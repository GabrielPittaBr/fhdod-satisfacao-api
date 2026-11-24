import type { Request, RequestHandler } from 'express'
import { CABECALHO_DA_TELA } from '../modules/tv-wall/tv-wall.schemas'
import { tvWallService } from '../modules/tv-wall/tv-wall.service'
import type { TelaAutenticada } from '../shared/security/acesso'

/**
 * Autentica a TV pelo token do link, no cabeçalho `X-Tv-Token`, e guarda a tela em `req.tela`. Sem o token, com
 * um que não existe ou com o de uma tela desativada, dá 401 `NAO_AUTENTICADO` com "Esta tela não está ativa.".
 * Vale para as rotas da TV no lugar do `authenticate`: a TV não tem quem digite senha.
 */
export const tvToken: RequestHandler = async (req, _res, next) => {
  req.tela = await tvWallService.autenticarTela(req.get(CABECALHO_DA_TELA))
  next()
}

/** A tela que abriu a rota. Numa rota sem `tvToken`, é erro de programação: vira 500 e aparece no log. */
export function telaAutenticada(req: Request): TelaAutenticada {
  if (!req.tela) throw new Error('A rota usa req.tela sem o middleware tvToken antes')
  return req.tela
}
