import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { ErroDoSeed, semearBase, type ResultadoDoSeedBase } from './seeds/base'

// Seed base, rodado pelo `pnpm db:seed` (prisma db seed): categorias, turnos provisórios, configurações e o
// primeiro Super Admin. As variáveis vêm do ambiente ou, se não estiverem nele, do .env, que o
// prisma7.config.ts lê. SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD só são exigidas enquanto não há usuários.

const NOMES: Record<keyof ResultadoDoSeedBase, [singular: string, plural: string]> = {
  categorias: ['categoria', 'categorias'],
  turnos: ['turno', 'turnos'],
  configuracoes: ['configuração', 'configurações'],
  superAdmin: ['Super Admin', 'Super Admins'],
}

/** "Seed base concluído. Novos registros: 7 categorias, 3 turnos, 8 configurações e 1 Super Admin." */
function descrever(criados: ResultadoDoSeedBase): string {
  const partes = (Object.keys(NOMES) as (keyof ResultadoDoSeedBase)[])
    .filter((tabela) => criados[tabela] > 0)
    .map((tabela) => `${criados[tabela]} ${NOMES[tabela][criados[tabela] === 1 ? 0 : 1]}`)
  if (partes.length === 0) {
    return 'Seed base concluído. Nenhum registro novo: o banco já tinha tudo o que o seed base cria.'
  }
  const lista = new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(partes)
  return `Seed base concluído. Novos registros: ${lista}.`
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    'O seed não rodou: DATABASE_URL não foi definida. Confira o .env (o modelo está no .env.example).',
  )
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5_000 }),
})

try {
  const superAdmin = { email: process.env.SEED_ADMIN_EMAIL, senha: process.env.SEED_ADMIN_PASSWORD }
  console.log(descrever(await semearBase(prisma, { superAdmin })))
} catch (erro) {
  if (!(erro instanceof ErroDoSeed)) throw erro
  console.error(erro.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
