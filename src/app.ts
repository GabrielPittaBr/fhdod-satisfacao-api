import './config/zod'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Router } from 'express'
import helmet from 'helmet'
import type { Logger } from 'pino'
import { env } from './config/env'
import { logger as loggerPadrao } from './config/logger'
import { errorHandler } from './middlewares/error-handler'
import { httpLogger } from './middlewares/http-logger'
import { notFound } from './middlewares/not-found'
import { requestId } from './middlewares/request-id'
import { criarDocsRoutes } from './modules/docs/docs.routes'
import healthRoutes from './modules/health/health.routes'
import { criarRotas } from './routes'

interface OpcoesDoApp {
  /** Rotas montadas em /api/v1. Padrão: as da API, criadas para este app. Os testes trocam pelas suas. */
  rotas?: Router
  /** Logger das requisições. Os testes passam um que grava na memória. */
  logger?: Logger
  /** Swagger em /api/docs. Padrão: o DOCS_ENABLED. */
  docs?: boolean
}

/** Cria o Express com a cadeia de middlewares do plano ("Ciclo de uma requisição"). */
export function createApp({
  rotas = criarRotas(),
  logger = loggerPadrao,
  docs = env.DOCS_ENABLED,
}: OpcoesDoApp = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // a API fica atrás do Caddy

  app.use(requestId)
  app.use(httpLogger(logger))
  app.use(helmet())
  // O `Content-Disposition` traz o nome dos arquivos exportados; sem expô-lo, o front de outra origem (o de
  // desenvolvimento, na 5173) não consegue lê-lo. Em produção, front e API ficam no mesmo domínio.
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true, exposedHeaders: ['Content-Disposition'] }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.use('/api', healthRoutes)
  if (docs) app.use('/api/docs', criarDocsRoutes())
  app.use('/api/v1', rotas)

  app.use(notFound)
  app.use(errorHandler) // sempre o último
  return app
}
