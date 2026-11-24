import { condicoesDoPainel, diaDaResposta } from '../../database/filtros-do-painel'
import { prisma } from '../../database/prisma'
import { Prisma } from '../../generated/prisma/client'
import type { FiltrosDoDashboard, FiltrosDoPainel } from '../../shared/http/filtros-do-painel'
import { paginar, type Paginacao } from '../../shared/http/pagination'
import { DETRATOR_ATE, PROMOTOR_A_PARTIR_DE, type ContagemDoNps } from '../../shared/rules/calcular-nps'
import { NOTA_BOA_A_PARTIR_DE, type ContagemDasNotas } from '../../shared/rules/notas-da-escala'
import type { TipoComentario } from '../../shared/constants/tipos-de-comentario'
import type { Classificacao } from '../../shared/rules/classificar-nota'
import type { Granularidade } from './dashboard.schemas'

// As consultas do dashboard. Só contam: o NPS e a média saem das regras de `src/shared/rules/`, no service. Os
// `::int` fazem as contagens chegarem como `number`, e não como `BigInt`.

export interface ContagemDoResumo extends ContagemDoNps {
  neutros: number
  notasBaixas: number
  baixissimas: number
  /** Notas de 1 a 5 respondidas, nas perguntas de escala. */
  quantidadeDeNotas: number
  somaDasNotas: number
}

export interface ContagemDoSetor extends ContagemDoNps {
  setorId: number
  setor: string
}

export interface ContagemDoPeriodo extends ContagemDoNps {
  /** Primeiro dia do período, em `AAAA-MM-DD`. */
  periodo: string
}

export interface ContagemDaCategoria extends ContagemDasNotas {
  categoriaId: number
  categoria: string
}

export interface ContagemDoPonto extends ContagemDasNotas {
  setorId: number
  setor: string
  categoriaId: number
  categoria: string
}

export interface ComentarioDoBanco {
  id: number
  respostaId: number
  tipo: TipoComentario
  texto: string
  setor: string
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  enviadoEm: Date
  classificacao: Classificacao
}

/** O `date_trunc` e o passo do `generate_series` de cada granularidade. */
const PERIODOS: Record<Granularidade, { unidade: string; passo: string }> = {
  DIA: { unidade: 'day', passo: '1 day' },
  SEMANA: { unidade: 'week', passo: '1 week' },
  MES: { unidade: 'month', passo: '1 month' },
}

/** As colunas com as contagens do NPS de um grupo de respostas `r`. */
const CONTAGEM_DO_NPS = Prisma.sql`
  count(r.id)::int AS total,
  (count(r.id) FILTER (WHERE r.nps >= ${PROMOTOR_A_PARTIR_DE}))::int AS promotores,
  (count(r.id) FILTER (WHERE r.nps <= ${DETRATOR_ATE}))::int AS detratores`

/** As colunas com as contagens das notas de 1 a 5 de um grupo de itens `i`. */
const CONTAGEM_DAS_NOTAS = Prisma.sql`
  count(i.valor_numero)::int AS quantidade,
  coalesce(sum(i.valor_numero), 0)::int AS soma,
  (count(i.valor_numero) FILTER (WHERE i.valor_numero >= ${NOTA_BOA_A_PARTIR_DE}))::int AS boas`

/**
 * As notas de 1 a 5 das respostas dos filtros e do escopo: os itens de escala `i`, com a resposta `r`, o setor
 * `s` e a categoria `c` do item, a do momento da resposta.
 */
function notasDaEscala(filtros: FiltrosDoPainel, setorIds: readonly number[] | null): Prisma.Sql {
  return Prisma.sql`
    FROM respostas r
    JOIN resposta_itens i ON i.resposta_id = r.id AND i.tipo = 'ESCALA_1_5' AND i.valor_numero IS NOT NULL
    JOIN categorias c ON c.id = i.categoria_id
    JOIN setores s ON s.id = r.setor_id
    WHERE ${condicoesDoPainel(filtros, setorIds)}`
}

