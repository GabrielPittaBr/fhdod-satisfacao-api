import { z } from 'zod'

const estadoSchema = z.enum(['ok', 'indisponivel'])

/** Como está a API: `status` é o geral, e cada dependência tem o seu. */
export const saudeSchema = z
  .object({
    status: estadoSchema.meta({ description: 'Estado geral da API.' }),
    banco: estadoSchema.meta({ description: 'Estado da conexão com o PostgreSQL.' }),
  })
  .meta({ id: 'Saude', description: 'Estado da API e das dependências dela.' })

export type Estado = z.output<typeof estadoSchema>
export type Saude = z.output<typeof saudeSchema>
