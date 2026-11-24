import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { contatosController } from './contatos.controller'
import { listarContatos, revelarTelefone } from './contatos.schemas'

/**
 * Os pedidos de retorno. Exigem `contatos:ver`, que só o Super Admin e a Ouvidoria têm. O escopo de setor vale
 * mesmo assim: na lista, o `setorScope` e a consulta; na revelação, o service.
 */
const router = Router()

router.get(
  '/contatos',
  authenticate,
  authorize('contatos:ver'),
  setorScope('setorId', 'query'),
  validate(listarContatos),
  contatosController.listar,
)
router.post(
  '/contatos/:id/revelar-telefone',
  authenticate,
  authorize('contatos:ver'),
  validate(revelarTelefone),
  contatosController.revelarTelefone,
)

export default router
