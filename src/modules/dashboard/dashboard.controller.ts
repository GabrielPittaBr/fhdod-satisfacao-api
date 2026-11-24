import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { responder } from '../../shared/http/respond'
import { buscarEvolucao, buscarNpsPorSetor, buscarResumo } from './dashboard.schemas'
import { dashboardService } from './dashboard.service'

export const dashboardController = {
  async resumo(req: Request, res: Response) {
    const { query } = validados(req, buscarResumo)
    responder(res, await dashboardService.resumo(usuarioLogado(req), query))
  },

  async npsPorSetor(req: Request, res: Response) {
    const { query } = validados(req, buscarNpsPorSetor)
    responder(res, await dashboardService.npsPorSetor(usuarioLogado(req), query))
  },

  async evolucao(req: Request, res: Response) {
    const { query } = validados(req, buscarEvolucao)
    responder(res, await dashboardService.evolucao(usuarioLogado(req), query))
  },
}
