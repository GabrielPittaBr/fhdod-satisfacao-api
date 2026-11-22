import type { CookieOptions, Request, Response } from 'express'
import { tokenDoCabecalho, usuarioLogado } from '../../middlewares/authenticate'
import { validados } from '../../middlewares/validate'
import { ipDaRequisicao } from '../../shared/http/ip'
import { responder, responderSemConteudo } from '../../shared/http/respond'
import { CAMINHO_DO_COOKIE, COOKIE_DO_REFRESH, login, trocarSenha } from './auth.schemas'
import { authService, type RefreshEmitido } from './auth.service'

/**
 * O refresh vai num cookie que o JavaScript do front não lê (HttpOnly), que só viaja por HTTPS (Secure; o
 * navegador aceita também em http://localhost), que não sai em pedidos de outros sites (SameSite=Strict) e
 * que só é enviado às rotas de /api/v1/auth.
 */
const OPCOES_DO_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: CAMINHO_DO_COOKIE,
}

/** O cookie vence junto com o refresh no banco; o Max-Age vai em segundos inteiros, arredondado para cima. */
function gravarCookieDoRefresh(res: Response, { token, expiraEm }: RefreshEmitido) {
  const validadeMs = Math.ceil((expiraEm.getTime() - Date.now()) / 1000) * 1000
  res.cookie(COOKIE_DO_REFRESH, token, { ...OPCOES_DO_COOKIE, maxAge: validadeMs })
}

function cookieDoRefresh(req: Request): string | undefined {
  const valor: unknown = req.cookies?.[COOKIE_DO_REFRESH]
  return typeof valor === 'string' && valor !== '' ? valor : undefined
}

/** Respostas com token ou dados da sessão não ficam em cache nenhum. */
function semCache(res: Response) {
  res.set('Cache-Control', 'no-store')
}

export const authController = {
  async entrar(req: Request, res: Response) {
    const { body } = validados(req, login)
    const { tokenAcesso, refresh } = await authService.entrar(body, ipDaRequisicao(req))
    gravarCookieDoRefresh(res, refresh)
    semCache(res)
    responder(res, { tokenAcesso })
  },

  async renovar(req: Request, res: Response) {
    const { tokenAcesso, refresh } = await authService.renovar(cookieDoRefresh(req))
    gravarCookieDoRefresh(res, refresh)
    semCache(res)
    responder(res, { tokenAcesso })
  },

  /** Sempre 204 e sempre apaga o cookie, mesmo sem sessão válida: sair nunca falha para quem clicou. */
  async sair(req: Request, res: Response) {
    await authService.sair({ tokenAcesso: tokenDoCabecalho(req), refreshToken: cookieDoRefresh(req) })
    res.clearCookie(COOKIE_DO_REFRESH, OPCOES_DO_COOKIE)
    responderSemConteudo(res)
  },

  async sessao(req: Request, res: Response) {
    const sessao = await authService.sessao(usuarioLogado(req))
    semCache(res)
    responder(res, sessao)
  },

  async trocarSenha(req: Request, res: Response) {
    const { body } = validados(req, trocarSenha)
    const refresh = await authService.trocarSenha(usuarioLogado(req), body, ipDaRequisicao(req))
    gravarCookieDoRefresh(res, refresh)
    responderSemConteudo(res)
  },
}
