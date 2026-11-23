import { prisma } from '../../src/database/prisma'

let criadas = 0

export interface DadosDaCategoria {
  nome?: string
  ordem?: number
  ativa?: boolean
}

/** Cria uma categoria de teste. Sem `nome`, inventa um único; sem `ordem`, usa a contagem da factory. */
export async function criarCategoria({ nome, ordem, ativa = true }: DadosDaCategoria = {}) {
  criadas += 1
  return prisma.categoria.create({
    data: { nome: nome ?? `Categoria de Teste ${criadas}`, ordem: ordem ?? criadas, ativa },
  })
}
