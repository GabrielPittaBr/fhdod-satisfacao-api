import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { validate } from '../../middlewares/validate'
import { turnosController } from './turnos.controller'
import { criarTurno, editarTurno } from './turnos.schemas'

/**
 * Rotas de /api/v1/turnos. Qualquer pessoa logada lê a lista, e só o Super Admin (`turnos:gerenciar`) cria e
 * edita. Não há rota para desativar nem apagar: turnos ficam para sempre, como no plano.
 */
const router = Router()

router.get('/turnos', authenticate, turnosController.listar)
router.post(
  '/turnos',
  authenticate,
  authorize('turnos:gerenciar'),
  validate(criarTurno),
  turnosController.criar,
)
router.patch(
  '/turnos/:id',
  authenticate,
  authorize('turnos:gerenciar'),
  validate(editarTurno),
  turnosController.editar,
)

export default router
