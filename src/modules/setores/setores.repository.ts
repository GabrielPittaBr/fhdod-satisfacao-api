import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import type { Setor } from './setores.schemas'

/** Os campos do `Setor` do contrato. */
const CAMPOS = { id: true, nome: true, slug: true, descricao: true, ativo: true } satisfies Prisma.SetorSelect

/** O que se grava num setor: a descrição já chega normalizada pelo service (vazia vira `null`). */
export interface DadosGravados {
  nome: string
  slug: string
  descricao: string | null
}

export const setoresRepository = {
  /**
   * Setores ativos e inativos, em ordem alfabética. Com `setorIds`, só esses, filtrados na própria consulta;
   * com `null`, todos.
   */
  async listar(setorIds: readonly number[] | null): Promise<Setor[]> {
    const setores = await prisma.setor.findMany({
      where: setorIds === null ? {} : { id: { in: [...setorIds] } },
      select: CAMPOS,
    })
    return setores.sort(porNome)
  },

  /** Lança o erro `P2002` do Prisma se o slug já existir. */
  criar(dados: DadosGravados): Promise<Setor> {
    return prisma.setor.create({ data: dados, select: CAMPOS })
  },

  /** Muda só os campos enviados. Lança `P2025` se o setor não existir e `P2002` se o slug já for de outro. */
  editar(id: number, dados: Partial<DadosGravados>): Promise<Setor> {
    return prisma.setor.update({ where: { id }, data: dados, select: CAMPOS })
  },

  /** Ativa ou desativa. Devolve `false` se o setor não existir. */
  async alterarStatus(id: number, ativo: boolean): Promise<boolean> {
    const { count } = await prisma.setor.updateMany({ where: { id }, data: { ativo } })
    return count > 0
  },
}
