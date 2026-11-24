import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authService } from '../../src/modules/auth/auth.service'
import { MENSAGEM_PEDIDO_NAO_ENCONTRADO } from '../../src/modules/contatos/contatos.schemas'
import type { Perfil } from '../../src/shared/constants/perfis'
import { MENSAGENS_DOS_FILTROS } from '../../src/shared/http/filtros-do-painel'
import { POR_PAGINA_PADRAO } from '../../src/shared/http/pagination'
import { MENSAGEM_FORA_DO_SETOR } from '../../src/shared/security/acesso'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarResposta, type DadosDaResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

type Query = Record<string, string | number>

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

interface PedidoRetorno {
  id: number
  respostaId: number
  setor: string
  dataAtendimento: string
  nps: number
  classificacao: string
  comentario: { tipo: string; texto: string } | null
  telefoneMascarado: string
  consentimentoEm: string
  status: string
}
interface Lista {
  data: PedidoRetorno[]
  meta: { pagina: number; porPagina: number; total: number }
}
interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

/** Cria o usuário e devolve o ID e um token de acesso dele, assinado pela API. */
async function entrarComo(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return { usuarioId: usuario.id, token: await emitirTokenDeAcesso(usuario.id) }
}

async function tokenDe(dados: DadosDoUsuario = {}) {
  return (await entrarComo(dados)).token
}

