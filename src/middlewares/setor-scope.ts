import type { RequestHandler } from 'express'
import { AppError } from '../shared/errors/app-error'
import { podeAcessarSetor } from '../shared/security/acesso'
import { usuarioLogado } from './authenticate'

const ID = /^[1-9]\d*$/

/**
 * Limita a rota aos setores de quem está logado. Super Admin e Ouvidoria passam; Gestor e Visualizador só
 * passam se o setor pedido estiver entre os seus, e fora deles recebem 403 `SEM_PERMISSAO`.
 *
 * Vem depois do `authenticate` e antes do `validate`, então lê o valor ainda em texto. Para quem tem
 * escopo, tudo o que não for o ID de um dos seus setores recebe 403, sem chegar à validação: o escopo nunca
 * depende de o schema converter o valor do mesmo jeito.
 *
 * - `params` (padrão): o parâmetro é da rota, como o `:setorId` de `/setores/:setorId/perguntas`.
 * - `query`: o filtro é opcional, como o `?setorId=` do dashboard. Sem ele, a rota aplica o escopo na
 *   própria consulta, com os `setorIds` de `req.usuario`.
 */
export function setorScope(parametro: string, origem: 'params' | 'query' = 'params'): RequestHandler {
  return (req, _res, next) => {
    const valores = (req[origem] ?? {}) as Record<string, unknown>
    if (origem === 'params' && !(parametro in valores)) {
      throw new Error(`setorScope('${parametro}') numa rota sem o parâmetro :${parametro}`)
    }

    const usuario = usuarioLogado(req)
    const valor = valores[parametro]
    if (usuario.setorIds === null || (origem === 'query' && valor === undefined)) return next()

    if (typeof valor !== 'string' || !ID.test(valor) || !podeAcessarSetor(usuario, Number(valor))) {
      throw AppError.semPermissao('Você não tem acesso a este setor.')
    }
    next()
  }
}
