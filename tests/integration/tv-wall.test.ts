import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import {
  DIAS_DOS_DESTAQUES,
  MENSAGEM_TELA_INATIVA,
  MENSAGEM_TELA_NAO_ENCONTRADA,
  MINUTOS_ENTRE_ACESSOS,
  SEMANAS_DA_EVOLUCAO,
  type IndicadoresTv,
} from '../../src/modules/tv-wall/tv-wall.schemas'
import type { Perfil } from '../../src/shared/constants/perfis'
import { emitirTokenDeAcesso, hashDoToken } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta, type DadosDaResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarTelaTv } from '../factories/telas-tv'
import { criarTurno } from '../factories/turnos'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `tvwall:gerenciar`. */
const SEM_A_PERMISSAO: Perfil[] = ['GESTOR', 'OUVIDORIA', 'VISUALIZADOR']

const MENSAGEM_ID = 'O ID precisa ser um número inteiro positivo.'

/** Terça, 24/11/2026, meio-dia em Brasília: o "agora" dos testes dos indicadores. */
const AGORA = '2026-11-24T15:00:00.000Z'

/** As segundas-feiras das 12 semanas da evolução em `AGORA`: a atual começa em 23/11. */
const SEGUNDAS = [
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-23',
]

beforeEach(async () => {
  await limparBanco()
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Cria o usuário e devolve um token de acesso dele, assinado pela API. */
async function tokenDe(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return emitirTokenDeAcesso(usuario.id)
}

function pedir(metodo: 'get' | 'post' | 'patch', caminho: string, token?: string) {
  const pedido = request(app)[metodo](`/api/v1${caminho}`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

/** O GET /tv/indicadores, como a TV pede: com o token do link no `X-Tv-Token`, se vier. */
function indicadores(tokenDaTela?: string) {
  const pedido = request(app).get('/api/v1/tv/indicadores')
  return tokenDaTela === undefined ? pedido : pedido.set('X-Tv-Token', tokenDaTela)
}

/** Pede os indicadores e confere o 200. */
async function lerIndicadores(tokenDaTela: string): Promise<IndicadoresTv> {
  const resposta = await indicadores(tokenDaTela)
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200)
  return (resposta.body as { data: IndicadoresTv }).data
}

/** Congela o relógio da API no instante pedido; o `afterEach` o solta. */
function relogioEm(instante: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instante))
}

interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

function esperarTelaInativa(resposta: request.Response) {
  expect(resposta.status).toBe(401)
  expect(erroDe(resposta)).toMatchObject({ codigo: 'NAO_AUTENTICADO', mensagem: MENSAGEM_TELA_INATIVA })
}

async function telaNoBanco(id: number) {
  return prisma.tvTela.findUniqueOrThrow({ where: { id } })
}

describe('GET /tv-telas', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403; com a senha provisória: 403', async () => {
    await criarTelaTv()

    expect((await pedir('get', '/tv-telas')).status).toBe(401)
    for (const perfil of SEM_A_PERMISSAO) {
      const resposta = await pedir('get', '/tv-telas', await tokenDe({ perfil }))
      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta).codigo, perfil).toBe('SEM_PERMISSAO')
    }
    const provisoria = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })
    expect((await pedir('get', '/tv-telas', provisoria)).status).toBe(403)
  })

  it('o Super Admin recebe todas, ativas e desativadas, em ordem alfabética, sem o token nem o hash', async () => {
    const recepcao = await criarTelaTv({
      nome: 'Recepção principal',
      ultimoAcessoEm: '2026-11-24T14:55:02.318Z',
    })
    const corredor = await criarTelaTv({ nome: 'Corredor da Internação', ativa: false })
    // Na ordem do português, o "É" fica entre o "C" e o "R".
    const etica = await criarTelaTv({ nome: 'Ética e Ouvidoria' })

    const resposta = await pedir('get', '/tv-telas', await tokenDe({ perfil: 'SUPER_ADMIN' }))

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({
      data: [
        { id: corredor.tela.id, nome: 'Corredor da Internação', ativa: false, ultimoAcessoEm: null },
        { id: etica.tela.id, nome: 'Ética e Ouvidoria', ativa: true, ultimoAcessoEm: null },
        {
          id: recepcao.tela.id,
          nome: 'Recepção principal',
          ativa: true,
          ultimoAcessoEm: '2026-11-24T14:55:02.318Z',
        },
      ],
    })
    for (const { token } of [recepcao, corredor, etica]) {
      expect(resposta.text).not.toContain(token)
      expect(resposta.text).not.toContain(hashDoToken(token))
    }
  })

  it('sem telas, a lista vem vazia', async () => {
    const resposta = await pedir('get', '/tv-telas', await tokenDe({ perfil: 'SUPER_ADMIN' }))

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: [] })
  })
})

