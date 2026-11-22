import { Prisma } from '../generated/prisma/client'
import type { AppError } from '../shared/errors/app-error'

/**
 * Erros do Prisma que os services traduzem para o usuário:
 * - `P2002`: valor repetido numa coluna única (slug, e-mail, nome da categoria), que vira 409 `CONFLITO`;
 * - `P2025`: o registro de um `update` ou `delete` não existe, que vira 404 `NAO_ENCONTRADO`.
 */
const CODIGOS = { valorRepetido: 'P2002', naoEncontrado: 'P2025' } as const

export type ErroDoPrisma = keyof typeof CODIGOS

export function ehErroDoPrisma(erro: unknown, tipo: ErroDoPrisma): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === CODIGOS[tipo]
}

/**
 * Troca o erro do Prisma pelo erro da API com a mensagem para o usuário; qualquer outro erro passa como veio
 * (e vira 500). Para o `catch` de uma gravação:
 *
 * ```ts
 * throw traduzirErroDoPrisma(erro, {
 *   valorRepetido: AppError.conflito('Já existe um setor com este endereço. Escolha outro.'),
 *   naoEncontrado: AppError.naoEncontrado('Setor não encontrado.'),
 * })
 * ```
 */
export function traduzirErroDoPrisma(
  erro: unknown,
  traducoes: Partial<Record<ErroDoPrisma, AppError>>,
): unknown {
  for (const [tipo, traducao] of Object.entries(traducoes) as [ErroDoPrisma, AppError][]) {
    if (ehErroDoPrisma(erro, tipo)) return traducao
  }
  return erro
}
