import ExcelJS from 'exceljs'
import { once } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { PassThrough } from 'node:stream'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authService } from '../../src/modules/auth/auth.service'
import { SEM_DADOS } from '../../src/modules/exportacao/exportacao.planilhas'
import { exportacaoRepository } from '../../src/modules/exportacao/exportacao.repository'
import { TIPO_XLSX } from '../../src/modules/exportacao/exportacao.schemas'
import { ACOES_DA_EXPORTACAO, exportacaoService } from '../../src/modules/exportacao/exportacao.service'
import type { Perfil } from '../../src/shared/constants/perfis'
import type { Permissao } from '../../src/shared/constants/permissoes'
import { DownloadInterrompido, Saida } from '../../src/shared/http/download'
import { MENSAGENS_DOS_FILTROS } from '../../src/shared/http/filtros-do-painel'
import { horarioDeBrasilia } from '../../src/shared/rules/calendario'
import { MENSAGEM_FORA_DO_SETOR } from '../../src/shared/security/acesso'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta, type DadosDaResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { criarLoggerDeTeste } from '../helpers/logger-de-teste'
import { bearer } from '../helpers/sessao'

const app = createApp()

const RESUMO = '/api/v1/exportacoes/resumo.xlsx'
const RESPOSTAS = '/api/v1/exportacoes/respostas.xlsx'
const ROTAS = [RESUMO, RESPOSTAS]

type Query = Record<string, string | number>