describe('POST /tv-telas', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem criar nada', async () => {
    expect((await pedir('post', '/tv-telas').send({ nome: 'Recepção principal' })).status).toBe(401)
    for (const perfil of SEM_A_PERMISSAO) {
      const resposta = await pedir('post', '/tv-telas', await tokenDe({ perfil })).send({
        nome: 'Recepção principal',
      })
      expect(resposta.status, perfil).toBe(403)
    }

    expect(await prisma.tvTela.count()).toBe(0)
  })

  it('o Super Admin cria a tela, já ativa: 201 com o token, fora do cache, e o banco guarda só o hash', async () => {
    const admin = await criarUsuario({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/tv-telas', await emitirTokenDeAcesso(admin.id)).send({
      nome: '  Recepção principal  ',
    })

    expect(resposta.status).toBe(201)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      data: {
        tela: { id: expect.any(Number), nome: 'Recepção principal', ativa: true, ultimoAcessoEm: null },
        // 32 bytes aleatórios em base64url.
        token: expect.stringMatching(/^[\w-]{43}$/),
      },
    })
    const { tela, token } = (resposta.body as { data: { tela: { id: number }; token: string } }).data
    expect(await telaNoBanco(tela.id)).toMatchObject({
      nome: 'Recepção principal',
      ativa: true,
      ultimoAcessoEm: null,
      tokenHash: hashDoToken(token),
      criadoPorId: admin.id,
    })
  })

  it('o token da criação abre a TV, e cada tela ganha o seu', async () => {
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const criar = async (nome: string) => {
      const resposta = await pedir('post', '/tv-telas', admin).send({ nome })
      return (resposta.body as { data: { token: string } }).data.token
    }

    const recepcao = await criar('Recepção principal')
    const corredor = await criar('Corredor da Internação')

    expect(recepcao).not.toBe(corredor)
    expect((await lerIndicadores(recepcao)).tela).toBe('Recepção principal')
    expect((await lerIndicadores(corredor)).tela).toBe('Corredor da Internação')
  })

  it('nome ausente, com menos de 2 caracteres, só com espaços ou acima de 100: 400 em nome, sem criar nada', async () => {
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const casos: [object, string][] = [
      [{}, 'Obrigatório'],
      [{ nome: 'R' }, 'Informe onde a tela fica'],
      [{ nome: '     ' }, 'Informe onde a tela fica'],
      [{ nome: 'x'.repeat(101) }, 'Use no máximo 100 caracteres'],
    ]

    for (const [corpo, mensagem] of casos) {
      const resposta = await pedir('post', '/tv-telas', admin).send(corpo)
      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes, JSON.stringify(corpo)).toEqual([{ campo: 'nome', mensagem }])
    }
    const numero = await pedir('post', '/tv-telas', admin).send({ nome: 42 })
    expect(numero.status).toBe(400)
    expect(erroDe(numero).detalhes.map(({ campo }) => campo)).toEqual(['nome'])
    expect(await prisma.tvTela.count()).toBe(0)

    // Os limites passam.
    expect((await pedir('post', '/tv-telas', admin).send({ nome: 'TV' })).status).toBe(201)
    expect((await pedir('post', '/tv-telas', admin).send({ nome: 'x'.repeat(100) })).status).toBe(201)
  })
})

