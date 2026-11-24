import { prisma } from '../../src/database/prisma'
import { hashDoToken } from '../../src/shared/security/tokens'
import { criarUsuario } from './usuarios'

let criadas = 0

export interface DadosDaTelaTv {
  nome?: string
  /** O token do link. Padrão: um inventado e único. O banco guarda só o hash, como na criação pela API. */
  token?: string
  ativa?: boolean
  /** O último acesso, em ISO com o fuso (`2026-11-24T15:00:00Z`). Padrão: a tela nunca foi aberta. */
  ultimoAcessoEm?: string
  /** Quem criou a tela. Sem ele, a factory cria um Super Admin. */
  criadoPorId?: number
}

/**
 * Cria uma tela de TV de teste, ativa e nunca aberta, se o teste não pedir outra coisa. Devolve a tela, como
 * está no banco, e o token do link, que a TV manda no `X-Tv-Token`.
 */
export async function criarTelaTv({
  nome,
  token,
  ativa = true,
  ultimoAcessoEm,
  criadoPorId,
}: DadosDaTelaTv = {}) {
  criadas += 1
  const tokenDoLink = token ?? `token-de-teste-${criadas}`
  const tela = await prisma.tvTela.create({
    data: {
      nome: nome ?? `Tela de Teste ${criadas}`,
      tokenHash: hashDoToken(tokenDoLink),
      ativa,
      ultimoAcessoEm: ultimoAcessoEm === undefined ? null : new Date(ultimoAcessoEm),
      criadoPorId: criadoPorId ?? (await criarUsuario({ perfil: 'SUPER_ADMIN' })).id,
    },
  })
  return { tela, token: tokenDoLink }
}
