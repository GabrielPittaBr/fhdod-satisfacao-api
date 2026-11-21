import type { Request, Response } from 'express'
import { responder } from '../../shared/http/respond'
import { healthService } from './health.service'

export const healthController = {
  /** 200 com o banco no ar; 503 sem ele. O corpo é o mesmo nos dois casos, para o monitor ver o que caiu. */
  async verificar(_req: Request, res: Response) {
    const saude = await healthService.verificar()
    res.set('Cache-Control', 'no-store')
    responder(res, saude, saude.status === 'ok' ? 200 : 503)
  },
}