describe('PATCH /tv-telas/:id/status', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem mudar nada', async () => {
    const { tela } = await criarTelaTv()

    expect((await pedir('patch', `/tv-telas/${tela.id}/status`).send({ ativa: false })).status).toBe(401)
    for (const perfil of SEM_A_PERMISSAO) {
      const resposta = await pedir('patch', `/tv-telas/${tela.id}/status`, await tokenDe({ perfil })).send({
        ativa: false,
      })
      expect(resposta.status, perfil).toBe(403)
    }

    expect((await telaNoBanco(tela.id)).ativa).toBe(true)
  })

  it('desativada com 204, a tela para de abrir na hora, e as outras continuam; ativada de novo, o mesmo link volta', async () => {
    const recepcao = await criarTelaTv({ nome: 'Recepção principal' })
    const corredor = await criarTelaTv({ nome: 'Corredor da Internação' })
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })
    await lerIndicadores(recepcao.token)

    const desativar = await pedir('patch', `/tv-telas/${recepcao.tela.id}/status`, admin).send({
      ativa: false,
    })

    expect(desativar.status).toBe(204)
    expect(desativar.text).toBe('')
    esperarTelaInativa(await indicadores(recepcao.token))
    expect((await lerIndicadores(corredor.token)).tela).toBe('Corredor da Internação')
    expect((await pedir('get', '/tv-telas', admin)).body).toMatchObject({
      data: [
        { nome: 'Corredor da Internação', ativa: true },
        { nome: 'Recepção principal', ativa: false },
      ],
    })

    const ativar = await pedir('patch', `/tv-telas/${recepcao.tela.id}/status`, admin).send({ ativa: true })

    expect(ativar.status).toBe(204)
    expect((await lerIndicadores(recepcao.token)).tela).toBe('Recepção principal')
  })

  it('ativa ausente ou que não é booleano: 400 em ativa, sem mudar nada', async () => {
    const { tela } = await criarTelaTv()
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const corpo of [{}, { ativa: 'false' }, { ativa: 0 }, { ativo: false }]) {
      const resposta = await pedir('patch', `/tv-telas/${tela.id}/status`, admin).send(corpo)
      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map(({ campo }) => campo),
        JSON.stringify(corpo),
      ).toEqual(['ativa'])
    }

    expect((await telaNoBanco(tela.id)).ativa).toBe(true)
  })

  it('tela inexistente: 404; ID que não é um inteiro positivo: 400 em id', async () => {
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const inexistente = await pedir('patch', '/tv-telas/999/status', admin).send({ ativa: false })

    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: MENSAGEM_TELA_NAO_ENCONTRADA,
    })
    for (const id of ['0', '-1', 'abc', '1.5']) {
      const resposta = await pedir('patch', `/tv-telas/${id}/status`, admin).send({ ativa: false })
      expect(resposta.status, id).toBe(400)
      expect(erroDe(resposta).detalhes, id).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
    }
  })
})

describe('GET /tv/indicadores: o token da tela', () => {
  it('com o token de uma tela ativa: 200, com o nome da tela', async () => {
    const { token } = await criarTelaTv({ nome: 'Recepção principal' })

    expect((await lerIndicadores(token)).tela).toBe('Recepção principal')
  })

  it('sem o token, vazio, com um que não existe ou com o de uma tela desativada: 401 "Esta tela não está ativa."', async () => {
    await criarTelaTv({ token: 'token-de-uma-tela-ativa' })
    const desativada = await criarTelaTv({ ativa: false })

    for (const token of [undefined, '', 'token-que-nao-existe', desativada.token]) {
      esperarTelaInativa(await indicadores(token))
    }
  })

  it('o login do painel não abre a TV, nem o hash do token no lugar dele', async () => {
    const { token } = await criarTelaTv()
    const admin = await tokenDe({ perfil: 'SUPER_ADMIN' })

    esperarTelaInativa(await indicadores().set('Authorization', bearer(admin)))
    esperarTelaInativa(await indicadores(hashDoToken(token)))
  })

  it(`grava o último acesso na primeira consulta e, depois, no máximo a cada ${MINUTOS_ENTRE_ACESSOS} minutos`, async () => {
    const { tela, token } = await criarTelaTv()
    const ultimoAcesso = async () => (await telaNoBanco(tela.id)).ultimoAcessoEm?.toISOString()

    relogioEm('2026-11-24T15:00:00.000Z')
    await lerIndicadores(token)
    expect(await ultimoAcesso()).toBe('2026-11-24T15:00:00.000Z')

    vi.setSystemTime(new Date('2026-11-24T15:04:59.999Z'))
    await lerIndicadores(token)
    expect(await ultimoAcesso()).toBe('2026-11-24T15:00:00.000Z')

    vi.setSystemTime(new Date('2026-11-24T15:05:00.000Z'))
    await lerIndicadores(token)
    expect(await ultimoAcesso()).toBe('2026-11-24T15:05:00.000Z')

    // O painel mostra o acesso, que não conta como mudança no cadastro da tela.
    const lista = await pedir('get', '/tv-telas', await tokenDe({ perfil: 'SUPER_ADMIN' }))
    expect(lista.body).toMatchObject({ data: [{ id: tela.id, ultimoAcessoEm: '2026-11-24T15:05:00.000Z' }] })
    expect((await telaNoBanco(tela.id)).atualizadoEm).toEqual(tela.atualizadoEm)
  })

  it('a tela desativada não grava o acesso', async () => {
    const { tela, token } = await criarTelaTv({ ativa: false })

    esperarTelaInativa(await indicadores(token))

    expect((await telaNoBanco(tela.id)).ultimoAcessoEm).toBeNull()
  })
})

