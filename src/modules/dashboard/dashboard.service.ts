import type { FiltrosDoDashboard, FiltrosDoPainel } from '../../shared/http/filtros-do-painel'
import type { Meta } from '../../shared/http/pagination'
import { calcularNps } from '../../shared/rules/calcular-nps'
import { mediaComUmaCasa } from '../../shared/rules/media'
import { indicadoresDasNotas } from '../../shared/rules/notas-da-escala'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import { ranquearPontos, type PontoAvaliado } from '../../shared/rules/ranking-de-pontos'
import type { UsuarioAutenticado } from '../../shared/security/acesso'
import { dashboardRepository } from './dashboard.repository'
import type {
  ComentarioRecente,
  FiltrosDaEvolucao,
  FiltrosDosComentarios,
  IndicadorCategoria,
  NpsSetor,
  PontoEvolucao,
  Ranking,
  Resumo,
} from './dashboard.schemas'

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

  /** A média e o % de notas 4 e 5 de cada categoria com notas no período, na ordem das categorias. */
  async categorias(usuario: UsuarioAutenticado, filtros: FiltrosDoDashboard): Promise<IndicadorCategoria[]> {
    const categorias = await dashboardRepository.categorias(filtros, usuario.setorIds)
    return categorias.map(({ categoriaId, categoria, ...contagem }) => ({
      categoriaId,
      categoria,
      ...indicadoresDasNotas(contagem),
    }))
  },

  /**
   * A média e o % de notas 4 e 5 de cada ponto (um setor numa categoria) com notas no período, sem ordem e sem
   * o mínimo de notas. Recebe os `setorIds`, e não quem está logado, para a TV (os destaques, que não têm login)
   * e as exportações usarem o mesmo cálculo; `null` conta todos os setores.
   */
  async pontosAvaliados(
    filtros: FiltrosDoPainel,
    setorIds: readonly number[] | null,
  ): Promise<PontoAvaliado[]> {
    const pontos = await dashboardRepository.notasPorPonto(filtros, setorIds)
    return pontos.map(({ setorId, setor, categoriaId, categoria, ...contagem }) => {
      const { media, percentual45, total } = indicadoresDasNotas(contagem)
      // A consulta só devolve pontos com pelo menos uma nota.
      if (media === null || percentual45 === null)
        throw new Error(`Ponto sem notas: ${setorId}:${categoriaId}`)
      return { setorId, setor, categoriaId, categoria, media, percentual45, total }
    })
  },

  /** Os melhores e os piores pontos com 5 notas ou mais, até 3 em cada lista, sem repetir. */
  async ranking(usuario: UsuarioAutenticado, filtros: FiltrosDoDashboard): Promise<Ranking> {
    return ranquearPontos(await dashboardService.pontosAvaliados(filtros, usuario.setorIds))
  },

  /** Os comentários do período, do envio mais recente para o mais antigo, na página pedida. */
  async comentarios(
    usuario: UsuarioAutenticado,
    { tipo, pagina, porPagina, ...filtros }: FiltrosDosComentarios,
  ): Promise<{ comentarios: ComentarioRecente[]; meta: Meta }> {
    const { comentarios, total } = await dashboardRepository.comentarios(
      filtros,
      tipo,
      { pagina, porPagina },
      usuario.setorIds,
    )
    return {
      comentarios: comentarios.map(({ enviadoEm, ...comentario }) => ({
        ...comentario,
        enviadoEm: enviadoEm.toISOString(),
      })),
      meta: { pagina, porPagina, total },
    }
  },
}
