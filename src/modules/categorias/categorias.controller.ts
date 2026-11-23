import type { Request, Response } from 'express'
import { validados } from '../../middlewares/validate'
import { responder } from '../../shared/http/respond'
import { criarCategoria, editarCategoria } from './categorias.schemas'
import { categoriasService } from './categorias.service'

export const categoriasController = {
  async listar(_req: Request, res: Response) {
    responder(res, await categoriasService.listar())
  },

  async criar(req: Request, res: Response) {
    const { body } = validados(req, criarCategoria)
    responder(res, await categoriasService.criar(body.nome), 201)
  },

  async editar(req: Request, res: Response) {
    const { params, body } = validados(req, editarCategoria)
    responder(res, await categoriasService.editar(params.id, body))
  },
}
