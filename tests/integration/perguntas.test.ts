import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import type { Pergunta } from '../../src/modules/perguntas/perguntas.schemas'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `perguntas:gerenciar`: nem no próprio setor mexem nas perguntas. */
const SEM_A_PERMISSAO = ['OUVIDORIA', 'VISUALIZADOR'] as const

const MENSAGEM_SEM_PERMISSAO = 'Você não tem permissão para isso.'
const MENSAGEM_FORA_DO_SETOR = 'Você não tem acesso a este setor.'
const MENSAGEM_TIPO_TRAVADO =
  'Esta pergunta já tem respostas, então o tipo não pode mudar. Crie outra pergunta e desative esta.'
const MENSAGEM_LISTA_INCOMPLETA = 'A lista precisa ter todas as perguntas do setor'
const MENSAGEM_CATEGORIA = 'Escolha uma categoria'
const MENSAGEM_CATEGORIA_INATIVA = 'Esta categoria está desativada. Escolha outra.'
const MENSAGEM_QUANTIDADE_DE_OPCOES = 'Escreva de 2 a 5 opções'
const MENSAGEM_ID = 'O ID precisa ser um número inteiro positivo.'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Cria o usuário e devolve o ID e um token de acesso dele, assinado pela API. */
async function logado(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return { usuarioId: usuario.id, token: await emitirTokenDeAcesso(usuario.id) }
}

/** Dois setores, uma categoria ativa e uma desativada, um Gestor só do primeiro setor e o Super Admin. */
async function cenario() {
  const setor = await criarSetor({ nome: 'Raio-X' })
  const outroSetor = await criarSetor({ nome: 'Laboratório' })
  const categoria = await criarCategoria({ nome: 'Recepção' })
  const inativa = await criarCategoria({ nome: 'Tempo de Espera', ativa: false })
  const gestor = await logado({ perfil: 'GESTOR', setorIds: [setor.id] })
  const admin = await logado({ perfil: 'SUPER_ADMIN' })
  return { setor, outroSetor, categoria, inativa, gestor, admin }
}

