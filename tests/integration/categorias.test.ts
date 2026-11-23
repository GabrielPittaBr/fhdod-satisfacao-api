import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { PERFIS, type Perfil } from '../../src/shared/constants/perfis'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `categorias:gerenciar`: só leem a lista. */
const SO_LEEM: Perfil[] = ['GESTOR', 'OUVIDORIA', 'VISUALIZADOR']

const MENSAGEM_NOME = 'Informe o nome da categoria'
const MENSAGEM_REPETIDO = 'Já existe uma categoria com este nome.'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

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

/** A categoria como está no banco, no formato do contrato. */
function noBanco(id: number) {
  return prisma.categoria.findUnique({
    where: { id },
    select: { id: true, nome: true, ordem: true, ativa: true },
  })
}

describe('GET /categorias', () => {
  it('sem login: 401', async () => {
    const resposta = await pedir('get', '/categorias')

    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
  })

  it('todos os perfis recebem a lista inteira, ativas e inativas, na ordem definida e sem paginação', async () => {
    const triagem = await criarCategoria({ nome: 'Triagem', ordem: 2 })
    const espera = await criarCategoria({ nome: 'Tempo de Espera', ordem: 7, ativa: false })
    const recepcao = await criarCategoria({ nome: 'Recepção', ordem: 1 })
    // Na mesma posição, vale a mais antiga.
    const enfermagem = await criarCategoria({ nome: 'Enfermagem', ordem: 2 })

    for (const perfil of PERFIS) {
      const resposta = await pedir('get', '/categorias', await tokenDe({ perfil }))

      expect(resposta.status, perfil).toBe(200)
      expect(resposta.body, perfil).toEqual({
        data: [
          { id: recepcao.id, nome: 'Recepção', ordem: 1, ativa: true },
          { id: triagem.id, nome: 'Triagem', ordem: 2, ativa: true },
          { id: enfermagem.id, nome: 'Enfermagem', ordem: 2, ativa: true },
          { id: espera.id, nome: 'Tempo de Espera', ordem: 7, ativa: false },
        ],
      })
    }
  })
})

describe('POST /categorias', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem criar nada', async () => {
    const semLogin = await pedir('post', '/categorias').send({ nome: 'Farmácia' })
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LEEM) {
      const resposta = await pedir('post', '/categorias', await tokenDe({ perfil })).send({
        nome: 'Farmácia',
      })

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    }
    expect(await prisma.categoria.count()).toBe(0)
  })

  it('o Super Admin cria a categoria, ativa e no fim da ordem: 201 com a Categoria', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const primeira = await pedir('post', '/categorias', token).send({ nome: '  Farmácia ' })
    expect(primeira.status).toBe(201)
    const { id } = (primeira.body as { data: { id: number } }).data
    expect(primeira.body).toEqual({ data: { id, nome: 'Farmácia', ordem: 1, ativa: true } })
    expect(await noBanco(id)).toEqual({ id, nome: 'Farmácia', ordem: 1, ativa: true })

    // Depois da maior posição, mesmo com buracos na numeração e com a última inativa.
    await criarCategoria({ nome: 'Recepção', ordem: 5, ativa: false })
    const segunda = await pedir('post', '/categorias', token).send({ nome: 'Nutrição' })
    expect(segunda.status).toBe(201)
    expect(segunda.body.data).toMatchObject({ nome: 'Nutrição', ordem: 6, ativa: true })
  })

  it('nome com menos de 2 caracteres, longo demais ou ausente: 400 em nome', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const [corpo, mensagem] of [
      [{ nome: 'A' }, MENSAGEM_NOME],
      [{ nome: '   ' }, MENSAGEM_NOME],
      [{ nome: 'N'.repeat(101) }, 'Use no máximo 100 caracteres'],
      [{}, 'Obrigatório'],
    ] as const) {
      const resposta = await pedir('post', '/categorias', token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'VALIDACAO', detalhes: [{ campo: 'nome', mensagem }] })
    }
    expect(await prisma.categoria.count()).toBe(0)
  })

  it('nome repetido, mesmo com maiúsculas e espaços diferentes ou de uma categoria inativa: 409', async () => {
    await criarCategoria({ nome: 'Recepção' })
    await criarCategoria({ nome: 'Higiene e Limpeza', ativa: false })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const nome of ['Recepção', 'RECEPÇÃO', 'recepção', '  Recepção ', 'higiene e limpeza']) {
      const resposta = await pedir('post', '/categorias', token).send({ nome })

      expect(resposta.status, nome).toBe(409)
      expect(erroDe(resposta), nome).toMatchObject({ codigo: 'CONFLITO', mensagem: MENSAGEM_REPETIDO })
    }
    expect(await prisma.categoria.count()).toBe(2)
  })
})

