import { prisma } from '../../src/database/prisma'
import type { TipoPergunta } from '../../src/shared/constants/tipos-de-pergunta'

let criadas = 0

export interface DadosDaPergunta {
  setorId: number
  categoriaId: number
  texto?: string
  tipo?: TipoPergunta
  /** Padrão: três opções na múltipla escolha e a lista vazia nos outros tipos, como o banco guarda. */
  opcoes?: string[]
  ordem?: number
  ativa?: boolean
}

/**
 * Cria uma pergunta de teste no setor e na categoria pedidos: uma escala de 1 a 5, ativa, com texto inventado
 * e único, se o teste não pedir outra coisa. Sem `ordem`, usa a contagem da factory.
 */
export async function criarPergunta({
  setorId,
  categoriaId,
  texto,
  tipo = 'ESCALA_1_5',
  opcoes,
  ordem,
  ativa = true,
}: DadosDaPergunta) {
  criadas += 1
  return prisma.pergunta.create({
    data: {
      setorId,
      categoriaId,
      texto: texto ?? `Pergunta de teste ${criadas}?`,
      tipo,
      opcoes: opcoes ?? (tipo === 'MULTIPLA_ESCOLHA' ? ['Sim', 'Não', 'Em parte'] : []),
      ordem: ordem ?? criadas,
      ativa,
    },
  })
}
