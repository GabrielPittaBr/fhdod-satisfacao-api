import type { Autor } from '../../database/auditoria'
import { traduzirErroDoPrisma } from '../../database/erros'
import { AppError } from '../../shared/errors/app-error'
import type { UsuarioAutenticado } from '../../shared/security/acesso'
import { gerarHashDaSenha } from '../../shared/security/password'
import { gerarSenhaProvisoria } from '../../shared/security/senha-provisoria'
import { usuariosRepository } from './usuarios.repository'
import {
  MENSAGEM_DESATIVAR_A_PROPRIA_CONTA,
  MENSAGEM_EMAIL_REPETIDO,
  MENSAGEM_MUDAR_O_PROPRIO_PERFIL,
  MENSAGEM_SETOR_INEXISTENTE,
  MENSAGEM_USUARIO_NAO_ENCONTRADO,
  type DadosDaEdicaoDoUsuario,
  type DadosDoNovoUsuario,
  type Usuario,
  type UsuarioCriado,
} from './usuarios.schemas'

function autorDe(usuario: UsuarioAutenticado, ip: string | null): Autor {
  return { usuarioId: usuario.id, ip }
}

async function buscarExistente(id: number): Promise<Usuario> {
  const usuario = await usuariosRepository.buscar(id)
  if (!usuario) throw AppError.naoEncontrado(MENSAGEM_USUARIO_NAO_ENCONTRADO)
  return usuario
}

function mesmaLista(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, indice) => id === b[indice])
}

// Quem chama estas funções já passou pelo `authorize('usuarios:gerenciar')`: só o Super Admin. O `usuario` é
// quem está logado, e o `id`, a conta que muda. Um pedido que não muda nada responde como os outros, mas não
// grava nem vai para a auditoria.

export const usuariosService = {
  /** Todas as contas do painel, ativas e inativas, em ordem alfabética. */
  listar(): Promise<Usuario[]> {
    return usuariosRepository.listar()
  },

  /**
   * Cria a conta com uma senha provisória, que só aparece nesta resposta: o banco guarda o hash, e a troca é
   * obrigatória no primeiro acesso. E-mail repetido dá 409.
   */
  async criar(
    usuario: UsuarioAutenticado,
    dados: DadosDoNovoUsuario,
    ip: string | null,
  ): Promise<UsuarioCriado> {
    const senhaProvisoria = gerarSenhaProvisoria()
    try {
      const criado = await usuariosRepository.criar(
        dados,
        await gerarHashDaSenha(senhaProvisoria),
        autorDe(usuario, ip),
      )
      return { usuario: criado, senhaProvisoria }
    } catch (erro) {
      // O e-mail é a única coluna única que a criação preenche: o `P2002` só pode ser ele.
      throw traduzirErroDoPrisma(erro, { valorRepetido: AppError.conflito(MENSAGEM_EMAIL_REPETIDO) })
    }
  },

  /**
   * Muda o nome, o perfil ou os dois; o e-mail não muda. A mudança vale na hora, porque o `authenticate` lê o
   * perfil do banco a cada requisição. Ninguém muda o próprio perfil: o Super Admin que se rebaixasse perderia o
   * acesso aos usuários, e o hospital poderia ficar sem nenhum.
   */
  async editar(
    usuario: UsuarioAutenticado,
    id: number,
    dados: DadosDaEdicaoDoUsuario,
    ip: string | null,
  ): Promise<Usuario> {
    const atual = await buscarExistente(id)
    const novo = { nome: dados.nome ?? atual.nome, perfil: dados.perfil ?? atual.perfil }
    if (id === usuario.id && novo.perfil !== atual.perfil) {
      throw AppError.conflito(MENSAGEM_MUDAR_O_PROPRIO_PERFIL)
    }
    if (novo.nome === atual.nome && novo.perfil === atual.perfil) return atual
    return usuariosRepository.editar(atual, novo, autorDe(usuario, ip))
  },

  /**
   * Troca os setores da pessoa pelos da lista, sem repetidos. Setor que não existe dá 400 em `setorIds`. O
   * escopo novo vale na hora, como o perfil.
   */
  async definirSetores(
    usuario: UsuarioAutenticado,
    id: number,
    setorIds: number[],
    ip: string | null,
  ): Promise<void> {
    const atual = await buscarExistente(id)
    const novos = [...new Set(setorIds)].sort((a, b) => a - b)
    if (!(await usuariosRepository.setoresExistem(novos))) {
      throw AppError.validacao([{ campo: 'setorIds', mensagem: MENSAGEM_SETOR_INEXISTENTE }])
    }
    if (mesmaLista(atual.setorIds, novos)) return
    await usuariosRepository.definirSetores(atual, novos, autorDe(usuario, ip))
  },

  /**
   * Ativa ou desativa. Desativar derruba na hora as sessões da pessoa, e ninguém desativa a própria conta: o
   * Super Admin ficaria de fora do painel.
   */
  async alterarStatus(
    usuario: UsuarioAutenticado,
    id: number,
    ativo: boolean,
    ip: string | null,
  ): Promise<void> {
    const atual = await buscarExistente(id)
    if (!ativo && id === usuario.id) throw AppError.conflito(MENSAGEM_DESATIVAR_A_PROPRIA_CONTA)
    if (atual.ativo === ativo) return
    await usuariosRepository.alterarStatus(atual, ativo, autorDe(usuario, ip))
  },

  /** Gera outra senha provisória, obriga a troca e derruba as sessões. Devolve a senha, que só aparece aqui. */
  async redefinirSenha(usuario: UsuarioAutenticado, id: number, ip: string | null): Promise<string> {
    const atual = await buscarExistente(id)
    const senhaProvisoria = gerarSenhaProvisoria()
    await usuariosRepository.redefinirSenha(
      atual,
      await gerarHashDaSenha(senhaProvisoria),
      autorDe(usuario, ip),
    )
    return senhaProvisoria
  },
}