function pedir(metodo: 'get' | 'post' | 'put' | 'patch', caminho: string, token?: string) {
  const pedido = request(app)[metodo](`/api/v1${caminho}`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

function dadosDe<T>(resposta: request.Response): T {
  return (resposta.body as { data: T }).data
}

/** A pergunta como está no banco: sem opções, a lista fica vazia. */
function noBanco(id: number) {
  return prisma.pergunta.findUnique({
    where: { id },
    select: {
      id: true,
      setorId: true,
      categoriaId: true,
      texto: true,
      tipo: true,
      opcoes: true,
      ordem: true,
      ativa: true,
    },
  })
}

/** As linhas da auditoria, na ordem em que foram gravadas. */
function auditoria() {
  return prisma.auditoria.findMany({
    orderBy: { id: 'asc' },
    select: { usuarioId: true, acao: true, entidade: true, entidadeId: true, dados: true },
  })
}

describe('GET /setores/:setorId/perguntas', () => {
  it('sem login: 401; Ouvidoria e Visualizador, mesmo no próprio setor: 403', async () => {
    const { setor } = await cenario()

    const semLogin = await pedir('get', `/setores/${setor.id}/perguntas`)
    expect(semLogin.status).toBe(401)
    expect(erroDe(semLogin).codigo).toBe('NAO_AUTENTICADO')

    for (const perfil of SEM_A_PERMISSAO) {
      const { token } = await logado({ perfil, setorIds: [setor.id] })

      const resposta = await pedir('get', `/setores/${setor.id}/perguntas`, token)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: MENSAGEM_SEM_PERMISSAO,
      })
    }
  })

  it('o gestor lê as perguntas dos seus setores e recebe 403 em qualquer outro, existente ou não', async () => {
    const { setor, outroSetor, categoria, gestor } = await cenario()
    const doSeu = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id })

    const resposta = await pedir('get', `/setores/${setor.id}/perguntas`, gestor.token)
    expect(resposta.status).toBe(200)
    expect(dadosDe<Pergunta[]>(resposta).map(({ id }) => id)).toEqual([doSeu.id])

    for (const setorId of [outroSetor.id, 999, 'abc']) {
      const deOutro = await pedir('get', `/setores/${setorId}/perguntas`, gestor.token)

      expect(deOutro.status, String(setorId)).toBe(403)
      expect(erroDe(deOutro), String(setorId)).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: MENSAGEM_FORA_DO_SETOR,
      })
    }
  })

  it('devolve as perguntas do setor, ativas e inativas, na ordem e no formato do contrato, sem paginação', async () => {
    const { setor, outroSetor, categoria, inativa, admin } = await cenario()
    const orientacao = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Você foi bem orientado?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Em parte', 'Não'],
      ordem: 2,
    })
    const espera = await criarPergunta({
      setorId: setor.id,
      categoriaId: inativa.id,
      texto: 'O tempo de espera foi informado?',
      tipo: 'SIM_NAO',
      ordem: 7,
      ativa: false,
    })
    const recepcao = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Como foi a recepção?',
      ordem: 1,
    })
    // Na mesma posição, vale a mais antiga.
    const recado = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Quer deixar um recado?',
      tipo: 'TEXTO',
      ordem: 2,
    })
    await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 0 })
    await criarResposta({ setorId: setor.id, perguntaIds: [recepcao.id, espera.id] })

    const resposta = await pedir('get', `/setores/${setor.id}/perguntas`, admin.token)

    expect(resposta.status).toBe(200)
    const doSetor = { setorId: setor.id, categoriaId: categoria.id, ativa: true }
    expect(resposta.body).toEqual({
      data: [
        {
          ...doSetor,
          id: recepcao.id,
          texto: 'Como foi a recepção?',
          tipo: 'ESCALA_1_5',
          opcoes: null,
          ordem: 1,
          temRespostas: true,
        },
        {
          ...doSetor,
          id: orientacao.id,
          texto: 'Você foi bem orientado?',
          tipo: 'MULTIPLA_ESCOLHA',
          opcoes: ['Sim', 'Em parte', 'Não'],
          ordem: 2,
          temRespostas: false,
        },
        {
          ...doSetor,
          id: recado.id,
          texto: 'Quer deixar um recado?',
          tipo: 'TEXTO',
          opcoes: null,
          ordem: 2,
          temRespostas: false,
        },
        {
          ...doSetor,
          id: espera.id,
          categoriaId: inativa.id,
          texto: 'O tempo de espera foi informado?',
          tipo: 'SIM_NAO',
          opcoes: null,
          ordem: 7,
          ativa: false,
          temRespostas: true,
        },
      ],
    })
  })

  it('setor sem perguntas: lista vazia; setor inexistente: 404; ID inválido: 400 em setorId', async () => {
    const { setor, admin } = await cenario()

    const vazia = await pedir('get', `/setores/${setor.id}/perguntas`, admin.token)
    expect(vazia.status).toBe(200)
    expect(vazia.body).toEqual({ data: [] })

    const inexistente = await pedir('get', '/setores/999/perguntas', admin.token)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Setor não encontrado.' })

    const invalido = await pedir('get', '/setores/abc/perguntas', admin.token)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'setorId', mensagem: MENSAGEM_ID }])
  })
})

