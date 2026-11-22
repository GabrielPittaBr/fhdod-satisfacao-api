import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import type { Categoria } from './categorias.schemas'

/** Os campos da `Categoria` do contrato. */
const CAMPOS = { id: true, nome: true, ordem: true, ativa: true } satisfies Prisma.CategoriaSelect

export const categoriasRepository = {
  /** Ativas e inativas, na ordem definida; no empate, a mais antiga primeiro. */
  listar(): Promise<Categoria[]> {
    return prisma.categoria.findMany({ select: CAMPOS, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })
  },

  /**
   * Cria a categoria no fim da ordem. Lança o erro `P2002` do Prisma se o nome já existir, com qualquer
   * combinação de maiúsculas (o índice único é sobre `lower(nome)`).
   */
  async criar(nome: string): Promise<Categoria> {
    const { _max } = await prisma.categoria.aggregate({ _max: { ordem: true } })
    return prisma.categoria.create({ data: { nome, ordem: (_max.ordem ?? 0) + 1 }, select: CAMPOS })
  },

  /** Muda só o que vier. Lança `P2025` se a categoria não existir e `P2002` se o nome já for de outra. */
  editar(id: number, dados: { nome?: string; ativa?: boolean }): Promise<Categoria> {
    return prisma.categoria.update({ where: { id }, data: dados, select: CAMPOS })
  },
}
