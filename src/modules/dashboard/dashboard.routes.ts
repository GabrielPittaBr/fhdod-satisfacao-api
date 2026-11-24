import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { dashboardController } from './dashboard.controller'
import {
  buscarCategorias,
  buscarComentarios,
  buscarEvolucao,
  buscarNpsPorSetor,
  buscarRanking,
  buscarResumo,
} from './dashboard.schemas'

/**
 * Rotas do dashboard. Todas exigem `dashboard:ver` (os quatro perfis a têm) e aplicam o escopo de setor: o
 * `setorScope` barra o `?setorId=` de um setor que não é da pessoa, e, sem ele, a consulta conta só os setores
 * que ela enxerga. Os comentários, com o texto dos pacientes, exigem também `comentarios:ver`, que o
 * Visualizador não tem.
 */
const router = Router()

router.get(
  '/dashboard/resumo',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  validate(buscarResumo),
  dashboardController.resumo,
)
router.get(
  '/dashboard/nps-por-setor',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  validate(buscarNpsPorSetor),
  dashboardController.npsPorSetor,
)
router.get(
  '/dashboard/evolucao',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  validate(buscarEvolucao),
  dashboardController.evolucao,
)
router.get(
  '/dashboard/categorias',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  validate(buscarCategorias),
  dashboardController.categorias,
)
router.get(
  '/dashboard/ranking',
  authenticate,
  authorize('dashboard:ver'),
  setorScope('setorId', 'query'),
  validate(buscarRanking),
  dashboardController.ranking,
)
router.get(
  '/dashboard/comentarios',
  authenticate,
  authorize('dashboard:ver'),
  authorize('comentarios:ver'),
  setorScope('setorId', 'query'),
  validate(buscarComentarios),
  dashboardController.comentarios,
)

export default router
