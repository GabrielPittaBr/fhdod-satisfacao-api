import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { MENSAGEM_CLASSIFICACAO } from '../../src/modules/pesquisa/pesquisa.schemas'
import {
  MENSAGEM_RESPOSTA_NAO_ENCONTRADA,
  MENSAGENS_DA_LISTA,
} from '../../src/modules/respostas/respostas.schemas'
import type { Perfil } from '../../src/shared/constants/perfis'
import { MENSAGENS_DOS_FILTROS } from '../../src/shared/http/filtros-do-painel'
import { POR_PAGINA_PADRAO } from '../../src/shared/http/pagination'
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

type Query = Record<string, string | number | boolean>

/** O telefone dos pedidos de retorno: os testes conferem que ele nunca sai inteiro. */
const TELEFONE = '(51) 99999-0042'
const DIGITOS = '51999990042'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

interface RespostaResumo {
  id: number
  setorId: number
  setor: string
  canal: string
  dataAtendimento: string
  turno: string
  nps: number
  classificacao: string
  enviadoEm: string
  temComentario: boolean
  pediuRetorno: boolean
}
interface Lista {
  data: RespostaResumo[]
  meta: { pagina: number; porPagina: number; total: number }
}
interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

/** Cria o usuário e devolve um token de acesso dele, assinado pela API. */
async function tokenDe(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return emitirTokenDeAcesso(usuario.id)
}

function pedirLista(query: Query, token?: string) {
  const pedido = request(app).get('/api/v1/respostas').query(query)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

function pedirDetalhe(id: number | string, token?: string) {
  const pedido = request(app).get(`/api/v1/respostas/${id}`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

async function listar(query: Query, token: string): Promise<Lista> {
  const resposta = await pedirLista(query, token)
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200)
  return resposta.body as Lista
}

/** Só os IDs da lista, na ordem em que vieram. */
async function ids(query: Query, token: string): Promise<number[]> {
  return (await listar(query, token)).data.map(({ id }) => id)
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

/** Dois setores com uma pergunta de escala cada e dois turnos. */
async function cenario() {
  const categoria = await criarCategoria({ nome: 'Recepção' })
  const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
  const pediatria = await criarSetor({ nome: 'Pediatria', slug: 'pediatria' })
  const manha = await criarTurno({ nome: 'Manhã' })
  const noite = await criarTurno({ nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' })
  const perguntas = {
    [pronto.id]: [(await criarPergunta({ setorId: pronto.id, categoriaId: categoria.id })).id],
    [pediatria.id]: [(await criarPergunta({ setorId: pediatria.id, categoriaId: categoria.id })).id],
  }

  /** Uma resposta no setor, com a pergunta dele, no turno da manhã e em 10/11, se o teste não pedir outra coisa. */
  function responder(setorId: number, dados: Omit<DadosDaResposta, 'setorId'> = {}) {
    return criarResposta({
      setorId,
      turnoId: manha.id,
      dataAtendimento: '2026-11-10',
      perguntaIds: perguntas[setorId] ?? [],
      ...dados,
    })
  }

  return { categoria, pronto, pediatria, manha, noite, responder }
}

describe('acesso às respostas', () => {
  it('sem login: 401 na lista e no detalhe', async () => {
    const lista = await pedirLista({})
    expect(lista.status).toBe(401)
    expect(erroDe(lista).codigo).toBe('NAO_AUTENTICADO')
    expect((await pedirDetalhe(1)).status).toBe(401)
  })

  it('com a senha provisória: 403', async () => {
    const { pronto, responder } = await cenario()
    const resposta = await responder(pronto.id)
    const token = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })

    expect((await pedirLista({}, token)).status).toBe(403)
    expect((await pedirDetalhe(resposta.id, token)).status).toBe(403)
  })

  it('o Visualizador não tem respostas:ver: 403 na lista e no detalhe, mesmo no seu setor', async () => {
    const { pronto, responder } = await cenario()
    const resposta = await responder(pronto.id)
    const token = await tokenDe({ perfil: 'VISUALIZADOR', setorIds: [pronto.id] })

    for (const pedido of [pedirLista({}, token), pedirDetalhe(resposta.id, token)]) {
      const recusa = await pedido
      expect(recusa.status).toBe(403)
      expect(erroDe(recusa)).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    }
  })

  it.each(['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA'] as Perfil[])('o %s tem respostas:ver', async (perfil) => {
    const { pronto, responder } = await cenario()
    const resposta = await responder(pronto.id)
    const token = await tokenDe({ perfil, setorIds: [pronto.id] })

    expect(await ids({}, token)).toEqual([resposta.id])
    await pedirDetalhe(resposta.id, token).expect(200)
  })

  it('o Gestor só vê os seus setores, mesmo sem pedir um, e pedir outro setor dá 403', async () => {
    const { pronto, pediatria, responder } = await cenario()
    const doPronto = await responder(pronto.id)
    const daPediatria = await responder(pediatria.id)
    const gestor = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })
    const ouvidoria = await tokenDe({ perfil: 'OUVIDORIA' })

    expect(await listar({}, gestor)).toMatchObject({ data: [{ id: doPronto.id }], meta: { total: 1 } })
    expect(await ids({ setorId: pronto.id }, gestor)).toEqual([doPronto.id])
    expect(await ids({}, ouvidoria)).toEqual([daPediatria.id, doPronto.id])

    for (const setorId of [pediatria.id, 999, 'abc']) {
      const recusa = await pedirLista({ setorId }, gestor)
      expect(recusa.status).toBe(403)
      expect(erroDe(recusa)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })
    }
  })

  it('o detalhe de uma resposta de outro setor dá 403 ao Gestor; a inexistente, 404; o ID inválido, 400', async () => {
    const { pronto, pediatria, responder } = await cenario()
    const daPediatria = await responder(pediatria.id)
    const gestor = await tokenDe({ perfil: 'GESTOR', setorIds: [pronto.id] })

    const fora = await pedirDetalhe(daPediatria.id, gestor)
    expect(fora.status).toBe(403)
    expect(erroDe(fora)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })

    const inexistente = await pedirDetalhe(daPediatria.id + 100, gestor)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: MENSAGEM_RESPOSTA_NAO_ENCONTRADA,
    })

    const invalido = await pedirDetalhe('abc', gestor)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'id', mensagem: expect.any(String) }])
  })
})

