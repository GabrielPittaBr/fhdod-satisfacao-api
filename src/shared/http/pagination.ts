import { z } from 'zod'

export const POR_PAGINA_PADRAO = 20
export const POR_PAGINA_MAXIMO = 100

const MENSAGEM_PAGINA = 'Use um número de página a partir de 1'
const MENSAGEM_POR_PAGINA = `Use de 1 a ${POR_PAGINA_MAXIMO} itens por página`

/** Query das listas paginadas (`?pagina=2&porPagina=50`), já convertida para número. */
export const paginacaoSchema = z.object({
  pagina: z.coerce
    .number({ error: MENSAGEM_PAGINA })
    .int({ error: MENSAGEM_PAGINA })
    .min(1, { error: MENSAGEM_PAGINA })
    .default(1),
  porPagina: z.coerce
    .number({ error: MENSAGEM_POR_PAGINA })
    .int({ error: MENSAGEM_POR_PAGINA })
    .min(1, { error: MENSAGEM_POR_PAGINA })
    .max(POR_PAGINA_MAXIMO, { error: MENSAGEM_POR_PAGINA })
    .default(POR_PAGINA_PADRAO),
})

export type Paginacao = z.output<typeof paginacaoSchema>

/** O `meta` das listas paginadas. */
export interface Meta {
  pagina: number
  porPagina: number
  total: number
}

/** `skip` e `take` do Prisma para a página pedida. */
export function paginar({ pagina, porPagina }: Paginacao) {
  return { skip: (pagina - 1) * porPagina, take: porPagina }
}

export function criarMeta({ pagina, porPagina }: Paginacao, total: number): Meta {
  return { pagina, porPagina, total }
}
