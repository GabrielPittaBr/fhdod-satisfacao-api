import request from 'supertest'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { healthRepository } from '../../src/modules/health/health.repository'
import { criarLoggerDeTeste } from '../helpers/logger-de-teste'

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/health', () => {
  it('responde 200 com o banco de teste no ar', async () => {
    const resposta = await request(createApp()).get('/api/health')

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: { status: 'ok', banco: 'ok' } })
    expect(resposta.headers['cache-control']).toBe('no-store')
  })

  it('responde 503 sem o banco, com o mesmo corpo dizendo o que caiu', async () => {
    vi.spyOn(healthRepository, 'consultarBanco').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:5433'),
    )

    const resposta = await request(createApp()).get('/api/health')

    expect(resposta.status).toBe(503)
    expect(resposta.body).toEqual({ data: { status: 'indisponivel', banco: 'indisponivel' } })
  })

  it('fica em /api/health, fora do /api/v1', async () => {
    const resposta = await request(createApp()).get('/api/v1/health')

    expect(resposta.status).toBe(404)
  })

  it('não enche o log quando está tudo bem, mas registra a falha', async () => {
    const { logger, linhas } = criarLoggerDeTeste()
    const app = createApp({ logger })

    await request(app).get('/api/health')
    await request(app).get('/api/v1/outra-rota')
    await vi.waitFor(() => expect(linhas).toHaveLength(2))
    expect(linhas.map((linha) => linha.req)).not.toContainEqual({ method: 'GET', url: '/api/health' })

    vi.spyOn(healthRepository, 'consultarBanco').mockRejectedValueOnce(new Error('sem banco'))
    const falha = await request(app).get('/api/health')
    await vi.waitFor(() => expect(linhas).toHaveLength(3))
    expect(linhas[2]).toMatchObject({
      level: 'error',
      requestId: falha.headers['x-request-id'],
      req: { method: 'GET', url: '/api/health' },
      res: { statusCode: 503 },
    })
  })
})
