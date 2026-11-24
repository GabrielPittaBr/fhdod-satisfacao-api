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

/** Os setores que quem está logado enxerga: o escopo que as consultas do dashboard aplicam. */
const setoresDe = (req: Request) => usuarioLogado(req).setorIds

export const dashboardController = {
  async resumo(req: Request, res: Response) {
    const { query } = validados(req, buscarResumo)
    responder(res, await dashboardService.resumo(query, setoresDe(req)))
  },

  async npsPorSetor(req: Request, res: Response) {
    const { query } = validados(req, buscarNpsPorSetor)
    responder(res, await dashboardService.npsPorSetor(query, setoresDe(req)))
  },

  async evolucao(req: Request, res: Response) {
    const { query } = validados(req, buscarEvolucao)
    responder(res, await dashboardService.evolucao(query, setoresDe(req)))
  },

  async categorias(req: Request, res: Response) {
    const { query } = validados(req, buscarCategorias)
    responder(res, await dashboardService.categorias(query, setoresDe(req)))
  },

  async ranking(req: Request, res: Response) {
    const { query } = validados(req, buscarRanking)
    responder(res, await dashboardService.ranking(query, setoresDe(req)))
  },

  async comentarios(req: Request, res: Response) {
    const { query } = validados(req, buscarComentarios)
    const { comentarios, meta } = await dashboardService.comentarios(query, setoresDe(req))
    responderLista(res, comentarios, meta)
  },
}
