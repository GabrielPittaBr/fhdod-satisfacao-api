import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { responder, responderLista } from '../../shared/http/respond'
import { buscarResposta, listarRespostas } from './respostas.schemas'
import { respostasService } from './respostas.service'

export const respostasController = {
  async listar(req: Request, res: Response) {
    const { query } = validados(req, listarRespostas)
    const { respostas, meta } = await respostasService.listar(usuarioLogado(req), query)
    responderLista(res, respostas, meta)
  },

  async detalhar(req: Request, res: Response) {
    const { params } = validados(req, buscarResposta)
    responder(res, await respostasService.detalhar(usuarioLogado(req), params.id))
  },
}
