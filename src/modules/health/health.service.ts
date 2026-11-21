import { logger } from '../../config/logger'
import { healthRepository } from './health.repository'
import type { Saude } from './health.schemas'

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
