import type { Server } from 'node:http'
import type { Logger } from 'pino'

export interface OpcoesDeEncerramento {
  servidor: Server
  /** Fecha o que a API abriu, como a conexão com o banco. Roda depois que as requisições terminam. */
  fecharRecursos: () => Promise<void>
  logger: Logger
  /** Tempo máximo de espera pelas requisições em curso. Fica abaixo dos 10 s que o Docker espera antes de matar. */
  prazoMs?: number
}

/**
 * Para de aceitar conexões, espera as requisições em curso terminarem e só então fecha os recursos.
 * Se alguma passar do prazo, as conexões que sobraram são cortadas.
 */
export async function encerrarServidor({
  servidor,
  fecharRecursos,
  logger,
  prazoMs = 8_000,
}: OpcoesDeEncerramento): Promise<void> {
  // Conexões keep-alive paradas fecham já; as que estão no meio de uma requisição, assim que responderem.
  const fecharOciosas = setInterval(() => servidor.closeIdleConnections(), 100).unref()
  const prazo = setTimeout(() => {
    logger.warn({ prazoMs }, 'prazo de encerramento esgotado: cortando as conexões que restaram')
    servidor.closeAllConnections()
  }, prazoMs).unref()

  try {
    await new Promise<void>((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())))
  } finally {
    clearInterval(fecharOciosas)
    clearTimeout(prazo)
  }
  await fecharRecursos()
}

/**
 * Liga o encerramento aos sinais de parada: SIGTERM (Docker) e SIGINT (Ctrl+C). Um segundo sinal durante o
 * encerramento força a saída. Devolve a função que desliga os ouvintes.
 */
export function encerrarAoReceberSinal(opcoes: OpcoesDeEncerramento): () => void {
  const { logger } = opcoes
  let encerrando = false

  const aoReceberSinal = (sinal: NodeJS.Signals) => {
    if (encerrando) {
      logger.warn({ sinal }, 'segundo sinal de parada: saindo sem esperar')
      process.exit(1)
    }
    encerrando = true
    logger.info({ sinal }, 'sinal de parada recebido: encerrando a API')
    encerrarServidor(opcoes).then(
      () => {
        logger.info('API encerrada')
        process.exit(0)
      },
      (erro: unknown) => {
        logger.error({ err: erro }, 'erro ao encerrar a API')
        process.exit(1)
      },
    )
  }

  const sinais = ['SIGTERM', 'SIGINT'] as const
  for (const sinal of sinais) process.on(sinal, aoReceberSinal)
  return () => {
    for (const sinal of sinais) process.off(sinal, aoReceberSinal)
  }
}
