import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { validate } from '../../middlewares/validate'
import { setoresController } from './setores.controller'
import { alterarStatusDoSetor, criarSetor, editarSetor } from './setores.schemas'

/**
 * Rotas de /api/v1/setores. A listagem é de quem está logado, com o escopo aplicado na consulta; criar,
 * editar e ativar ou desativar são do Super Admin (`setores:gerenciar`), que enxerga todos os setores, e por
 * isso não passam pelo `setorScope`.
 */
const router = Router()

router.get('/setores', authenticate, setoresController.listar)
router.post(
  '/setores',
  authenticate,
  authorize('setores:gerenciar'),
  validate(criarSetor),
  setoresController.criar,
)
router.patch(
  '/setores/:id',
  authenticate,
  authorize('setores:gerenciar'),
  validate(editarSetor),
  setoresController.editar,
)
router.patch(
  '/setores/:id/status',
  authenticate,
  authorize('setores:gerenciar'),
  validate(alterarStatusDoSetor),
  setoresController.alterarStatus,
)

export default router
