import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { perguntasController } from './perguntas.controller'
import {
  alterarStatusDaPergunta,
  criarPergunta,
  editarPergunta,
  listarPerguntas,
  ordenarPerguntas,
} from './perguntas.schemas'

/**
 * Rotas das perguntas de cada setor. Todas exigem `perguntas:gerenciar` (Super Admin e Gestor) e o escopo do
 * setor: nas rotas com `:setorId`, o `setorScope` barra o setor que não é da pessoa; nas rotas pelo ID da
 * pergunta, quem confere o setor dela é o service, com o `podeAcessarSetor`.
 */
const router = Router()

router.get(
  '/setores/:setorId/perguntas',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate(listarPerguntas),
  perguntasController.listar,
)
router.post(
  '/setores/:setorId/perguntas',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate(criarPergunta),
  perguntasController.criar,
)
router.put(
  '/setores/:setorId/perguntas/ordem',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate(ordenarPerguntas),
  perguntasController.ordenar,
)
router.patch(
  '/perguntas/:id',
  authenticate,
  authorize('perguntas:gerenciar'),
  validate(editarPergunta),
  perguntasController.editar,
)
router.patch(
  '/perguntas/:id/status',
  authenticate,
  authorize('perguntas:gerenciar'),
  validate(alterarStatusDaPergunta),
  perguntasController.alterarStatus,
)

export default router