describe('POST /setores/:setorId/perguntas', () => {
  const TEXTO = 'Como foi o atendimento na recepção?'

  it('sem login: 401; Ouvidoria e Visualizador: 403; o gestor fora dos seus setores: 403, sem criar nada', async () => {
    const { setor, outroSetor, categoria, gestor } = await cenario()
    const corpo = { texto: TEXTO, categoriaId: categoria.id, tipo: 'ESCALA_1_5' }

    const semLogin = await pedir('post', `/setores/${setor.id}/perguntas`).send(corpo)
    expect(semLogin.status).toBe(401)

    for (const perfil of SEM_A_PERMISSAO) {
      const { token } = await logado({ perfil, setorIds: [setor.id] })

      const resposta = await pedir('post', `/setores/${setor.id}/perguntas`, token).send(corpo)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: MENSAGEM_SEM_PERMISSAO,
      })
    }

    const deOutro = await pedir('post', `/setores/${outroSetor.id}/perguntas`, gestor.token).send(corpo)
    expect(deOutro.status).toBe(403)
    expect(erroDe(deOutro)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })

    expect(await prisma.pergunta.count()).toBe(0)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('o gestor cria no seu setor: 201 com a Pergunta, ativa e no fim da ordem, e a criação vai para a auditoria', async () => {
    const { setor, outroSetor, categoria, gestor } = await cenario()

    const primeira = await pedir('post', `/setores/${setor.id}/perguntas`, gestor.token)
      .set('X-Forwarded-For', '198.51.100.7')
      .send({ texto: `  ${TEXTO} `, categoriaId: categoria.id, tipo: 'ESCALA_1_5', ativa: false, ordem: 9 })

    expect(primeira.status).toBe(201)
    const { id } = dadosDe<Pergunta>(primeira)
    const gravada = {
      id,
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: TEXTO,
      tipo: 'ESCALA_1_5',
      ordem: 1,
      ativa: true,
    }
    expect(primeira.body).toEqual({ data: { ...gravada, opcoes: null, temRespostas: false } })
    expect(await noBanco(id)).toEqual({ ...gravada, opcoes: [] })
    expect(await prisma.auditoria.findMany()).toEqual([
      expect.objectContaining({
        usuarioId: gestor.usuarioId,
        acao: 'criacao_de_pergunta',
        entidade: 'perguntas',
        entidadeId: String(id),
        ip: '198.51.100.7',
        dados: {
          setorId: setor.id,
          texto: TEXTO,
          categoriaId: categoria.id,
          tipo: 'ESCALA_1_5',
          opcoes: null,
        },
      }),
    ])

    // Depois da maior posição do setor, mesmo com buracos e com a última inativa; as de outro setor não contam.
    await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 6, ativa: false })
    await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 30 })
    const segunda = await pedir('post', `/setores/${setor.id}/perguntas`, gestor.token).send({
      texto: 'Você indicaria o setor?',
      categoriaId: categoria.id,
      tipo: 'SIM_NAO',
    })
    expect(segunda.status).toBe(201)
    expect(dadosDe<Pergunta>(segunda)).toMatchObject({ ordem: 7, ativa: true, opcoes: null })
  })

  it('o Super Admin cria em qualquer setor, mesmo inativo; setor inexistente: 404; ID inválido: 400', async () => {
    const { outroSetor, categoria, admin } = await cenario()
    await prisma.setor.update({ where: { id: outroSetor.id }, data: { ativo: false } })
    const corpo = { texto: TEXTO, categoriaId: categoria.id, tipo: 'TEXTO' }

    const criada = await pedir('post', `/setores/${outroSetor.id}/perguntas`, admin.token).send(corpo)
    expect(criada.status).toBe(201)
    expect(dadosDe<Pergunta>(criada)).toMatchObject({ setorId: outroSetor.id, tipo: 'TEXTO', ordem: 1 })

    const inexistente = await pedir('post', '/setores/999/perguntas', admin.token).send(corpo)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Setor não encontrado.' })

    const invalido = await pedir('post', '/setores/0/perguntas', admin.token).send(corpo)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'setorId', mensagem: MENSAGEM_ID }])
    expect(await prisma.pergunta.count()).toBe(1)
  })

  it('múltipla escolha: de 2 a 5 opções, sem os espaços das pontas e sem repetir, nem com maiúsculas diferentes', async () => {
    const { setor, categoria, gestor } = await cenario()
    const caminho = `/setores/${setor.id}/perguntas`
    const base = {
      texto: 'Você recebeu as orientações?',
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
    }

    const duas = await pedir('post', caminho, gestor.token).send({
      ...base,
      opcoes: ['  Sim, e entendi tudo ', 'Não'],
    })
    expect(duas.status).toBe(201)
    expect(dadosDe<Pergunta>(duas).opcoes).toEqual(['Sim, e entendi tudo', 'Não'])
    expect((await noBanco(dadosDe<Pergunta>(duas).id))?.opcoes).toEqual(['Sim, e entendi tudo', 'Não'])

    const cinco = ['Ótimo', 'Bom', 'Regular', 'Ruim', 'O'.repeat(80)]
    const nasPontas = await pedir('post', caminho, gestor.token).send({ ...base, opcoes: cinco })
    expect(nasPontas.status).toBe(201)
    expect(dadosDe<Pergunta>(nasPontas).opcoes).toEqual(cinco)

    for (const [opcoes, mensagem] of [
      [undefined, MENSAGEM_QUANTIDADE_DE_OPCOES],
      [null, MENSAGEM_QUANTIDADE_DE_OPCOES],
      [[], MENSAGEM_QUANTIDADE_DE_OPCOES],
      [['Sim'], MENSAGEM_QUANTIDADE_DE_OPCOES],
      [['1', '2', '3', '4', '5', '6'], MENSAGEM_QUANTIDADE_DE_OPCOES],
      [['Sim', '   '], 'Escreva o texto de cada opção'],
      [['Sim', 'N'.repeat(81)], 'Use no máximo 80 caracteres em cada opção'],
      [['Sim', 'Não', ' sim '], 'As opções não podem se repetir'],
      [['Ótimo', 'ÓTIMO'], 'As opções não podem se repetir'],
    ] as const) {
      const resposta = await pedir('post', caminho, gestor.token).send({ ...base, opcoes })

      expect(resposta.status, JSON.stringify(opcoes)).toBe(400)
      expect(erroDe(resposta).detalhes, JSON.stringify(opcoes)).toEqual([{ campo: 'opcoes', mensagem }])
    }
    expect(await prisma.pergunta.count()).toBe(2)
  })

  it('nos outros tipos, opcoes fica null: vale null, a lista vazia ou nada; uma lista com opções dá 400', async () => {
    const { setor, categoria, gestor } = await cenario()
    const caminho = `/setores/${setor.id}/perguntas`

    for (const tipo of ['ESCALA_1_5', 'SIM_NAO', 'TEXTO'] as const) {
      for (const opcoes of [null, [], undefined]) {
        const resposta = await pedir('post', caminho, gestor.token).send({
          texto: TEXTO,
          categoriaId: categoria.id,
          tipo,
          opcoes,
        })

        expect(resposta.status, `${tipo} ${JSON.stringify(opcoes)}`).toBe(201)
        expect(dadosDe<Pergunta>(resposta)).toMatchObject({ tipo, opcoes: null })
        expect((await noBanco(dadosDe<Pergunta>(resposta).id))?.opcoes).toEqual([])
      }

      const comOpcoes = await pedir('post', caminho, gestor.token).send({
        texto: TEXTO,
        categoriaId: categoria.id,
        tipo,
        opcoes: ['Sim', 'Não'],
      })
      expect(comOpcoes.status, tipo).toBe(400)
      expect(erroDe(comOpcoes).detalhes, tipo).toEqual([
        { campo: 'opcoes', mensagem: 'Só a pergunta de múltipla escolha tem opções' },
      ])
    }
    expect(await prisma.pergunta.count()).toBe(9)
    // A auditoria guarda a pergunta como a API a devolve: sem opções, `null`.
    const opcoesNaAuditoria = (await auditoria()).map(({ dados }) => (dados as { opcoes: unknown }).opcoes)
    expect(opcoesNaAuditoria).toEqual(Array(9).fill(null))
  })

  it('texto de 5 a 140 caracteres, categoria existente e ativa e um dos quatro tipos: 400 no campo, sem criar nada', async () => {
    const { setor, categoria, inativa, gestor } = await cenario()
    const caminho = `/setores/${setor.id}/perguntas`
    const base = { texto: TEXTO, categoriaId: categoria.id, tipo: 'ESCALA_1_5' }

    for (const [corpo, campo, mensagem] of [
      [{ ...base, texto: 'Dor?' }, 'texto', 'Escreva a pergunta'],
      [{ ...base, texto: '  Oi?   ' }, 'texto', 'Escreva a pergunta'],
      [{ ...base, texto: '        ' }, 'texto', 'Escreva a pergunta'],
      [
        { ...base, texto: 'P'.repeat(141) },
        'texto',
        'Use no máximo 140 caracteres: perguntas curtas são mais respondidas',
      ],
      [{ ...base, texto: undefined }, 'texto', 'Obrigatório'],
      [{ ...base, categoriaId: undefined }, 'categoriaId', MENSAGEM_CATEGORIA],
      [{ ...base, categoriaId: String(categoria.id) }, 'categoriaId', MENSAGEM_CATEGORIA],
      [{ ...base, categoriaId: 0 }, 'categoriaId', MENSAGEM_CATEGORIA],
      [{ ...base, categoriaId: 999 }, 'categoriaId', MENSAGEM_CATEGORIA],
      [{ ...base, categoriaId: inativa.id }, 'categoriaId', MENSAGEM_CATEGORIA_INATIVA],
      [{ ...base, tipo: 'NOTA_0_10' }, 'tipo', 'Escolha o tipo da pergunta'],
      [{ ...base, tipo: undefined }, 'tipo', 'Escolha o tipo da pergunta'],
    ] as const) {
      const resposta = await pedir('post', caminho, gestor.token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes, JSON.stringify(corpo)).toEqual([{ campo, mensagem }])
    }
    expect(await prisma.pergunta.count()).toBe(0)

    // Nas pontas, 5 e 140 caracteres passam.
    for (const texto of ['Fila?', 'P'.repeat(140)]) {
      const resposta = await pedir('post', caminho, gestor.token).send({ ...base, texto })

      expect(resposta.status, texto).toBe(201)
    }
  })
})

