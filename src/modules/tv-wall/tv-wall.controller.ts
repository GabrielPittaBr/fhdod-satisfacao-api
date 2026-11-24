import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { telaAutenticada } from '../../middlewares/tv-token'
import { validados } from '../../middlewares/validate'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import { alterarStatusDaTela, criarTela } from './tv-wall.schemas'
import { tvWallService } from './tv-wall.service'

export const tvWallController = {
  async listar(_req: Request, res: Response) {
    responder(res, await tvWallService.listar())
  },

  async criar(req: Request, res: Response) {
    const { body } = validados(req, criarTela)
    const criada = await tvWallService.criar(usuarioLogado(req), body)
    // O token da tela só aparece nesta resposta, que não fica em cache.
    res.set('Cache-Control', 'no-store')
    responder(res, criada, 201)
  },

  async alterarStatus(req: Request, res: Response) {
    const { params, body } = validados(req, alterarStatusDaTela)
    await tvWallService.alterarStatus(params.id, body.ativa)
    responderSemConteudo(res)
  },

  async indicadores(req: Request, res: Response) {
    responder(res, await tvWallService.indicadores(telaAutenticada(req)))
  },
}
