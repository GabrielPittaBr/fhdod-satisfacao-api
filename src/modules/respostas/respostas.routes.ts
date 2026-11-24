import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { respostasController } from './respostas.controller'
import { buscarResposta, listarRespostas } from './respostas.schemas'

/**
 * As avaliações uma a uma, no painel. Exigem `respostas:ver` (o Visualizador não tem). Na lista, o
 * `setorScope` barra o `?setorId=` de um setor que não é da pessoa, e, sem ele, a consulta traz só os setores
 * que ela enxerga; no detalhe, o service confere o setor da resposta.
 */
const router = Router()

router.get(
  '/respostas',
  authenticate,
  authorize('respostas:ver'),
  setorScope('setorId', 'query'),
  validate(listarRespostas),
  respostasController.listar,
)
router.get(
  '/respostas/:id',
  authenticate,
  authorize('respostas:ver'),
  validate(buscarResposta),
  respostasController.detalhar,
)

export default router
