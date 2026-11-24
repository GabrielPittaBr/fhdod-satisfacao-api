import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import type { TelaTv } from './tv-wall.schemas'

/** Os campos da `TelaTv` do contrato. O hash do token nunca sai daqui, nem na criação. */
const CAMPOS = { id: true, nome: true, ativa: true, ultimoAcessoEm: true } satisfies Prisma.TvTelaSelect

type TelaGravada = Prisma.TvTelaGetPayload<{ select: typeof CAMPOS }>

function paraContrato({ ultimoAcessoEm, ...tela }: TelaGravada): TelaTv {
  return { ...tela, ultimoAcessoEm: ultimoAcessoEm?.toISOString() ?? null }
}

/** O que se grava numa tela nova: o token já chega em hash, e a tela nasce ativa. */
export interface NovaTela {
  nome: string
  tokenHash: string
  criadoPorId: number
}

export const tvWallRepository = {
  /** Todas as telas, ativas e desativadas, em ordem alfabética. */
  async listar(): Promise<TelaTv[]> {
    const telas = await prisma.tvTela.findMany({ select: CAMPOS })
    return telas.map(paraContrato).sort(porNome)
  },

  async criar(tela: NovaTela): Promise<TelaTv> {
    return paraContrato(await prisma.tvTela.create({ data: tela, select: CAMPOS }))
  },

  /** Ativa ou desativa. Devolve `false` se a tela não existir. */
  async alterarStatus(id: number, ativa: boolean): Promise<boolean> {
    const { count } = await prisma.tvTela.updateMany({ where: { id }, data: { ativa } })
    return count > 0
  },

  /** A tela do token, pelo hash, com o que a autenticação confere; `null` se nenhuma tela tiver este token. */
  buscarPeloToken(tokenHash: string): Promise<TelaGravada | null> {
    return prisma.tvTela.findUnique({ where: { tokenHash }, select: CAMPOS })
  },

  /**
   * Grava o acesso da tela em `agora`, se ela nunca foi aberta ou se o último acesso foi até `ultimoAte`. A
   * condição vai no próprio `UPDATE`: duas TVs com o mesmo link, ao mesmo tempo, gravam uma vez só. Entra por SQL
   * para não mexer no `atualizado_em`, que marca a última mudança no cadastro, e não o acesso, como no último
   * login.
   */
  async registrarAcesso(id: number, agora: Date, ultimoAte: Date): Promise<void> {
    await prisma.$executeRaw`
      UPDATE tv_telas
      SET ultimo_acesso_em = ${agora}
      WHERE id = ${id} AND (ultimo_acesso_em IS NULL OR ultimo_acesso_em <= ${ultimoAte})`
  },
}
