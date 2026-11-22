import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import { alterarStatusDoSetor, criarSetor, editarSetor } from './setores.schemas'
import { setoresService } from './setores.service'

export const setoresController = {
  async listar(req: Request, res: Response) {
    responder(res, await setoresService.listar(usuarioLogado(req)))
  },

  async criar(req: Request, res: Response) {
    const { body } = validados(req, criarSetor)
    responder(res, await setoresService.criar(body), 201)
  },

  async editar(req: Request, res: Response) {
    const { params, body } = validados(req, editarSetor)
    responder(res, await setoresService.editar(params.id, body))
  },

  async alterarStatus(req: Request, res: Response) {
    const { params, body } = validados(req, alterarStatusDoSetor)
    await setoresService.alterarStatus(params.id, body.ativo)
    responderSemConteudo(res)
  },
}
