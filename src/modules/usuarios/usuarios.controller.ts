import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { ipDaRequisicao } from '../../shared/http/ip'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import {
  alterarStatusDoUsuario,
  criarUsuario,
  definirSetoresDoUsuario,
  editarUsuario,
  redefinirSenhaDoUsuario,
} from './usuarios.schemas'
import { usuariosService } from './usuarios.service'

/** A resposta com a senha provisória não fica em cache nenhum: ela aparece uma vez só. */
function semCache(res: Response) {
  res.set('Cache-Control', 'no-store')
}

export const usuariosController = {
  async listar(_req: Request, res: Response) {
    responder(res, await usuariosService.listar())
  },

  async criar(req: Request, res: Response) {
    const { body } = validados(req, criarUsuario)
    const criado = await usuariosService.criar(usuarioLogado(req), body, ipDaRequisicao(req))
    semCache(res)
    responder(res, criado, 201)
  },

  async editar(req: Request, res: Response) {
    const { params, body } = validados(req, editarUsuario)
    responder(res, await usuariosService.editar(usuarioLogado(req), params.id, body, ipDaRequisicao(req)))
  },

  async definirSetores(req: Request, res: Response) {
    const { params, body } = validados(req, definirSetoresDoUsuario)
    await usuariosService.definirSetores(usuarioLogado(req), params.id, body.setorIds, ipDaRequisicao(req))
    responderSemConteudo(res)
  },

  async alterarStatus(req: Request, res: Response) {
    const { params, body } = validados(req, alterarStatusDoUsuario)
    await usuariosService.alterarStatus(usuarioLogado(req), params.id, body.ativo, ipDaRequisicao(req))
    responderSemConteudo(res)
  },

  async redefinirSenha(req: Request, res: Response) {
    const { params } = validados(req, redefinirSenhaDoUsuario)
    const senhaProvisoria = await usuariosService.redefinirSenha(
      usuarioLogado(req),
      params.id,
      ipDaRequisicao(req),
    )
    semCache(res)
    responder(res, { senhaProvisoria })
  },
}
