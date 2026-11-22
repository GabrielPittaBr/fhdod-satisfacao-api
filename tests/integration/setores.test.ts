import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import type { Perfil } from '../../src/shared/constants/perfis'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarSetor } from '../factories/setores'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `setores:gerenciar`: só listam. */
const SO_LISTAM: Perfil[] = ['GESTOR', 'OUVIDORIA', 'VISUALIZADOR']

const MENSAGEM_SLUG = 'Use só letras minúsculas, números e hífen, sem espaços'
const MENSAGEM_ID = 'O ID precisa ser um número inteiro positivo.'

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

function pedir(metodo: 'get' | 'post' | 'patch', caminho: string, token?: string) {
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

/** O setor como está no banco, no formato do contrato. */
async function noBanco(id: number) {
  return prisma.setor.findUnique({
    where: { id },
    select: { id: true, nome: true, slug: true, descricao: true, ativo: true },
  })
}

describe('GET /setores', () => {
  it('sem login: 401', async () => {
    const resposta = await pedir('get', '/setores')

    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
  })

  it('Super Admin e Ouvidoria recebem todos, ativos e inativos, em ordem alfabética e sem paginação', async () => {
    const pronto = await criarSetor({
      nome: 'Pronto Atendimento',
      slug: 'pronto-atendimento',
      descricao: 'Urgência e emergência, 24 horas',
    })
    const ortese = await criarSetor({ nome: 'Órtese e Prótese', slug: 'ortese-e-protese' })
    const maternidade = await criarSetor({
      nome: 'Maternidade',
      slug: 'maternidade',
      descricao: 'Em reforma',
      ativo: false,
    })
    const oncologia = await criarSetor({ nome: 'Oncologia', slug: 'oncologia' })
    const ambulatorio = await criarSetor({ nome: 'Ambulatório', slug: 'ambulatorio' })

    for (const perfil of ['SUPER_ADMIN', 'OUVIDORIA'] as const) {
      const resposta = await pedir('get', '/setores', await tokenDe({ perfil }))

      expect(resposta.status, perfil).toBe(200)
      expect(resposta.body, perfil).toEqual({
        data: [
          { id: ambulatorio.id, nome: 'Ambulatório', slug: 'ambulatorio', descricao: null, ativo: true },
          {
            id: maternidade.id,
            nome: 'Maternidade',
            slug: 'maternidade',
            descricao: 'Em reforma',
            ativo: false,
          },
          { id: oncologia.id, nome: 'Oncologia', slug: 'oncologia', descricao: null, ativo: true },
          { id: ortese.id, nome: 'Órtese e Prótese', slug: 'ortese-e-protese', descricao: null, ativo: true },
          {
            id: pronto.id,
            nome: 'Pronto Atendimento',
            slug: 'pronto-atendimento',
            descricao: 'Urgência e emergência, 24 horas',
            ativo: true,
          },
        ],
      })
    }
  })

  it('Gestor e Visualizador recebem só os seus setores, inclusive os inativos', async () => {
    const raioX = await criarSetor({ nome: 'Raio-X' })
    const laboratorio = await criarSetor({ nome: 'Laboratório', ativo: false })
    await criarSetor({ nome: 'Internação' })
    await criarSetor({ nome: 'Ambulatório' })

    for (const perfil of ['GESTOR', 'VISUALIZADOR'] as const) {
      const token = await tokenDe({ perfil, setorIds: [raioX.id, laboratorio.id] })

      const resposta = await pedir('get', '/setores', token)

      expect(resposta.status, perfil).toBe(200)
      const recebidos = (resposta.body as { data: { id: number; nome: string; ativo: boolean }[] }).data
      expect(
        recebidos.map(({ id, nome, ativo }) => ({ id, nome, ativo })),
        perfil,
      ).toEqual([
        { id: laboratorio.id, nome: 'Laboratório', ativo: false },
        { id: raioX.id, nome: 'Raio-X', ativo: true },
      ])
    }
  })

  it('quem não tem setor nenhum recebe a lista vazia', async () => {
    await criarSetor()
    const token = await tokenDe({ perfil: 'GESTOR' })

    const resposta = await pedir('get', '/setores', token)

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: [] })
  })
})

