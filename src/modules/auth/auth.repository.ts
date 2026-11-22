import { prisma } from '../../database/prisma'

/** Um refresh token novo: o hash vai para o banco; o token em claro, só para o cookie. */
export interface NovoRefresh {
  usuarioId: number
  tokenHash: string
  expiraEm: Date
}

// Linhas da auditoria: `acao` diz o que aconteceu, e `entidade` e `entidadeId`, a linha de que tabela.
const ENTIDADE_USUARIO = 'usuarios'

export const authRepository = {
  /** O necessário para conferir um login. O e-mail chega em minúsculas, como é gravado. */
  buscarParaLogin(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
      select: { id: true, senhaHash: true, ativo: true },
    })
  },

  /** O usuário de um token de acesso, com os IDs dos setores ligados a ele. */
  buscarParaAutenticar(id: number) {
    return prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        trocarSenha: true,
        setores: { select: { setorId: true }, orderBy: { setorId: 'asc' } },
      },
    })
  },

  async buscarSenhaHash(usuarioId: number): Promise<string | undefined> {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { senhaHash: true } })
    return usuario?.senhaHash
  },

  /** Nome dos setores, em ordem alfabética, para o /auth/me. */
  buscarSetores(ids: readonly number[]) {
    return prisma.setor.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nome: true },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    })
  },

  /**
   * Login com sucesso, tudo ou nada: grava a sessão, o último login e a linha da auditoria. O último login
   * entra por SQL para não mexer no `atualizado_em`, que marca a última mudança no cadastro, não o acesso.
   */
  async registrarLogin(refresh: NovoRefresh, ip: string | null): Promise<void> {
    const { usuarioId } = refresh
    await prisma.$transaction([
      prisma.refreshToken.create({ data: refresh }),
      prisma.$executeRaw`UPDATE usuarios SET ultimo_login_em = ${new Date()} WHERE id = ${usuarioId}`,
      prisma.auditoria.create({
        data: { usuarioId, acao: 'login', entidade: ENTIDADE_USUARIO, entidadeId: String(usuarioId), ip },
      }),
    ])
  },

  buscarRefresh(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usuarioId: true,
        expiraEm: true,
        revogadoEm: true,
        usuario: { select: { ativo: true } },
      },
    })
  },

  /**
   * Troca um refresh pelo novo: revoga o antigo, que passa a apontar para o substituto. Devolve `false` se o
   * antigo já tinha sido revogado ou venceu, inclusive por outro pedido que chegou ao mesmo tempo: o UPDATE
   * só pega a linha ainda válida, e o PostgreSQL faz o segundo pedido esperar o primeiro terminar.
   */
  trocarRefresh(antigoId: number, novo: NovoRefresh): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const agora = new Date()
      const { count } = await tx.refreshToken.updateMany({
        where: { id: antigoId, revogadoEm: null, expiraEm: { gt: agora } },
        data: { revogadoEm: agora },
      })
      if (count === 0) return false
      const { id } = await tx.refreshToken.create({ data: novo, select: { id: true } })
      await tx.refreshToken.update({ where: { id: antigoId }, data: { substituidoPorId: id } })
      return true
    })
  },

  /** Revoga todas as sessões ainda abertas da pessoa. */
  async revogarSessoes(usuarioId: number): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    })
  },

  /**
   * Troca de senha, tudo ou nada: grava o hash novo, desliga a obrigação de trocar, revoga todas as sessões,
   * abre a sessão nova de quem trocou e registra na auditoria.
   */
  async trocarSenha(senhaHash: string, refresh: NovoRefresh, ip: string | null): Promise<void> {
    const { usuarioId } = refresh
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash, trocarSenha: false } }),
      prisma.refreshToken.updateMany({
        where: { usuarioId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      }),
      prisma.refreshToken.create({ data: refresh }),
      prisma.auditoria.create({
        data: {
          usuarioId,
          acao: 'troca_de_senha',
          entidade: ENTIDADE_USUARIO,
          entidadeId: String(usuarioId),
          ip,
        },
      }),
    ])
  },
}
