import type { Request, Response } from 'express'
import { validados } from '../../middlewares/validate'
import { responder } from '../../shared/http/respond'
import { abrirPesquisa, enviarResposta } from './pesquisa.schemas'
import { pesquisaService } from './pesquisa.service'

export const pesquisaController = {
  async abrir(req: Request, res: Response) {
    const { params } = validados(req, abrirPesquisa)
    responder(res, await pesquisaService.abrir(params.slug))
  },

  async enviar(req: Request, res: Response) {
    const { params, body } = validados(req, enviarResposta)
    const criada = await pesquisaService.enviar(params.slug, body)
    // O token de complemento só aparece nesta resposta, que não fica em cache.
    res.set('Cache-Control', 'no-store')
    responder(res, criada, 201)
  },
}
