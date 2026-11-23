import { Router } from 'express'
import { criarAuthRoutes } from './modules/auth/auth.routes'
import categoriasRoutes from './modules/categorias/categorias.routes'
import perguntasRoutes from './modules/perguntas/perguntas.routes'
import { criarPesquisaRoutes } from './modules/pesquisa/pesquisa.routes'
import setoresRoutes from './modules/setores/setores.routes'
import turnosRoutes from './modules/turnos/turnos.routes'
import usuariosRoutes from './modules/usuarios/usuarios.routes'

/**
 * Rotas da API em /api/v1. Cada módulo registra aqui o seu roteador e a documentação dele no MODULOS do
 * src/config/openapi.ts ("Como documentar uma rota", no AGENTS.md). É uma função porque o login e a pesquisa
 * pública têm limites com contador próprio: cada app criado (um na API, vários nos testes) ganha os seus.
 */
export function criarRotas(): Router {
  const routes = Router()
  routes.use(criarAuthRoutes())
  routes.use(criarPesquisaRoutes())
  routes.use(setoresRoutes)
  routes.use(categoriasRoutes)
  routes.use(turnosRoutes)
  routes.use(perguntasRoutes)
  routes.use(usuariosRoutes)
  return routes
}
