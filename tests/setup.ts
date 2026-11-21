import { PrismaPg } from '@prisma/adapter-pg'
import type { TestProject } from 'vitest/node'
import { PrismaClient } from '../src/generated/prisma/client'
import { rodarPrisma } from './helpers/prisma-cli'

/**
 * Roda uma vez, antes dos testes de integração: recria o banco de teste (o DATABASE_URL do vitest.config.ts)
 * limpo, com todas as migrations aplicadas e nenhum dado. Os testes que gravam no banco começam com o
 * `limparBanco`, de tests/helpers/banco.ts.
 *
 * O schema é apagado por SQL e as migrations entram pelo `prisma migrate deploy`, em vez do
 * `prisma migrate reset`: o Prisma 7 recusa o reset quando quem roda é um agente de IA, e os agentes também
 * rodam a suíte. A proteção aqui é o nome do banco, que precisa ter "test".
 */
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL ?? ''
  conferirQueEhBancoDeTeste(url)
  await apagarSchema(url)
  rodarPrisma(['migrate', 'deploy'], url)
}

/** A suíte apaga o banco inteiro: um TEST_DATABASE_URL apontado por engano para outro banco para aqui. */
function conferirQueEhBancoDeTeste(url: string) {
  const banco = decodeURIComponent(new URL(url).pathname.slice(1))
  if (!/test/i.test(banco)) {
    throw new Error(
      `Os testes apagam o banco antes de rodar, e "${banco}" não parece um banco de teste. Use um banco com ` +
        '"test" no nome, como o satisfacao_teste do docker compose, em TEST_DATABASE_URL.',
    )
  }
}

/** Apaga o schema public, com tabelas, tipos e o histórico das migrations, e o cria de novo vazio. */
async function apagarSchema(url: string) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 3_000 }),
  })
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    await prisma.$disconnect()
    const { host, pathname } = new URL(url)
    throw new Error(
      `O banco de teste não respondeu em ${host}${pathname}. Suba o PostgreSQL com \`docker compose up -d\` ` +
        'ou aponte TEST_DATABASE_URL para outro banco de teste.',
    )
  }
  try {
    await prisma.$executeRaw`DROP SCHEMA IF EXISTS public CASCADE`
    await prisma.$executeRaw`CREATE SCHEMA public`
  } finally {
    await prisma.$disconnect()
  }
}
