import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../config/env'
import { PrismaClient } from '../generated/prisma/client'

/**
 * Cliente único do Prisma: a API toda usa esta instância e o mesmo pool de conexões.
 * Sem banco, a conexão desiste em 5 s, em vez de deixar a requisição esperando para sempre.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000 }),
})
