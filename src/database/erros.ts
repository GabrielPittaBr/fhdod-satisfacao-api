import { Prisma } from '../generated/prisma/client'

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
