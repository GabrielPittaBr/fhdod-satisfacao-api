import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { validate } from '../../middlewares/validate'
import { usuariosController } from './usuarios.controller'
import {
  alterarStatusDoUsuario,
  criarUsuario,
  definirSetoresDoUsuario,
  editarUsuario,
  redefinirSenhaDoUsuario,
} from './usuarios.schemas'

/**
 * Rotas de /api/v1/usuarios, todas do Super Admin (`usuarios:gerenciar`). As contas não têm setor: o Super
 * Admin enxerga todos, então não há `setorScope`.
 */
const router = Router()

router.get('/usuarios', authenticate, authorize('usuarios:gerenciar'), usuariosController.listar)
router.post(
  '/usuarios',
  authenticate,
  authorize('usuarios:gerenciar'),
  validate(criarUsuario),
  usuariosController.criar,
)
router.patch(
  '/usuarios/:id',
  authenticate,
  authorize('usuarios:gerenciar'),
  validate(editarUsuario),
  usuariosController.editar,
)
router.put(
  '/usuarios/:id/setores',
  authenticate,
  authorize('usuarios:gerenciar'),
  validate(definirSetoresDoUsuario),
  usuariosController.definirSetores,
)
router.patch(
  '/usuarios/:id/status',
  authenticate,
  authorize('usuarios:gerenciar'),
  validate(alterarStatusDoUsuario),
  usuariosController.alterarStatus,
)
router.post(
  '/usuarios/:id/redefinir-senha',
  authenticate,
  authorize('usuarios:gerenciar'),
  validate(redefinirSenhaDoUsuario),
  usuariosController.redefinirSenha,
)

export default router
