import type { Request, Response } from 'express'
import { validados } from '../../middlewares/validate'
import { responder } from '../../shared/http/respond'
import { criarTurno, editarTurno } from './turnos.schemas'
import { turnosService } from './turnos.service'

export const turnosController = {
  async listar(_req: Request, res: Response) {
    responder(res, await turnosService.listar())
  },

  async criar(req: Request, res: Response) {
    const { body } = validados(req, criarTurno)
    responder(res, await turnosService.criar(body), 201)
  },

  async editar(req: Request, res: Response) {
    const { params, body } = validados(req, editarTurno)
    responder(res, await turnosService.editar(params.id, body))
  },
}
