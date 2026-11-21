import type { Response } from 'express'
import type { Meta } from './pagination'

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
