import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { semearBase, type ResultadoDoSeedBase } from './seeds/base'

// Seed base, rodado pelo `pnpm db:seed` (prisma db seed): categorias, turnos provisórios e configurações.
// O DATABASE_URL vem do ambiente ou, se não estiver nele, do .env, que o prisma7.config.ts lê.

const NOMES: Record<keyof ResultadoDoSeedBase, [singular: string, plural: string]> = {
  categorias: ['categoria', 'categorias'],
  turnos: ['turno', 'turnos'],
  configuracoes: ['configuração', 'configurações'],
}

/** "Seed base concluído. Novos registros: 7 categorias, 3 turnos e 8 configurações." */
function descrever(criados: ResultadoDoSeedBase): string {
  const partes = (Object.keys(NOMES) as (keyof ResultadoDoSeedBase)[])
    .filter((tabela) => criados[tabela] > 0)
    .map((tabela) => `${criados[tabela]} ${NOMES[tabela][criados[tabela] === 1 ? 0 : 1]}`)
  if (partes.length === 0) {
    return 'Seed base concluído. Nenhum registro novo: o banco já tinha as categorias, os turnos e as configurações.'
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
  console.log(descrever(await semearBase(prisma)))
} finally {
  await prisma.$disconnect()
}
