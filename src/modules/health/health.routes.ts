import { Router } from 'express'
import { healthController } from './health.controller'

// Montado em /api, fora do /api/v1: o endereço do health não muda com a versão da API,
// e o Docker e o monitor externo chamam sempre o mesmo /api/health.
const router = Router()

router.get('/health', healthController.verificar)

export default router
