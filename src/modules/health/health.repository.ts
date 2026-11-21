import { prisma } from '../../database/prisma'

export const healthRepository = {
  /** Consulta mínima no banco; rejeita se ele não responder. */
  async consultarBanco(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`
  },
}
