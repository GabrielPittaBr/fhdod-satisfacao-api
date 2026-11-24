import ExcelJS from 'exceljs'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authService } from '../../src/modules/auth/auth.service'
import { exportacaoRepository } from '../../src/modules/exportacao/exportacao.repository'
import {
  indicadoresDoResumo,
  numeroBrasileiro,
  type TipoDeNumero,
} from '../../src/modules/exportacao/exportacao.resumo'
import { TIPO_PDF } from '../../src/modules/exportacao/exportacao.schemas'
import type { Perfil } from '../../src/shared/constants/perfis'
import { MENSAGENS_DOS_FILTROS } from '../../src/shared/http/filtros-do-painel'
import { MENSAGEM_FORA_DO_SETOR } from '../../src/shared/security/acesso'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { lerPdf, linhaQueComeca, valorAoLado, type PdfLido } from '../helpers/pdf'
import { bearer } from '../helpers/sessao'

const app = createApp()

const PDF = '/api/v1/exportacoes/resumo.pdf'
const XLSX = '/api/v1/exportacoes/resumo.xlsx'

type Query = Record<string, string | number>

const NOVEMBRO: Query = { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO' }

beforeEach(async () => {
  await limparBanco()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function tokenDe(dados: DadosDoUsuario = {}) {
  return emitirTokenDeAcesso((await criarUsuario(dados)).id)
}

function pedir(rota: string, query: Query, token?: string) {
  const pedido = request(app).get(rota).query(query)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

/** Baixa o arquivo em bytes. */
async function baixar(rota: string, query: Query, token: string) {
  const resposta = await pedir(rota, query, token)
    .buffer(true)
    .parse((corpo, pronto) => {
      const partes: Buffer[] = []
      corpo.on('data', (parte: Buffer) => partes.push(parte))
      corpo.on('end', () => pronto(null, Buffer.concat(partes)))
    })
  expect(resposta.status, String(resposta.body)).toBe(200)
  return { resposta, bytes: resposta.body as Buffer }
}

async function abrirPdf(query: Query, token: string): Promise<PdfLido> {
  return lerPdf((await baixar(PDF, query, token)).bytes)
}

/** As linhas da aba Resumo do Excel, sem as células vazias. */
async function abrirResumoEmExcel(query: Query, token: string): Promise<ExcelJS.CellValue[][]> {
  const livro = new ExcelJS.Workbook()
  await livro.xlsx.load(new Uint8Array((await baixar(XLSX, query, token)).bytes).buffer)
  const linhas: ExcelJS.CellValue[][] = []
  livro.getWorksheet('Resumo')?.eachRow((linha) => {
    const valores: ExcelJS.CellValue[] = []
    linha.eachCell((celula) => valores.push(celula.value))
    linhas.push(valores)
  })
  return linhas
}

const erroDe = (resposta: request.Response) =>
  (resposta.body as { erro: { codigo: string; mensagem: string } }).erro

/** Dois setores, com uma pergunta de escala cada, e respostas de novembro. */
async function cenario() {
  const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
  const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
  const recepcao = await criarCategoria({ nome: 'Recepção' })
  const limpeza = await criarCategoria({ nome: 'Limpeza' })
  const turno = await criarTurno({ nome: 'Manhã' })
  const doPronto = await criarPergunta({ setorId: pronto.id, categoriaId: recepcao.id })
  const daPediatria = await criarPergunta({ setorId: pediatria.id, categoriaId: limpeza.id })
  const responder = (
    setorId: number,
    perguntaId: number,
    nps: number,
    nota: number,
    dataAtendimento: string,
  ) => criarResposta({ setorId, turnoId: turno.id, perguntaIds: [perguntaId], nps, nota, dataAtendimento })
  await responder(pronto.id, doPronto.id, 10, 5, '2026-11-03')
  await responder(pronto.id, doPronto.id, 3, 2, '2026-11-10')
  await responder(pronto.id, doPronto.id, 8, 4, '2026-11-12')
  await responder(pediatria.id, daPediatria.id, 9, 5, '2026-11-05')
  await criarResposta({
    setorId: pediatria.id,
    turnoId: turno.id,
    perguntaIds: [daPediatria.id],
    nps: 6,
    nota: 3,
    dataAtendimento: '2026-11-20',
    comentario: { tipo: 'RECLAMACAO', texto: 'Texto do paciente que não vai para o PDF.' },
    contato: { telefone: '(51) 99999-0042' },
  })
  return { pronto, pediatria, turno }
}

describe('GET /exportacoes/resumo.pdf: acesso', () => {
  it('sem login: 401 no formato padrão, sem o download', async () => {
    const resposta = await pedir(PDF, NOVEMBRO)

    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
    expect(resposta.headers['content-disposition']).toBeUndefined()
  })

  it('com a senha provisória: 403', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })

    expect((await pedir(PDF, NOVEMBRO, token)).status).toBe(403)
  })

  it.each(['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'] as Perfil[])(
    'o %s baixa o PDF',
    async (perfil) => {
      const setor = await criarSetor()
      const token = await tokenDe({ perfil, setorIds: [setor.id] })

      const { bytes } = await baixar(PDF, NOVEMBRO, token)

      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    },
  )

  it('sem exportacao:resumo: 403', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const autenticar = authService.autenticar.bind(authService)
    vi.spyOn(authService, 'autenticar').mockImplementation(async (tokenAcesso) => {
      const usuario = await autenticar(tokenAcesso)
      return { ...usuario, permissoes: usuario.permissoes.filter((p) => p !== 'exportacao:resumo') }
    })

    const resposta = await pedir(PDF, NOVEMBRO, token)

    expect(resposta.status).toBe(403)
    expect(erroDe(resposta).codigo).toBe('SEM_PERMISSAO')
  })

  it.each(['GESTOR', 'VISUALIZADOR'] as Perfil[])(
    'o %s que pede um setor que não é seu recebe 403, e nada vai para a auditoria',
    async (perfil) => {
      const meu = await criarSetor()
      const outro = await criarSetor()
      const token = await tokenDe({ perfil, setorIds: [meu.id] })

      const resposta = await pedir(PDF, { ...NOVEMBRO, setorId: outro.id }, token)

      expect(resposta.status).toBe(403)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })
      expect(await prisma.auditoria.count()).toBe(0)
    },
  )

  it('400 sem o período ou a base, sem auditoria', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir(PDF, { inicio: '2026-11-30', fim: '2026-11-01', base: 'ATENDIMENTO' }, token)

    expect(resposta.status).toBe(400)
    expect((resposta.body as { erro: { detalhes: unknown[] } }).erro.detalhes).toEqual([
      { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo },
    ])
    expect((await pedir(PDF, {}, token)).status).toBe(400)
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('GET /exportacoes/resumo.pdf: o arquivo', () => {
  it('baixa como PDF, com o nome do período e sem cache', async () => {
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { resposta } = await baixar(PDF, NOVEMBRO, token)

    expect(resposta.headers['content-type']).toBe(TIPO_PDF)
    expect(resposta.headers['content-disposition']).toBe(
      'attachment; filename=fhdod-resumo-2026-11-01-a-2026-11-30.pdf',
    )
    expect(resposta.headers['cache-control']).toBe('no-store')
  })

  it('os números do PDF batem com os do resumo.xlsx para os mesmos filtros', async () => {
    const { pronto } = await cenario()
    const token = await tokenDe({ perfil: 'OUVIDORIA', nome: 'Renata Ouvidoria' })

    for (const query of [NOVEMBRO, { ...NOVEMBRO, base: 'ENVIO' }, { ...NOVEMBRO, setorId: pronto.id }]) {
      const [pdf, excel] = await Promise.all([abrirPdf(query, token), abrirResumoEmExcel(query, token)])
      const doExcel = (rotulo: string) => excel.find(([primeira]) => primeira === rotulo)

      // Os indicadores, com o tipo de cada número para escrevê-lo como o PDF escreve.
      const tipos = new Map(
        indicadoresDoResumo({
          nps: 0,
          total: 0,
          promotores: 0,
          neutros: 0,
          detratores: 0,
          notasBaixas: 0,
          baixissimas: 0,
          mediaEscala: 0,
        }).map(([rotulo, { tipo }]) => [rotulo, tipo]),
      )
      for (const [rotulo, tipo] of tipos) {
        const valor = doExcel(rotulo)?.[1]
        expect(valorAoLado(pdf, rotulo), rotulo).toBe(
          typeof valor === 'number' ? numeroBrasileiro({ valor, tipo }) : valor,
        )
      }

      // As tabelas: cada setor e cada categoria do Excel, com os mesmos números, na mesma ordem.
      const linhasDaTabela = (titulo: string, tiposDasColunas: TipoDeNumero[]) => {
        const inicio = excel.findIndex(([primeira]) => primeira === titulo) + 2
        const fim = excel.findIndex((linha, indice) => indice >= inicio && !linhaDeDados(linha))
        return excel
          .slice(inicio, fim === -1 ? undefined : fim)
          .map(([nome, ...numeros]) => [
            nome,
            ...numeros.map((valor, indice) =>
              numeroBrasileiro({ valor: valor as number, tipo: tiposDasColunas[indice] ?? 'contagem' }),
            ),
          ])
      }
      const linhaDeDados = (linha: ExcelJS.CellValue[]) => linha.length > 1 && typeof linha[1] === 'number'
      const setoresDoExcel = linhasDaTabela('NPS por setor', ['inteiro', 'contagem'])
      const categoriasDoExcel = linhasDaTabela('Médias por categoria', ['media', 'percentual', 'contagem'])
      expect(setoresDoExcel.length).toBeGreaterThan(0)
      expect(categoriasDoExcel.length).toBeGreaterThan(0)
      for (const linha of [...setoresDoExcel, ...categoriasDoExcel]) {
        expect(linhaQueComeca(pdf, String(linha[0]))).toEqual(linha)
      }
      const ordemNoPdf = pdf.linhas
        .map(([primeiro]) => primeiro)
        .filter((nome) => nome === 'Pronto Atendimento' || nome === 'Pediatria')
      expect(ordemNoPdf).toEqual(setoresDoExcel.map(([nome]) => nome))

      for (const rotulo of ['Período', 'Data considerada', 'Setor', 'Turno', 'Canal', 'Gerado por']) {
        expect(valorAoLado(pdf, rotulo), rotulo).toBe(doExcel(rotulo)?.[1])
      }
    }
  })

  it('em no máximo duas páginas, sem texto nem telefone do paciente', async () => {
    await cenario()
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const pdf = await abrirPdf(NOVEMBRO, token)

    expect(pdf.paginas).toBeLessThanOrEqual(2)
    const texto = pdf.linhas.flat().join(' ')
    expect(texto).not.toContain('Texto do paciente')
    expect(texto).not.toContain('99999')
    expect(texto).toContain('Página 1 de 1')
  })

  it('o Gestor leva só os seus setores, e o PDF diz quais são', async () => {
    const { pronto } = await cenario()
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })

    const pdf = await abrirPdf(NOVEMBRO, token)

    expect(valorAoLado(pdf, 'Setor')).toBe('Os seus setores: Pronto Atendimento')
    expect(valorAoLado(pdf, 'Respostas')).toBe('3')
    expect(pdf.linhas.flat()).not.toContain('Pediatria')
  })
})

describe('GET /exportacoes/resumo.pdf: auditoria', () => {
  it('cada PDF grava uma linha, com quem exportou, de onde e os filtros', async () => {
    const { pronto } = await cenario()
    const usuario = await criarUsuario({ perfil: 'VISUALIZADOR', setorIds: [pronto.id] })

    await baixar(PDF, { ...NOVEMBRO, canal: 'WEB' }, await emitirTokenDeAcesso(usuario.id))

    const linhas = await prisma.auditoria.findMany()
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      usuarioId: usuario.id,
      acao: 'exportacao_de_resumo_em_pdf',
      entidade: 'respostas',
      entidadeId: null,
      dados: {
        filtros: { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO', canal: 'WEB' },
        respostas: 3,
        comTelefones: false,
      },
    })
  })

  it('sem a linha da auditoria, o PDF não sai', async () => {
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    vi.spyOn(exportacaoRepository, 'registrarExportacao').mockRejectedValueOnce(new Error('Banco fora do ar'))

    const resposta = await pedir(PDF, NOVEMBRO, token)

    expect(resposta.status).toBe(500)
    expect(resposta.headers['content-disposition']).toBeUndefined()
    expect(resposta.headers['content-type']).toMatch(/^application\/json/)
  })
})
