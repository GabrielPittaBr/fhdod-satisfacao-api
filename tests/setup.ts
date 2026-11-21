import { PrismaPg } from '@prisma/adapter-pg'
import type { TestProject } from 'vitest/node'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Roda uma vez, antes dos testes de integração: confere se o banco de teste (o DATABASE_URL do
 * vitest.config.ts) está no ar e, se não estiver, diz como subir. A partir do ticket 04, também aplica as
 * migrations, para a suíte começar com o banco limpo.
 */
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL ?? ''
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 3_000 }),
  })
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    const { host, pathname } = new URL(url)
    throw new Error(
      `O banco de teste não respondeu em ${host}${pathname}. Suba o PostgreSQL com \`docker compose up -d\` ` +
        'ou aponte TEST_DATABASE_URL para outro banco de teste.',
    )
  } finally {
    await prisma.$disconnect()
  }
}
