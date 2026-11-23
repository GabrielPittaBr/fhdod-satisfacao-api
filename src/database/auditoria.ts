import type { Prisma } from '../generated/prisma/client'

/** Quem fez uma ação no painel e de onde: a linha da auditoria grava o usuário logado e o IP da requisição. */
export interface Autor {
  usuarioId: number
  /** O de `ipDaRequisicao(req)`: `null` quando o valor não é um IP. */
  ip: string | null
}

/** O que aconteceu e com qual linha de qual tabela. */
export interface AcaoAuditada {
  /** Em snake_case, como `criacao_de_pergunta`. */
  acao: string
  /** A tabela, como `perguntas`. */
  entidade: string
  /** O ID da linha, ou `null` quando a ação mexe em várias, como uma nova ordem das perguntas. */
  entidadeId: number | null
  /** O que mudou. Nenhuma senha nem token vai aqui. */
  dados: Prisma.InputJsonObject
}

/**
 * Uma linha da auditoria, para gravar na mesma transação da mudança: se a mudança falha, a linha não fica, e
 * o contrário também.
 *
 * ```ts
 * tx.auditoria.create({ data: linhaDeAuditoria(autor, { acao, entidade, entidadeId, dados }) })
 * ```
 */
export function linhaDeAuditoria(
  { usuarioId, ip }: Autor,
  { acao, entidade, entidadeId, dados }: AcaoAuditada,
): Prisma.AuditoriaUncheckedCreateInput {
  return {
    usuarioId,
    acao,
    entidade,
    entidadeId: entidadeId === null ? null : String(entidadeId),
    dados,
    ip,
  }
}
