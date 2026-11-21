import { logger } from '../../config/logger'
import { healthRepository } from './health.repository'

export type Estado = 'ok' | 'indisponivel'

/** Como está a API: `status` é o geral, e cada dependência tem o seu. */
export interface Saude {
  status: Estado
  banco: Estado
}

export const healthService = {
  async verificar(): Promise<Saude> {
    try {
      await healthRepository.consultarBanco()
      return { status: 'ok', banco: 'ok' }
    } catch (erro) {
      logger.error({ err: erro }, 'banco de dados indisponível')
      return { status: 'indisponivel', banco: 'indisponivel' }
    }
  },
}
