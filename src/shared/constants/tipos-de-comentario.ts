import type { TipoComentario as TipoComentarioDoBanco } from '../../generated/prisma/enums'

/**
 * Tipos de comentário, os mesmos do tipo `tipo_comentario` do banco. A lista fica aqui, e não só no cliente
 * do Prisma, porque os schemas e a documentação não importam o Prisma. O `satisfies` recusa um tipo que o
 * banco não tem, e o teste confere que nenhum ficou de fora.
 */
export const TIPOS_DE_COMENTARIO = [
  'ELOGIO',
  'RECLAMACAO',
  'SUGESTAO',
  'OUTRO',
] as const satisfies readonly TipoComentarioDoBanco[]

export type TipoComentario = (typeof TIPOS_DE_COMENTARIO)[number]
