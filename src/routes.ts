import { Router } from 'express'
import { criarAuthRoutes } from './modules/auth/auth.routes'
import categoriasRoutes from './modules/categorias/categorias.routes'
import setoresRoutes from './modules/setores/setores.routes'

/**
 * Rotas da API em /api/v1. Cada módulo registra aqui o seu roteador e a documentação dele no MODULOS do
 * src/config/openapi.ts ("Como documentar uma rota", no AGENTS.md). É uma função porque o login tem um
 * limite de tentativas com contador próprio: cada app criado (um na API, vários nos testes) ganha o seu.
 */
export function criarRotas(): Router {
  const routes = Router()
  routes.use(criarAuthRoutes())
  routes.use(setoresRoutes)
  routes.use(categoriasRoutes)
  return routes
}