/** Novembro de 2026, pela data do atendimento. */
const NOVEMBRO: Query = { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO' }

type Celula = ExcelJS.CellValue

beforeEach(async () => {
  await limparBanco()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})

interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

async function tokenDe(dados: DadosDoUsuario = {}) {
  return emitirTokenDeAcesso((await criarUsuario(dados)).id)
}

function pedir(rota: string, query: Query, token?: string) {
  const pedido = request(app).get(rota).query(query)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

/** Baixa o arquivo, com o corpo em bytes, sem o supertest tentar lê-lo como texto. */
function baixar(rota: string, query: Query, token: string) {
  return pedir(rota, query, token)
    .buffer(true)
    .parse((resposta, pronto) => {
      const partes: Buffer[] = []
      resposta.on('data', (parte: Buffer) => partes.push(parte))
      resposta.on('end', () => pronto(null, Buffer.concat(partes)))
    })
}

/** Os bytes num `ArrayBuffer` só deles, como o leitor do exceljs pede. */
const emArrayBuffer = (bytes: Buffer): ArrayBuffer => new Uint8Array(bytes).buffer

/** Baixa e abre a planilha, como o Excel abriria; falha se a exportação não respondeu 200. */
async function abrir(rota: string, query: Query, token: string) {
  const resposta = await baixar(rota, query, token)
  expect(resposta.status, String(resposta.body)).toBe(200)
  const livro = new ExcelJS.Workbook()
  await livro.xlsx.load(emArrayBuffer(resposta.body as Buffer))
  return { livro, resposta }
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

function aba(livro: ExcelJS.Workbook, nome: string): ExcelJS.Worksheet {
  const encontrada = livro.getWorksheet(nome)
  if (!encontrada) throw new Error(`A planilha não tem a aba ${nome}`)
  return encontrada
}

/** As linhas da aba, todas com o número de colunas da aba; a célula vazia vem `null`. */
function linhasDa(planilha: ExcelJS.Worksheet): Celula[][] {
  const linhas: Celula[][] = []
  planilha.eachRow({ includeEmpty: true }, (linha) => {
    const valores: Celula[] = []
    for (let coluna = 1; coluna <= planilha.columnCount; coluna++) {
      valores.push(linha.getCell(coluna).value ?? null)
    }
    linhas.push(valores)
  })
  return linhas
}

/** As linhas de dados de uma tabela, sem o cabeçalho. */
const dadosDa = (planilha: ExcelJS.Worksheet) => linhasDa(planilha).slice(1)

const vazia = (linha: Celula[]) => linha.every((celula) => celula === null)

/** A linha do Resumo que começa com o rótulo, e a célula do valor. */
function linhaDoResumo(resumo: ExcelJS.Worksheet, rotulo: string): ExcelJS.Row {
  let achada: ExcelJS.Row | undefined
  resumo.eachRow((linha) => {
    if (!achada && linha.getCell(1).value === rotulo) achada = linha
  })
  if (!achada) throw new Error(`O Resumo não tem a linha ${rotulo}`)
  return achada
}

const valorDoResumo = (resumo: ExcelJS.Worksheet, rotulo: string) =>
  linhaDoResumo(resumo, rotulo).getCell(2).value

/** As linhas da tabela do Resumo que vem depois do título, até a primeira linha vazia: o cabeçalho e os dados. */
function tabelaDoResumo(resumo: ExcelJS.Worksheet, titulo: string): Celula[][] {
  const linhas = linhasDa(resumo)
  const inicio = linhas.findIndex(([primeira]) => primeira === titulo)
  const fim = linhas.findIndex((linha, indice) => indice > inicio && vazia(linha))
  return linhas
    .slice(inicio + 1, fim === -1 ? undefined : fim)
    .map((linha) => linha.filter((c) => c !== null))
}

/** Todos os textos e números do arquivo, de todas as abas. */
function conteudoDo(livro: ExcelJS.Workbook): string[] {
  const textos: string[] = []
  livro.eachSheet((planilha) =>
    planilha.eachRow((linha) => linha.eachCell((celula) => textos.push(String(celula.value)))),
  )
  return textos
}

/** O dia do atendimento como a planilha o guarda: a meia-noite em UTC. */
const dia = (data: string) => new Date(`${data}T00:00:00.000Z`)

/** Tira a permissão de quem está logado, como faria uma mudança no mapa de permissões. */
function tirarPermissao(permissao: Permissao) {
  const autenticar = authService.autenticar.bind(authService)
  vi.spyOn(authService, 'autenticar').mockImplementation(async (token) => {
    const usuario = await autenticar(token)
    return { ...usuario, permissoes: usuario.permissoes.filter((outra) => outra !== permissao) }
  })
}

/**
 * Dois setores com as quatro perguntas no Pronto Atendimento. A resposta mais recente (enviada às 02h30 de 11/11 em
 * UTC, 23h30 de 10/11 em Brasília) tem um pedido de retorno e uma reclamação; a mais antiga, um elogio.
 */
async function cenario() {
  const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
  const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
  const recepcao = await criarCategoria({ nome: 'Recepção' })
  const espera = await criarCategoria({ nome: 'Tempo de espera' })
  const manha = await criarTurno({ nome: 'Manhã' })
  const noite = await criarTurno({ nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' })
  const escala = await criarPergunta({
    setorId: pronto.id,
    categoriaId: recepcao.id,
    texto: 'Como você avalia a recepção?',
  })
  const simNao = await criarPergunta({
    setorId: pronto.id,
    categoriaId: espera.id,
    tipo: 'SIM_NAO',
    texto: 'Você foi atendido no horário?',
  })
  const multipla = await criarPergunta({
    setorId: pronto.id,
    categoriaId: espera.id,
    tipo: 'MULTIPLA_ESCOLHA',
    texto: 'Quanto tempo você esperou?',
    opcoes: ['Menos de 30 minutos', 'Mais de 30 minutos'],
  })
  const livre = await criarPergunta({
    setorId: pronto.id,
    categoriaId: recepcao.id,
    tipo: 'TEXTO',
    texto: 'O que podemos melhorar?',
  })
  const escalaDaPediatria = await criarPergunta({
    setorId: pediatria.id,
    categoriaId: recepcao.id,
    texto: 'Como você avalia o atendimento?',
  })

  const antiga = await criarResposta({
    setorId: pronto.id,
    turnoId: manha.id,
    dataAtendimento: '2026-11-05',
    enviadoEm: '2026-11-05T15:00:00.000Z',
    nps: 10,
    nota: 5,
    perguntaIds: [escala.id, simNao.id, multipla.id, livre.id],
    comentario: { tipo: 'ELOGIO', texto: 'Equipe muito atenciosa.' },
  })
  await prisma.respostaItem.updateMany({
    where: { respostaId: antiga.id, perguntaId: livre.id },
    data: { valorTexto: 'Mais cadeiras na sala de espera.' },
  })
  const daPediatria = await criarResposta({
    setorId: pediatria.id,
    turnoId: manha.id,
    dataAtendimento: '2026-11-08',
    enviadoEm: '2026-11-08T12:00:00.000Z',
    nps: 8,
    nota: 4,
    perguntaIds: [escalaDaPediatria.id],
  })
  const recente = await criarResposta({
    setorId: pronto.id,
    turnoId: noite.id,
    canal: 'TOTEM',
    dataAtendimento: '2026-11-10',
    enviadoEm: '2026-11-11T02:30:00.000Z',
    nps: 3,
    nota: 2,
    classificacao: 'BAIXA',
    perguntaIds: [escala.id, simNao.id],
    comentario: { tipo: 'RECLAMACAO', texto: 'Esperei duas horas.' },
    contato: { telefone: '(51) 99999-0042' },
  })
  await prisma.respostaItem.updateMany({
    where: { respostaId: recente.id, perguntaId: simNao.id },
    data: { valorTexto: 'NAO' },
  })

  return { pronto, pediatria, recepcao, espera, manha, noite, antiga, daPediatria, recente }
}

describe('acesso às exportações', () => {
  it('sem login: 401 nos dois arquivos, no formato padrão', async () => {
    for (const rota of ROTAS) {
      const resposta = await pedir(rota, NOVEMBRO)
      expect(resposta.status, rota).toBe(401)
      expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
      expect(resposta.headers['content-disposition']).toBeUndefined()
    }
  })

  it('com a senha provisória: 403 nos dois arquivos', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })

    for (const rota of ROTAS) expect((await pedir(rota, NOVEMBRO, token)).status, rota).toBe(403)
  })

  it.each(['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'] as Perfil[])(
    'o %s exporta o resumo',
    async (perfil) => {
      const setor = await criarSetor()
      const token = await tokenDe({ perfil, setorIds: [setor.id] })

      await abrir(RESUMO, NOVEMBRO, token)
    },
  )

  it.each(['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA'] as Perfil[])('o %s exporta as respostas', async (perfil) => {
    const setor = await criarSetor()
    const token = await tokenDe({ perfil, setorIds: [setor.id] })

    await abrir(RESPOSTAS, NOVEMBRO, token)
  })

  it('o Visualizador não exporta as respostas: 403, e nada vai para a auditoria', async () => {
    const setor = await criarSetor()
    const token = await tokenDe({ perfil: 'VISUALIZADOR', setorIds: [setor.id] })

    const resposta = await pedir(RESPOSTAS, NOVEMBRO, token)

    expect(resposta.status).toBe(403)
    expect(erroDe(resposta)).toMatchObject({
      codigo: 'SEM_PERMISSAO',
      mensagem: 'Você não tem permissão para isso.',
    })
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('sem exportacao:resumo: 403 no resumo', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    tirarPermissao('exportacao:resumo')

    const resposta = await pedir(RESUMO, NOVEMBRO, token)

    expect(resposta.status).toBe(403)
    expect(erroDe(resposta).codigo).toBe('SEM_PERMISSAO')
  })
})

describe('escopo de setor', () => {
  it.each([
    ['GESTOR', RESUMO],
    ['GESTOR', RESPOSTAS],
    ['VISUALIZADOR', RESUMO],
  ] as [Perfil, string][])(
    'o %s que pede um setor que não é seu recebe 403 em %s, e nada vai para a auditoria',
    async (perfil, rota) => {
      const meu = await criarSetor()
      const outro = await criarSetor()
      const token = await tokenDe({ perfil, setorIds: [meu.id] })

      const resposta = await pedir(rota, { ...NOVEMBRO, setorId: outro.id }, token)

      expect(resposta.status).toBe(403)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })
      expect(await prisma.auditoria.count()).toBe(0)
    },
  )

  it('o Gestor sem setor pedido leva só os seus setores, em todas as abas', async () => {
    const { pronto, antiga, recente } = await cenario()
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    const resumo = aba(livro, 'Resumo')
    expect(valorDoResumo(resumo, 'Setor')).toBe('Os seus setores: Pronto Atendimento')
    expect(valorDoResumo(resumo, 'Respostas')).toBe(2)
    // Um promotor (10) e um detrator (3): NPS 0.
    expect(tabelaDoResumo(resumo, 'NPS por setor').slice(1)).toEqual([['Pronto Atendimento', 0, 2]])
    expect(dadosDa(aba(livro, 'Respostas')).map(([codigo]) => codigo)).toEqual([recente.id, antiga.id])
    expect(new Set(dadosDa(aba(livro, 'Itens')).map(([codigo]) => codigo))).toEqual(
      new Set([recente.id, antiga.id]),
    )
    expect(dadosDa(aba(livro, 'Comentários')).map(([codigo]) => codigo)).toEqual([recente.id, antiga.id])
    expect(conteudoDo(livro).some((texto) => texto.includes('Pediatria'))).toBe(false)
  })

  it('o Visualizador exporta o resumo só dos seus setores, com os nomes deles em ordem alfabética', async () => {
    const { pronto, pediatria } = await cenario()
    const semRespostas = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio' })
    const token = await tokenDe({ perfil: 'VISUALIZADOR', setorIds: [pronto.id, semRespostas.id] })

    const { livro } = await abrir(RESUMO, NOVEMBRO, token)

    const resumo = aba(livro, 'Resumo')
    expect(valorDoResumo(resumo, 'Setor')).toBe('Os seus setores: Ambulatório, Pronto Atendimento')
    expect(valorDoResumo(resumo, 'Respostas')).toBe(2)
    expect(tabelaDoResumo(resumo, 'NPS por setor').slice(1)).toEqual([['Pronto Atendimento', 0, 2]])
    expect(conteudoDo(livro).some((texto) => texto.includes(pediatria.nome))).toBe(false)
  })
})

describe('GET /exportacoes/resumo.xlsx', () => {
  it('baixa como arquivo, com o nome do período, sem cache e com o nome legível pelo front de outra origem', async () => {
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const resposta = await baixar(RESUMO, NOVEMBRO, token).set('Origin', 'http://localhost:5173')

    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toBe(TIPO_XLSX)
    expect(resposta.headers['content-disposition']).toBe(
      'attachment; filename=fhdod-resumo-2026-11-01-a-2026-11-30.xlsx',
    )
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.headers['access-control-expose-headers']).toBe('Content-Disposition')
  })

  it('uma aba, Resumo, com os números do dashboard para os mesmos filtros', async () => {
    await cenario()
    const usuario = await criarUsuario({ perfil: 'OUVIDORIA', nome: 'Renata Ouvidoria' })
    const token = await emitirTokenDeAcesso(usuario.id)
    const antes = horarioDeBrasilia(new Date())

    const { livro } = await abrir(RESUMO, NOVEMBRO, token)

    expect(livro.worksheets.map(({ name }) => name)).toEqual(['Resumo'])
    const resumo = aba(livro, 'Resumo')
    const doDashboard = async (rota: string) =>
      (
        await request(app)
          .get(`/api/v1/dashboard/${rota}`)
          .query(NOVEMBRO)
          .set('Authorization', bearer(token))
      ).body.data

    const [indicadores, setores, categorias] = await Promise.all([
      doDashboard('resumo'),
      doDashboard('nps-por-setor'),
      doDashboard('categorias'),
    ])
    expect(valorDoResumo(resumo, 'NPS')).toBe(indicadores.nps)
    expect(valorDoResumo(resumo, 'Respostas')).toBe(indicadores.total)
    expect(valorDoResumo(resumo, 'Promotores (notas 9 e 10)')).toBe(indicadores.promotores)
    expect(valorDoResumo(resumo, 'Neutros (notas 7 e 8)')).toBe(indicadores.neutros)
    expect(valorDoResumo(resumo, 'Detratores (notas 0 a 6)')).toBe(indicadores.detratores)
    expect(valorDoResumo(resumo, 'Avaliações com nota baixa ou baixíssima')).toBe(indicadores.notasBaixas)
    expect(valorDoResumo(resumo, 'Avaliações com nota baixíssima')).toBe(indicadores.baixissimas)
    expect(valorDoResumo(resumo, 'Média das notas de 1 a 5')).toBe(indicadores.mediaEscala)
    expect(indicadores).toMatchObject({ nps: 0, total: 3, promotores: 1, neutros: 1, detratores: 1 })

    expect(tabelaDoResumo(resumo, 'NPS por setor')).toEqual([
      ['Setor', 'NPS', 'Respostas'],
      ...setores.map(({ setor, nps, total }: { setor: string; nps: number; total: number }) => [
        setor,
        nps,
        total,
      ]),
    ])
    expect(tabelaDoResumo(resumo, 'Médias por categoria')).toEqual([
      ['Categoria', 'Média (1 a 5)', '% de notas 4 e 5', 'Notas'],
      ...categorias.map((c: { categoria: string; media: number; percentual45: number; total: number }) => [
        c.categoria,
        c.media,
        c.percentual45 / 100,
        c.total,
      ]),
    ])
    expect(categorias).toHaveLength(1)

    expect(valorDoResumo(resumo, 'Gerado por')).toBe('Renata Ouvidoria')
    const geradoEm = valorDoResumo(resumo, 'Gerado em') as Date
    expect(geradoEm.getTime() - antes.getTime()).toBeGreaterThanOrEqual(-1000)
    expect(geradoEm.getTime() - antes.getTime()).toBeLessThan(60_000)
  })

  it('os números no formato de cada um: inteiro, contagem, média com uma casa e porcentagem', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESUMO, NOVEMBRO, token)

    const resumo = aba(livro, 'Resumo')
    const formatoDo = (rotulo: string, coluna = 2) => linhaDoResumo(resumo, rotulo).getCell(coluna).numFmt
    expect(formatoDo('Gerado em')).toBe('dd/mm/yyyy hh:mm')
    expect(formatoDo('NPS')).toBe('0')
    expect(formatoDo('Respostas')).toBe('#,##0')
    expect(formatoDo('Média das notas de 1 a 5')).toBe('0.0')
    expect(formatoDo('Recepção', 2)).toBe('0.0')
    expect(formatoDo('Recepção', 3)).toBe('0%')
    expect(formatoDo('Recepção', 4)).toBe('#,##0')
    expect(formatoDo('Pronto Atendimento', 3)).toBe('#,##0')
  })

  it('descreve os filtros com os nomes do setor, do turno e do canal e a base da data', async () => {
    const { pronto, noite } = await cenario()
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const { livro } = await abrir(
      RESUMO,
      {
        inicio: '2026-11-10',
        fim: '2026-11-11',
        base: 'ENVIO',
        setorId: pronto.id,
        turnoId: noite.id,
        canal: 'TOTEM',
      },
      token,
    )

    const resumo = aba(livro, 'Resumo')
    expect(valorDoResumo(resumo, 'Período')).toBe('10/11/2026 a 11/11/2026')
    expect(valorDoResumo(resumo, 'Data considerada')).toBe('Data do envio, no horário de Brasília')
    expect(valorDoResumo(resumo, 'Setor')).toBe('Pronto Atendimento')
    expect(valorDoResumo(resumo, 'Turno')).toBe('Noite')
    expect(valorDoResumo(resumo, 'Canal')).toBe('Totem')
    // Só a recente: enviada às 23h30 de 10/11 em Brasília, pelo totem, no turno da noite.
    expect(valorDoResumo(resumo, 'Respostas')).toBe(1)
  })

  it('sem filtros de setor, turno e canal, e com códigos que não existem', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const todos = aba((await abrir(RESUMO, NOVEMBRO, token)).livro, 'Resumo')
    expect(valorDoResumo(todos, 'Data considerada')).toBe('Data do atendimento')
    expect(valorDoResumo(todos, 'Setor')).toBe('Todos os setores')
    expect(valorDoResumo(todos, 'Turno')).toBe('Todos os turnos')
    expect(valorDoResumo(todos, 'Canal')).toBe('Todos os canais')

    const inexistentes = aba(
      (await abrir(RESUMO, { ...NOVEMBRO, setorId: 9999, turnoId: 8888 }, token)).livro,
      'Resumo',
    )
    expect(valorDoResumo(inexistentes, 'Setor')).toBe('Nenhum setor tem o código 9999')
    expect(valorDoResumo(inexistentes, 'Turno')).toBe('Nenhum turno tem o código 8888')
  })

  it('sem respostas no período: NPS e média sem número, e as tabelas avisam que não há dados', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESUMO, { ...NOVEMBRO, inicio: '2026-12-01', fim: '2026-12-31' }, token)

    const resumo = aba(livro, 'Resumo')
    expect(valorDoResumo(resumo, 'NPS')).toBe(SEM_DADOS)
    expect(valorDoResumo(resumo, 'Respostas')).toBe(0)
    expect(valorDoResumo(resumo, 'Média das notas de 1 a 5')).toBe(SEM_DADOS)
    expect(tabelaDoResumo(resumo, 'NPS por setor').slice(1)).toEqual([['Nenhuma resposta no período.']])
    expect(tabelaDoResumo(resumo, 'Médias por categoria').slice(1)).toEqual([
      ['Nenhuma nota de 1 a 5 no período.'],
    ])
  })

  it('o Gestor de uma conta sem setores exporta um resumo vazio, que diz o porquê', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [] })

    const resumo = aba((await abrir(RESUMO, NOVEMBRO, token)).livro, 'Resumo')

    expect(valorDoResumo(resumo, 'Setor')).toBe('Nenhum: a sua conta ainda não tem setores')
    expect(valorDoResumo(resumo, 'Respostas')).toBe(0)
  })
})

