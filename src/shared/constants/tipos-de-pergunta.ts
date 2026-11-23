import type { TipoPergunta as TipoPerguntaDoBanco } from '../../generated/prisma/enums'

/**
 * Tipos de pergunta, os mesmos do tipo `tipo_pergunta` do banco, na ordem do formulário do front. A lista fica
 * aqui, e não só no cliente do Prisma, porque os schemas e a documentação não importam o Prisma. O `satisfies`
 * recusa um tipo que o banco não tem, e o teste confere que nenhum ficou de fora.
 */
export const TIPOS_DE_PERGUNTA = [
  'ESCALA_1_5',
  'SIM_NAO',
  'MULTIPLA_ESCOLHA',
  'TEXTO',
] as const satisfies readonly TipoPerguntaDoBanco[]

export type TipoPergunta = (typeof TIPOS_DE_PERGUNTA)[number]

/** O único tipo com opções. Nos outros, a API devolve `opcoes: null`, e o banco guarda a lista vazia. */
export const TIPO_COM_OPCOES = 'MULTIPLA_ESCOLHA' satisfies TipoPergunta
