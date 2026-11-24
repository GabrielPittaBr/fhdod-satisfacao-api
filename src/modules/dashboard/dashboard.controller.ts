import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { responder, responderLista } from '../../shared/http/respond'
import {
  buscarCategorias,
  buscarComentarios,
  buscarEvolucao,
  buscarNpsPorSetor,
  buscarRanking,
  buscarResumo,
} from './dashboard.schemas'
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

  async categorias(req: Request, res: Response) {
    const { query } = validados(req, buscarCategorias)
    responder(res, await dashboardService.categorias(usuarioLogado(req), query))
  },

  async ranking(req: Request, res: Response) {
    const { query } = validados(req, buscarRanking)
    responder(res, await dashboardService.ranking(usuarioLogado(req), query))
  },

  async comentarios(req: Request, res: Response) {
    const { query } = validados(req, buscarComentarios)
    const { comentarios, meta } = await dashboardService.comentarios(usuarioLogado(req), query)
    responderLista(res, comentarios, meta)
  },
}