describe('PATCH /perguntas/:id', () => {
  it('sem login: 401; Ouvidoria e Visualizador: 403; o gestor de outro setor: 403, sem mudar nada', async () => {
    const { outroSetor, categoria, gestor } = await cenario()
    const pergunta = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id })
    const antes = await noBanco(pergunta.id)
    const corpo = { texto: 'Texto novo da pergunta', categoriaId: categoria.id, tipo: 'TEXTO' }

    const semLogin = await pedir('patch', `/perguntas/${pergunta.id}`).send(corpo)
    expect(semLogin.status).toBe(401)

    for (const perfil of SEM_A_PERMISSAO) {
      const { token } = await logado({ perfil, setorIds: [outroSetor.id] })

      const resposta = await pedir('patch', `/perguntas/${pergunta.id}`, token).send(corpo)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({ mensagem: MENSAGEM_SEM_PERMISSAO })
    }

    const deOutro = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send(corpo)
    expect(deOutro.status).toBe(403)
    expect(erroDe(deOutro)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })

    expect(await noBanco(pergunta.id)).toEqual(antes)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('troca o texto, a categoria, o tipo e as opções; a ordem e a situação não mudam; o antes e o depois vão para a auditoria', async () => {
    const { setor, categoria, gestor } = await cenario()
    const orientacao = await criarCategoria({ nome: 'Orientação' })
    const pergunta = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Como foi a recepção?',
      ordem: 4,
      ativa: false,
    })
    const { id } = pergunta

    const resposta = await pedir('patch', `/perguntas/${id}`, gestor.token).send({
      texto: ' Você recebeu as orientações? ',
      categoriaId: orientacao.id,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
      ordem: 1,
      ativa: true,
    })

    expect(resposta.status).toBe(200)
    const gravada = {
      id,
      setorId: setor.id,
      categoriaId: orientacao.id,
      texto: 'Você recebeu as orientações?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
      ordem: 4,
      ativa: false,
    }
    expect(resposta.body).toEqual({ data: { ...gravada, temRespostas: false } })
    expect(await noBanco(id)).toEqual(gravada)
    expect(await auditoria()).toEqual([
      {
        usuarioId: gestor.usuarioId,
        acao: 'edicao_de_pergunta',
        entidade: 'perguntas',
        entidadeId: String(id),
        dados: {
          setorId: setor.id,
          antes: {
            texto: 'Como foi a recepção?',
            categoriaId: categoria.id,
            tipo: 'ESCALA_1_5',
            opcoes: null,
          },
          depois: {
            texto: 'Você recebeu as orientações?',
            categoriaId: orientacao.id,
            tipo: 'MULTIPLA_ESCOLHA',
            opcoes: ['Sim', 'Não'],
          },
        },
      },
    ])

    // De volta à escala, as opções saem.
    const deVolta = await pedir('patch', `/perguntas/${id}`, gestor.token).send({
      texto: 'Como foi a recepção?',
      categoriaId: categoria.id,
      tipo: 'ESCALA_1_5',
      opcoes: null,
    })
    expect(deVolta.status).toBe(200)
    expect(dadosDe<Pergunta>(deVolta)).toMatchObject({ tipo: 'ESCALA_1_5', opcoes: null })
    expect((await noBanco(id))?.opcoes).toEqual([])
  })

  it('pergunta com respostas: mudar o tipo dá 409, sem mudar nada; o texto, a categoria e as opções mudam', async () => {
    const { setor, categoria, gestor } = await cenario()
    const orientacao = await criarCategoria({ nome: 'Orientação' })
    const pergunta = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Você foi bem orientado?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
    })
    await criarResposta({ setorId: setor.id, perguntaIds: [pergunta.id] })
    const antes = await noBanco(pergunta.id)

    for (const tipo of ['ESCALA_1_5', 'SIM_NAO', 'TEXTO'] as const) {
      const resposta = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send({
        texto: 'Você foi bem orientado?',
        categoriaId: categoria.id,
        tipo,
      })

      expect(resposta.status, tipo).toBe(409)
      expect(erroDe(resposta), tipo).toMatchObject({ codigo: 'CONFLITO', mensagem: MENSAGEM_TIPO_TRAVADO })
    }
    expect(await noBanco(pergunta.id)).toEqual(antes)

    const mesmoTipo = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send({
      texto: 'As orientações ficaram claras?',
      categoriaId: orientacao.id,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Em parte', 'Não'],
    })
    expect(mesmoTipo.status).toBe(200)
    expect(dadosDe<Pergunta>(mesmoTipo)).toMatchObject({
      texto: 'As orientações ficaram claras?',
      categoriaId: orientacao.id,
      opcoes: ['Sim', 'Em parte', 'Não'],
      temRespostas: true,
    })
    // A resposta antiga continua com o texto que o paciente leu.
    expect(await prisma.respostaItem.findFirst({ where: { perguntaId: pergunta.id } })).toMatchObject({
      perguntaTexto: 'Você foi bem orientado?',
      tipo: 'MULTIPLA_ESCOLHA',
    })
    expect(await prisma.auditoria.count()).toBe(1)
  })

  it('a pergunta mantém a categoria desativada que já tem, mas não passa para outra desativada', async () => {
    const { setor, categoria, inativa, gestor } = await cenario()
    const outraInativa = await criarCategoria({ nome: 'Limpeza', ativa: false })
    const pergunta = await criarPergunta({
      setorId: setor.id,
      categoriaId: inativa.id,
      texto: 'O tempo de espera foi informado?',
    })
    const caminho = `/perguntas/${pergunta.id}`
    const corpo = { texto: 'Avisaram quanto tempo ia demorar?', tipo: 'ESCALA_1_5' }

    const mantem = await pedir('patch', caminho, gestor.token).send({ ...corpo, categoriaId: inativa.id })
    expect(mantem.status).toBe(200)
    expect(dadosDe<Pergunta>(mantem)).toMatchObject({ categoriaId: inativa.id, texto: corpo.texto })

    for (const [categoriaId, mensagem] of [
      [outraInativa.id, MENSAGEM_CATEGORIA_INATIVA],
      [999, MENSAGEM_CATEGORIA],
    ] as const) {
      const resposta = await pedir('patch', caminho, gestor.token).send({ ...corpo, categoriaId })

      expect(resposta.status, String(categoriaId)).toBe(400)
      expect(erroDe(resposta).detalhes, String(categoriaId)).toEqual([{ campo: 'categoriaId', mensagem }])
    }
    expect((await noBanco(pergunta.id))?.categoriaId).toBe(inativa.id)

    const paraAtiva = await pedir('patch', caminho, gestor.token).send({
      ...corpo,
      categoriaId: categoria.id,
    })
    expect(paraAtiva.status).toBe(200)
    expect((await noBanco(pergunta.id))?.categoriaId).toBe(categoria.id)
  })

  it('a edição que não muda nada responde 200 com a pergunta, sem gravar nem ir para a auditoria', async () => {
    const { setor, categoria, gestor } = await cenario()
    const pergunta = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Você foi bem orientado?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
    })

    const resposta = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send({
      texto: ' Você foi bem orientado? ',
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim ', ' Não'],
    })

    expect(resposta.status).toBe(200)
    expect(dadosDe<Pergunta>(resposta)).toMatchObject({
      id: pergunta.id,
      texto: 'Você foi bem orientado?',
      opcoes: ['Sim', 'Não'],
    })
    const depois = await prisma.pergunta.findUniqueOrThrow({ where: { id: pergunta.id } })
    expect(depois.atualizadoEm).toEqual(pergunta.atualizadoEm)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('valida a pergunta inteira, como na criação; pergunta inexistente: 404; ID inválido: 400', async () => {
    const { setor, categoria, gestor, admin } = await cenario()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const antes = await noBanco(pergunta.id)
    const valida = { texto: 'Texto válido da pergunta', categoriaId: categoria.id, tipo: 'TEXTO' }

    const invalida = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send({
      texto: 'Oi?',
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim'],
    })
    expect(invalida.status).toBe(400)
    expect(erroDe(invalida).detalhes).toEqual([
      { campo: 'texto', mensagem: 'Escreva a pergunta' },
      { campo: 'opcoes', mensagem: MENSAGEM_QUANTIDADE_DE_OPCOES },
    ])

    // A edição recebe a pergunta inteira: só o texto não basta.
    const parcial = await pedir('patch', `/perguntas/${pergunta.id}`, gestor.token).send({
      texto: 'Só o texto novo',
    })
    expect(parcial.status).toBe(400)
    expect(erroDe(parcial).detalhes.map(({ campo }) => campo)).toEqual(['categoriaId', 'tipo'])
    expect(await noBanco(pergunta.id)).toEqual(antes)

    const inexistente = await pedir('patch', '/perguntas/999', admin.token).send(valida)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: 'Pergunta não encontrada.',
    })

    const idInvalido = await pedir('patch', '/perguntas/abc', admin.token).send(valida)
    expect(idInvalido.status).toBe(400)
    expect(erroDe(idInvalido).detalhes).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
  })
})