describe('PATCH /categorias/:id', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem mudar nada', async () => {
    const categoria = await criarCategoria({ nome: 'Recepção' })
    const antes = await noBanco(categoria.id)

    const semLogin = await pedir('patch', `/categorias/${categoria.id}`).send({ ativa: false })
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LEEM) {
      const resposta = await pedir('patch', `/categorias/${categoria.id}`, await tokenDe({ perfil })).send({
        nome: 'Atendimento',
        ativa: false,
      })

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta).codigo, perfil).toBe('SEM_PERMISSAO')
    }
    expect(await noBanco(categoria.id)).toEqual(antes)
  })

  it('muda o nome, desativa e ativa, ou faz os dois de uma vez; a ordem não muda', async () => {
    const categoria = await criarCategoria({ nome: 'Recepção', ordem: 3 })
    const { id } = categoria
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const soNome = await pedir('patch', `/categorias/${id}`, token).send({ nome: ' Recepção e Cadastro ' })
    expect(soNome.status).toBe(200)
    expect(soNome.body).toEqual({ data: { id, nome: 'Recepção e Cadastro', ordem: 3, ativa: true } })

    const desativar = await pedir('patch', `/categorias/${id}`, token).send({ ativa: false })
    expect(desativar.body).toEqual({ data: { id, nome: 'Recepção e Cadastro', ordem: 3, ativa: false } })

    const osDois = await pedir('patch', `/categorias/${id}`, token).send({ nome: 'Recepção', ativa: true })
    expect(osDois.body).toEqual({ data: { id, nome: 'Recepção', ordem: 3, ativa: true } })
    expect(await noBanco(id)).toEqual({ id, nome: 'Recepção', ordem: 3, ativa: true })
  })

  it('trocar só as maiúsculas do próprio nome não é conflito; o nome de outra categoria dá 409', async () => {
    const recepcao = await criarCategoria({ nome: 'Recepção' })
    await criarCategoria({ nome: 'Triagem' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const proprio = await pedir('patch', `/categorias/${recepcao.id}`, token).send({ nome: 'RECEPÇÃO' })
    expect(proprio.status).toBe(200)
    expect(proprio.body.data.nome).toBe('RECEPÇÃO')

    const deOutra = await pedir('patch', `/categorias/${recepcao.id}`, token).send({
      nome: 'triagem',
      ativa: false,
    })
    expect(deOutra.status).toBe(409)
    expect(erroDe(deOutra)).toMatchObject({ codigo: 'CONFLITO', mensagem: MENSAGEM_REPETIDO })
    // Nada da edição recusada foi gravado, nem a desativação que veio junto.
    expect(await noBanco(recepcao.id)).toMatchObject({ nome: 'RECEPÇÃO', ativa: true })
  })

  it('sem nada para mudar, nome inválido ou ativa que não é booleano: 400, sem mudar nada', async () => {
    const categoria = await criarCategoria({ nome: 'Recepção' })
    const antes = await noBanco(categoria.id)
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    // A `ordem` não é editável por esta rota: vem ignorada, e o corpo fica sem nada para mudar.
    for (const corpo of [{}, { ordem: 1 }]) {
      const resposta = await pedir('patch', `/categorias/${categoria.id}`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        { campo: 'body', mensagem: 'Envie o que vai mudar: o nome, a situação ou os dois.' },
      ])
    }

    const invalidos = await pedir('patch', `/categorias/${categoria.id}`, token).send({
      nome: 'R',
      ativa: 'false',
    })
    expect(invalidos.status).toBe(400)
    expect(erroDe(invalidos).detalhes.map(({ campo }) => campo)).toEqual(['nome', 'ativa'])
    expect(erroDe(invalidos).detalhes[0]).toEqual({ campo: 'nome', mensagem: MENSAGEM_NOME })
    expect(await noBanco(categoria.id)).toEqual(antes)
  })

  it('categoria inexistente: 404; ID inválido: 400 em id', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const inexistente = await pedir('patch', '/categorias/1', token).send({ ativa: false })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: 'Categoria não encontrada.',
    })

    const invalido = await pedir('patch', '/categorias/abc', token).send({ ativa: false })
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([
      { campo: 'id', mensagem: 'O ID precisa ser um número inteiro positivo.' },
    ])
  })
})
