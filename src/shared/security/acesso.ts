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

export function temPermissao(usuario: UsuarioAutenticado, permissao: Permissao): boolean {
  return usuario.permissoes.includes(permissao)
}

export function podeAcessarSetor(usuario: UsuarioAutenticado, setorId: number): boolean {
  return usuario.setorIds === null || usuario.setorIds.includes(setorId)
}
