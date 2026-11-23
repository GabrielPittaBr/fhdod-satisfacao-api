import { z } from 'zod'

// Variáveis de ambiente da API, validadas ao iniciar: se faltar alguma ou alguma estiver errada, a API nem sobe.
// Cada variável nova entra aqui, no COMO_PREENCHER e no .env.example.

const NIVEIS_DE_LOG = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const SEGUNDOS_POR_UNIDADE = { s: 1, m: 60, h: 60 * 60 } as const

/** Duração como 15m, 900s ou 1h, convertida para segundos. */
const duracaoEmSegundos = z
  .string()
  .regex(/^[1-9]\d*[smh]$/)
  .transform(
    (valor) =>
      Number(valor.slice(0, -1)) * SEGUNDOS_POR_UNIDADE[valor.at(-1) as keyof typeof SEGUNDOS_POR_UNIDADE],
  )

/** Lista separada por vírgulas, sem os espaços das pontas nem os itens vazios. */
function separarPorVirgula(valor: string) {
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Origem de um site, como http://localhost:5173: protocolo, host e porta, sem caminho nem barra no fim. */
function ehOrigem(valor: string) {
  try {
    const url = new URL(valor)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === valor
  } catch {
    return false
  }
}

const variaveis = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CORS_ORIGIN: z
    .string()
    .transform(separarPorVirgula)
    .pipe(z.array(z.string().refine(ehOrigem)).min(1)),
  LOG_LEVEL: z.enum(NIVEIS_DE_LOG).default('info'),
  DOCS_ENABLED: z.stringbool().optional(),
  /** Assina os tokens de acesso (HS256). Quem tem o segredo consegue emitir um token de qualquer usuário. */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Validade do token de acesso, em segundos (no .env, como 15m). */
  ACCESS_TOKEN_TTL: duracaoEmSegundos.default(15 * 60),
  /** Validade do refresh token, em dias. Cada uso troca o token e conta o prazo de novo. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  /** IPs fora do limite de envios da pesquisa pública, como o do hospital, por onde saem os totens. */
  RATE_LIMIT_ALLOWLIST: z
    .string()
    .default('')
    .transform(separarPorVirgula)
    .pipe(z.array(z.union([z.ipv4(), z.ipv6()]))),
})

// Sem DOCS_ENABLED, o Swagger fica ligado fora de produção. A homologação roda em production e o liga com
// DOCS_ENABLED=true.
const schema = variaveis.transform((env) => ({
  ...env,
  DOCS_ENABLED: env.DOCS_ENABLED ?? env.NODE_ENV !== 'production',
}))

export type Env = z.output<typeof schema>

type Variavel = keyof typeof variaveis.shape

const VARIAVEIS = Object.keys(variaveis.shape) as Variavel[]

/** O que escrever em cada variável. A mensagem de erro nunca mostra o valor, que pode ser segredo. */
const COMO_PREENCHER: Record<Variavel, string> = {
  NODE_ENV: 'use development, test ou production',
  PORT: 'use um número de porta de 1 a 65535, como 3333',
  DATABASE_URL: 'use uma URL do PostgreSQL, como postgresql://usuario:senha@localhost:5432/banco',
  CORS_ORIGIN: 'use a origem do front, como http://localhost:5173; várias origens vão separadas por vírgula',
  LOG_LEVEL: `use ${NIVEIS_DE_LOG.join(', ')}`,
  DOCS_ENABLED: 'use true ou false',
  JWT_ACCESS_SECRET:
    'use um texto aleatório de pelo menos 32 caracteres; o .env.example mostra como gerar um',
  ACCESS_TOKEN_TTL: 'use um tempo como 15m, 900s ou 1h',
  REFRESH_TOKEN_TTL_DAYS: 'use um número de dias de 1 a 365, como 7',
  RATE_LIMIT_ALLOWLIST: 'use IPs separados por vírgula, como 203.0.113.10, ou deixe vazia',
}

export class ErroDeAmbiente extends Error {
  constructor(problemas: string[]) {
    super(
      [
        'A API não subiu: há variáveis de ambiente faltando ou inválidas.',
        ...problemas.map((problema) => `  - ${problema}`),
        'Confira o .env (o modelo, com todas as variáveis, está no .env.example).',
      ].join('\n'),
    )
    this.name = 'ErroDeAmbiente'
  }
}

/** Valida as variáveis de `fonte`. Texto vazio (`CHAVE=`) conta como variável não definida. */
export function lerEnv(fonte: Record<string, string | undefined>): Env {
  const entrada = Object.fromEntries(
    VARIAVEIS.map((variavel) => [variavel, fonte[variavel] === '' ? undefined : fonte[variavel]]),
  )
  const resultado = schema.safeParse(entrada)
  if (resultado.success) return resultado.data

  const invalidas = new Set(resultado.error.issues.map((problema) => problema.path[0] as Variavel))
  const problemas = VARIAVEIS.filter((variavel) => invalidas.has(variavel)).map((variavel) =>
    entrada[variavel] === undefined
      ? `${variavel} não foi definida (${COMO_PREENCHER[variavel]})`
      : `${variavel} está inválida: ${COMO_PREENCHER[variavel]}`,
  )
  throw new ErroDeAmbiente(problemas)
}

function carregarEnv(): Env {
  try {
    return lerEnv(process.env)
  } catch (erro) {
    if (!(erro instanceof ErroDeAmbiente)) throw erro
    // O logger depende destas variáveis, então o aviso sai direto no terminal, sem pilha de chamadas.
    console.error(erro.message)
    process.exit(1)
  }
}

export const env = carregarEnv()
