import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authenticate, usuarioLogado } from '../../src/middlewares/authenticate'
import { authorize } from '../../src/middlewares/authorize'
import { setorScope } from '../../src/middlewares/setor-scope'
import { validate } from '../../src/middlewares/validate'
import type { Perfil } from '../../src/shared/constants/perfis'
import { responder } from '../../src/shared/http/respond'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarSetor } from '../factories/setores'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer, tokenDeAcesso } from '../helpers/sessao'

// Rotas de teste montadas como as dos próximos tickets: authenticate → authorize → setorScope → validate.
const rotas = Router()
rotas.get('/teste/logado', authenticate, (req, res) => {
  responder(res, usuarioLogado(req))
})
rotas.get('/teste/respostas', authenticate, authorize('respostas:ver'), (_req, res) => {
  responder(res, 'ok')
})
rotas.get(
  '/teste/setores/:setorId/perguntas',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate({ params: z.object({ setorId: z.coerce.number().int().positive() }) }),
  (req, res) => {
    responder(res, req.valid.params)
  },
)
rotas.get(
  '/teste/dashboard',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  (req, res) => {
    responder(res, { setorIds: usuarioLogado(req).setorIds })
  },
)
rotas.get('/teste/sem-authenticate', (req, res) => {
  responder(res, usuarioLogado(req))
})

const app = createApp({ rotas })

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Cria o usuário e devolve também um token de acesso dele, assinado pela API. */
async function logado(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return { usuario, token: await emitirTokenDeAcesso(usuario.id) }
}

function chamar(caminho: string, token?: string) {
  const pedido = request(app).get(`/api/v1${caminho}`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

function erroDe(resposta: request.Response) {
  return (resposta.body as { erro: { codigo: string; mensagem: string } }).erro
}

describe('authenticate', () => {
  it('sem token, com o cabeçalho fora do formato ou com token inválido, forjado ou vencido: 401', async () => {
    const { usuario, token } = await logado()
    const forjado = await tokenDeAcesso(usuario.id, { segredo: 'segredo-de-quem-quer-forjar-um-token-0000' })
    const vencido = await tokenDeAcesso(usuario.id, { emitidoHaSegundos: 15 * 60 + 1 })
    const deQuemNaoExiste = await emitirTokenDeAcesso(usuario.id + 1000)

    for (const autorizacao of [
      undefined,
      `Token ${token}`,
      'Bearer',
      `Bearer ${token} extra`,
      'Bearer nao-e-um-jwt',
      bearer(forjado),
      bearer(vencido),
      bearer(deQuemNaoExiste),
    ]) {
      const pedido = request(app).get('/api/v1/teste/logado')
      const resposta = await (autorizacao ? pedido.set('Authorization', autorizacao) : pedido)

      expect(resposta.status, autorizacao).toBe(401)
      expect(erroDe(resposta)).toMatchObject({
        codigo: 'NAO_AUTENTICADO',
        mensagem: 'Sua sessão terminou. Entre de novo.',
      })
    }
    await chamar('/teste/logado', token).expect(200)
  })

  it('lê do banco, em req.usuario, quem está logado, as permissões do perfil e os setores', async () => {
    const pediatria = await criarSetor()
    const maternidade = await criarSetor()
    const gestor = await logado({
      perfil: 'GESTOR',
      nome: 'Bruno Lima',
      email: 'bruno.lima@hospital.test',
      setorIds: [maternidade.id, pediatria.id],
    })
    const admin = await logado({ perfil: 'SUPER_ADMIN', setorIds: [pediatria.id] })

    expect((await chamar('/teste/logado', gestor.token)).body.data).toEqual({
      id: gestor.usuario.id,
      nome: 'Bruno Lima',
      email: 'bruno.lima@hospital.test',
      perfil: 'GESTOR',
      trocarSenha: false,
      permissoes: [
        'perguntas:gerenciar',
        'dashboard:ver',
        'respostas:ver',
        'comentarios:ver',
        'exportacao:resumo',
        'exportacao:detalhada',
        'escalas:gerenciar',
      ],
      setorIds: [pediatria.id, maternidade.id],
    })
    expect((await chamar('/teste/logado', admin.token)).body.data).toMatchObject({ setorIds: null })
  })

  it('o usuário desativado perde o acesso na hora, mesmo com o token ainda válido', async () => {
    const { usuario, token } = await logado()
    await chamar('/teste/logado', token).expect(200)

    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })

    const resposta = await chamar('/teste/logado', token)
    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
  })

  it('com a senha provisória, responde 403 até a troca', async () => {
    const { usuario, token } = await logado({ trocarSenha: true })

    const resposta = await chamar('/teste/logado', token)

    expect(resposta.status).toBe(403)
    expect(erroDe(resposta)).toMatchObject({
      codigo: 'SEM_PERMISSAO',
      mensagem: 'Troque a senha provisória para continuar.',
    })
    await prisma.usuario.update({ where: { id: usuario.id }, data: { trocarSenha: false } })
    await chamar('/teste/logado', token).expect(200)
  })

  it('numa rota que esqueceu o authenticate, ler o usuário é erro de programação: 500', async () => {
    const { token } = await logado()

    const resposta = await chamar('/teste/sem-authenticate', token)

    expect(resposta.status).toBe(500)
    expect(erroDe(resposta).codigo).toBe('ERRO_INTERNO')
  })
})

