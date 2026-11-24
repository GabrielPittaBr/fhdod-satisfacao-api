import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { tvToken } from '../../middlewares/tv-token'
import { validate } from '../../middlewares/validate'
import { tvWallController } from './tv-wall.controller'
import { alterarStatusDaTela, criarTela } from './tv-wall.schemas'

/**
 * Rotas da TV Wall. As telas são do Super Admin (`tvwall:gerenciar`), que enxerga todos os setores, e por isso
 * não passam pelo `setorScope`. Os indicadores são da TV, que não tem login: o `tvToken` confere o token do link
 * no lugar do `authenticate`.
 */
const router = Router()

router.get('/tv-telas', authenticate, authorize('tvwall:gerenciar'), tvWallController.listar)
router.post(
  '/tv-telas',
  authenticate,
  authorize('tvwall:gerenciar'),
  validate(criarTela),
  tvWallController.criar,
)
router.patch(
  '/tv-telas/:id/status',
  authenticate,
  authorize('tvwall:gerenciar'),
  validate(alterarStatusDaTela),
  tvWallController.alterarStatus,
)
// Sem limite por IP, como o complemento da pesquisa: só passa quem tem o token de uma tela ativa, que é
// aleatório (32 bytes) e não se adivinha. A TV consulta a cada 30 s.
router.get('/tv/indicadores', tvToken, tvWallController.indicadores)

export default router
