import { PERFIS, type Perfil } from './perfis'

// O mapa de permissões por perfil existe só na API ("Perfis e permissões", no plano). O front recebe a lista
// de quem está logado no /auth/me e a usa só para esconder menus: quem decide é sempre a API.

/** Todas as permissões, na ordem da tabela do plano. As da fase 2 já entram, para o front conhecê-las. */
export const PERMISSOES = [
  'setores:gerenciar',
  'usuarios:gerenciar',
  'categorias:gerenciar',
  'turnos:gerenciar',
  'tvwall:gerenciar',
  'configuracoes:gerenciar',
  'auditoria:ver',
  'perguntas:gerenciar',
  'dashboard:ver',
  'respostas:ver',
  'comentarios:ver',
  'contatos:ver',
  'contatos:gerenciar',
  'exportacao:resumo',
  'exportacao:detalhada',
  'escalas:gerenciar',
] as const

export type Permissao = (typeof PERMISSOES)[number]

/**
 * Quem tem cada permissão: uma linha por linha da tabela do plano. "Nos seus setores" não aparece aqui: quem
 * limita o Gestor e o Visualizador aos seus setores é o escopo (o `setorScope` e as consultas das listagens).
 */
const PERFIS_DA_PERMISSAO: Record<Permissao, readonly Perfil[]> = {
  'setores:gerenciar': ['SUPER_ADMIN'],
  'usuarios:gerenciar': ['SUPER_ADMIN'],
  'categorias:gerenciar': ['SUPER_ADMIN'],
  'turnos:gerenciar': ['SUPER_ADMIN'],
  'tvwall:gerenciar': ['SUPER_ADMIN'],
  'configuracoes:gerenciar': ['SUPER_ADMIN'],
  'auditoria:ver': ['SUPER_ADMIN'],
  'perguntas:gerenciar': ['SUPER_ADMIN', 'GESTOR'],
  'dashboard:ver': ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'],
  'respostas:ver': ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA'],
  'comentarios:ver': ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA'],
  'contatos:ver': ['SUPER_ADMIN', 'OUVIDORIA'],
  'contatos:gerenciar': ['SUPER_ADMIN', 'OUVIDORIA'],
  'exportacao:resumo': ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'],
  'exportacao:detalhada': ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA'],
  'escalas:gerenciar': ['SUPER_ADMIN', 'GESTOR'],
}

/** As permissões de cada perfil, na ordem de `PERMISSOES`. */
export const PERMISSOES_POR_PERFIL: Readonly<Record<Perfil, readonly Permissao[]>> = Object.freeze(
  Object.fromEntries(
    PERFIS.map((perfil) => [
      perfil,
      Object.freeze(PERMISSOES.filter((permissao) => PERFIS_DA_PERMISSAO[permissao].includes(perfil))),
    ]),
  ) as Record<Perfil, readonly Permissao[]>,
)

export function permissoesDoPerfil(perfil: Perfil): readonly Permissao[] {
  return PERMISSOES_POR_PERFIL[perfil]
}
