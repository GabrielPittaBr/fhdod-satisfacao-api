import type { Response } from 'express'
import { z, type ZodType } from 'zod'
import { metaSchema, type Meta } from './pagination'

/** Sucesso: `{ data }`. */
export function responder<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data })
}

/** Lista paginada: `{ data, meta: { pagina, porPagina, total } }`. */
export function responderLista<T>(res: Response, data: T[], meta: Meta) {
  return res.status(200).json({ data, meta })
}

/** Sucesso sem corpo (logout, desativação). */
export function responderSemConteudo(res: Response) {
  return res.status(204).end()
}

// Os mesmos formatos no contrato, para os `*.docs.ts` dos módulos descreverem as respostas.

/** O `{ data }` do `responder`, com o schema do dado. */
export function envelope<T extends ZodType>(data: T) {
  return z.object({ data })
}

/** O `{ data, meta }` do `responderLista`, com o schema de cada item. */
export function lista<T extends ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: metaSchema })
}