describe('POST /setores', () => {
  const NOVO = { nome: 'Pronto Atendimento', slug: 'pronto-atendimento', descricao: 'Urgência e emergência' }

  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem criar nada', async () => {
    const semLogin = await pedir('post', '/setores').send(NOVO)
    expect(semLogin.status).toBe(401)
    expect(erroDe(semLogin).codigo).toBe('NAO_AUTENTICADO')

    for (const perfil of SO_LISTAM) {
      const resposta = await pedir('post', '/setores', await tokenDe({ perfil })).send(NOVO)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    }
    expect(await prisma.setor.count()).toBe(0)
  })

  it('o Super Admin cria o setor, já ativo: 201 com o Setor', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/setores', token).send(NOVO)

    expect(resposta.status).toBe(201)
    const { id } = (resposta.body as { data: { id: number } }).data
    const esperado = { id, ...NOVO, ativo: true }
    expect(resposta.body).toEqual({ data: esperado })
    expect(await noBanco(id)).toEqual(esperado)
  })

  it('tira os espaços das pontas do nome e da descrição; descrição vazia, só com espaços, nula ou ausente vira null', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const comEspacos = await pedir('post', '/setores', token).send({
      nome: '  Raio-X  ',
      slug: 'raio-x',
      descricao: '  Exames de imagem ',
    })
    expect(comEspacos.status).toBe(201)
    expect(comEspacos.body.data).toMatchObject({ nome: 'Raio-X', descricao: 'Exames de imagem' })

    for (const [slug, descricao] of [
      ['vazia', ''],
      ['so-espacos', '   '],
      ['nula', null],
      ['ausente', undefined],
    ] as const) {
      const resposta = await pedir('post', '/setores', token).send({ nome: 'Laboratório', slug, descricao })

      expect(resposta.status, slug).toBe(201)
      expect(resposta.body.data.descricao, slug).toBeNull()
      expect((await noBanco(resposta.body.data.id))?.descricao, slug).toBeNull()
    }
  })

  it('nome com menos de 2 caracteres e slug fora do formato: 400 em nome e em slug', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const ambos = await pedir('post', '/setores', token).send({ nome: ' A ', slug: 'Pronto Atendimento' })
    expect(ambos.status).toBe(400)
    expect(erroDe(ambos)).toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: [
        { campo: 'nome', mensagem: 'Informe o nome do setor' },
        { campo: 'slug', mensagem: MENSAGEM_SLUG },
      ],
    })

    for (const slug of [
      'Pronto',
      'pronto atendimento',
      'pronto_atendimento',
      'ação',
      '-pronto',
      'pronto-',
      'pronto--atendimento',
      '',
    ]) {
      const resposta = await pedir('post', '/setores', token).send({ nome: 'Pronto', slug })

      expect(resposta.status, slug).toBe(400)
      expect(erroDe(resposta).detalhes, slug).toEqual([{ campo: 'slug', mensagem: MENSAGEM_SLUG }])
    }

    const semNada = await pedir('post', '/setores', token).send({})
    expect(erroDe(semNada).detalhes).toEqual([
      { campo: 'nome', mensagem: 'Obrigatório' },
      { campo: 'slug', mensagem: 'Obrigatório' },
    ])

    const longos = await pedir('post', '/setores', token).send({
      nome: 'N'.repeat(101),
      slug: 'a'.repeat(101),
      descricao: 'D'.repeat(121),
    })
    expect(erroDe(longos).detalhes).toEqual([
      { campo: 'nome', mensagem: 'Use no máximo 100 caracteres' },
      { campo: 'slug', mensagem: 'Use no máximo 100 caracteres' },
      { campo: 'descricao', mensagem: 'Use no máximo 120 caracteres' },
    ])
    expect(await prisma.setor.count()).toBe(0)
  })

  it('slug repetido, mesmo de um setor inativo: 409 CONFLITO', async () => {
    await criarSetor({ nome: 'Maternidade', slug: 'maternidade', ativo: false })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/setores', token).send({
      nome: 'Maternidade Nova',
      slug: 'maternidade',
    })

    expect(resposta.status).toBe(409)
    expect(erroDe(resposta)).toMatchObject({
      codigo: 'CONFLITO',
      mensagem: 'Já existe um setor com este endereço. Escolha outro.',
      detalhes: [],
    })
    expect(await prisma.setor.count()).toBe(1)
  })
})

