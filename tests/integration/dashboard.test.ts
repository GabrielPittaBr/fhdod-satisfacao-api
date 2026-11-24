import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authService } from '../../src/modules/auth/auth.service'
import {
  MAXIMO_DE_PONTOS,
  MENSAGEM_GRANULARIDADE,
  MENSAGENS_DE_PONTOS_DEMAIS,
} from '../../src/modules/dashboard/dashboard.schemas'
import type { Perfil } from '../../src/shared/constants/perfis'
import { MENSAGENS_DOS_FILTROS } from '../../src/shared/http/filtros-do-painel'
import { MENSAGEM_FORA_DO_SETOR } from '../../src/shared/security/acesso'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta, type DadosDaResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

type Rota = 'resumo' | 'nps-por-setor' | 'evolucao'
type Query = Record<string, string | number>

/** As três rotas, com o que cada uma pede além dos filtros. */
const ROTAS: [Rota, Query][] = [
  ['resumo', {}],
  ['nps-por-setor', {}],
  ['evolucao', { granularidade: 'MES' }],
]

const NOVEMBRO = { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO' }

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Cria o usuário e devolve um token de acesso dele, assinado pela API. */
async function tokenDe(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return emitirTokenDeAcesso(usuario.id)
}

function pedir(rota: Rota, query: Query, token?: string) {
  const pedido = request(app).get(`/api/v1/dashboard/${rota}`).query(query)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

interface Resumo {
  nps: number | null
  total: number
  promotores: number
  neutros: number
  detratores: number
  notasBaixas: number
  baixissimas: number
  mediaEscala: number | null
}
interface NpsSetor {
  setorId: number
  setor: string
  nps: number | null
  total: number
}
interface PontoEvolucao {
  periodo: string
  nps: number | null
  total: number
}
interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

/** Pede a rota e confere o 200. */
async function ler<T>(rota: Rota, query: Query, token: string): Promise<T> {
  const resposta = await pedir(rota, query, token)
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200)
  return (resposta.body as { data: T }).data
}

const resumo = (query: Query, token: string) => ler<Resumo>('resumo', query, token)
const npsPorSetor = (query: Query, token: string) => ler<NpsSetor[]>('nps-por-setor', query, token)
const evolucao = (query: Query, token: string) => ler<PontoEvolucao[]>('evolucao', query, token)

/** O total de respostas que cada rota contou com os mesmos filtros. */
async function totaisDasTresRotas(query: Query, token: string) {
  const [doResumo, setores, pontos] = await Promise.all([
    resumo(query, token),
    npsPorSetor(query, token),
    evolucao({ ...query, granularidade: 'DIA' }, token),
  ])
  const somar = (lista: { total: number }[]) => lista.reduce((soma, { total }) => soma + total, 0)
  return [doResumo.total, somar(setores), somar(pontos)]
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

/** Os setores, os turnos e uma pergunta de escala por setor; o Pronto Atendimento tem também um sim ou não. */
async function cenario() {
  const categoria = await criarCategoria()
  const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
  const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
  const maternidade = await criarSetor({ nome: 'Maternidade', slug: 'maternidade' })
  const manha = await criarTurno({ nome: 'Manhã' })
  const noite = await criarTurno({ nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' })
  const escala = async (setorId: number) => (await criarPergunta({ setorId, categoriaId: categoria.id })).id
  const perguntas = {
    [pronto.id]: [
      await escala(pronto.id),
      (await criarPergunta({ setorId: pronto.id, categoriaId: categoria.id, tipo: 'SIM_NAO' })).id,
    ],
    [pediatria.id]: [await escala(pediatria.id)],
    [maternidade.id]: [await escala(maternidade.id)],
  }

  /** Uma resposta no setor, com as perguntas dele, no turno da manhã e em 10/11, se o teste não pedir outra coisa. */
  function responder(setorId: number, dados: Omit<DadosDaResposta, 'setorId'> = {}) {
    return criarResposta({
      setorId,
      turnoId: manha.id,
      dataAtendimento: '2026-11-10',
      perguntaIds: perguntas[setorId] ?? [],
      ...dados,
    })
  }

  return { pronto, pediatria, maternidade, manha, noite, responder }
}

describe('acesso ao dashboard', () => {
  it.each(ROTAS)('%s sem login: 401', async (rota, extra) => {
    const resposta = await pedir(rota, { ...NOVEMBRO, ...extra })

    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
  })

  it.each(ROTAS)('%s com a senha provisória: 403', async (rota, extra) => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })

    const resposta = await pedir(rota, { ...NOVEMBRO, ...extra }, token)

    expect(resposta.status).toBe(403)
    expect(erroDe(resposta).codigo).toBe('SEM_PERMISSAO')
  })

  it.each(ROTAS)('%s sem dashboard:ver: 403', async (rota, extra) => {
    // Os quatro perfis têm a permissão: o teste tira a permissão de quem está logado, como faria uma mudança
    // no mapa de permissões.
    const autenticar = authService.autenticar.bind(authService)
    vi.spyOn(authService, 'autenticar').mockImplementation(async (token) => {
      const usuario = await autenticar(token)
      return { ...usuario, permissoes: usuario.permissoes.filter((p) => p !== 'dashboard:ver') }
    })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    try {
      const resposta = await pedir(rota, { ...NOVEMBRO, ...extra }, token)

      expect(resposta.status).toBe(403)
      expect(erroDe(resposta)).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    } finally {
      vi.restoreAllMocks()
    }
    await pedir(rota, { ...NOVEMBRO, ...extra }, token).expect(200)
  })

  it.each(['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'] as Perfil[])(
    'o %s tem dashboard:ver e lê as três rotas',
    async (perfil) => {
      const token = await tokenDe({ perfil })

      for (const [rota, extra] of ROTAS) {
        await pedir(rota, { ...NOVEMBRO, ...extra }, token).expect(200)
      }
    },
  )

  it.each(['GESTOR', 'VISUALIZADOR'] as Perfil[])(
    'o %s que pede um setor que não é seu recebe 403 nas três rotas',
    async (perfil) => {
      const { pronto, maternidade, responder } = await cenario()
      await responder(maternidade.id)
      const token = await tokenDe({ perfil, setorIds: [pronto.id] })

      for (const [rota, extra] of ROTAS) {
        for (const setorId of [maternidade.id, 'todos', '']) {
          const resposta = await pedir(rota, { ...NOVEMBRO, ...extra, setorId }, token)

          expect(resposta.status, `${rota} ${setorId}`).toBe(403)
          expect(erroDe(resposta)).toMatchObject({
            codigo: 'SEM_PERMISSAO',
            mensagem: MENSAGEM_FORA_DO_SETOR,
          })
        }
      }
    },
  )

  it.each(['GESTOR', 'VISUALIZADOR'] as Perfil[])(
    'o %s só conta os seus setores, mesmo sem pedir um',
    async (perfil) => {
      const { pronto, pediatria, maternidade, responder } = await cenario()
      await responder(pronto.id, { nps: 10 })
      await responder(pronto.id, { nps: 9 })
      await responder(pediatria.id, { nps: 6 })
      await responder(maternidade.id, { nps: 0 })
      await responder(maternidade.id, { nps: 1 })
      const token = await tokenDe({ perfil, setorIds: [pronto.id, pediatria.id] })

      expect(await resumo(NOVEMBRO, token)).toMatchObject({ total: 3, promotores: 2, detratores: 1, nps: 33 })
      expect((await npsPorSetor(NOVEMBRO, token)).map(({ setor }) => setor)).toEqual([
        'Pronto Atendimento',
        'Pediatria',
      ])
      expect(await totaisDasTresRotas(NOVEMBRO, token)).toEqual([3, 3, 3])

      const soPediatria = { ...NOVEMBRO, setorId: pediatria.id }
      expect(await resumo(soPediatria, token)).toMatchObject({ total: 1, nps: -100 })
      expect(await npsPorSetor(soPediatria, token)).toEqual([
        { setorId: pediatria.id, setor: 'Pediatria', nps: -100, total: 1 },
      ])
      expect(await totaisDasTresRotas(soPediatria, token)).toEqual([1, 1, 1])
    },
  )

  it('o Gestor sem setores não vê nenhuma resposta', async () => {
    const { pronto, responder } = await cenario()
    await responder(pronto.id)
    const token = await tokenDe({ perfil: 'GESTOR' })

    expect(await resumo(NOVEMBRO, token)).toMatchObject({ total: 0, nps: null })
    expect(await npsPorSetor(NOVEMBRO, token)).toEqual([])
    expect(await totaisDasTresRotas(NOVEMBRO, token)).toEqual([0, 0, 0])
  })

  it.each(['SUPER_ADMIN', 'OUVIDORIA'] as Perfil[])(
    'o %s conta todos os setores e pode pedir qualquer um',
    async (perfil) => {
      const { pronto, pediatria, maternidade, responder } = await cenario()
      await responder(pronto.id)
      await responder(pediatria.id)
      await responder(maternidade.id)
      // Os setores ligados a quem enxerga tudo não limitam nada.
      const token = await tokenDe({ perfil, setorIds: [pronto.id] })

      expect(await totaisDasTresRotas(NOVEMBRO, token)).toEqual([3, 3, 3])
      expect(await totaisDasTresRotas({ ...NOVEMBRO, setorId: maternidade.id }, token)).toEqual([1, 1, 1])
    },
  )
})

describe('filtros do dashboard', () => {
  it.each(ROTAS)('%s sem inicio, fim e base: 400 em cada um', async (rota, extra) => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir(rota, extra, token)

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.inicio },
      { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.fim },
      { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
    ])
  })

  it('data fora do formato ou que não existe: 400', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const inicio of [
      '01/11/2026',
      '2026-11-1',
      '2026-02-30',
      '2026-13-01',
      '2026-11-01T00:00:00Z',
      '',
    ]) {
      const resposta = await pedir('resumo', { ...NOVEMBRO, inicio }, token)

      expect(resposta.status, inicio).toBe(400)
      expect(erroDe(resposta).detalhes, inicio).toEqual([
        { campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.data },
      ])
    }
    await pedir('resumo', { ...NOVEMBRO, inicio: '2024-02-29' }, token).expect(200)
  })

  it.each(ROTAS)('%s com o fim antes do início: 400 em fim; o mesmo dia vale', async (rota, extra) => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir(
      rota,
      { ...extra, inicio: '2026-11-10', fim: '2026-11-09', base: 'ENVIO' },
      token,
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }])
    await pedir(rota, { ...extra, inicio: '2026-11-10', fim: '2026-11-10', base: 'ENVIO' }, token).expect(200)
  })

  it('base, setor, turno e canal fora dos valores aceitos: 400 em cada campo', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir(
      'resumo',
      { ...NOVEMBRO, base: 'envio', setorId: 'abc', turnoId: 0, canal: 'WHATSAPP' },
      token,
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
      { campo: 'setorId', mensagem: 'O ID precisa ser um número inteiro positivo.' },
      { campo: 'turnoId', mensagem: 'O ID precisa ser um número inteiro positivo.' },
      { campo: 'canal', mensagem: 'Canal inválido' },
    ])
  })

  it('o período inclui o primeiro e o último dia, pela data do atendimento', async () => {
    const { pronto, responder } = await cenario()
    for (const dataAtendimento of ['2026-10-31', '2026-11-01', '2026-11-15', '2026-11-30', '2026-12-01']) {
      // O envio fica fora do período, para provar que a base é a do atendimento.
      await responder(pronto.id, { dataAtendimento, enviadoEm: '2026-08-01T12:00:00Z' })
    }
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await totaisDasTresRotas(NOVEMBRO, token)).toEqual([3, 3, 3])
    expect(await totaisDasTresRotas({ ...NOVEMBRO, fim: '2026-11-01' }, token)).toEqual([1, 1, 1])
  })

  it('com base=ENVIO, vale o dia do envio em Brasília: 23h30 do dia 10 conta no dia 10, gravado em UTC no dia 11', async () => {
    const { pronto, responder } = await cenario()
    // 23h30 do dia 10 em Brasília (UTC-3), atendido no dia 9.
    await responder(pronto.id, { dataAtendimento: '2026-11-09', enviadoEm: '2026-11-11T02:30:00Z' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const dia = (data: string, base: string) => ({ inicio: data, fim: data, base })

    expect(await totaisDasTresRotas(dia('2026-11-10', 'ENVIO'), token)).toEqual([1, 1, 1])
    expect(await totaisDasTresRotas(dia('2026-11-11', 'ENVIO'), token)).toEqual([0, 0, 0])
    expect(await totaisDasTresRotas(dia('2026-11-09', 'ATENDIMENTO'), token)).toEqual([1, 1, 1])
    expect(await totaisDasTresRotas(dia('2026-11-10', 'ATENDIMENTO'), token)).toEqual([0, 0, 0])
  })

  it('com base=ENVIO, o dia vai da meia-noite à meia-noite de Brasília', async () => {
    const { pronto, responder } = await cenario()
    for (const enviadoEm of [
      '2026-11-10T02:59:59.999Z', // 23h59 do dia 9
      '2026-11-10T03:00:00.000Z', // meia-noite do dia 10
      '2026-11-11T02:59:59.999Z', // 23h59 do dia 10
      '2026-11-11T03:00:00.000Z', // meia-noite do dia 11
    ]) {
      await responder(pronto.id, { enviadoEm })
    }
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(
      await totaisDasTresRotas({ inicio: '2026-11-10', fim: '2026-11-10', base: 'ENVIO' }, token),
    ).toEqual([2, 2, 2])
    expect(
      await totaisDasTresRotas({ inicio: '2026-11-09', fim: '2026-11-11', base: 'ENVIO' }, token),
    ).toEqual([4, 4, 4])
  })

  it('setor, turno e canal valem juntos, nas três rotas', async () => {
    const { pronto, pediatria, manha, noite, responder } = await cenario()
    const certa = await responder(pronto.id, { turnoId: noite.id, canal: 'TOTEM', nps: 10 })
    await responder(pronto.id, { turnoId: noite.id, canal: 'WEB' })
    await responder(pronto.id, { turnoId: manha.id, canal: 'TOTEM' })
    await responder(pediatria.id, { turnoId: noite.id, canal: 'TOTEM' })
    await responder(pronto.id, { turnoId: noite.id, canal: 'TOTEM', dataAtendimento: '2026-10-10' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const filtros = { ...NOVEMBRO, setorId: pronto.id, turnoId: noite.id, canal: 'TOTEM' }

    expect(await totaisDasTresRotas(filtros, token)).toEqual([1, 1, 1])
    expect(await resumo(filtros, token)).toMatchObject({ total: 1, nps: 100 })
    expect(await npsPorSetor(filtros, token)).toEqual([
      { setorId: certa.setorId, setor: 'Pronto Atendimento', nps: 100, total: 1 },
    ])
    expect(await totaisDasTresRotas({ ...NOVEMBRO, turnoId: noite.id }, token)).toEqual([3, 3, 3])
    expect(await totaisDasTresRotas({ ...NOVEMBRO, canal: 'WEB' }, token)).toEqual([1, 1, 1])
    expect(await totaisDasTresRotas({ ...NOVEMBRO, setorId: pediatria.id }, token)).toEqual([1, 1, 1])
  })
})

describe('GET /dashboard/resumo', () => {
  it('conta promotores, neutros, detratores e notas baixas e calcula o NPS e a média da escala', async () => {
    const { pronto, pediatria, responder } = await cenario()
    // NPS, classificação e nota da escala de cada resposta. A do NPS 9 com nota 2 é baixa pela escala.
    const respostas: [number, 'NORMAL' | 'BAIXA' | 'BAIXISSIMA', number][] = [
      [10, 'NORMAL', 5],
      [10, 'NORMAL', 5],
      [9, 'NORMAL', 5],
      [9, 'BAIXA', 2],
      [8, 'NORMAL', 4],
      [7, 'NORMAL', 4],
      [6, 'BAIXA', 4],
      [3, 'BAIXA', 3],
      [0, 'BAIXISSIMA', 1],
    ]
    for (const [nps, classificacao, nota] of respostas) {
      await responder(pronto.id, { nps, classificacao, nota })
    }
    // Uma resposta sem nenhuma pergunta respondida conta no NPS, mas não na média.
    await responder(pediatria.id, { nps: 8, perguntaIds: [] })
    // Fora do período: não conta.
    await responder(pronto.id, {
      nps: 0,
      classificacao: 'BAIXISSIMA',
      nota: 1,
      dataAtendimento: '2026-12-01',
    })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await resumo(NOVEMBRO, token)).toEqual({
      // 4 promotores e 3 detratores em 10: 10%.
      nps: 10,
      total: 10,
      promotores: 4,
      neutros: 3,
      detratores: 3,
      notasBaixas: 4,
      baixissimas: 1,
      // As 9 notas da escala: 33 / 9 = 3,67. O sim ou não do Pronto Atendimento não entra.
      mediaEscala: 3.7,
    })
  })

  it('sem respostas, o NPS e a média vêm null e as contagens, 0', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await resumo(NOVEMBRO, token)).toEqual({
      nps: null,
      total: 0,
      promotores: 0,
      neutros: 0,
      detratores: 0,
      notasBaixas: 0,
      baixissimas: 0,
      mediaEscala: null,
    })
  })

  it('com respostas, mas sem nenhuma nota de escala, só a média vem null', async () => {
    const { pronto, responder } = await cenario()
    await responder(pronto.id, { nps: 9, perguntaIds: [] })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await resumo(NOVEMBRO, token)).toMatchObject({ nps: 100, total: 1, mediaEscala: null })
  })
})

