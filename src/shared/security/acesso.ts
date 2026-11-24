import type { Perfil } from '../constants/perfis'
import type { Permissao } from '../constants/permissoes'

/** Quem está logado, lido do banco pelo `authenticate` a cada requisição e guardado em `req.usuario`. */
export interface UsuarioAutenticado {
  id: number
  nome: string
  email: string
  perfil: Perfil
  /** Ainda com a senha provisória: só pode ver a própria sessão e trocar a senha. */
  trocarSenha: boolean
  permissoes: readonly Permissao[]
  /**
   * Setores que a pessoa enxerga, em ordem de ID; `null` quando enxerga todos (Super Admin e Ouvidoria). As
   * listagens usam esta lista dentro da própria consulta.
   */
  setorIds: readonly number[] | null
}

/**
 * A TV que abriu os indicadores, lida do banco pelo `tvToken` com o token do link e guardada em `req.tela`. A TV
 * não tem login nem permissões: o token só abre os números gerais, de todos os setores.
 */
export interface TelaAutenticada {
  id: number
  /** Onde a tela fica: o nome que aparece no topo da TV. */
  nome: string
}

/** O 403 de quem pede um setor que não é seu, no `setorScope` e nos services que conferem o setor do registro. */
export const MENSAGEM_FORA_DO_SETOR = 'Você não tem acesso a este setor.'

export function temPermissao(usuario: UsuarioAutenticado, permissao: Permissao): boolean {
  return usuario.permissoes.includes(permissao)
}

export function podeAcessarSetor(usuario: UsuarioAutenticado, setorId: number): boolean {
  return usuario.setorIds === null || usuario.setorIds.includes(setorId)
}
