import { randomUUID } from 'node:crypto'
import { env } from '../../config/env'
import { enxergaTodosOsSetores } from '../../shared/constants/perfis'
import { permissoesDoPerfil } from '../../shared/constants/permissoes'
import { AppError } from '../../shared/errors/app-error'
import type { UsuarioAutenticado } from '../../shared/security/acesso'
import { gerarHashDaSenha, senhaConfere } from '../../shared/security/password'
import {
  emitirTokenDeAcesso,
  gerarTokenOpaco,
  hashDoToken,
  lerTokenDeAcesso,
} from '../../shared/security/tokens'
import { authRepository, type NovoRefresh } from './auth.repository'
import {
  MENSAGEM_LOGIN_INVALIDO,
  MENSAGEM_SENHA_ATUAL_ERRADA,
  type DadosDaTrocaDeSenha,
  type DadosDeLogin,
  type Sessao,
} from './auth.schemas'

const UM_DIA_MS = 24 * 60 * 60 * 1000

/** Refresh token que vai para o cookie; o banco guarda só o hash dele. */
export interface RefreshEmitido {
  token: string
  expiraEm: Date
}

/** O que o login e o refresh devolvem: o token de acesso, para o corpo, e o refresh, para o cookie. */
export interface Credenciais {
  tokenAcesso: string
  refresh: RefreshEmitido
}

function novoRefresh(usuarioId: number): { emitido: RefreshEmitido; registro: NovoRefresh } {
  const token = gerarTokenOpaco()
  const expiraEm = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * UM_DIA_MS)
  return { emitido: { token, expiraEm }, registro: { usuarioId, tokenHash: hashDoToken(token), expiraEm } }
}

let hashFicticio: Promise<string> | undefined

/**
 * Hash de uma senha que ninguém tem. O login confere a senha contra ele quando o e-mail não existe, para a
 * resposta levar o mesmo tempo e não revelar quais e-mails têm conta.
 */
function hashParaEmailInexistente(): Promise<string> {
  hashFicticio ??= gerarHashDaSenha(randomUUID())
  return hashFicticio
}

export const authService = {
  /** Confere e-mail e senha e abre uma sessão. E-mail ou senha errados, ou usuário inativo, dão o mesmo 401. */
  async entrar({ email, senha }: DadosDeLogin, ip: string | null): Promise<Credenciais> {
    const usuario = await authRepository.buscarParaLogin(email.toLowerCase())
    const confere = await senhaConfere(usuario?.senhaHash ?? (await hashParaEmailInexistente()), senha)
    if (!usuario || !usuario.ativo || !confere) throw AppError.naoAutenticado(MENSAGEM_LOGIN_INVALIDO)

    const { emitido, registro } = novoRefresh(usuario.id)
    await authRepository.registrarLogin(registro, ip)
    return { tokenAcesso: await emitirTokenDeAcesso(usuario.id), refresh: emitido }
  },

  /**
   * Troca o refresh por um novo e emite outro token de acesso. Refresh desconhecido, vencido, revogado (já
   * usado) ou de usuário inativo dá 401.
   */
  async renovar(refreshToken: string | undefined): Promise<Credenciais> {
    const atual = refreshToken ? await authRepository.buscarRefresh(hashDoToken(refreshToken)) : null
    if (!atual || atual.revogadoEm || atual.expiraEm <= new Date() || !atual.usuario.ativo) {
      throw AppError.naoAutenticado()
    }

    const { emitido, registro } = novoRefresh(atual.usuarioId)
    if (!(await authRepository.trocarRefresh(atual.id, registro))) throw AppError.naoAutenticado()
    return { tokenAcesso: await emitirTokenDeAcesso(atual.usuarioId), refresh: emitido }
  },

  /**
   * Encerra todas as sessões de quem sai. A pessoa é a do token de acesso ou, se ele já venceu, a do refresh
   * do cookie, que o navegador envia ao /auth/logout. Sem nenhum dos dois válido, não há o que revogar.
   */
  async sair({ tokenAcesso, refreshToken }: { tokenAcesso?: string; refreshToken?: string }): Promise<void> {
    let usuarioId = tokenAcesso ? await lerTokenDeAcesso(tokenAcesso) : null
    if (usuarioId === null && refreshToken) {
      const refresh = await authRepository.buscarRefresh(hashDoToken(refreshToken))
      if (refresh && !refresh.revogadoEm && refresh.expiraEm > new Date()) usuarioId = refresh.usuarioId
    }
    if (usuarioId !== null) await authRepository.revogarSessoes(usuarioId)
  },

  /** Revoga todas as sessões da pessoa: logout, troca de senha e, no ticket 09, desativação. */
  encerrarSessoes(usuarioId: number): Promise<void> {
    return authRepository.revogarSessoes(usuarioId)
  },

  /**
   * Quem é o dono do token de acesso, com o perfil, as permissões e os setores lidos agora do banco. Sem
   * token, com token vencido ou adulterado, ou com o usuário inativo, dá 401.
   */
  async autenticar(tokenAcesso: string | undefined): Promise<UsuarioAutenticado> {
    const usuarioId = tokenAcesso ? await lerTokenDeAcesso(tokenAcesso) : null
    const usuario = usuarioId === null ? null : await authRepository.buscarParaAutenticar(usuarioId)
    if (!usuario?.ativo) throw AppError.naoAutenticado()

    const { id, nome, email, perfil, trocarSenha, setores } = usuario
    return {
      id,
      nome,
      email,
      perfil,
      trocarSenha,
      permissoes: permissoesDoPerfil(perfil),
      setorIds: enxergaTodosOsSetores(perfil) ? null : setores.map(({ setorId }) => setorId),
    }
  },

  /** O /auth/me: usuário, permissões e setores, no formato `Sessao` que o front já usa. */
  async sessao(usuario: UsuarioAutenticado): Promise<Sessao> {
    const { id, nome, email, perfil, trocarSenha, permissoes, setorIds } = usuario
    return {
      usuario: { id, nome, email, perfil, trocarSenha },
      permissoes: [...permissoes],
      setores: setorIds === null ? [] : await authRepository.buscarSetores(setorIds),
      todosSetores: setorIds === null,
    }
  },

  /**
   * Troca a própria senha, conferindo a atual. Desliga a obrigação de trocar e encerra todas as sessões,
   * mas abre uma nova para quem trocou continuar logado: o refresh devolvido vai para o cookie.
   */
  async trocarSenha(
    usuario: UsuarioAutenticado,
    { senhaAtual, novaSenha }: DadosDaTrocaDeSenha,
    ip: string | null,
  ): Promise<RefreshEmitido> {
    const senhaHash = await authRepository.buscarSenhaHash(usuario.id)
    if (!senhaHash || !(await senhaConfere(senhaHash, senhaAtual))) {
      throw AppError.validacao([{ campo: 'senhaAtual', mensagem: MENSAGEM_SENHA_ATUAL_ERRADA }])
    }

    const { emitido, registro } = novoRefresh(usuario.id)
    await authRepository.trocarSenha(await gerarHashDaSenha(novaSenha), registro, ip)
    return emitido
  },
}
