import { z } from 'zod'
import type { Canal as CanalDoBanco } from '../../generated/prisma/enums'

/**
 * Os canais da pesquisa em uso, do tipo `canal` do banco. O `WHATSAPP` já existe no banco e fica de fora até a
 * fase 3. A lista fica aqui, e não só no cliente do Prisma, porque os schemas e a documentação não importam o
 * Prisma.
 */
export const CANAIS = ['WEB', 'TOTEM'] as const satisfies readonly CanalDoBanco[]

export type Canal = (typeof CANAIS)[number]

/** O canal, no envio da pesquisa e nos filtros do painel: um schema só, o `Canal` do contrato. */
export const canalSchema = z.enum(CANAIS, { error: 'Canal inválido' }).meta({
  id: 'Canal',
  description: '`WEB` no celular ou no computador; `TOTEM` no aparelho fixo do setor.',
})