function pedirLista(query: Query, token?: string) {
  const pedido = request(app).get('/api/v1/contatos').query(query)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

function pedirTelefone(id: number | string, token?: string) {
  const pedido = request(app).post(`/api/v1/contatos/${id}/revelar-telefone`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

async function listar(query: Query, token: string): Promise<Lista> {
  const resposta = await pedirLista(query, token)
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200)
  return resposta.body as Lista
}

/** Só os IDs das respostas da lista, na ordem em que vieram. */
async function respostasDaLista(query: Query, token: string): Promise<number[]> {
  return (await listar(query, token)).data.map(({ respostaId }) => respostaId)
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

/** Uma resposta com pedido de retorno, atendida em 10/11 e enviada às 12h (UTC) do dia pedido. */
function pedirRetorno(
  setorId: number,
  telefone: string,
  dia = '2026-11-10',
  dados: Omit<DadosDaResposta, 'setorId' | 'contato'> = {},
) {
  return criarResposta({
    setorId,
    dataAtendimento: '2026-11-10',
    enviadoEm: `${dia}T12:00:00.000Z`,
    contato: { telefone },
    ...dados,
  })
}

/** O pedido de retorno de uma resposta, como está no banco. */
function pedidoDe(respostaId: number) {
  return prisma.contatoRetorno.findUniqueOrThrow({ where: { respostaId } })
}

/** Dá `contatos:ver` a quem está logado, como faria uma mudança no mapa de permissões. */
function darContatosVer() {
  const autenticar = authService.autenticar.bind(authService)
  vi.spyOn(authService, 'autenticar').mockImplementation(async (token) => {
    const usuario = await autenticar(token)
    return { ...usuario, permissoes: [...usuario.permissoes, 'contatos:ver'] }
  })
}

describe('acesso aos pedidos de retorno', () => {
  it('sem login: 401 na lista e na revelação', async () => {
    const lista = await pedirLista({})
    expect(lista.status).toBe(401)
    expect(erroDe(lista).codigo).toBe('NAO_AUTENTICADO')
    expect((await pedirTelefone(1)).status).toBe(401)
  })

  it('com a senha provisória: 403', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN', trocarSenha: true })

    expect((await pedirLista({}, token)).status).toBe(403)
    expect((await pedirTelefone(1, token)).status).toBe(403)
  })

  it.each(['GESTOR', 'VISUALIZADOR'] as Perfil[])(
    'o %s não tem contatos:ver: 403 na lista e na revelação, mesmo no seu setor, e nada vai para a auditoria',
    async (perfil) => {
      const setor = await criarSetor()
      const resposta = await pedirRetorno(setor.id, '(51) 99999-0042')
      const pedido = await pedidoDe(resposta.id)
      const token = await tokenDe({ perfil, setorIds: [setor.id] })

      for (const recusa of [await pedirLista({}, token), await pedirTelefone(pedido.id, token)]) {
        expect(recusa.status).toBe(403)
        expect(erroDe(recusa)).toMatchObject({
          codigo: 'SEM_PERMISSAO',
          mensagem: 'Você não tem permissão para isso.',
        })
      }
      expect(await prisma.auditoria.count()).toBe(0)
    },
  )

  it.each(['SUPER_ADMIN', 'OUVIDORIA'] as Perfil[])('o %s tem contatos:ver', async (perfil) => {
    const setor = await criarSetor()
    const resposta = await pedirRetorno(setor.id, '(51) 99999-0042')
    const token = await tokenDe({ perfil })

    expect(await respostasDaLista({}, token)).toEqual([resposta.id])
    await pedirTelefone((await pedidoDe(resposta.id)).id, token).expect(200)
  })

  it('quem ganhar contatos:ver fora do Super Admin e da Ouvidoria continua preso aos seus setores', async () => {
    const meu = await criarSetor()
    const outro = await criarSetor()
    const doMeu = await pedirRetorno(meu.id, '(51) 99999-0001')
    const doOutro = await pedirRetorno(outro.id, '(51) 99999-0002')
    const token = await tokenDe({ perfil: 'GESTOR', setorIds: [meu.id] })
    darContatosVer()

    try {
      expect(await respostasDaLista({}, token)).toEqual([doMeu.id])
      expect((await pedirLista({ setorId: outro.id }, token)).status).toBe(403)

      const recusa = await pedirTelefone((await pedidoDe(doOutro.id)).id, token)
      expect(recusa.status).toBe(403)
      expect(erroDe(recusa)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })
      expect(await prisma.auditoria.count()).toBe(0)

      await pedirTelefone((await pedidoDe(doMeu.id)).id, token).expect(200)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('GET /contatos', () => {
  it('os mais recentes primeiro, no formato do contrato, só das respostas com pedido, e sem o número', async () => {
    const pronto = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
    const ambulatorio = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio' })
    const antigo = await pedirRetorno(ambulatorio.id, '(11) 3333-7788', '2026-11-09', {
      nps: 1,
      classificacao: 'BAIXISSIMA',
      dataAtendimento: '2026-11-08',
    })
    const recente = await pedirRetorno(pronto.id, '(51) 99999-0042', '2026-11-10', {
      nps: 3,
      classificacao: 'BAIXA',
      comentario: { tipo: 'RECLAMACAO', texto: 'Esperei muito.' },
    })
    await criarResposta({ setorId: pronto.id, comentario: { tipo: 'ELOGIO', texto: 'Ótimo.' } })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const resposta = await pedirLista({}, token)

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({
      data: [
        {
          id: (await pedidoDe(recente.id)).id,
          respostaId: recente.id,
          setor: 'Pronto Atendimento',
          dataAtendimento: '2026-11-10',
          nps: 3,
          classificacao: 'BAIXA',
          comentario: { tipo: 'RECLAMACAO', texto: 'Esperei muito.' },
          telefoneMascarado: '•••• 0042',
          consentimentoEm: '2026-11-10T12:00:00.000Z',
          status: 'NOVO',
        },
        {
          id: (await pedidoDe(antigo.id)).id,
          respostaId: antigo.id,
          setor: 'Ambulatório',
          dataAtendimento: '2026-11-08',
          nps: 1,
          classificacao: 'BAIXISSIMA',
          comentario: null,
          telefoneMascarado: '•••• 7788',
          consentimentoEm: '2026-11-09T12:00:00.000Z',
          status: 'NOVO',
        },
      ],
      meta: { pagina: 1, porPagina: POR_PAGINA_PADRAO, total: 2 },
    })
    for (const texto of ['51999990042', '1133337788', (await pedidoDe(recente.id)).telefoneCifrado]) {
      expect(resposta.text).not.toContain(texto)
    }
  })

  it('a ordem é a do consentimento, e não a do envio', async () => {
    const setor = await criarSetor()
    const primeiro = await criarResposta({
      setorId: setor.id,
      enviadoEm: '2026-11-10T12:00:00.000Z',
      contato: { telefone: '(51) 99999-0001', consentimentoEm: '2026-11-10T12:20:00.000Z' },
    })
    const segundo = await criarResposta({
      setorId: setor.id,
      enviadoEm: '2026-11-10T12:10:00.000Z',
      contato: { telefone: '(51) 99999-0002', consentimentoEm: '2026-11-10T12:15:00.000Z' },
    })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    expect(await respostasDaLista({}, token)).toEqual([primeiro.id, segundo.id])
  })

  it('filtra pelo período (com a base) e pelo setor, e pagina com o total de todas as páginas', async () => {
    const pronto = await criarSetor()
    const pediatria = await criarSetor()
    const dia8 = await pedirRetorno(pronto.id, '(51) 99999-0008', '2026-11-08', {
      dataAtendimento: '2026-11-08',
    })
    const dia9 = await pedirRetorno(pediatria.id, '(51) 99999-0009', '2026-11-09', {
      dataAtendimento: '2026-11-09',
    })
    // Atendida em 01/11 e enviada às 23h30 de 10/11 em Brasília, já 11/11 em UTC.
    const tardio = await criarResposta({
      setorId: pronto.id,
      dataAtendimento: '2026-11-01',
      enviadoEm: '2026-11-11T02:30:00.000Z',
      contato: { telefone: '(51) 99999-0010' },
    })
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    expect(await respostasDaLista({}, token)).toEqual([tardio.id, dia9.id, dia8.id])
    expect(await respostasDaLista({ inicio: '2026-11-09' }, token)).toEqual([dia9.id])
    expect(await respostasDaLista({ fim: '2026-11-08' }, token)).toEqual([tardio.id, dia8.id])
    expect(await respostasDaLista({ inicio: '2026-11-10', fim: '2026-11-10', base: 'ENVIO' }, token)).toEqual(
      [tardio.id],
    )
    expect(await respostasDaLista({ setorId: pronto.id }, token)).toEqual([tardio.id, dia8.id])

    const segunda = await listar({ porPagina: 2, pagina: 2 }, token)
    expect(segunda.data.map(({ respostaId }) => respostaId)).toEqual([dia8.id])
    expect(segunda.meta).toEqual({ pagina: 2, porPagina: 2, total: 3 })
  })

  it('400 com o campo e a mensagem de cada filtro errado', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedirLista({ inicio: '2026-11-1', base: 'HOJE', setorId: 'abc', pagina: 0 }, token)

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.data },
      { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
      { campo: 'setorId', mensagem: expect.any(String) },
      { campo: 'pagina', mensagem: 'Use um número de página a partir de 1' },
    ])

    const invertido = await pedirLista({ inicio: '2026-11-10', fim: '2026-11-01' }, token)
    expect(invertido.status).toBe(400)
    expect(erroDe(invertido).detalhes).toEqual([{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }])
  })
})

describe('POST /contatos/:id/revelar-telefone', () => {
  it('devolve o número completo, sem cache, e registra na auditoria quem revelou e quando', async () => {
    const setor = await criarSetor()
    const resposta = await pedirRetorno(setor.id, '(51) 99999-0042')
    const pedido = await pedidoDe(resposta.id)
    const ouvidoria = await entrarComo({ perfil: 'OUVIDORIA' })
    const antes = new Date()

    const revelado = await pedirTelefone(pedido.id, ouvidoria.token).set('X-Forwarded-For', '198.51.100.7')

    expect(revelado.status).toBe(200)
    expect(revelado.body).toEqual({ data: { telefone: '51999990042' } })
    expect(revelado.headers['cache-control']).toBe('no-store')
    const linhas = await prisma.auditoria.findMany()
    expect(linhas).toEqual([
      expect.objectContaining({
        usuarioId: ouvidoria.usuarioId,
        acao: 'revelacao_de_telefone',
        entidade: 'contatos_retorno',
        entidadeId: String(pedido.id),
        dados: { respostaId: resposta.id, setorId: setor.id },
        ip: '198.51.100.7',
      }),
    ])
    expect(linhas[0]!.criadoEm.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000)
    expect(JSON.stringify(linhas)).not.toContain('0042')
  })

  it('cada revelação gera a sua linha, com quem revelou', async () => {
    const setor = await criarSetor()
    const pedido = await pedidoDe((await pedirRetorno(setor.id, '(51) 3333-4444')).id)
    const ouvidoria = await entrarComo({ perfil: 'OUVIDORIA' })
    const admin = await entrarComo({ perfil: 'SUPER_ADMIN' })

    for (const { token } of [ouvidoria, admin, ouvidoria]) {
      const { body } = await pedirTelefone(pedido.id, token).expect(200)
      expect(body).toEqual({ data: { telefone: '5133334444' } })
    }

    const linhas = await prisma.auditoria.findMany({ orderBy: { id: 'asc' } })
    expect(linhas.map(({ usuarioId, acao }) => ({ usuarioId, acao }))).toEqual([
      { usuarioId: ouvidoria.usuarioId, acao: 'revelacao_de_telefone' },
      { usuarioId: admin.usuarioId, acao: 'revelacao_de_telefone' },
      { usuarioId: ouvidoria.usuarioId, acao: 'revelacao_de_telefone' },
    ])
  })

  it('pedido inexistente: 404; ID inválido: 400; nos dois, nada vai para a auditoria', async () => {
    const token = await tokenDe({ perfil: 'OUVIDORIA' })

    const inexistente = await pedirTelefone(999, token)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: MENSAGEM_PEDIDO_NAO_ENCONTRADO,
    })

    const invalido = await pedirTelefone('abc', token)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'id', mensagem: expect.any(String) }])

    expect(await prisma.auditoria.count()).toBe(0)
  })
})
