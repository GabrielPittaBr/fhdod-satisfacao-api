import type { Request, Response } from 'express'
import { validados } from '../../middlewares/validate'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import {
  abrirPesquisa,
  CABECALHO_DO_COMPLEMENTO,
  complementarResposta,
  enviarResposta,
  enviarRespostasGerais,
} from './pesquisa.schemas'
import { pesquisaService } from './pesquisa.service'

export const pesquisaController = {
  async abrir(req: Request, res: Response) {
    const { params } = validados(req, abrirPesquisa)
    responder(res, await pesquisaService.abrir(params.slug))
  },

  async abrirGeral(_req: Request, res: Response) {
    responder(res, await pesquisaService.abrirGeral())
  },

  async enviar(req: Request, res: Response) {
    const { params, body } = validados(req, enviarResposta)
    const criada = await pesquisaService.enviar(params.slug, body)
    // O token de complemento só aparece nesta resposta, que não fica em cache.
    res.set('Cache-Control', 'no-store')
    responder(res, criada, 201)
  },

  async enviarGeral(req: Request, res: Response) {
    const { body } = validados(req, enviarRespostasGerais)
    const criadas = await pesquisaService.enviarGeral(body)
    // Os tokens de complemento só aparecem nesta resposta, que não fica em cache.
    res.set('Cache-Control', 'no-store')
    responder(res, criadas, 201)
  },

  async complementar(req: Request, res: Response) {
    const { params, body } = validados(req, complementarResposta)
    await pesquisaService.complementar(params.id, req.get(CABECALHO_DO_COMPLEMENTO), body)
    responderSemConteudo(res)
  },
}
