import type { RequestHandler } from 'express'
import type { Permissao } from '../shared/constants/permissoes'
import { AppError } from '../shared/errors/app-error'
import { temPermissao } from '../shared/security/acesso'
import { usuarioLogado } from './authenticate'

/**
 * Exige uma permissão do mapa do perfil (`src/shared/constants/permissoes.ts`). Vem depois do
 * `authenticate`; sem a permissão, dá 403 `SEM_PERMISSAO`.
 */
export function authorize(permissao: Permissao): RequestHandler {
  return (req, _res, next) => {
    if (!temPermissao(usuarioLogado(req), permissao)) throw AppError.semPermissao()
    next()
  }
}
