import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { dashboardController } from './dashboard.controller'
import { buscarEvolucao, buscarNpsPorSetor, buscarResumo } from './dashboard.schemas'

/**
 * Rotas do dashboard. Todas exigem `dashboard:ver` (os quatro perfis a têm) e aplicam o escopo de setor: o
 * `setorScope` barra o `?setorId=` de um setor que não é da pessoa, e, sem ele, a consulta conta só os setores
 * que ela enxerga.
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

export default router