export const dashboardRepository = {
  /** As contagens do resumo, numa consulta só, sobre as respostas dos filtros e do escopo. */
  async resumo(filtros: FiltrosDoDashboard, setorIds: readonly number[] | null): Promise<ContagemDoResumo> {
    const [contagem] = await prisma.$queryRaw<ContagemDoResumo[]>`
      WITH filtradas AS (
        SELECT r.id, r.nps, r.classificacao
        FROM respostas r
        WHERE ${condicoesDoPainel(filtros, setorIds)}
      ),
      notas AS (
        SELECT count(i.valor_numero)::int AS quantidade, coalesce(sum(i.valor_numero), 0)::int AS soma
        FROM resposta_itens i
        JOIN filtradas f ON f.id = i.resposta_id
        WHERE i.tipo = 'ESCALA_1_5'
      )
      SELECT ${CONTAGEM_DO_NPS},
             (count(r.id) FILTER (WHERE r.nps > ${DETRATOR_ATE} AND r.nps < ${PROMOTOR_A_PARTIR_DE}))::int
               AS neutros,
             (count(r.id) FILTER (WHERE r.classificacao IN ('BAIXA', 'BAIXISSIMA')))::int AS "notasBaixas",
             (count(r.id) FILTER (WHERE r.classificacao = 'BAIXISSIMA'))::int AS baixissimas,
             n.quantidade AS "quantidadeDeNotas",
             n.soma AS "somaDasNotas"
      FROM notas n
      LEFT JOIN filtradas r ON TRUE
      GROUP BY n.quantidade, n.soma`
    if (!contagem) throw new Error('A consulta do resumo não devolveu linha')
    return contagem
  },

  /** As contagens de cada setor com respostas nos filtros e no escopo, com o nome do setor. */
  npsPorSetor(filtros: FiltrosDoDashboard, setorIds: readonly number[] | null): Promise<ContagemDoSetor[]> {
    return prisma.$queryRaw<ContagemDoSetor[]>`
      SELECT r.setor_id AS "setorId", s.nome AS setor, ${CONTAGEM_DO_NPS}
      FROM respostas r
      JOIN setores s ON s.id = r.setor_id
      WHERE ${condicoesDoPainel(filtros, setorIds)}
      GROUP BY r.setor_id, s.nome`
  },

  /**
   * As contagens de cada período, do que contém o `inicio` ao que contém o `fim`, em ordem, inclusive os sem
   * resposta, que vêm com o total 0. O período das pontas é o inteiro (a semana do início começa na segunda
   * antes dele), mas só entram as respostas de `inicio` a `fim`.
   */
  evolucao(
    filtros: FiltrosDoDashboard,
    granularidade: Granularidade,
    setorIds: readonly number[] | null,
  ): Promise<ContagemDoPeriodo[]> {
    const { unidade, passo } = PERIODOS[granularidade]
    return prisma.$queryRaw<ContagemDoPeriodo[]>`
      WITH periodos AS (
        SELECT generate_series(
                 date_trunc(${unidade}, ${filtros.inicio}::date::timestamp),
                 ${filtros.fim}::date::timestamp,
                 ${passo}::interval
               ) AS inicio
      ),
      filtradas AS (
        SELECT r.id, r.nps, date_trunc(${unidade}, ${diaDaResposta(filtros.base)}::timestamp) AS periodo
        FROM respostas r
        WHERE ${condicoesDoPainel(filtros, setorIds)}
      )
      SELECT to_char(p.inicio, 'YYYY-MM-DD') AS periodo, ${CONTAGEM_DO_NPS}
      FROM periodos p
      LEFT JOIN filtradas r ON r.periodo = p.inicio
      GROUP BY p.inicio
      ORDER BY p.inicio`
  },

  /** As notas de cada categoria com notas no período, na ordem das categorias. */
  categorias(filtros: FiltrosDoPainel, setorIds: readonly number[] | null): Promise<ContagemDaCategoria[]> {
    return prisma.$queryRaw<ContagemDaCategoria[]>`
      SELECT c.id AS "categoriaId", c.nome AS categoria, ${CONTAGEM_DAS_NOTAS}
      ${notasDaEscala(filtros, setorIds)}
      GROUP BY c.id, c.nome, c.ordem
      ORDER BY c.ordem, c.id`
  },

  /**
   * As notas de cada ponto (um setor numa categoria) com notas no período, sem ordem. É a base do ranking e dos
   * destaques da TV.
   */
  notasPorPonto(filtros: FiltrosDoPainel, setorIds: readonly number[] | null): Promise<ContagemDoPonto[]> {
    return prisma.$queryRaw<ContagemDoPonto[]>`
      SELECT r.setor_id AS "setorId", s.nome AS setor, c.id AS "categoriaId", c.nome AS categoria,
             ${CONTAGEM_DAS_NOTAS}
      ${notasDaEscala(filtros, setorIds)}
      GROUP BY r.setor_id, s.nome, c.id, c.nome`
  },

  /**
   * Os comentários das respostas dos filtros e do escopo, do envio mais recente para o mais antigo, na página
   * pedida, e o total de todas as páginas, numa transação só.
   */
  async comentarios(
    filtros: FiltrosDoPainel,
    tipo: TipoComentario | undefined,
    paginacao: Paginacao,
    setorIds: readonly number[] | null,
  ): Promise<{ comentarios: ComentarioDoBanco[]; total: number }> {
    const { skip, take } = paginar(paginacao)
    const condicoes = Prisma.sql`${condicoesDoPainel(filtros, setorIds)}
      ${tipo === undefined ? Prisma.empty : Prisma.sql`AND co.tipo = ${tipo}::tipo_comentario`}`
    const [comentarios, [contagem]] = await prisma.$transaction([
      prisma.$queryRaw<ComentarioDoBanco[]>`
        SELECT co.id, co.resposta_id AS "respostaId", co.tipo::text AS tipo, co.texto, s.nome AS setor,
               to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento", r.enviado_em AS "enviadoEm",
               r.classificacao::text AS classificacao
        FROM comentarios co
        JOIN respostas r ON r.id = co.resposta_id
        JOIN setores s ON s.id = r.setor_id
        WHERE ${condicoes}
        ORDER BY r.enviado_em DESC, co.id DESC
        LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        FROM comentarios co
        JOIN respostas r ON r.id = co.resposta_id
        WHERE ${condicoes}`,
    ])
    return { comentarios, total: contagem?.total ?? 0 }
  },
}