describe('PATCH /setores/:id', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, mesmo num setor seu, sem mudar nada', async () => {
    const setor = await criarSetor({ nome: 'Raio-X', slug: 'raio-x' })
    const antes = await noBanco(setor.id)

    const semLogin = await pedir('patch', `/setores/${setor.id}`).send({ nome: 'Imagem' })
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LISTAM) {
      const token = await tokenDe({ perfil, setorIds: [setor.id] })

      const resposta = await pedir('patch', `/setores/${setor.id}`, token).send({ nome: 'Imagem' })

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta).codigo, perfil).toBe('SEM_PERMISSAO')
    }
    expect(await noBanco(setor.id)).toEqual(antes)
  })

  it('o Super Admin edita nome, slug e descrição: 200 com o Setor', async () => {
    const setor = await criarSetor({ nome: 'Raio-X', slug: 'raio-x', descricao: 'Exames' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('patch', `/setores/${setor.id}`, token).send({
      nome: ' Raio-X e Imagem ',
      slug: 'raio-x-e-imagem',
      descricao: 'Raio-X, tomografia e ultrassom',
    })

    const esperado = {
      id: setor.id,
      nome: 'Raio-X e Imagem',
      slug: 'raio-x-e-imagem',
      descricao: 'Raio-X, tomografia e ultrassom',
      ativo: true,
    }
    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: esperado })
    expect(await noBanco(setor.id)).toEqual(esperado)
  })

  it('só os campos enviados mudam, e a descrição vazia vira null', async () => {
    const setor = await criarSetor({ nome: 'Raio-X', slug: 'raio-x', descricao: 'Exames', ativo: false })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const soNome = await pedir('patch', `/setores/${setor.id}`, token).send({ nome: 'Imagem' })
    expect(soNome.body.data).toEqual({
      id: setor.id,
      nome: 'Imagem',
      slug: 'raio-x',
      descricao: 'Exames',
      ativo: false,
    })

    const semDescricao = await pedir('patch', `/setores/${setor.id}`, token).send({ descricao: '' })
    expect(semDescricao.status).toBe(200)
    expect(await noBanco(setor.id)).toEqual({
      id: setor.id,
      nome: 'Imagem',
      slug: 'raio-x',
      descricao: null,
      ativo: false,
    })
  })

  it('manter o próprio slug não é conflito; usar o de outro setor dá 409 e não muda nada', async () => {
    const raioX = await criarSetor({ nome: 'Raio-X', slug: 'raio-x' })
    await criarSetor({ nome: 'Laboratório', slug: 'laboratorio' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const proprio = await pedir('patch', `/setores/${raioX.id}`, token).send({
      nome: 'Imagem',
      slug: 'raio-x',
    })
    expect(proprio.status).toBe(200)

    const deOutro = await pedir('patch', `/setores/${raioX.id}`, token).send({
      nome: 'Laboratório 2',
      slug: 'laboratorio',
    })
    expect(deOutro.status).toBe(409)
    expect(erroDe(deOutro)).toMatchObject({
      codigo: 'CONFLITO',
      mensagem: 'Já existe um setor com este endereço. Escolha outro.',
    })
    expect(await noBanco(raioX.id)).toMatchObject({ nome: 'Imagem', slug: 'raio-x' })
  })

  it('setor inexistente: 404; ID que não é um inteiro positivo: 400 em id', async () => {
    const setor = await criarSetor()
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const inexistente = await pedir('patch', `/setores/${setor.id + 1}`, token).send({ nome: 'Imagem' })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Setor não encontrado.' })

    for (const id of ['abc', '0', '-1', '1.5', '2147483648']) {
      const resposta = await pedir('patch', `/setores/${id}`, token).send({ nome: 'Imagem' })

      expect(resposta.status, id).toBe(400)
      expect(erroDe(resposta).detalhes, id).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
    }
  })

  it('sem nenhum campo para mudar, ou com nome e slug inválidos: 400', async () => {
    const setor = await criarSetor({ nome: 'Raio-X', slug: 'raio-x' })
    const antes = await noBanco(setor.id)
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    // Campos que não são do setor, como o `ativo`, são ignorados: o status tem a sua rota.
    for (const corpo of [{}, { ativo: false }]) {
      const resposta = await pedir('patch', `/setores/${setor.id}`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        { campo: 'body', mensagem: 'Envie o que vai mudar: nome, slug ou descrição.' },
      ])
    }

    const invalidos = await pedir('patch', `/setores/${setor.id}`, token).send({ nome: 'R', slug: 'Raio X' })
    expect(invalidos.status).toBe(400)
    expect(erroDe(invalidos).detalhes).toEqual([
      { campo: 'nome', mensagem: 'Informe o nome do setor' },
      { campo: 'slug', mensagem: MENSAGEM_SLUG },
    ])
    expect(await noBanco(setor.id)).toEqual(antes)
  })
})

