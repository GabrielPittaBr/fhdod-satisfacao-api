import type { RequestHandler } from 'express'
import { AppError } from '../shared/errors/app-error'

/** Depois de todas as rotas: endereço que nenhuma rota atendeu vira 404 `NAO_ENCONTRADO`. */
export const notFound: RequestHandler = () => {
  throw AppError.naoEncontrado('Endereço não encontrado.')
}