describe('authorize', () => {
  it.each([
    ['SUPER_ADMIN', 200],
    ['GESTOR', 200],
    ['OUVIDORIA', 200],
    ['VISUALIZADOR', 403],
  ] as [Perfil, number][])('respostas:ver para o %s: %i', async (perfil, status) => {
    const { token } = await logado({ perfil })

    const resposta = await chamar('/teste/respostas', token)

    expect(resposta.status).toBe(status)
    if (status === 403) {
      expect(erroDe(resposta)).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    }
  })

  it('a mudança de perfil vale na hora, com o mesmo token', async () => {
    const { usuario, token } = await logado({ perfil: 'GESTOR' })
    await chamar('/teste/respostas', token).expect(200)

    await prisma.usuario.update({ where: { id: usuario.id }, data: { perfil: 'VISUALIZADOR' } })
    await chamar('/teste/respostas', token).expect(403)

    await prisma.usuario.update({ where: { id: usuario.id }, data: { perfil: 'OUVIDORIA' } })
    await chamar('/teste/respostas', token).expect(200)
  })
})

describe('setorScope', () => {
  it('o Gestor só entra nos seus setores; nos outros, recebe 403', async () => {
    const seu = await criarSetor()
    const outro = await criarSetor()
    const { token } = await logado({ perfil: 'GESTOR', setorIds: [seu.id] })

    const permitido = await chamar(`/teste/setores/${seu.id}/perguntas`, token)
    const negado = await chamar(`/teste/setores/${outro.id}/perguntas`, token)

    expect(permitido.status).toBe(200)
    expect(permitido.body.data).toEqual({ setorId: seu.id })
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toMatchObject({
      codigo: 'SEM_PERMISSAO',
      mensagem: 'Você não tem acesso a este setor.',
    })
  })

  it('o Super Admin entra em qualquer setor', async () => {
    const setor = await criarSetor()
    const { token } = await logado({ perfil: 'SUPER_ADMIN' })

    await chamar(`/teste/setores/${setor.id}/perguntas`, token).expect(200)
    await chamar(`/teste/setores/${setor.id + 50}/perguntas`, token).expect(200)
  })

  it('para quem tem escopo, o que não for o ID de um dos seus setores recebe 403 antes da validação', async () => {
    const setor = await criarSetor()
    const gestor = await logado({ perfil: 'GESTOR', setorIds: [setor.id] })
    const admin = await logado({ perfil: 'SUPER_ADMIN' })

    for (const valor of ['abc', '0', `0${setor.id}`, '-1', '1.5']) {
      expect((await chamar(`/teste/setores/${valor}/perguntas`, gestor.token)).status, valor).toBe(403)
    }
    // Sem escopo, quem responde ao valor inválido é a validação.
    const invalido = await chamar('/teste/setores/abc/perguntas', admin.token)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).codigo).toBe('VALIDACAO')
  })

  it('tirar o setor da pessoa vale na hora', async () => {
    const setor = await criarSetor()
    const { usuario, token } = await logado({ perfil: 'GESTOR', setorIds: [setor.id] })
    await chamar(`/teste/setores/${setor.id}/perguntas`, token).expect(200)

    await prisma.usuarioSetor.deleteMany({ where: { usuarioId: usuario.id } })

    await chamar(`/teste/setores/${setor.id}/perguntas`, token).expect(403)
  })

  it('no filtro da query, sem setor a rota passa com o escopo da pessoa, e um setor de fora dá 403', async () => {
    const seu = await criarSetor()
    const outro = await criarSetor()
    const visualizador = await logado({ perfil: 'VISUALIZADOR', setorIds: [seu.id] })
    const ouvidoria = await logado({ perfil: 'OUVIDORIA' })

    expect((await chamar('/teste/dashboard', visualizador.token)).body.data).toEqual({ setorIds: [seu.id] })
    await chamar(`/teste/dashboard?setorId=${seu.id}`, visualizador.token).expect(200)
    await chamar(`/teste/dashboard?setorId=${outro.id}`, visualizador.token).expect(403)
    await chamar(`/teste/dashboard?setorId=${seu.id}&setorId=${outro.id}`, visualizador.token).expect(403)

    const daOuvidoria = await chamar(`/teste/dashboard?setorId=${outro.id}`, ouvidoria.token)
    expect(daOuvidoria.status).toBe(200)
    expect(daOuvidoria.body.data).toEqual({ setorIds: null })
  })
})
