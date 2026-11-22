import { prisma } from '../../src/database/prisma'

let criados = 0

export interface DadosDoSetor {
  nome?: string
  slug?: string
  descricao?: string | null
  ativo?: boolean
}

/** Cria um setor de teste. Sem `nome` e `slug`, inventa os dois, únicos. */
export async function criarSetor({ nome, slug, descricao = null, ativo = true }: DadosDoSetor = {}) {
  criados += 1
  return prisma.setor.create({
    data: {
      nome: nome ?? `Setor de Teste ${criados}`,
      slug: slug ?? `setor-de-teste-${criados}`,
      descricao,
      ativo,
    },
  })
}
