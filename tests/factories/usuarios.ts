import { prisma } from '../../src/database/prisma'
import type { Perfil } from '../../src/shared/constants/perfis'
import { gerarHashDaSenha } from '../../src/shared/security/password'

/** Senha de quem a factory cria, quando o teste não pede outra. Segue a regra de senha. */
export const SENHA_DE_TESTE = 'senha-de-teste-123'

let hashDaSenhaDeTeste: Promise<string> | undefined
let criados = 0

export interface DadosDoUsuario {
  nome?: string
  email?: string
  perfil?: Perfil
  senha?: string
  ativo?: boolean
  /** Padrão: `false`, a conta que já trocou a senha provisória. */
  trocarSenha?: boolean
  setorIds?: number[]
}

/**
 * Cria um usuário de teste, com nome e e-mail inventados e únicos. A senha padrão tem o hash calculado uma vez
 * só por arquivo de teste, para não pagar o argon2id a cada usuário.
 */
export async function criarUsuario({
  senha,
  setorIds = [],
  perfil = 'GESTOR',
  ...dados
}: DadosDoUsuario = {}) {
  criados += 1
  hashDaSenhaDeTeste ??= gerarHashDaSenha(SENHA_DE_TESTE)
  return prisma.usuario.create({
    data: {
      nome: `Pessoa de Teste ${criados}`,
      email: `pessoa${criados}@hospital.test`,
      perfil,
      senhaHash: await (senha === undefined ? hashDaSenhaDeTeste : gerarHashDaSenha(senha)),
      trocarSenha: false,
      ...dados,
      setores: { create: setorIds.map((setorId) => ({ setorId })) },
    },
  })
}
