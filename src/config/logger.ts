import { pino, type DestinationStream, type LevelWithSilent, type Logger } from 'pino'
import { env } from './env'

/** Chaves que nunca aparecem no log, em qualquer objeto: cabeçalhos, corpo ou erro. */
export const CHAVES_OCULTAS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-tv-token',
  'x-complemento-token',
  'senha',
  'senhaAtual',
  'novaSenha',
  'senhaProvisoria',
  'tokenAcesso',
  'tokenComplemento',
  'telefone',
] as const

/** O pino não tem curinga recursivo: cada chave é ocultada na raiz e até quatro níveis abaixo dela. */
function caminhosOcultos() {
  const niveis = ['', '*.', '*.*.', '*.*.*.', '*.*.*.*.']
  return CHAVES_OCULTAS.flatMap((chave) =>
    niveis.map((nivel) =>
      /^[A-Za-z_$][\w$]*$/.test(chave) ? `${nivel}${chave}` : `${nivel.slice(0, -1)}["${chave}"]`,
    ),
  )
}

/** Logs em JSON, uma linha por evento, com hora ISO em UTC e o nível por extenso. */
export function criarLogger(destino?: DestinationStream, nivel: LevelWithSilent = env.LOG_LEVEL): Logger {
  return pino(
    {
      level: nivel,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (nivel) => ({ level: nivel }) },
      redact: { paths: caminhosOcultos(), censor: '[oculto]' },
    },
    destino,
  )
}

export const logger = criarLogger()
