import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// O Prisma 7 não lê o .env sozinho. As variáveis que já vêm do ambiente (CI, Docker, testes) têm prioridade.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // O seed base (`pnpm db:seed`) cria categorias, turnos e configurações e pode rodar mais de uma vez. No
  // Prisma 7, nem o `migrate dev` nem o `migrate reset` o rodam sozinhos.
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Sem a URL, o `prisma generate` funciona; os comandos de migration avisam que ela falta.
  datasource: { url: process.env.DATABASE_URL },
})