describe('PATCH /setores/:id/status', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, mesmo num setor seu', async () => {
    const setor = await criarSetor()

    const semLogin = await pedir('patch', `/setores/${setor.id}/status`).send({ ativo: false })
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LISTAM) {
      const token = await tokenDe({ perfil, setorIds: [setor.id] })

      const resposta = await pedir('patch', `/setores/${setor.id}/status`, token).send({ ativo: false })

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta).codigo, perfil).toBe('SEM_PERMISSAO')
    }
    expect((await noBanco(setor.id))?.ativo).toBe(true)
  })

  it('desativa e ativa de novo com 204; o setor inativo continua na lista, e as respostas dele, no banco', async () => {
    const setor = await criarSetor({ nome: 'Pronto Atendimento' })
    const turno = await prisma.turno.create({
      data: { nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 },
    })
    await prisma.resposta.create({
      data: {
        setorId: setor.id,
        canal: 'TOTEM',
        dataAtendimento: new Date('2026-11-20'),
        turnoId: turno.id,
        nps: 9,
        classificacao: 'NORMAL',
        chaveIdempotencia: randomUUID(),
      },
    })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const desativar = await pedir('patch', `/setores/${setor.id}/status`, token).send({ ativo: false })
    expect(desativar.status).toBe(204)
    expect(desativar.text).toBe('')
    expect((await noBanco(setor.id))?.ativo).toBe(false)
    expect(await prisma.resposta.count({ where: { setorId: setor.id } })).toBe(1)

    const lista = await pedir('get', '/setores', token)
    expect(lista.body.data).toEqual([expect.objectContaining({ id: setor.id, ativo: false })])

    // Pedir de novo o que já está valendo também responde 204.
    await pedir('patch', `/setores/${setor.id}/status`, token).send({ ativo: false }).expect(204)

    await pedir('patch', `/setores/${setor.id}/status`, token).send({ ativo: true }).expect(204)
    expect((await noBanco(setor.id))?.ativo).toBe(true)
  })

  it('ativo ausente ou que não é booleano: 400 em ativo', async () => {
    const setor = await criarSetor()
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const corpo of [{}, { ativo: 'false' }, { ativo: 0 }, { ativo: null }]) {
      const resposta = await pedir('patch', `/setores/${setor.id}/status`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map(({ campo }) => campo),
        JSON.stringify(corpo),
      ).toEqual(['ativo'])
    }
    expect((await noBanco(setor.id))?.ativo).toBe(true)
  })

  it('setor inexistente: 404; ID inválido: 400 em id', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const inexistente = await pedir('patch', '/setores/1/status', token).send({ ativo: false })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Setor não encontrado.' })

    const invalido = await pedir('patch', '/setores/abc/status', token).send({ ativo: false })
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
  })
})
