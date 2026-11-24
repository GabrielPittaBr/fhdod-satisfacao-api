import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { ipDaRequisicao } from '../../shared/http/ip'
import { responder, responderLista } from '../../shared/http/respond'
import { listarContatos, revelarTelefone } from './contatos.schemas'
import { contatosService } from './contatos.service'

export const contatosController = {
  async listar(req: Request, res: Response) {
    const { query } = validados(req, listarContatos)
    const { pedidos, meta } = await contatosService.listar(usuarioLogado(req), query)
    responderLista(res, pedidos, meta)
  },

  async revelarTelefone(req: Request, res: Response) {
    const { params } = validados(req, revelarTelefone)
    const telefone = await contatosService.revelarTelefone(usuarioLogado(req), params.id, ipDaRequisicao(req))
    // O número completo não fica em cache do navegador nem de nenhum intermediário.
    res.set('Cache-Control', 'no-store')
    responder(res, telefone)
  },
}
