import { linhaDeAuditoria, type Autor } from '../../database/auditoria'
import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import type { Perfil } from '../../shared/constants/perfis'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import type { DadosDoNovoUsuario, Usuario } from './usuarios.schemas'

// Linhas da auditoria: as mudanças de perfil, de setores, de status e de senha são ações sensíveis.
const ENTIDADE = 'usuarios'

/** Os campos do `Usuario` do contrato. A senha nunca sai daqui. */
const CAMPOS = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  ativo: true,
  trocarSenha: true,
  ultimoLoginEm: true,
  setores: { select: { setorId: true }, orderBy: { setorId: 'asc' } },
} satisfies Prisma.UsuarioSelect

type UsuarioGravado = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS }>

function paraContrato({
  id,
  nome,
  email,
  perfil,
  ativo,
  trocarSenha,
  ultimoLoginEm,
  setores,
}: UsuarioGravado): Usuario {
  return {
    id,
    nome,
    email,
    perfil,
    ativo,
    trocarSenha,
    setorIds: setores.map(({ setorId }) => setorId),
    ultimoLoginEm: ultimoLoginEm?.toISOString() ?? null,
  }
}

/**
 * Revoga as sessões ainda abertas da pessoa, como o `authService.encerrarSessoes`, mas para entrar na mesma
 * transação da mudança: a conta desativada ou com a senha redefinida nunca fica com uma sessão viva.
 */
function revogacaoDasSessoes(usuarioId: number) {
  return prisma.refreshToken.updateMany({
    where: { usuarioId, revogadoEm: null },
    data: { revogadoEm: new Date() },
  })
}

export const usuariosRepository = {
  /** Todas as contas, ativas e inativas, em ordem alfabética. */
  async listar(): Promise<Usuario[]> {
    const usuarios = await prisma.usuario.findMany({ select: CAMPOS })
    return usuarios.map(paraContrato).sort(porNome)
  },

  async buscar(id: number): Promise<Usuario | null> {
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: CAMPOS })
    return usuario && paraContrato(usuario)
  },

  /**
   * Cria a conta, ativa e com a troca de senha obrigatória, e registra na auditoria. Lança o `P2002` do Prisma
   * se o e-mail já for de outra conta.
   */
  criar({ nome, email, perfil }: DadosDoNovoUsuario, senhaHash: string, autor: Autor): Promise<Usuario> {
    return prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { nome, email, perfil, senhaHash, trocarSenha: true },
        select: CAMPOS,
      })
      await tx.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'criacao_de_usuario',
          entidade: ENTIDADE,
          entidadeId: usuario.id,
          dados: { nome, email, perfil },
        }),
      })
      return paraContrato(usuario)
    })
  },

  /** Muda o nome e o perfil. Só a mudança de perfil vai para a auditoria, com o antes e o depois. */
  editar(atual: Usuario, dados: { nome: string; perfil: Perfil }, autor: Autor): Promise<Usuario> {
    return prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.update({ where: { id: atual.id }, data: dados, select: CAMPOS })
      if (dados.perfil !== atual.perfil) {
        await tx.auditoria.create({
          data: linhaDeAuditoria(autor, {
            acao: 'alteracao_de_perfil',
            entidade: ENTIDADE,
            entidadeId: atual.id,
            dados: { antes: atual.perfil, depois: dados.perfil },
          }),
        })
      }
      return paraContrato(usuario)
    })
  },

  /** Todos os IDs são de setores cadastrados, ativos ou inativos. A lista chega sem repetidos. */
  async setoresExistem(setorIds: readonly number[]): Promise<boolean> {
    return (await prisma.setor.count({ where: { id: { in: [...setorIds] } } })) === setorIds.length
  },

  /** Troca os setores da pessoa pelos da lista, tudo ou nada, e registra o antes e o depois na auditoria. */
  async definirSetores(atual: Usuario, setorIds: number[], autor: Autor): Promise<void> {
    await prisma.$transaction([
      prisma.usuarioSetor.deleteMany({ where: { usuarioId: atual.id } }),
      prisma.usuarioSetor.createMany({ data: setorIds.map((setorId) => ({ usuarioId: atual.id, setorId })) }),
      prisma.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'alteracao_de_setores_do_usuario',
          entidade: ENTIDADE,
          entidadeId: atual.id,
          dados: { antes: atual.setorIds, depois: setorIds },
        }),
      }),
    ])
  },

  /** Ativa ou desativa, e registra na auditoria. Desativar revoga, na mesma transação, as sessões da pessoa. */
  async alterarStatus(atual: Usuario, ativo: boolean, autor: Autor): Promise<void> {
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: atual.id }, data: { ativo } }),
      ...(ativo ? [] : [revogacaoDasSessoes(atual.id)]),
      prisma.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'alteracao_de_status_de_usuario',
          entidade: ENTIDADE,
          entidadeId: atual.id,
          dados: { ativo },
        }),
      }),
    ])
  },

  /**
   * Grava o hash da senha provisória nova, obriga a troca no próximo acesso, revoga as sessões e registra na
   * auditoria, sem a senha, tudo ou nada.
   */
  async redefinirSenha(atual: Usuario, senhaHash: string, autor: Autor): Promise<void> {
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: atual.id }, data: { senhaHash, trocarSenha: true } }),
      revogacaoDasSessoes(atual.id),
      prisma.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'redefinicao_de_senha',
          entidade: ENTIDADE,
          entidadeId: atual.id,
        }),
      }),
    ])
  },
}