/** Três setores, um deles desativado, com uma pergunta de escala em cada e o turno das respostas. */
async function cenario() {
  const categoria = await criarCategoria({ nome: 'Recepção' })
  const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
  const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
  const maternidade = await criarSetor({ nome: 'Maternidade', slug: 'maternidade', ativo: false })
  const turno = await criarTurno()
  const perguntas = new Map<number, number>()
  for (const setor of [pronto, pediatria, maternidade]) {
    perguntas.set(setor.id, (await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })).id)
  }

  /** Uma resposta no setor, atendida no dia pedido, com a pergunta de escala dele. */
  function responder(
    setor: { id: number },
    dataAtendimento: string,
    dados: Omit<DadosDaResposta, 'setorId' | 'dataAtendimento'> = {},
  ) {
    return criarResposta({
      setorId: setor.id,
      turnoId: turno.id,
      dataAtendimento,
      perguntaIds: [perguntas.get(setor.id) ?? 0],
      ...dados,
    })
  }

  return { pronto, pediatria, maternidade, responder }
}

describe('GET /tv/indicadores: os números', () => {
  it('o mês corrente pela data do atendimento, de todos os setores, também o desativado, com as contas do dashboard', async () => {
    relogioEm(AGORA)
    const { pronto, pediatria, maternidade, responder } = await cenario()
    await responder(pronto, '2026-11-01', { nps: 10, nota: 5 })
    await responder(pronto, '2026-11-10', { nps: 9, nota: 4 })
    await responder(pronto, '2026-11-12', { nps: 8, nota: 3 })
    await responder(pronto, '2026-11-24', { nps: 3, nota: 1 })
    await responder(pediatria, '2026-11-20', { nps: 10, nota: 5 })
    await responder(pediatria, '2026-11-21', { nps: 9, nota: 5 })
    await responder(maternidade, '2026-11-05', { nps: 0, nota: 2 })
    // Atendida em outubro e enviada em novembro: fora do mês.
    await responder(pediatria, '2026-10-31', { nps: 0, nota: 1, enviadoEm: '2026-11-02T12:00:00Z' })
    // Quem criou a tela não limita os números: a TV junta todos os setores.
    const gestor = await criarUsuario({ perfil: 'GESTOR', setorIds: [pronto.id] })
    const { token } = await criarTelaTv({ nome: 'Recepção principal', criadoPorId: gestor.id })

    const dados = await lerIndicadores(token)

    expect(dados.tela).toBe('Recepção principal')
    expect(dados.geradoEm).toBe(AGORA)
    // 7 respostas: 4 promotores, 1 neutro e 2 detratores, (4 - 2) / 7 = 29; as notas somam 25 em 7.
    expect(dados.mes).toEqual({
      nps: 29,
      total: 7,
      promotores: 4,
      neutros: 1,
      detratores: 2,
      mediaEscala: 3.6,
    })
    expect(dados.npsPorSetor).toEqual([
      { setor: 'Pediatria', nps: 100, total: 2 },
      { setor: 'Pronto Atendimento', nps: 25, total: 4 },
      { setor: 'Maternidade', nps: -100, total: 1 },
    ])

    const doPainel = await pedir('get', '/dashboard/resumo', await tokenDe({ perfil: 'SUPER_ADMIN' })).query({
      inicio: '2026-11-01',
      fim: '2026-11-24',
      base: 'ATENDIMENTO',
    })
    expect((doPainel.body as { data: object }).data).toMatchObject(dados.mes)
  })

  it('o mês é o de hoje em Brasília: às 23h30 do dia 30, ainda é novembro; à meia-noite, já é dezembro', async () => {
    const { pronto, responder } = await cenario()
    await responder(pronto, '2026-11-30', { nps: 10, nota: 5 })
    const { token } = await criarTelaTv()

    // 23h30 de 30/11 em Brasília.
    relogioEm('2026-12-01T02:30:00Z')
    expect((await lerIndicadores(token)).mes).toMatchObject({ nps: 100, total: 1 })

    // Meia-noite de 01/12 em Brasília.
    vi.setSystemTime(new Date('2026-12-01T03:00:00Z'))
    expect(await lerIndicadores(token)).toMatchObject({
      mes: { nps: null, total: 0, promotores: 0, neutros: 0, detratores: 0, mediaEscala: null },
      npsPorSetor: [],
    })
  })

  it(`a evolução: as ${SEMANAS_DA_EVOLUCAO} semanas até a atual, de segunda a domingo, inclusive as vazias`, async () => {
    relogioEm(AGORA)
    const { pronto, pediatria, responder } = await cenario()
    // O domingo antes da primeira semana fica de fora.
    await responder(pronto, '2026-09-06', { nps: 0 })
    // A primeira semana inteira: de segunda, 07/09, a domingo, 13/09.
    await responder(pronto, '2026-09-07', { nps: 10 })
    await responder(pediatria, '2026-09-13', { nps: 0 })
    await responder(pronto, '2026-10-14', { nps: 9 })
    // A semana atual vai até hoje.
    await responder(pronto, '2026-11-23', { nps: 10 })
    await responder(pediatria, '2026-11-24', { nps: 7 })
    const { token } = await criarTelaTv()

    const { evolucao } = await lerIndicadores(token)

    expect(evolucao).toHaveLength(SEMANAS_DA_EVOLUCAO)
    expect(evolucao).toEqual([
      { periodo: '2026-09-07', nps: 0, total: 2 },
      { periodo: '2026-09-14', nps: null, total: 0 },
      { periodo: '2026-09-21', nps: null, total: 0 },
      { periodo: '2026-09-28', nps: null, total: 0 },
      { periodo: '2026-10-05', nps: null, total: 0 },
      { periodo: '2026-10-12', nps: 100, total: 1 },
      { periodo: '2026-10-19', nps: null, total: 0 },
      { periodo: '2026-10-26', nps: null, total: 0 },
      { periodo: '2026-11-02', nps: null, total: 0 },
      { periodo: '2026-11-09', nps: null, total: 0 },
      { periodo: '2026-11-16', nps: null, total: 0 },
      { periodo: '2026-11-23', nps: 50, total: 2 },
    ])
  })

  it(`os destaques: o melhor ponto de até 3 setores diferentes, nos últimos ${DIAS_DOS_DESTAQUES} dias, com 5 notas ou mais`, async () => {
    // Os 30 dias, contando hoje, vão de 26/10 a 24/11.
    relogioEm(AGORA)
    const recepcao = await criarCategoria({ nome: 'Recepção', ordem: 1 })
    const limpeza = await criarCategoria({ nome: 'Limpeza', ordem: 2 })
    const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
    const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
    const ambulatorio = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio' })
    const laboratorio = await criarSetor({ nome: 'Laboratório', slug: 'laboratorio' })
    const turno = await criarTurno()
    const perguntas = new Map<string, number>()
    for (const setor of [pronto, pediatria, ambulatorio, laboratorio]) {
      for (const categoria of [recepcao, limpeza]) {
        const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
        perguntas.set(`${setor.id}:${categoria.id}`, pergunta.id)
      }
    }
    /** Uma resposta por nota, no ponto pedido, atendida em 10/11 se o teste não pedir outro dia. */
    async function notas(
      setor: { id: number },
      categoria: { id: number },
      valores: number[],
      dataAtendimento = '2026-11-10',
    ) {
      for (const nota of valores) {
        await criarResposta({
          setorId: setor.id,
          turnoId: turno.id,
          dataAtendimento,
          perguntaIds: [perguntas.get(`${setor.id}:${categoria.id}`) ?? 0],
          nota,
        })
      }
    }

    // O Laboratório só chega a 5 notas com a do primeiro dia, 26/10: média 5.
    await notas(laboratorio, limpeza, [5, 5, 5, 5])
    await notas(laboratorio, limpeza, [5], '2026-10-26')
    await notas(laboratorio, recepcao, [3, 3, 3, 3, 3])
    // O Pronto Atendimento entra com o melhor dos seus pontos, e o segundo fica de fora.
    await notas(pronto, recepcao, [5, 5, 5, 5, 4])
    await notas(pronto, limpeza, [5, 5, 5, 4, 4])
    // A Pediatria só chega a 5 notas na Limpeza com a de hoje; a Recepção, com média 5, tem só 4 notas.
    await notas(pediatria, limpeza, [5, 4, 4, 4])
    await notas(pediatria, limpeza, [4], '2026-11-24')
    await notas(pediatria, recepcao, [5, 5, 5, 5])
    // O Ambulatório seria o quarto setor. A Limpeza dele só teria 5 notas, todas 5, contando a de 25/10, que fica
    // fora dos 30 dias.
    await notas(ambulatorio, recepcao, [4, 4, 4, 3, 3])
    await notas(ambulatorio, limpeza, [5, 5, 5, 5], '2026-10-26')
    await notas(ambulatorio, limpeza, [5], '2026-10-25')
    const { token } = await criarTelaTv()

    const { destaques } = await lerIndicadores(token)

    expect(destaques).toEqual([
      { setor: 'Laboratório', categoria: 'Limpeza', media: 5, percentual45: 100 },
      { setor: 'Pronto Atendimento', categoria: 'Recepção', media: 4.8, percentual45: 100 },
      { setor: 'Pediatria', categoria: 'Limpeza', media: 4.2, percentual45: 100 },
    ])
  })

  it(`sem respostas: o mês zerado, nenhum setor, as ${SEMANAS_DA_EVOLUCAO} semanas vazias e nenhum destaque`, async () => {
    relogioEm(AGORA)
    const { token } = await criarTelaTv({ nome: 'Recepção principal' })

    expect(await lerIndicadores(token)).toEqual({
      tela: 'Recepção principal',
      geradoEm: AGORA,
      mes: { nps: null, total: 0, promotores: 0, neutros: 0, detratores: 0, mediaEscala: null },
      npsPorSetor: [],
      evolucao: SEGUNDAS.map((periodo) => ({ periodo, nps: null, total: 0 })),
      destaques: [],
    })
  })

  it('a resposta não tem nenhum campo pessoal: nem comentário, nem telefone, nem texto escrito pelo paciente', async () => {
    relogioEm(AGORA)
    const categoria = await criarCategoria({ nome: 'Recepção' })
    const setor = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
    const escala = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const livre = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, tipo: 'TEXTO' })
    for (let i = 0; i < 5; i += 1) {
      await criarResposta({
        setorId: setor.id,
        dataAtendimento: '2026-11-20',
        perguntaIds: [escala.id, livre.id],
        nps: i === 0 ? 2 : 10,
        nota: 5,
        classificacao: i === 0 ? 'BAIXISSIMA' : 'NORMAL',
        comentario: { tipo: 'RECLAMACAO', texto: `Esperei demais na recepção, escreveu o paciente ${i}` },
        contato: { telefone: '(51) 98765-4321' },
      })
    }
    await prisma.respostaItem.updateMany({
      where: { tipo: 'TEXTO' },
      data: { valorTexto: 'Texto livre escrito pelo paciente' },
    })
    const { token } = await criarTelaTv()

    const resposta = await indicadores(token)

    expect(resposta.status).toBe(200)
    // As respostas entram nos números: cada parte da resposta tem o que mostrar.
    const { data } = resposta.body as { data: IndicadoresTv }
    expect(data.mes.total).toBe(5)
    expect(data.npsPorSetor).toHaveLength(1)
    expect(data.destaques).toHaveLength(1)
    expect([...chaves(resposta.body)].sort()).toEqual(
      [
        'data',
        'tela',
        'geradoEm',
        'mes',
        'nps',
        'total',
        'promotores',
        'neutros',
        'detratores',
        'mediaEscala',
        'npsPorSetor',
        'setor',
        'evolucao',
        'periodo',
        'destaques',
        'categoria',
        'media',
        'percentual45',
      ].sort(),
    )
    for (const pessoal of [
      'escreveu o paciente',
      'Texto livre',
      'RECLAMACAO',
      'BAIXISSIMA',
      '98765',
      '4321',
      '•',
    ]) {
      expect(resposta.text, pessoal).not.toContain(pessoal)
    }
  })
})

/** Todas as chaves dos objetos de uma resposta, em qualquer nível. */
function chaves(valor: unknown, encontradas = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) {
    for (const item of valor) chaves(item, encontradas)
  } else if (valor !== null && typeof valor === 'object') {
    for (const [chave, filho] of Object.entries(valor)) {
      encontradas.add(chave)
      chaves(filho, encontradas)
    }
  }
  return encontradas
}
