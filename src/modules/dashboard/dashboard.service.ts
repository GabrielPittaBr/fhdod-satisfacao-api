import type { FiltrosDoDashboard } from '../../shared/http/filtros-do-painel'
import { calcularNps } from '../../shared/rules/calcular-nps'
import { mediaComUmaCasa } from '../../shared/rules/media'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import type { UsuarioAutenticado } from '../../shared/security/acesso'
import { dashboardRepository } from './dashboard.repository'
import type { FiltrosDaEvolucao, NpsSetor, PontoEvolucao, Resumo } from './dashboard.schemas'

/**
 * Do maior NPS para o menor; no empate, o setor com mais respostas e depois a ordem alfabética, para a ordem
 * nunca variar entre duas chamadas. Um NPS `null` iria para o fim.
 */
function porNps(a: NpsSetor, b: NpsSetor): number {
  return (
    (b.nps ?? -Infinity) - (a.nps ?? -Infinity) ||
    b.total - a.total ||
    porNome({ id: a.setorId, nome: a.setor }, { id: b.setorId, nome: b.setor })
  )
}

/**
 * Os números do dashboard. O escopo de setor vai para a própria consulta, com os `setorIds` de quem está
 * logado: o Gestor e o Visualizador só contam os seus setores, mesmo sem pedir um. Quem pede um setor de fora
 * já recebeu 403 no `setorScope` da rota.
 */
export const dashboardService = {
  async resumo(usuario: UsuarioAutenticado, filtros: FiltrosDoDashboard): Promise<Resumo> {
    const { quantidadeDeNotas, somaDasNotas, ...contagem } = await dashboardRepository.resumo(
      filtros,
      usuario.setorIds,
    )
    return {
      nps: calcularNps(contagem),
      total: contagem.total,
      promotores: contagem.promotores,
      neutros: contagem.neutros,
      detratores: contagem.detratores,
      notasBaixas: contagem.notasBaixas,
      baixissimas: contagem.baixissimas,
      mediaEscala: mediaComUmaCasa(somaDasNotas, quantidadeDeNotas),
    }
  },

  /** Só os setores com respostas no período: um setor sem nenhuma não tem NPS para mostrar. */
  async npsPorSetor(usuario: UsuarioAutenticado, filtros: FiltrosDoDashboard): Promise<NpsSetor[]> {
    const setores = await dashboardRepository.npsPorSetor(filtros, usuario.setorIds)
    return setores
      .map(({ setorId, setor, ...contagem }) => ({
        setorId,
        setor,
        nps: calcularNps(contagem),
        total: contagem.total,
      }))
      .sort(porNps)
  },

  async evolucao(
    usuario: UsuarioAutenticado,
    { granularidade, ...filtros }: FiltrosDaEvolucao,
  ): Promise<PontoEvolucao[]> {
    const periodos = await dashboardRepository.evolucao(filtros, granularidade, usuario.setorIds)
    return periodos.map(({ periodo, ...contagem }) => ({
      periodo,
      nps: calcularNps(contagem),
      total: contagem.total,
    }))
  },
}
