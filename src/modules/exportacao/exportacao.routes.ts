import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate'
import { authorize } from '../../middlewares/authorize'
import { setorScope } from '../../middlewares/setor-scope'
import { validate } from '../../middlewares/validate'
import { exportacaoController } from './exportacao.controller'
import { exportarRespostas, exportarResumo, exportarResumoEmPdf } from './exportacao.schemas'

/**
 * As exportações em Excel e o resumo em PDF, com os filtros e o escopo do dashboard. O resumo, nos dois formatos,
 * exige `exportacao:resumo` (os quatro perfis); o detalhado, `exportacao:detalhada` (o Visualizador não tem). O `setorScope` barra o `?setorId=` de um
 * setor que não é da pessoa, e, sem ele, as consultas levam só os setores que ela enxerga.
 */
const router = Router()

router.get(
  '/exportacoes/resumo.xlsx',
  authenticate,
  authorize('exportacao:resumo'),
  setorScope('setorId', 'query'),
  validate(exportarResumo),
  exportacaoController.resumo,
)
router.get(
  '/exportacoes/resumo.pdf',
  authenticate,
  authorize('exportacao:resumo'),
  setorScope('setorId', 'query'),
  validate(exportarResumoEmPdf),
  exportacaoController.resumoEmPdf,
)
router.get(
  '/exportacoes/respostas.xlsx',
  authenticate,
  authorize('exportacao:detalhada'),
  setorScope('setorId', 'query'),
  validate(exportarRespostas),
  exportacaoController.respostas,
)

export default router