describe('GET /dashboard/nps-por-setor', () => {
  it('do maior NPS para o menor; no empate, mais respostas e depois a ordem alfabética', async () => {
    const { pronto, pediatria, maternidade, responder } = await cenario()
    // A Ortopedia nasce antes, com o ID menor: só a ordem alfabética põe a Oncologia na frente.
    const ortopedia = await criarSetor({ nome: 'Ortopedia', slug: 'ortopedia' })
    const oncologia = await criarSetor({ nome: 'Oncologia', slug: 'oncologia' })
    const ambulatorio = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio', ativo: false })
    await criarSetor({ nome: 'Sem Respostas', slug: 'sem-respostas' })

    // Pediatria: 2 respostas, NPS 50. Pronto Atendimento: 4 respostas, NPS 50.
    for (const nps of [10, 8]) await responder(pediatria.id, { nps })
    for (const nps of [10, 10, 8, 7]) await responder(pronto.id, { nps })
    // Oncologia e Ortopedia: 1 resposta, NPS 0; a ordem alfabética desempata.
    await responder(ortopedia.id, { nps: 8 })
    await responder(oncologia.id, { nps: 7 })
    // Maternidade: NPS -100. Ambulatório, desativado: NPS 100.
    await responder(maternidade.id, { nps: 2 })
    await responder(ambulatorio.id, { nps: 9 })
    // Fora do período: não muda nada.
    await responder(maternidade.id, { nps: 10, dataAtendimento: '2026-10-31' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await npsPorSetor(NOVEMBRO, token)).toEqual([
      { setorId: ambulatorio.id, setor: 'Ambulatório', nps: 100, total: 1 },
      { setorId: pronto.id, setor: 'Pronto Atendimento', nps: 50, total: 4 },
      { setorId: pediatria.id, setor: 'Pediatria', nps: 50, total: 2 },
      { setorId: oncologia.id, setor: 'Oncologia', nps: 0, total: 1 },
      { setorId: ortopedia.id, setor: 'Ortopedia', nps: 0, total: 1 },
      { setorId: maternidade.id, setor: 'Maternidade', nps: -100, total: 1 },
    ])
  })

  it('sem respostas no período, a lista vem vazia', async () => {
    const { pronto, responder } = await cenario()
    await responder(pronto.id, { dataAtendimento: '2026-10-31' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await npsPorSetor(NOVEMBRO, token)).toEqual([])
  })
})

describe('GET /dashboard/evolucao', () => {
  it('por dia: um ponto por dia do período, com os dias sem resposta vazios', async () => {
    const { pronto, pediatria, responder } = await cenario()
    await responder(pronto.id, { dataAtendimento: '2026-11-02', nps: 10 })
    await responder(pediatria.id, { dataAtendimento: '2026-11-02', nps: 6 })
    await responder(pronto.id, { dataAtendimento: '2026-11-04', nps: 9 })
    await responder(pronto.id, { dataAtendimento: '2026-11-06', nps: 0 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(
      await evolucao(
        { inicio: '2026-11-01', fim: '2026-11-05', base: 'ATENDIMENTO', granularidade: 'DIA' },
        token,
      ),
    ).toEqual([
      { periodo: '2026-11-01', nps: null, total: 0 },
      { periodo: '2026-11-02', nps: 0, total: 2 },
      { periodo: '2026-11-03', nps: null, total: 0 },
      { periodo: '2026-11-04', nps: 100, total: 1 },
      { periodo: '2026-11-05', nps: null, total: 0 },
    ])
  })

  it('por semana: a semana começa na segunda, e só contam as respostas do período', async () => {
    const { pronto, responder } = await cenario()
    // Terça, 3/11: na semana de 2/11, mas antes do início (quarta, 4/11).
    await responder(pronto.id, { dataAtendimento: '2026-11-03', nps: 0 })
    await responder(pronto.id, { dataAtendimento: '2026-11-04', nps: 10 })
    // Domingo, 8/11: ainda a semana de 2/11.
    await responder(pronto.id, { dataAtendimento: '2026-11-08', nps: 6 })
    // Segunda, 16/11, e terça, 17/11, o fim do período.
    await responder(pronto.id, { dataAtendimento: '2026-11-16', nps: 9 })
    await responder(pronto.id, { dataAtendimento: '2026-11-17', nps: 9 })
    // Quarta, 18/11: depois do fim.
    await responder(pronto.id, { dataAtendimento: '2026-11-18', nps: 0 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(
      await evolucao(
        { inicio: '2026-11-04', fim: '2026-11-17', base: 'ATENDIMENTO', granularidade: 'SEMANA' },
        token,
      ),
    ).toEqual([
      { periodo: '2026-11-02', nps: 0, total: 2 },
      { periodo: '2026-11-09', nps: null, total: 0 },
      { periodo: '2026-11-16', nps: 100, total: 2 },
    ])
  })

  it('por mês: o período é o dia 1 de cada mês, com os meses sem resposta vazios', async () => {
    const { pronto, responder } = await cenario()
    await responder(pronto.id, { dataAtendimento: '2026-08-31', nps: 0 })
    await responder(pronto.id, { dataAtendimento: '2026-09-15', nps: 10 })
    await responder(pronto.id, { dataAtendimento: '2026-09-30', nps: 7 })
    await responder(pronto.id, { dataAtendimento: '2026-11-20', nps: 3 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(
      await evolucao(
        { inicio: '2026-09-15', fim: '2026-11-23', base: 'ATENDIMENTO', granularidade: 'MES' },
        token,
      ),
    ).toEqual([
      { periodo: '2026-09-01', nps: 50, total: 2 },
      { periodo: '2026-10-01', nps: null, total: 0 },
      { periodo: '2026-11-01', nps: -100, total: 1 },
    ])
  })

  it('com base=ENVIO, agrupa pelo dia do envio em Brasília', async () => {
    const { pronto, responder } = await cenario()
    // 23h30 de 31/10 em Brasília, gravado em UTC no dia 1º/11; atendido no dia 1º/11.
    await responder(pronto.id, { dataAtendimento: '2026-11-01', enviadoEm: '2026-11-01T02:30:00Z', nps: 10 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const periodo = { inicio: '2026-10-01', fim: '2026-11-30', granularidade: 'MES' }

    expect(await evolucao({ ...periodo, base: 'ENVIO' }, token)).toEqual([
      { periodo: '2026-10-01', nps: 100, total: 1 },
      { periodo: '2026-11-01', nps: null, total: 0 },
    ])
    expect(await evolucao({ ...periodo, base: 'ATENDIMENTO' }, token)).toEqual([
      { periodo: '2026-10-01', nps: null, total: 0 },
      { periodo: '2026-11-01', nps: 100, total: 1 },
    ])
    expect(
      await evolucao({ inicio: '2026-10-31', fim: '2026-11-01', base: 'ENVIO', granularidade: 'DIA' }, token),
    ).toEqual([
      { periodo: '2026-10-31', nps: 100, total: 1 },
      { periodo: '2026-11-01', nps: null, total: 0 },
    ])
  })

  it('sem granularidade ou com uma que não existe: 400 em granularidade', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const granularidade of [undefined, 'ANO', 'dia']) {
      const query = granularidade ? { ...NOVEMBRO, granularidade } : NOVEMBRO
      const resposta = await pedir('evolucao', query, token)

      expect(resposta.status, granularidade).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        { campo: 'granularidade', mensagem: MENSAGEM_GRANULARIDADE },
      ])
    }
  })

  it(`até ${MAXIMO_DE_PONTOS} pontos: um ano bissexto inteiro por dia passa, um dia a mais não`, async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const ano = { inicio: '2024-01-01', fim: '2024-12-31', base: 'ATENDIMENTO', granularidade: 'DIA' }

    const pontos = await evolucao(ano, token)
    expect(pontos).toHaveLength(366)
    expect(pontos.at(-1)).toEqual({ periodo: '2024-12-31', nps: null, total: 0 })

    const resposta = await pedir('evolucao', { ...ano, fim: '2025-01-01' }, token)
    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'granularidade', mensagem: MENSAGENS_DE_PONTOS_DEMAIS.DIA },
    ])
    expect(await evolucao({ ...ano, fim: '2025-01-01', granularidade: 'SEMANA' }, token)).toHaveLength(53)
  })
})
