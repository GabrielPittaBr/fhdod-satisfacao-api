import { prisma } from '../../src/database/prisma'

let criados = 0

/** Cria um setor de teste, com slug único. */
export async function criarSetor({ nome, ativo = true }: { nome?: string; ativo?: boolean } = {}) {
  criados += 1
  return prisma.setor.create({
    data: { nome: nome ?? `Setor de Teste ${criados}`, slug: `setor-de-teste-${criados}`, ativo },
  })
}