describe('GET /exportacoes/respostas.xlsx', () => {
  it('as abas Resumo, Respostas, Itens e Comentários, com o nome do período', async () => {
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro, resposta } = await abrir(RESPOSTAS, NOVEMBRO, token)

    expect(resposta.headers['content-disposition']).toBe(
      'attachment; filename=fhdod-respostas-2026-11-01-a-2026-11-30.xlsx',
    )
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(livro.worksheets.map(({ name }) => name)).toEqual(['Resumo', 'Respostas', 'Itens', 'Comentários'])
    expect(valorDoResumo(aba(livro, 'Resumo'), 'Respostas')).toBe(0)
    expect(linhasDa(aba(livro, 'Itens'))).toEqual([
      [
        'Código da resposta',
        'Setor',
        'Data do atendimento',
        'Pergunta',
        'Categoria',
        'Tipo da pergunta',
        'Nota (1 a 5)',
        'Resposta',
      ],
    ])
    expect(linhasDa(aba(livro, 'Comentários'))).toEqual([
      [
        'Código da resposta',
        'Setor',
        'Data do atendimento',
        'Enviada em',
        'Tipo',
        'Comentário',
        'Classificação da avaliação',
      ],
    ])
  })

  it('Respostas: uma linha por envio, do mais recente para o mais antigo, com as datas em Brasília', async () => {
    const { antiga, daPediatria, recente } = await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    const respostas = aba(livro, 'Respostas')
    expect(linhasDa(respostas)).toEqual([
      [
        'Código da resposta',
        'Setor',
        'Data do atendimento',
        'Turno',
        'Canal',
        'Enviada em',
        'Nota de recomendação (0 a 10)',
        'Classificação',
        'Tipo do comentário',
        'Pediu retorno',
        'Telefone para retorno',
      ],
      [
        recente.id,
        'Pronto Atendimento',
        dia('2026-11-10'),
        'Noite',
        'Totem',
        new Date('2026-11-10T23:30:00.000Z'),
        3,
        'Baixa',
        'Reclamação',
        'Sim',
        '(51) 99999-0042',
      ],
      [
        daPediatria.id,
        'Pediatria',
        dia('2026-11-08'),
        'Manhã',
        'Celular ou computador',
        new Date('2026-11-08T09:00:00.000Z'),
        8,
        'Normal',
        null,
        'Não',
        null,
      ],
      [
        antiga.id,
        'Pronto Atendimento',
        dia('2026-11-05'),
        'Manhã',
        'Celular ou computador',
        new Date('2026-11-05T12:00:00.000Z'),
        10,
        'Normal',
        'Elogio',
        'Não',
        null,
      ],
    ])
    expect(respostas.getRow(2).getCell(3).numFmt).toBe('dd/mm/yyyy')
    expect(respostas.getRow(2).getCell(6).numFmt).toBe('dd/mm/yyyy hh:mm')
    expect(respostas.getRow(1).getCell(1).font?.bold).toBe(true)
    expect(respostas.views).toMatchObject([{ state: 'frozen', ySplit: 1 }])
    expect(respostas.autoFilter).toBe('A1:K1')
  })

  it('Itens: uma linha por pergunta respondida, na ordem em que o paciente viu, com a nota ou o texto', async () => {
    const { antiga, daPediatria, recente } = await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    const pronto = (data: string, ...resto: Celula[]) => ['Pronto Atendimento', dia(data), ...resto]
    expect(dadosDa(aba(livro, 'Itens'))).toEqual([
      [
        recente.id,
        ...pronto('2026-11-10', 'Como você avalia a recepção?', 'Recepção', 'Rostinhos (1 a 5)', 2, null),
      ],
      [
        recente.id,
        ...pronto(
          '2026-11-10',
          'Você foi atendido no horário?',
          'Tempo de espera',
          'Sim ou não',
          null,
          'Não',
        ),
      ],
      [
        daPediatria.id,
        'Pediatria',
        dia('2026-11-08'),
        'Como você avalia o atendimento?',
        'Recepção',
        'Rostinhos (1 a 5)',
        4,
        null,
      ],
      [
        antiga.id,
        ...pronto('2026-11-05', 'Como você avalia a recepção?', 'Recepção', 'Rostinhos (1 a 5)', 5, null),
      ],
      [
        antiga.id,
        ...pronto(
          '2026-11-05',
          'Você foi atendido no horário?',
          'Tempo de espera',
          'Sim ou não',
          null,
          'Sim',
        ),
      ],
      [
        antiga.id,
        ...pronto(
          '2026-11-05',
          'Quanto tempo você esperou?',
          'Tempo de espera',
          'Múltipla escolha',
          null,
          'Menos de 30 minutos',
        ),
      ],
      [
        antiga.id,
        ...pronto(
          '2026-11-05',
          'O que podemos melhorar?',
          'Recepção',
          'Texto livre',
          null,
          'Mais cadeiras na sala de espera.',
        ),
      ],
    ])
  })

  it('Itens: o texto, o tipo e a categoria são os do momento da resposta', async () => {
    const { antiga } = await cenario()
    const outra = await criarCategoria({ nome: 'Conforto' })
    await prisma.pergunta.updateMany({
      where: { texto: 'Como você avalia a recepção?' },
      data: { texto: 'Pergunta reescrita depois', categoriaId: outra.id },
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    const daAntiga = dadosDa(aba(livro, 'Itens')).filter(([codigo]) => codigo === antiga.id)
    expect(daAntiga[0]?.slice(3, 5)).toEqual(['Como você avalia a recepção?', 'Recepção'])
  })

  it('Comentários: uma linha por comentário, com o tipo, o texto e a classificação da avaliação', async () => {
    const { antiga, recente } = await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    expect(dadosDa(aba(livro, 'Comentários'))).toEqual([
      [
        recente.id,
        'Pronto Atendimento',
        dia('2026-11-10'),
        new Date('2026-11-10T23:30:00.000Z'),
        'Reclamação',
        'Esperei duas horas.',
        'Baixa',
      ],
      [
        antiga.id,
        'Pronto Atendimento',
        dia('2026-11-05'),
        new Date('2026-11-05T12:00:00.000Z'),
        'Elogio',
        'Equipe muito atenciosa.',
        'Normal',
      ],
    ])
  })

  it('os filtros valem em todas as abas: o turno, o canal e a base do envio', async () => {
    const { manha, antiga, daPediatria, recente } = await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    const codigos = async (query: Query) => {
      const { livro } = await abrir(RESPOSTAS, query, token)
      return ['Respostas', 'Itens', 'Comentários'].map((nome) => [
        ...new Set(dadosDa(aba(livro, nome)).map(([codigo]) => codigo)),
      ])
    }

    expect(await codigos({ ...NOVEMBRO, turnoId: manha.id })).toEqual([
      [daPediatria.id, antiga.id],
      [daPediatria.id, antiga.id],
      [antiga.id],
    ])
    expect(await codigos({ ...NOVEMBRO, canal: 'TOTEM' })).toEqual([[recente.id], [recente.id], [recente.id]])
    // Enviada às 23h30 de 10/11 em Brasília: conta no dia 10 pela base do envio, e não no 11.
    expect(await codigos({ inicio: '2026-11-10', fim: '2026-11-10', base: 'ENVIO' })).toEqual([
      [recente.id],
      [recente.id],
      [recente.id],
    ])
    expect(await codigos({ inicio: '2026-11-11', fim: '2026-11-11', base: 'ENVIO' })).toEqual([[], [], []])
  })
})

describe('telefone no arquivo detalhado', () => {
  it.each(['SUPER_ADMIN', 'OUVIDORIA'] as Perfil[])(
    'o %s recebe a coluna com o número completo; sem pedido de retorno, a célula fica vazia',
    async (perfil) => {
      const { recente } = await cenario()
      const token = await tokenDe({ perfil })

      const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

      const respostas = linhasDa(aba(livro, 'Respostas'))
      expect(respostas[0]?.at(-1)).toBe('Telefone para retorno')
      expect(respostas.slice(1).map((linha) => [linha[0], linha.at(-1)])).toEqual([
        [recente.id, '(51) 99999-0042'],
        [expect.any(Number), null],
        [expect.any(Number), null],
      ])
    },
  )

  it('o Gestor não recebe a coluna, e o número não aparece em lugar nenhum do arquivo', async () => {
    const { pronto } = await cenario()
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    const cabecalho = linhasDa(aba(livro, 'Respostas'))[0]
    expect(cabecalho).not.toContain('Telefone para retorno')
    expect(cabecalho?.at(-1)).toBe('Pediu retorno')
    const conteudo = conteudoDo(livro).join('\n')
    expect(conteudo).not.toContain('99999')
    expect(conteudo).not.toContain('0042')
  })

  it('sem contatos:ver, o arquivo sai mesmo com o número cifrado estragado: a consulta nem o lê', async () => {
    const { pronto, recente } = await cenario()
    await prisma.contatoRetorno.updateMany({
      where: { respostaId: recente.id },
      data: { telefoneCifrado: 'estragado' },
    })
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })

    const { livro } = await abrir(RESPOSTAS, NOVEMBRO, token)

    expect(dadosDa(aba(livro, 'Respostas'))[0]?.slice(0, 1)).toEqual([recente.id])
  })

  it('um número que não se decifra para quem tem contatos:ver: 500 no formato padrão, sem download nem auditoria', async () => {
    const { recente } = await cenario()
    await prisma.contatoRetorno.updateMany({
      where: { respostaId: recente.id },
      data: { telefoneCifrado: 'estragado' },
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const resposta = await pedir(RESPOSTAS, NOVEMBRO, token)

    expect(resposta.status).toBe(500)
    expect(erroDe(resposta).codigo).toBe('ERRO_INTERNO')
    expect(resposta.headers['content-disposition']).toBeUndefined()
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('auditoria das exportações', () => {
  it('cada exportação grava uma linha, com quem exportou, de onde, os filtros usados e se levou telefones', async () => {
    const { pronto, noite } = await cenario()
    const visualizador = await criarUsuario({ perfil: 'VISUALIZADOR', setorIds: [pronto.id] })
    const ouvidoria = await criarUsuario({ perfil: 'OUVIDORIA' })
    const gestor = await criarUsuario({ perfil: 'GESTOR', setorIds: [pronto.id] })

    await baixar(RESUMO, { ...NOVEMBRO, setorId: pronto.id }, await emitirTokenDeAcesso(visualizador.id))
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200)
    await baixar(
      RESPOSTAS,
      { ...NOVEMBRO, canal: 'TOTEM', turnoId: noite.id },
      await emitirTokenDeAcesso(ouvidoria.id),
    )
      .set('X-Forwarded-For', '203.0.113.8')
      .expect(200)
    await baixar(RESPOSTAS, { ...NOVEMBRO, base: 'ENVIO' }, await emitirTokenDeAcesso(gestor.id)).expect(200)

    const linhas = await prisma.auditoria.findMany({ orderBy: { id: 'asc' } })
    expect(
      linhas.map(({ usuarioId, acao, entidade, entidadeId, ip, dados }) => ({
        usuarioId,
        acao,
        entidade,
        entidadeId,
        ip,
        dados,
      })),
    ).toEqual([
      {
        usuarioId: visualizador.id,
        acao: ACOES_DA_EXPORTACAO.resumo,
        entidade: 'respostas',
        entidadeId: null,
        ip: '203.0.113.7',
        dados: {
          filtros: { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO', setorId: pronto.id },
          respostas: 2,
          comTelefones: false,
        },
      },
      {
        usuarioId: ouvidoria.id,
        acao: ACOES_DA_EXPORTACAO.respostas,
        entidade: 'respostas',
        entidadeId: null,
        ip: '203.0.113.8',
        dados: {
          filtros: {
            inicio: '2026-11-01',
            fim: '2026-11-30',
            base: 'ATENDIMENTO',
            turnoId: noite.id,
            canal: 'TOTEM',
          },
          respostas: 1,
          comTelefones: true,
          telefones: 1,
        },
      },
      {
        usuarioId: gestor.id,
        acao: ACOES_DA_EXPORTACAO.respostas,
        entidade: 'respostas',
        entidadeId: null,
        ip: expect.any(String),
        dados: {
          filtros: { inicio: '2026-11-01', fim: '2026-11-30', base: 'ENVIO' },
          respostas: 2,
          comTelefones: false,
          telefones: 0,
        },
      },
    ])
  })

  it('a exportação não sai se a linha da auditoria não for gravada', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    vi.spyOn(exportacaoRepository, 'registrarExportacao').mockRejectedValueOnce(new Error('Banco fora do ar'))

    const resposta = await pedir(RESPOSTAS, NOVEMBRO, token)

    expect(resposta.status).toBe(500)
    expect(erroDe(resposta).codigo).toBe('ERRO_INTERNO')
    expect(resposta.headers['content-disposition']).toBeUndefined()
    expect(resposta.headers['content-type']).toMatch(/^application\/json/)
  })
})

describe('validação dos filtros', () => {
  it.each(ROTAS)(
    '%s: 400 sem o período ou a base, com o fim antes do início ou com um filtro inválido',
    async (rota) => {
      const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
      const campos = async (query: Query) => {
        const resposta = await pedir(rota, query, token)
        expect(resposta.status, JSON.stringify(resposta.body)).toBe(400)
        expect(resposta.headers['content-disposition']).toBeUndefined()
        return erroDe(resposta).detalhes
      }

      expect(await campos({})).toEqual([
        { campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.inicio },
        { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.fim },
        { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
      ])
      expect(await campos({ ...NOVEMBRO, inicio: '2026-11-30', fim: '2026-11-01' })).toEqual([
        { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo },
      ])
      expect((await campos({ ...NOVEMBRO, canal: 'FAX' })).map(({ campo }) => campo)).toEqual(['canal'])
      expect((await campos({ ...NOVEMBRO, turnoId: 'x' })).map(({ campo }) => campo)).toEqual(['turnoId'])
      expect(await prisma.auditoria.count()).toBe(0)
    },
  )
})

describe('envio em streaming', () => {
  /** Uma API de verdade, numa porta, com o log na memória: o cliente HTTP do Node vê a conexão como ela é. */
  async function servidorComLog() {
    const { logger, linhas } = criarLoggerDeTeste()
    const servidor = createApp({ logger }).listen(0)
    await once(servidor, 'listening')
    const { port } = servidor.address() as AddressInfo
    const abrirDownload = (caminho: string, query: Query, token: string) => {
      const pedido = http.get(
        `http://127.0.0.1:${port}${caminho}?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
        { headers: { Authorization: bearer(token) }, agent: false },
      )
      return pedido
    }
    const fechar = async () => {
      servidor.closeAllConnections()
      servidor.close()
      await once(servidor, 'close')
    }
    return { servidor, linhas, abrirDownload, fechar }
  }

  /** Espera a condição valer, de 10 em 10 ms, por até 3 s. */
  async function esperarAte(condicao: () => boolean | Promise<boolean>) {
    for (let tentativa = 0; tentativa < 300; tentativa++) {
      if (await condicao()) return
      await new Promise((pronto) => setTimeout(pronto, 10))
    }
    throw new Error('A condição não aconteceu a tempo')
  }

  it('um erro no meio do arquivo derruba a conexão, em vez de mandar um arquivo pela metade, e vai para o log', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    vi.spyOn(exportacaoRepository, 'itens').mockRejectedValueOnce(new Error('O banco caiu no meio'))
    const { linhas, abrirDownload, fechar } = await servidorComLog()

    try {
      const pedido = abrirDownload(RESPOSTAS, NOVEMBRO, token)
      pedido.on('error', () => {})
      const [resposta] = (await once(pedido, 'response')) as [http.IncomingMessage]
      expect(resposta.statusCode).toBe(200)
      const chegouInteira = await new Promise<boolean>((pronto) => {
        resposta.on('data', () => {})
        resposta.on('error', () => {})
        resposta.on('close', () => pronto(resposta.complete))
      })

      expect(chegouInteira).toBe(false)
      await esperarAte(() => linhas.some(({ msg }) => msg === 'requisição com erro'))
      const linha = linhas.find(({ msg }) => msg === 'requisição com erro')
      expect(linha).toMatchObject({ level: 'error', err: { message: 'O banco caiu no meio' } })
      // A tentativa ficou na auditoria: a linha entra antes de o arquivo sair.
      expect(await prisma.auditoria.count()).toBe(1)
    } finally {
      await fechar()
    }
  })

  it('quem fecha a conexão no meio faz a geração parar, sem erro no log', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    let liberar = () => {}
    const segurar = new Promise<void>((pronto) => {
      liberar = pronto
    })
    const respostas = exportacaoRepository.respostas.bind(exportacaoRepository)
    vi.spyOn(exportacaoRepository, 'respostas').mockImplementation(async (ids) => {
      await segurar
      return respostas(ids)
    })
    const itens = vi.spyOn(exportacaoRepository, 'itens')
    const esvaziar = vi.spyOn(Saida.prototype, 'esvaziar')
    const { servidor, linhas, abrirDownload, fechar } = await servidorComLog()

    try {
      const pedido = abrirDownload(RESPOSTAS, NOVEMBRO, token)
      pedido.on('error', () => {})
      const [resposta] = (await once(pedido, 'response')) as [http.IncomingMessage]
      expect(resposta.statusCode).toBe(200)

      // A aba Resumo já saiu, e a das respostas espera o primeiro lote: a pessoa fecha a conexão.
      pedido.destroy()
      await esperarAte(
        () => new Promise((pronto) => servidor.getConnections((_erro, conexoes) => pronto(conexoes === 0))),
      )
      liberar()

      await esperarAte(() => esvaziar.mock.results.length > 0)
      await expect(esvaziar.mock.results[0]?.value).rejects.toBeInstanceOf(DownloadInterrompido)
      await esperarAte(() => linhas.some(({ msg }) => msg === 'requisição interrompida'))
      expect(itens).not.toHaveBeenCalled()
      expect(linhas.some(({ level }) => level === 'error')).toBe(false)
    } finally {
      liberar()
      await fechar()
    }
  })
})

describe('respostas em mais de um lote', () => {
  it('as abas leem o banco em lotes, na ordem do arquivo, e no mesmo instante a de ID maior vem antes', async () => {
    const setor = await criarSetor()
    const categoria = await criarCategoria()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const turno = await criarTurno()
    const dados: DadosDaResposta = {
      setorId: setor.id,
      turnoId: turno.id,
      perguntaIds: [pergunta.id],
      comentario: { tipo: 'OUTRO', texto: 'Sem queixas.' },
    }
    const criadas = []
    for (const enviadoEm of ['10', '11', '11', '12', '13', '14', '15']) {
      criadas.push(await criarResposta({ ...dados, enviadoEm: `2026-11-${enviadoEm}T12:00:00.000Z` }))
    }
    const usuario = await authService.autenticar(await tokenDe({ perfil: 'OUVIDORIA' }))
    const lotes = vi.spyOn(exportacaoRepository, 'respostas')

    const arquivo = await exportacaoService.respostas(
      { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO' },
      usuario,
      null,
      { respostasPorLote: 3 },
    )
    const destino = new PassThrough()
    const partes: Buffer[] = []
    destino.on('data', (parte: Buffer) => partes.push(parte))
    await arquivo.escrever(new Saida(destino))
    const livro = new ExcelJS.Workbook()
    await livro.xlsx.load(emArrayBuffer(Buffer.concat(partes)))

    // A segunda e a terceira têm o mesmo instante: a terceira, de ID maior, vem antes.
    const esperados = criadas.map(({ id }) => id).reverse()
    expect(lotes.mock.calls.map(([ids]) => ids)).toEqual([
      esperados.slice(0, 3),
      esperados.slice(3, 6),
      esperados.slice(6),
    ])
    for (const nome of ['Respostas', 'Itens', 'Comentários']) {
      expect(
        dadosDa(aba(livro, nome)).map(([codigo]) => codigo),
        nome,
      ).toEqual(esperados)
    }
  })
})
