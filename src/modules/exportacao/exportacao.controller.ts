import type { Request, Response } from 'express'
import { usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { enviarArquivo } from '../../shared/http/download'
import { ipDaRequisicao } from '../../shared/http/ip'
import { exportarRespostas, exportarResumo, exportarResumoEmPdf } from './exportacao.schemas'
import { exportacaoService } from './exportacao.service'

export const exportacaoController = {
  async resumo(req: Request, res: Response) {
    const { query } = validados(req, exportarResumo)
    await enviarArquivo(res, await exportacaoService.resumo(query, usuarioLogado(req), ipDaRequisicao(req)))
  },

  async resumoEmPdf(req: Request, res: Response) {
    const { query } = validados(req, exportarResumoEmPdf)
    await enviarArquivo(
      res,
      await exportacaoService.resumoEmPdf(query, usuarioLogado(req), ipDaRequisicao(req)),
    )
  },

  async respostas(req: Request, res: Response) {
    const { query } = validados(req, exportarRespostas)
    await enviarArquivo(
      res,
      await exportacaoService.respostas(query, usuarioLogado(req), ipDaRequisicao(req)),
    )
  },
}
