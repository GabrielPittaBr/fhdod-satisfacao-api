import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { responder, responderSemConteudo } from '../../src/shared/http/respond'
import { criarLoggerDeTeste } from '../helpers/logger-de-teste'

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/

const rotas = Router()
rotas.get('/cookies', (req, res) => {
  responder(res, req.cookies)
})
// Simula um descuido: alguém joga cabeçalhos e corpo inteiros no log.
rotas.post('/depuracao', (req, res) => {
  req.log.info({ headers: req.headers, body: req.body }, 'depuração descuidada')
  responderSemConteudo(res)
})

function criarAppDeTeste() {
  const log = criarLoggerDeTeste()
  return { app: createApp({ rotas, logger: log.logger }), ...log }
}

describe('ID da requisição', () => {
  it('cada resposta, de sucesso ou de erro, traz um ID novo em X-Request-Id', async () => {
    const { app } = criarAppDeTeste()

    const respostas = await Promise.all([
      request(app).get('/api/v1/cookies'),
      request(app).get('/api/v1/nao-existe'),
      request(app).get('/api/v1/cookies').set('X-Request-Id', 'id-escolhido-pelo-cliente'),
    ])

    const ids = respostas.map((resposta) => resposta.headers['x-request-id'])
    for (const id of ids) expect(id).toMatch(ULID)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('cabeçalhos de segurança e CORS', () => {
  it('aplica os cabeçalhos do helmet e esconde o X-Powered-By', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).get('/api/v1/nao-existe')

    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(resposta.headers['strict-transport-security']).toBeDefined()
    expect(resposta.headers['x-powered-by']).toBeUndefined()
  })

  it('libera o CORS só para a origem configurada', async () => {
    const { app } = criarAppDeTeste()
    const preflight = (origem: string) =>
      request(app)
        .options('/api/v1/cookies')
        .set('Origin', origem)
        .set('Access-Control-Request-Method', 'POST')

    const permitida = await preflight('http://localhost:5173')
    expect(permitida.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(permitida.headers['access-control-allow-credentials']).toBe('true')

    const outra = await preflight('https://site-malicioso.example')
    expect(outra.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('leitura de cookies', () => {
  it('entrega os cookies já lidos em req.cookies', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).get('/api/v1/cookies').set('Cookie', 'refresh=abc; tema=escuro')

    expect(resposta.body).toEqual({ data: { refresh: 'abc', tema: 'escuro' } })
  })
})

describe('log das requisições', () => {
  const segredos = {
    authorization: 'Bearer token-secreto-1',
    cookie: 'refresh=cookie-secreto-2',
    'x-tv-token': 'tv-secreto-3',
    'x-complemento-token': 'complemento-secreto-4',
  }
  const corpo = {
    senha: 'senha-secreta-5',
    novaSenha: 'senha-secreta-6',
    senhaProvisoria: 'senha-secreta-9',
    // O token de uma tela de TV, como sai na criação dela.
    tela: { token: 'tv-secreto-10' },
    contato: { telefone: '51999990007' },
  }

  async function enviarComSegredos() {
    const log = criarAppDeTeste()
    const resposta = await request(log.app)
      .post('/api/v1/depuracao?token=query-secreto-8')
      .set(segredos)
      .send(corpo)
    await vi.waitFor(() =>
      expect(log.linhas.some((linha) => linha.msg === 'requisição concluída')).toBe(true),
    )
    return { ...log, resposta }
  }

  it('registra a entrada e a saída em JSON, com requestId, rota, status e duração', async () => {
    const { linhas, resposta } = await enviarComSegredos()
    const requestId = resposta.headers['x-request-id']

    const entrada = linhas.find((linha) => linha.msg === 'requisição recebida')
    const saida = linhas.find((linha) => linha.msg === 'requisição concluída')
    expect(entrada).toMatchObject({
      level: 'info',
      requestId,
      req: { method: 'POST', url: '/api/v1/depuracao' },
    })
    expect(saida).toMatchObject({
      level: 'info',
      requestId,
      req: { method: 'POST', url: '/api/v1/depuracao' },
      res: { statusCode: 204 },
      duracaoMs: expect.any(Number),
    })
    expect(saida?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('nunca mostra tokens, cookies, senha nem telefone, nem num log descuidado', async () => {
    const { linhas, texto } = await enviarComSegredos()

    for (const segredo of [
      ...Object.values(segredos),
      'senha-secreta-5',
      'senha-secreta-6',
      'senha-secreta-9',
      'tv-secreto-10',
      '51999990007',
    ]) {
      expect(texto()).not.toContain(segredo.replace('Bearer ', ''))
    }
    expect(texto()).not.toContain('query-secreto-8')

    const descuidada = linhas.find((linha) => linha.msg === 'depuração descuidada')
    expect(descuidada).toMatchObject({
      headers: {
        authorization: '[oculto]',
        cookie: '[oculto]',
        'x-tv-token': '[oculto]',
        'x-complemento-token': '[oculto]',
      },
      body: {
        senha: '[oculto]',
        novaSenha: '[oculto]',
        senhaProvisoria: '[oculto]',
        tela: { token: '[oculto]' },
        contato: { telefone: '[oculto]' },
      },
    })
  })
})
