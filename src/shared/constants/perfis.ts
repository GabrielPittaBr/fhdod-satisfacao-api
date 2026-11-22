import type { Perfil as PerfilDoBanco } from '../../generated/prisma/enums'

/**
 * Perfis do painel, os mesmos do tipo `perfil` do banco. A lista fica aqui, e não só no cliente do Prisma,
 * porque os schemas e a documentação não importam o Prisma. O `satisfies` recusa um perfil que o banco não
 * tem, e o teste do mapa de permissões confere que nenhum ficou de fora.
 */
export const PERFIS = [
  'SUPER_ADMIN',
  'GESTOR',
  'OUVIDORIA',
  'VISUALIZADOR',
] as const satisfies readonly PerfilDoBanco[]

export type Perfil = (typeof PERFIS)[number]

/** Perfis que enxergam todos os setores. Gestor e Visualizador enxergam só os setores ligados a eles. */
export const PERFIS_SEM_ESCOPO: readonly Perfil[] = ['SUPER_ADMIN', 'OUVIDORIA']

export function enxergaTodosOsSetores(perfil: Perfil): boolean {
  return PERFIS_SEM_ESCOPO.includes(perfil)
}
