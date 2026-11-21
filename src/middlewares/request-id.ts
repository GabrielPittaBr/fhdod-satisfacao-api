import type { RequestHandler } from 'express'
import { ulid } from 'ulid'

/**
 * Primeiro da cadeia: dá um ID único (ULID) a cada requisição e o devolve no cabeçalho `X-Request-Id`.
 * O mesmo ID aparece no log e no `requestId` dos erros, e liga a mensagem que o usuário viu à linha do log.
 * Um ID enviado pelo cliente é ignorado, para ninguém conseguir repetir ou forjar IDs no log.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const id = ulid()
  req.id = id
  res.setHeader('X-Request-Id', id)
  next()
}
