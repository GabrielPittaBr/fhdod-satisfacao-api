import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { ipDaRequisicao } from '../../shared/http/ip'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import {
  alterarStatusDaPergunta,
  criarPergunta,
  editarPergunta,
  listarPerguntas,
  ordenarPerguntas,
} from './perguntas.schemas'
import { perguntasService } from './perguntas.service'

export const perguntasController = {
  async listar(req: Request, res: Response) {
    const { params } = validados(req, listarPerguntas)
    responder(res, await perguntasService.listar(params.setorId))
  },

  async criar(req: Request, res: Response) {
    const { params, body } = validados(req, criarPergunta)
    const pergunta = await perguntasService.criar(
      usuarioLogado(req),
      params.setorId,
      body,
      ipDaRequisicao(req),
    )
    responder(res, pergunta, 201)
  },

  async editar(req: Request, res: Response) {
    const { params, body } = validados(req, editarPergunta)
    responder(res, await perguntasService.editar(usuarioLogado(req), params.id, body, ipDaRequisicao(req)))
  },

  async ordenar(req: Request, res: Response) {
    const { params, body } = validados(req, ordenarPerguntas)
    await perguntasService.ordenar(usuarioLogado(req), params.setorId, body.ids, ipDaRequisicao(req))
    responderSemConteudo(res)
  },

  async alterarStatus(req: Request, res: Response) {
    const { params, body } = validados(req, alterarStatusDaPergunta)
    await perguntasService.alterarStatus(usuarioLogado(req), params.id, body.ativa, ipDaRequisicao(req))
    responderSemConteudo(res)
  },
}
