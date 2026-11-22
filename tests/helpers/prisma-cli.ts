import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

// O CLI do Prisma chamado direto pelo Node, sem o pnpm nem o npx: funciona igual no Windows e no CI.
const CLI = path.join(
  path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
  'build',
  'index.js',
)

/**
 * Roda um comando do Prisma num processo à parte, contra o banco de `url`, e devolve a saída. Se o comando
 * falhar, o erro traz o que ele escreveu. O DATABASE_URL e as `variaveis` passados aqui valem mais que os do
 * .env, que o prisma7.config.ts só lê para as variáveis que faltam; texto vazio conta como não definida.
 */
export function rodarPrisma(
  argumentos: string[],
  url: string,
  variaveis: Record<string, string> = {},
): string {
  try {
    return execFileSync(process.execPath, [CLI, ...argumentos], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        ...variaveis,
        DATABASE_URL: url,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
        CHECKPOINT_DISABLE: '1',
      },
    })
  } catch (erro) {
    const { stdout = '', stderr = '' } = erro as { stdout?: string; stderr?: string }
    throw new Error(`O comando "prisma ${argumentos.join(' ')}" falhou:\n${stderr}${stdout}`, { cause: erro })
  }
}
