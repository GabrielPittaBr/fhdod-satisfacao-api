import type { Request } from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'
import { pinoHttp } from 'pino-http'

const ROTA_DE_SAUDE = '/api/health'

/** Só o caminho: a query string (filtros, links com token) não vai para o log. */
function caminho(url: string | undefined) {
  return (url ?? '').split('?')[0]
}

function nivel(req: IncomingMessage, res: ServerResponse, erro?: Error) {
  const rota = caminho((req as Request).originalUrl ?? req.url)
  // O Docker e o monitor chamam o /api/health o tempo todo; só a falha dele interessa no log.
  if (rota === ROTA_DE_SAUDE && !erro && res.statusCode < 400) return 'silent'
  if (erro || res.statusCode >= 500) return 'error'
  if (res.statusCode >= 400) return 'warn'
  return 'info'
}

/**
 * Log de entrada e de saída de cada requisição, em JSON: `requestId`, método, rota, status e `duracaoMs`.
 * Cabeçalhos e corpo nunca entram no log; o `req.log` dos controllers já leva o `requestId`.
 */
export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId', responseTime: 'duracaoMs' },
    serializers: {
      req: (req: { method: string; url: string }) => ({ method: req.method, url: caminho(req.url) }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: nivel,
    customReceivedObject: (req) => ({ req }),
    customReceivedMessage: () => 'requisição recebida',
    customSuccessMessage: (_req, res) =>
      res.writableEnded ? 'requisição concluída' : 'requisição interrompida',
    customErrorMessage: () => 'requisição com erro',
    // Sem `res.err` (um 503 do health, por exemplo), não há erro de verdade para mostrar.
    customErrorObject: (_req, res, _erro, objeto: Record<string, unknown>) =>
      res.err ? objeto : { res: objeto.res, duracaoMs: objeto.duracaoMs },
  })
}