describe('PUT /setores/:setorId/perguntas/ordem', () => {
  it('sem login: 401; Ouvidoria e Visualizador: 403; o gestor fora dos seus setores: 403, sem mudar nada', async () => {
    const { outroSetor, categoria, gestor } = await cenario()
    const primeira = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 1 })
    const segunda = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 2 })
    const caminho = `/setores/${outroSetor.id}/perguntas/ordem`
    const corpo = { ids: [segunda.id, primeira.id] }

    expect((await pedir('put', caminho).send(corpo)).status).toBe(401)

    for (const perfil of SEM_A_PERMISSAO) {
      const { token } = await logado({ perfil, setorIds: [outroSetor.id] })

      const resposta = await pedir('put', caminho, token).send(corpo)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({ mensagem: MENSAGEM_SEM_PERMISSAO })
    }

    const deOutro = await pedir('put', caminho, gestor.token).send(corpo)
    expect(deOutro.status).toBe(403)
    expect(erroDe(deOutro)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })

    expect((await noBanco(primeira.id))?.ordem).toBe(1)
    expect((await noBanco(segunda.id))?.ordem).toBe(2)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('grava a nova ordem, com as inativas: 204; a ordem de antes e a de depois vão para a auditoria', async () => {
    const { setor, outroSetor, categoria, gestor } = await cenario()
    const a = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 1 })
    const b = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 3, ativa: false })
    const c = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 8 })
    const deOutro = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 2 })

    const resposta = await pedir('put', `/setores/${setor.id}/perguntas/ordem`, gestor.token).send({
      ids: [c.id, a.id, b.id],
    })

    expect(resposta.status).toBe(204)
    expect(resposta.body).toEqual({})
    const lista = await pedir('get', `/setores/${setor.id}/perguntas`, gestor.token)
    expect(dadosDe<Pergunta[]>(lista).map(({ id, ordem, ativa }) => ({ id, ordem, ativa }))).toEqual([
      { id: c.id, ordem: 1, ativa: true },
      { id: a.id, ordem: 2, ativa: true },
      { id: b.id, ordem: 3, ativa: false },
    ])
    // Só as que mudam de posição são gravadas: a que já estava na 3 fica como estava.
    const naMesmaPosicao = await prisma.pergunta.findUniqueOrThrow({ where: { id: b.id } })
    expect(naMesmaPosicao.atualizadoEm).toEqual(b.atualizadoEm)
    expect((await noBanco(deOutro.id))?.ordem).toBe(2)
    expect(await auditoria()).toEqual([
      {
        usuarioId: gestor.usuarioId,
        acao: 'reordenacao_de_perguntas',
        entidade: 'perguntas',
        entidadeId: null,
        dados: { setorId: setor.id, antes: [a.id, b.id, c.id], depois: [c.id, a.id, b.id] },
      },
    ])
  })

  it('lista incompleta, com pergunta de outro setor, repetida ou a mais: 400 em ids, sem mudar nada', async () => {
    const { setor, outroSetor, categoria, gestor } = await cenario()
    const a = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 1 })
    const b = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 2, ativa: false })
    const deOutro = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id, ordem: 1 })
    const caminho = `/setores/${setor.id}/perguntas/ordem`

    for (const ids of [
      [b.id],
      [],
      [b.id, deOutro.id],
      [b.id, a.id, deOutro.id],
      [b.id, b.id],
      [b.id, a.id, a.id],
      [b.id, a.id, 999],
    ]) {
      const resposta = await pedir('put', caminho, gestor.token).send({ ids })

      expect(resposta.status, JSON.stringify(ids)).toBe(400)
      expect(erroDe(resposta).detalhes, JSON.stringify(ids)).toEqual([
        { campo: 'ids', mensagem: MENSAGEM_LISTA_INCOMPLETA },
      ])
    }

    // Sem a lista, ou com o que não é ID: 400 também.
    for (const [corpo, campo] of [
      [{}, 'ids'],
      [{ ids: `${b.id},${a.id}` }, 'ids'],
      [{ ids: [String(b.id), a.id] }, 'ids.0'],
    ] as const) {
      const resposta = await pedir('put', caminho, gestor.token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map((detalhe) => detalhe.campo),
        JSON.stringify(corpo),
      ).toEqual([campo])
    }

    expect((await noBanco(a.id))?.ordem).toBe(1)
    expect((await noBanco(b.id))?.ordem).toBe(2)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('a mesma ordem: 204, sem gravar nem ir para a auditoria; setor sem perguntas: lista vazia; setor inexistente: 404', async () => {
    const { setor, outroSetor, categoria, gestor, admin } = await cenario()
    const a = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 2 })
    const b = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 5 })

    const mesma = await pedir('put', `/setores/${setor.id}/perguntas/ordem`, gestor.token).send({
      ids: [a.id, b.id],
    })
    expect(mesma.status).toBe(204)
    expect(await noBanco(a.id)).toMatchObject({ ordem: 2 })
    expect(await noBanco(b.id)).toMatchObject({ ordem: 5 })
    expect(await prisma.auditoria.count()).toBe(0)

    const vazio = await pedir('put', `/setores/${outroSetor.id}/perguntas/ordem`, admin.token).send({
      ids: [],
    })
    expect(vazio.status).toBe(204)

    const inexistente = await pedir('put', '/setores/999/perguntas/ordem', admin.token).send({ ids: [] })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Setor não encontrado.' })
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('PATCH /perguntas/:id/status', () => {
  it('sem login: 401; Ouvidoria e Visualizador: 403; o gestor de outro setor: 403, sem mudar nada', async () => {
    const { outroSetor, categoria, gestor } = await cenario()
    const pergunta = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id })
    const caminho = `/perguntas/${pergunta.id}/status`

    expect((await pedir('patch', caminho).send({ ativa: false })).status).toBe(401)

    for (const perfil of SEM_A_PERMISSAO) {
      const { token } = await logado({ perfil, setorIds: [outroSetor.id] })

      const resposta = await pedir('patch', caminho, token).send({ ativa: false })

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({ mensagem: MENSAGEM_SEM_PERMISSAO })
    }

    const deOutro = await pedir('patch', caminho, gestor.token).send({ ativa: false })
    expect(deOutro.status).toBe(403)
    expect(erroDe(deOutro)).toMatchObject({ codigo: 'SEM_PERMISSAO', mensagem: MENSAGEM_FORA_DO_SETOR })

    expect((await noBanco(pergunta.id))?.ativa).toBe(true)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('desativa e ativa: 204; a inativa continua na lista, com as respostas; cada mudança vai para a auditoria', async () => {
    const { setor, categoria, gestor } = await cenario()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    await criarResposta({ setorId: setor.id, perguntaIds: [pergunta.id] })
    const caminho = `/perguntas/${pergunta.id}/status`

    const desativar = await pedir('patch', caminho, gestor.token).send({ ativa: false })
    expect(desativar.status).toBe(204)
    expect(desativar.body).toEqual({})
    const lista = await pedir('get', `/setores/${setor.id}/perguntas`, gestor.token)
    expect(dadosDe<Pergunta[]>(lista)).toEqual([
      expect.objectContaining({ id: pergunta.id, ativa: false, temRespostas: true }),
    ])
    expect(await prisma.respostaItem.count({ where: { perguntaId: pergunta.id } })).toBe(1)

    // Já inativa: 204 de novo, sem outra linha na auditoria.
    expect((await pedir('patch', caminho, gestor.token).send({ ativa: false })).status).toBe(204)

    const ativar = await pedir('patch', caminho, gestor.token).send({ ativa: true })
    expect(ativar.status).toBe(204)
    expect((await noBanco(pergunta.id))?.ativa).toBe(true)

    const linha = {
      usuarioId: gestor.usuarioId,
      acao: 'alteracao_de_status_de_pergunta',
      entidade: 'perguntas',
      entidadeId: String(pergunta.id),
    }
    expect(await auditoria()).toEqual([
      { ...linha, dados: { setorId: setor.id, ativa: false } },
      { ...linha, dados: { setorId: setor.id, ativa: true } },
    ])
  })

  it('ativa que não é booleano: 400; pergunta inexistente: 404', async () => {
    const { setor, categoria, admin } = await cenario()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })

    for (const corpo of [{}, { ativa: 'false' }, { ativo: false }]) {
      const resposta = await pedir('patch', `/perguntas/${pergunta.id}/status`, admin.token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map(({ campo }) => campo),
        JSON.stringify(corpo),
      ).toEqual(['ativa'])
    }
    expect((await noBanco(pergunta.id))?.ativa).toBe(true)

    const inexistente = await pedir('patch', '/perguntas/999/status', admin.token).send({ ativa: false })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: 'Pergunta não encontrada.',
    })
  })
})