describe('GET /respostas', () => {
  it('cada linha no formato do contrato, com o meta, e sem o telefone', async () => {
    const { pronto, noite, responder } = await cenario()
    const resposta = await responder(pronto.id, {
      turnoId: noite.id,
      canal: 'TOTEM',
      nps: 3,
      classificacao: 'BAIXA',
      dataAtendimento: '2026-11-09',
      enviadoEm: '2026-11-10T01:30:00.000Z',
      comentario: { tipo: 'RECLAMACAO', texto: 'Esperei muito.' },
      contato: { telefone: TELEFONE },
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const resposta200 = await pedirLista({}, token)

    expect(resposta200.body).toEqual({
      data: [
        {
          id: resposta.id,
          setorId: pronto.id,
          setor: 'Pronto Atendimento',
          canal: 'TOTEM',
          dataAtendimento: '2026-11-09',
          turno: 'Noite',
          nps: 3,
          classificacao: 'BAIXA',
          enviadoEm: '2026-11-10T01:30:00.000Z',
          temComentario: true,
          pediuRetorno: true,
        },
      ],
      meta: { pagina: 1, porPagina: POR_PAGINA_PADRAO, total: 1 },
    })
    expect(resposta200.text).not.toContain('0042')
    expect(resposta200.text).not.toContain('telefone')
  })

  it(`do envio mais recente para o mais antigo, ${POR_PAGINA_PADRAO} por página, com o total de todas`, async () => {
    const { pronto, responder } = await cenario()
    const criadas: number[] = []
    // 23 respostas, uma por hora, de 10/11 à 0h até as 22h (UTC).
    for (let hora = 0; hora < 23; hora += 1) {
      const enviadoEm = `2026-11-10T${String(hora).padStart(2, '0')}:00:00.000Z`
      criadas.push((await responder(pronto.id, { enviadoEm })).id)
    }
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const doMaisRecente = [...criadas].reverse()

    const primeira = await listar({}, token)
    expect(primeira.data.map(({ id }) => id)).toEqual(doMaisRecente.slice(0, 20))
    expect(primeira.meta).toEqual({ pagina: 1, porPagina: 20, total: 23 })

    const segunda = await listar({ pagina: 2 }, token)
    expect(segunda.data.map(({ id }) => id)).toEqual(doMaisRecente.slice(20))
    expect(segunda.meta).toEqual({ pagina: 2, porPagina: 20, total: 23 })

    const pequena = await listar({ pagina: 3, porPagina: 5 }, token)
    expect(pequena.data.map(({ id }) => id)).toEqual(doMaisRecente.slice(10, 15))
    expect(pequena.meta).toEqual({ pagina: 3, porPagina: 5, total: 23 })

    expect(await listar({ pagina: 9 }, token)).toEqual({
      data: [],
      meta: { pagina: 9, porPagina: 20, total: 23 },
    })
  })

  it('ordena pelo atendimento, pelo envio ou pelo NPS, nos dois sentidos, e desempata pelo ID', async () => {
    const { pronto, responder } = await cenario()
    const a = await responder(pronto.id, {
      nps: 8,
      dataAtendimento: '2026-11-08',
      enviadoEm: '2026-11-12T10:00:00.000Z',
    })
    const b = await responder(pronto.id, {
      nps: 2,
      dataAtendimento: '2026-11-10',
      enviadoEm: '2026-11-11T10:00:00.000Z',
    })
    const c = await responder(pronto.id, {
      nps: 8,
      dataAtendimento: '2026-11-09',
      enviadoEm: '2026-11-13T10:00:00.000Z',
    })
    const d = await responder(pronto.id, {
      nps: 10,
      dataAtendimento: '2026-11-10',
      enviadoEm: '2026-11-10T10:00:00.000Z',
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    expect(await ids({}, token)).toEqual([c.id, a.id, b.id, d.id])
    expect(await ids({ ordenarPor: 'enviadoEm', ordem: 'asc' }, token)).toEqual([d.id, b.id, a.id, c.id])
    expect(await ids({ ordenarPor: 'dataAtendimento' }, token)).toEqual([d.id, b.id, c.id, a.id])
    expect(await ids({ ordenarPor: 'dataAtendimento', ordem: 'asc' }, token)).toEqual([
      a.id,
      c.id,
      b.id,
      d.id,
    ])
    expect(await ids({ ordenarPor: 'nps' }, token)).toEqual([d.id, c.id, a.id, b.id])
    expect(await ids({ ordenarPor: 'nps', ordem: 'asc' }, token)).toEqual([b.id, a.id, c.id, d.id])
  })

  it('filtra pelo período (com a base), pelo setor, pelo turno, pelo canal e pela classificação', async () => {
    const { pronto, pediatria, noite, responder } = await cenario()
    const dia9 = await responder(pronto.id, { dataAtendimento: '2026-11-09' })
    const dia10 = await responder(pronto.id, { classificacao: 'BAIXISSIMA', nps: 1 })
    // Enviada às 23h30 de 10/11 em Brasília (já 11/11 em UTC), sobre um atendimento de 01/11.
    const tardia = await responder(pediatria.id, {
      dataAtendimento: '2026-11-01',
      enviadoEm: '2026-11-11T02:30:00.000Z',
      canal: 'TOTEM',
    })
    const daNoite = await responder(pediatria.id, { turnoId: noite.id, classificacao: 'BAIXA', nps: 5 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const ordenados = (lista: number[]) => [...lista].sort((x, y) => x - y)
    const filtrar = async (query: Query) => ordenados(await ids(query, token))

    expect(await filtrar({})).toEqual(ordenados([dia9.id, dia10.id, tardia.id, daNoite.id]))
    expect(await filtrar({ inicio: '2026-11-10' })).toEqual([dia10.id, daNoite.id])
    expect(await filtrar({ fim: '2026-11-09' })).toEqual([dia9.id, tardia.id])
    expect(await filtrar({ inicio: '2026-11-10', fim: '2026-11-10', base: 'ENVIO' })).toEqual([tardia.id])
    expect(await filtrar({ setorId: pronto.id })).toEqual([dia9.id, dia10.id])
    expect(await filtrar({ turnoId: noite.id })).toEqual([daNoite.id])
    expect(await filtrar({ canal: 'TOTEM' })).toEqual([tardia.id])
    expect(await filtrar({ classificacao: 'BAIXISSIMA' })).toEqual([dia10.id])
    expect(await filtrar({ classificacao: 'BAIXA' })).toEqual([daNoite.id])
    expect(await filtrar({ classificacao: 'NORMAL', setorId: pediatria.id })).toEqual([tardia.id])
  })

  it('filtra pelas que têm, ou não têm, comentário e pedido de retorno', async () => {
    const { pronto, responder } = await cenario()
    const comentario = { tipo: 'ELOGIO' as const, texto: 'Muito bom.' }
    const contato = { telefone: TELEFONE }
    const nada = await responder(pronto.id)
    const soComentario = await responder(pronto.id, { comentario })
    const soRetorno = await responder(pronto.id, { contato })
    const ambos = await responder(pronto.id, { comentario, contato })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })
    const filtrar = async (query: Query) =>
      (await ids({ ...query, ordem: 'asc', ordenarPor: 'nps' }, token)).sort((x, y) => x - y)

    expect(await filtrar({ comComentario: true })).toEqual([soComentario.id, ambos.id])
    expect(await filtrar({ comComentario: false })).toEqual([nada.id, soRetorno.id])
    expect(await filtrar({ comRetorno: true })).toEqual([soRetorno.id, ambos.id])
    expect(await filtrar({ comRetorno: false })).toEqual([nada.id, soComentario.id])
    expect(await filtrar({ comComentario: true, comRetorno: false })).toEqual([soComentario.id])
    expect((await listar({ comRetorno: true }, token)).meta.total).toBe(2)

    const marcas = (await listar({}, token)).data.map(({ id, temComentario, pediuRetorno }) => ({
      id,
      temComentario,
      pediuRetorno,
    }))
    expect(marcas).toEqual([
      { id: ambos.id, temComentario: true, pediuRetorno: true },
      { id: soRetorno.id, temComentario: false, pediuRetorno: true },
      { id: soComentario.id, temComentario: true, pediuRetorno: false },
      { id: nada.id, temComentario: false, pediuRetorno: false },
    ])
  })

  it('400 com o campo e a mensagem de cada filtro errado', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedirLista(
      {
        classificacao: 'RUIM',
        comComentario: 'sim',
        comRetorno: '1',
        ordenarPor: 'setor',
        ordem: 'cima',
        porPagina: 0,
      },
      token,
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'classificacao', mensagem: MENSAGEM_CLASSIFICACAO },
      { campo: 'comComentario', mensagem: 'Escolha sim ou não' },
      { campo: 'comRetorno', mensagem: 'Escolha sim ou não' },
      { campo: 'porPagina', mensagem: 'Use de 1 a 100 itens por página' },
      { campo: 'ordenarPor', mensagem: MENSAGENS_DA_LISTA.ordenarPor },
      { campo: 'ordem', mensagem: MENSAGENS_DA_LISTA.ordem },
    ])

    // O período invertido só é conferido com os outros campos certos, como no dashboard.
    const invertido = await pedirLista({ inicio: '2026-11-10', fim: '2026-11-01' }, token)
    expect(invertido.status).toBe(400)
    expect(erroDe(invertido).detalhes).toEqual([{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }])
  })
})

describe('GET /respostas/:id', () => {
  /** Uma pergunta de cada tipo no setor, na ordem da pesquisa. */
  async function perguntasDeCadaTipo(setorId: number) {
    const recepcao = await criarCategoria({ nome: 'Recepção' })
    const triagem = await criarCategoria({ nome: 'Triagem' })
    return [
      await criarPergunta({ setorId, categoriaId: recepcao.id, texto: 'Como foi a recepção?' }),
      await criarPergunta({
        setorId,
        categoriaId: triagem.id,
        texto: 'Chamaram pelo nome?',
        tipo: 'SIM_NAO',
      }),
      await criarPergunta({
        setorId,
        categoriaId: triagem.id,
        texto: 'Quanto esperou?',
        tipo: 'MULTIPLA_ESCOLHA',
        opcoes: ['Pouco', 'Muito'],
      }),
      await criarPergunta({ setorId, categoriaId: recepcao.id, texto: 'O que melhorar?', tipo: 'TEXTO' }),
    ]
  }

  it('o resumo, as perguntas como o paciente viu, o comentário e o telefone mascarado', async () => {
    const setor = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio' })
    const turno = await criarTurno({ nome: 'Tarde' })
    const perguntas = await perguntasDeCadaTipo(setor.id)
    const resposta = await criarResposta({
      setorId: setor.id,
      turnoId: turno.id,
      perguntaIds: perguntas.map(({ id }) => id),
      nota: 2,
      nps: 4,
      classificacao: 'BAIXA',
      dataAtendimento: '2026-11-10',
      enviadoEm: '2026-11-10T14:22:00.000Z',
      comentario: { tipo: 'RECLAMACAO', texto: 'Esperei mais de duas horas.' },
      contato: { telefone: TELEFONE },
    })
    // Depois da resposta, a primeira pergunta muda de texto e de categoria e vai para o fim da pesquisa.
    const outra = await criarCategoria({ nome: 'Outra' })
    await prisma.pergunta.update({
      where: { id: perguntas[0]!.id },
      data: { texto: 'Texto novo', categoriaId: outra.id, ordem: 99 },
    })
    const contato = await prisma.contatoRetorno.findUniqueOrThrow({ where: { respostaId: resposta.id } })
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [setor.id] })

    const detalhe = await pedirDetalhe(resposta.id, token)

    expect(detalhe.status).toBe(200)
    expect(detalhe.body).toEqual({
      data: {
        id: resposta.id,
        setorId: setor.id,
        setor: 'Ambulatório',
        canal: 'WEB',
        dataAtendimento: '2026-11-10',
        turno: 'Tarde',
        nps: 4,
        classificacao: 'BAIXA',
        enviadoEm: '2026-11-10T14:22:00.000Z',
        temComentario: true,
        pediuRetorno: true,
        itens: [
          {
            perguntaId: perguntas[0]!.id,
            perguntaTexto: 'Como foi a recepção?',
            categoria: 'Recepção',
            tipo: 'ESCALA_1_5',
            valorNumero: 2,
            valorTexto: null,
            classificacao: 'BAIXA',
          },
          {
            perguntaId: perguntas[1]!.id,
            perguntaTexto: 'Chamaram pelo nome?',
            categoria: 'Triagem',
            tipo: 'SIM_NAO',
            valorNumero: null,
            valorTexto: 'SIM',
            classificacao: null,
          },
          {
            perguntaId: perguntas[2]!.id,
            perguntaTexto: 'Quanto esperou?',
            categoria: 'Triagem',
            tipo: 'MULTIPLA_ESCOLHA',
            valorNumero: null,
            valorTexto: 'Pouco',
            classificacao: null,
          },
          {
            perguntaId: perguntas[3]!.id,
            perguntaTexto: 'O que melhorar?',
            categoria: 'Recepção',
            tipo: 'TEXTO',
            valorNumero: null,
            valorTexto: 'Sim',
            classificacao: null,
          },
        ],
        comentario: { tipo: 'RECLAMACAO', texto: 'Esperei mais de duas horas.' },
        contato: { id: contato.id, telefoneMascarado: '•••• 0042', status: 'NOVO' },
      },
    })
    expect(detalhe.text).not.toContain(DIGITOS)
    expect(detalhe.text).not.toContain(contato.telefoneCifrado)
  })

  it('sem comentário e sem pedido de retorno, os dois vêm null', async () => {
    const { pronto, responder } = await cenario()
    const resposta = await responder(pronto.id)
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { body } = await pedirDetalhe(resposta.id, token).expect(200)

    expect(body).toMatchObject({
      data: { temComentario: false, pediuRetorno: false, comentario: null, contato: null },
    })
  })

  it('cada nota de 1 a 5 é classificada com os limites da escala das configurações', async () => {
    const setor = await criarSetor()
    const categoria = await criarCategoria()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })
    const classificacoes = async () => {
      const porNota: string[] = []
      for (const nota of [1, 2, 3, 4, 5]) {
        const resposta = await criarResposta({ setorId: setor.id, perguntaIds: [pergunta.id], nota })
        const { body } = await pedirDetalhe(resposta.id, token).expect(200)
        porNota.push((body as { data: { itens: { classificacao: string }[] } }).data.itens[0]!.classificacao)
      }
      return porNota
    }

    expect(await classificacoes()).toEqual(['BAIXISSIMA', 'BAIXA', 'BAIXA', 'NORMAL', 'NORMAL'])

    await prisma.configuracao.createMany({
      data: [
        { chave: 'escala_limite_baixa', valor: 4 },
        { chave: 'escala_limite_baixissima', valor: 2 },
      ],
    })
    expect(await classificacoes()).toEqual(['BAIXISSIMA', 'BAIXISSIMA', 'BAIXA', 'BAIXA', 'NORMAL'])
  })

  it('a máscara sai dos 4 últimos dígitos gravados, sem decifrar o telefone', async () => {
    const { pronto, responder } = await cenario()
    const resposta = await responder(pronto.id, { contato: { telefone: '(11) 3333-0007' } })
    // Com o cifrado ilegível, qualquer tentativa de decifrar daria erro 500.
    await prisma.contatoRetorno.update({
      where: { respostaId: resposta.id },
      data: { telefoneCifrado: 'ilegivel' },
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const { body } = await pedirDetalhe(resposta.id, token).expect(200)
    expect(body).toMatchObject({ data: { contato: { telefoneMascarado: '•••• 0007' } } })
    expect(await ids({ comRetorno: true }, token)).toEqual([resposta.id])
  })
})
