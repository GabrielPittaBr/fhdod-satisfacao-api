import type { Request, RequestHandler } from 'express'
import type { z, ZodType } from 'zod'
import { AppError, type DetalheErro } from '../shared/errors/app-error'

/** Schemas Zod de uma rota. */
export interface EsquemasDaRota {
  params?: ZodType
  query?: ZodType
  body?: ZodType
}

/** O que o `validate` entrega ao controller: a saída de cada schema, já convertida (`z.coerce`, `default`...). */
export type DadosValidados<E extends EsquemasDaRota> = {
  [Parte in keyof E]: E[Parte] extends ZodType ? z.output<E[Parte]> : never
}

const PARTES = ['params', 'query', 'body'] as const

/**
 * Um item por campo, com a primeira mensagem de cada um. `campo` é o caminho no objeto (`nome`,
 * `contato.telefone`, `itens.0.valor`); um problema no objeto inteiro leva o nome da parte (`body`).
 */
function detalhesDosProblemas(parte: string, problemas: z.core.$ZodIssue[]): DetalheErro[] {
  const porCampo = new Map<string, string>()
  for (const problema of problemas) {
    const campo = problema.path.length > 0 ? problema.path.map(String).join('.') : parte
    if (!porCampo.has(campo)) porCampo.set(campo, problema.message)
  }
  return [...porCampo].map(([campo, mensagem]) => ({ campo, mensagem }))
}

/**
 * Valida params, query e body com os schemas da rota. Se algum falhar, responde 400 `VALIDACAO` com todos
 * os campos errados; se passar, guarda os dados convertidos em `req.valid` (no Express 5, `req.query` é
 * somente leitura). O controller os lê com `validados(req, esquemas)`.
 */
export function validate(esquemas: EsquemasDaRota): RequestHandler {
  return (req, _res, next) => {
    const dados: Request['valid'] = {}
    const detalhes: DetalheErro[] = []

    for (const parte of PARTES) {
      const esquema = esquemas[parte]
      if (!esquema) continue
      const resultado = esquema.safeParse(req[parte])
      if (resultado.success) dados[parte] = resultado.data
      else detalhes.push(...detalhesDosProblemas(parte, resultado.error.issues))
    }

    if (detalhes.length > 0) throw AppError.validacao(detalhes)
    req.valid = dados
    next()
  }
}

/** Os dados que o `validate` guardou em `req.valid`, com os tipos dos mesmos schemas passados a ele. */
export function validados<E extends EsquemasDaRota>(req: Request, _esquemas: E): DadosValidados<E> {
  return req.valid as DadosValidados<E>
}
