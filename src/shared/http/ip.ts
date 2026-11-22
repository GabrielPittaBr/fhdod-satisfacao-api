import type { Request } from 'express'
import { isIP } from 'node:net'

/**
 * IP de quem fez a requisição, para a auditoria do painel (o do paciente nunca é gravado). Atrás do Caddy,
 * vem do X-Forwarded-For (`trust proxy`). Um valor que não é IP, como um cabeçalho forjado sem o proxy na
 * frente, vira `null`: a coluna `inet` recusaria gravá-lo.
 */
export function ipDaRequisicao(req: Request): string | null {
  const ip = req.ip
  return ip && isIP(ip) ? ip : null
}
