import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { validate } from '../../middlewares/validate'
import { categoriasController } from './categorias.controller'
import { criarCategoria, editarCategoria } from './categorias.schemas'

/**
 * Rotas de /api/v1/categorias. As categorias valem para todos os setores: qualquer pessoa logada lê a lista,
 * e só o Super Admin (`categorias:gerenciar`) cria e edita. Não há escopo de setor.
 */
const router = Router()

router.get('/categorias', authenticate, categoriasController.listar)
router.post(
  '/categorias',
  authenticate,
  authorize('categorias:gerenciar'),
  validate(criarCategoria),
  categoriasController.criar,
)
router.patch(
  '/categorias/:id',
  authenticate,
  authorize('categorias:gerenciar'),
  validate(editarCategoria),
  categoriasController.editar,
)

export default router
