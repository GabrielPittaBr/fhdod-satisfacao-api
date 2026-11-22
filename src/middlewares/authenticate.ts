import type { Request, RequestHandler } from 'express'
import { authService } from '../modules/auth/auth.service'
import { AppError } from '../shared/errors/app-error'
import type { UsuarioAutenticado } from '../shared/security/acesso'

const MENSAGEM_SENHA_PROVISORIA = 'Troque a senha provisória para continuar.'

/** O token de `Authorization: Bearer <token>`, ou `undefined` sem o cabeçalho nesse formato. */
export function tokenDoCabecalho(req: Request): string | undefined {
  const [esquema, token, ...resto] = (req.headers.authorization ?? '').split(' ')
  return esquema?.toLowerCase() === 'bearer' && token && resto.length === 0 ? token : undefined
}

function criarAutenticacao(permiteSenhaProvisoria: boolean): RequestHandler {
  return async (req, _res, next) => {
    const usuario = await authService.autenticar(tokenDoCabecalho(req))
    if (usuario.trocarSenha && !permiteSenhaProvisoria) throw AppError.semPermissao(MENSAGEM_SENHA_PROVISORIA)
    req.usuario = usuario
    next()
  }
}

/**
 * Exige login: valida o token de acesso e lê do banco o usuário, o perfil, as permissões e os setores, que
 * ficam em `req.usuario`. Sem token, com token vencido ou com o usuário inativo, dá 401 `NAO_AUTENTICADO`.
 * Quem ainda está com a senha provisória recebe 403 até trocá-la: a troca no primeiro acesso é obrigatória.
 */
export const authenticate = criarAutenticacao(false)

/**
 * O `authenticate` que deixa passar quem está com a senha provisória. Só para o que essa pessoa precisa
 * antes da troca: ver a própria sessão (`/auth/me`) e trocar a senha (`/auth/senha`).
 */
export const authenticateComSenhaProvisoria = criarAutenticacao(true)

/** Quem está logado. Numa rota sem `authenticate`, é erro de programação: vira 500 e aparece no log. */
export function usuarioLogado(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw new Error('A rota usa req.usuario sem o middleware authenticate antes')
  return req.usuario
}
