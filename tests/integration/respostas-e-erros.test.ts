import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../../src/app'
import { validados, validate } from '../../src/middlewares/validate'
import { criarMeta, paginacaoSchema } from '../../src/shared/http/pagination'
import { responder, responderLista } from '../../src/shared/http/respond'
import { criarLoggerDeTeste } from '../helpers/logger-de-teste'

// Rotas só para o teste, montadas em /api/v1 no lugar das rotas reais.
const cadastro = {
  params: z.object({ id: z.coerce.number().int().positive('Use um número a partir de 1') }),
  query: paginacaoSchema,
  body: z.object({
    nome: z
      .string()
      .min(3, 'Use pelo menos 3 letras')
      .regex(/^[a-zà-ú ]+$/i, 'Use só letras'),
    contato: z.object({ telefone: z.string().regex(/^\d{10,11}$/, 'Telefone com DDD, só números') }),
  }),
}

const rotas = Router()
rotas.post('/cadastros/:id', validate(cadastro), (req, res) => {
  responder(res, validados(req, cadastro), 201)
})
rotas.get('/itens', validate({ query: paginacaoSchema }), (req, res) => {
  const { query } = validados(req, { query: paginacaoSchema })
  responderLista(res, [{ id: 1 }, { id: 2 }], criarMeta(query, 134))
})
rotas.get('/quebra', () => {
  throw new Error('falha ao conectar em 10.0.0.5 com a senha errada')
})
rotas.get('/quebra-async', async () => {
  await Promise.resolve()
  throw new Error('detalhe interno')
})

function criarAppDeTeste() {
  const log = criarLoggerDeTeste()
  return { app: createApp({ rotas, logger: log.logger }), ...log }
}

/** Confere o formato padrão do erro e que o `requestId` é o mesmo do cabeçalho X-Request-Id. */
function esperarErro(resposta: request.Response, status: number, codigo: string) {
  expect(resposta.status).toBe(status)
  expect(Object.keys(resposta.body)).toEqual(['erro'])
  expect(Object.keys(resposta.body.erro)).toEqual(['codigo', 'mensagem', 'detalhes', 'requestId'])
  expect(resposta.body.erro.codigo).toBe(codigo)
  expect(resposta.body.erro.requestId).toBe(resposta.headers['x-request-id'])
  return resposta.body.erro as {
    codigo: string
    mensagem: string
    detalhes: { campo: string; mensagem: string }[]
    requestId: string
  }
}

describe('sucesso', () => {
  it('devolve { data } com os dados que o validate já converteu', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app)
      .post('/api/v1/cadastros/42?pagina=2')
      .send({ nome: 'Maria', contato: { telefone: '51999990000' } })

    expect(resposta.status).toBe(201)
    expect(resposta.body).toEqual({
      data: {
        params: { id: 42 },
        query: { pagina: 2, porPagina: 20 },
        body: { nome: 'Maria', contato: { telefone: '51999990000' } },
      },
    })
  })

  it('devolve as listas paginadas com meta: { pagina, porPagina, total }', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).get('/api/v1/itens?pagina=3&porPagina=2')

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({
      data: [{ id: 1 }, { id: 2 }],
      meta: { pagina: 3, porPagina: 2, total: 134 },
    })
  })
})

describe('400 VALIDACAO', () => {
  it('traz um item em detalhes por campo, com o caminho do campo no corpo', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app)
      .post('/api/v1/cadastros/0?porPagina=500')
      .send({ nome: 'J1', contato: { telefone: '123' } })

    const erro = esperarErro(resposta, 400, 'VALIDACAO')
    expect(erro.mensagem).toBe('Dados inválidos')
    expect(erro.detalhes).toEqual([
      { campo: 'id', mensagem: 'Use um número a partir de 1' },
      { campo: 'porPagina', mensagem: 'Use de 1 a 100 itens por página' },
      { campo: 'nome', mensagem: 'Use pelo menos 3 letras' },
      { campo: 'contato.telefone', mensagem: 'Telefone com DDD, só números' },
    ])
  })

  it('avisa em português o campo que faltou', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).post('/api/v1/cadastros/1').send({})

    const erro = esperarErro(resposta, 400, 'VALIDACAO')
    expect(erro.detalhes).toEqual([
      { campo: 'nome', mensagem: 'Obrigatório' },
      { campo: 'contato', mensagem: 'Obrigatório' },
    ])
  })

  it('usa o nome da parte quando o problema é o corpo inteiro', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).post('/api/v1/cadastros/1')

    const erro = esperarErro(resposta, 400, 'VALIDACAO')
    expect(erro.detalhes).toEqual([{ campo: 'body', mensagem: 'Obrigatório' }])
  })

  it('recusa JSON malformado sem mostrar o conteúdo', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app)
      .post('/api/v1/cadastros/1')
      .set('Content-Type', 'application/json')
      .send('{"nome": "Maria",')

    const erro = esperarErro(resposta, 400, 'VALIDACAO')
    expect(erro).toMatchObject({ mensagem: 'Não foi possível ler os dados enviados.', detalhes: [] })
  })

  it('recusa corpo acima de 100 kB', async () => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app)
      .post('/api/v1/cadastros/1')
      .send({ nome: 'a'.repeat(110 * 1024), contato: { telefone: '51999990000' } })

    const erro = esperarErro(resposta, 400, 'VALIDACAO')
    expect(erro.mensagem).toBe('Os dados enviados passam do tamanho permitido.')
  })
})

describe('404 NAO_ENCONTRADO', () => {
  it.each(['/api/v1/rota-que-nao-existe', '/api/qualquer', '/'])('responde 404 em %s', async (caminho) => {
    const { app } = criarAppDeTeste()

    const resposta = await request(app).get(caminho)

    const erro = esperarErro(resposta, 404, 'NAO_ENCONTRADO')
    expect(erro).toMatchObject({ mensagem: 'Endereço não encontrado.', detalhes: [] })
  })
})

describe('500 ERRO_INTERNO', () => {
  it.each(['/api/v1/quebra', '/api/v1/quebra-async'])(
    'responde com mensagem genérica em %s e deixa o detalhe só no log',
    async (caminho) => {
      const { app, linhas } = criarAppDeTeste()

      const resposta = await request(app).get(caminho)

      const erro = esperarErro(resposta, 500, 'ERRO_INTERNO')
      expect(erro).toEqual({
        codigo: 'ERRO_INTERNO',
        mensagem: 'Erro inesperado. Tente de novo em instantes.',
        detalhes: [],
        requestId: resposta.headers['x-request-id'],
      })

      const requestId = resposta.headers['x-request-id']
      await vi.waitFor(() => expect(linhas.find((linha) => linha.level === 'error')).toBeDefined())
      const linhaDoErro = linhas.find((linha) => linha.level === 'error')
      expect(linhaDoErro).toMatchObject({ requestId, res: { statusCode: 500 } })
      expect(linhaDoErro?.err).toMatchObject({
        message: expect.stringMatching(/10\.0\.0\.5|detalhe interno/),
      })
      expect(linhaDoErro?.err).toHaveProperty('stack')
    },
  )
})
