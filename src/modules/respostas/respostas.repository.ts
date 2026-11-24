import { condicoesDoPainel } from '../../database/filtros-do-painel'
import { prisma } from '../../database/prisma'
import { Prisma } from '../../generated/prisma/client'
import type { Canal } from '../../shared/http/canal'
import type { FiltrosDoPainel } from '../../shared/http/filtros-do-painel'
import { paginar, type Paginacao } from '../../shared/http/pagination'
import type { Classificacao } from '../../shared/rules/classificar-nota'
import type { Ordem, OrdenacaoDasRespostas } from './respostas.schemas'

// As consultas das respostas do painel. A lista e o detalhe leem o resumo com as mesmas colunas, e a lista usa
// os filtros do painel (`condicoesDoPainel`), com o escopo de setor dentro da própria consulta.

/** Uma resposta como a lista e o detalhe a mostram, com o instante do envio ainda em `Date`. */
export interface RespostaDoBanco {
  id: number
  setorId: number
  setor: string
  canal: Canal
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  turno: string
  nps: number
  classificacao: Classificacao
  enviadoEm: Date
  temComentario: boolean
  pediuRetorno: boolean
}

/** O que a lista filtra além dos filtros do painel. */
export interface FiltrosDasRespostas {
  classificacao?: Classificacao
  comComentario?: boolean
  comRetorno?: boolean
}

export interface OrdemDaLista {
  ordenarPor: OrdenacaoDasRespostas
  ordem: Ordem
}

/** A coluna de cada ordenação: a lista só ordena por estas, nunca por um texto que veio no pedido. */
const COLUNAS_DA_ORDEM: Record<OrdenacaoDasRespostas, Prisma.Sql> = {
  dataAtendimento: Prisma.sql`r.data_atendimento`,
  enviadoEm: Prisma.sql`r.enviado_em`,
  nps: Prisma.sql`r.nps`,
}

const SENTIDOS: Record<Ordem, Prisma.Sql> = { asc: Prisma.sql`ASC`, desc: Prisma.sql`DESC` }

/**
 * A resposta `r` com o setor `s`, o turno `t`, o comentário `co` e o pedido de retorno `cr`. Cada resposta tem
 * no máximo um comentário e um pedido (os dois são únicos por resposta), então as junções não repetem linhas.
 */
const RESPOSTAS_COM_AS_PARTES = Prisma.sql`
  FROM respostas r
  JOIN setores s ON s.id = r.setor_id
  JOIN turnos t ON t.id = r.turno_id
  LEFT JOIN comentarios co ON co.resposta_id = r.id
  LEFT JOIN contatos_retorno cr ON cr.resposta_id = r.id`

/** As colunas do resumo de cada resposta, no formato da `RespostaDoBanco`. */
const COLUNAS_DO_RESUMO = Prisma.sql`
  r.id, r.setor_id AS "setorId", s.nome AS setor, r.canal::text AS canal,
  to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento", t.nome AS turno, r.nps::int AS nps,
  r.classificacao::text AS classificacao, r.enviado_em AS "enviadoEm",
  (co.id IS NOT NULL) AS "temComentario", (cr.id IS NOT NULL) AS "pediuRetorno"`

/** `IS NOT NULL` para `true` e `IS NULL` para `false`: a resposta tem a parte, ou não tem. */
function temAParte(coluna: Prisma.Sql, tem: boolean): Prisma.Sql {
  return tem ? Prisma.sql`${coluna} IS NOT NULL` : Prisma.sql`${coluna} IS NULL`
}

function condicoesDaLista(
  filtros: FiltrosDoPainel,
  { classificacao, comComentario, comRetorno }: FiltrosDasRespostas,
  setorIds: readonly number[] | null,
): Prisma.Sql {
  const condicoes = [condicoesDoPainel(filtros, setorIds)]
  if (classificacao !== undefined)
    condicoes.push(Prisma.sql`r.classificacao = ${classificacao}::classificacao`)
  if (comComentario !== undefined) condicoes.push(temAParte(Prisma.sql`co.id`, comComentario))
  if (comRetorno !== undefined) condicoes.push(temAParte(Prisma.sql`cr.id`, comRetorno))
  return Prisma.join(condicoes, ' AND ')
}

/** As partes de uma resposta que só o detalhe mostra. */
const PARTES_DO_DETALHE = {
  itens: {
    select: {
      perguntaId: true,
      perguntaTexto: true,
      tipo: true,
      valorNumero: true,
      valorTexto: true,
      categoria: { select: { nome: true } },
    },
    // A pesquisa grava os itens na ordem em que o front os mostrou: o ID guarda a ordem que o paciente viu,
    // mesmo que as perguntas mudem de lugar depois.
    orderBy: { id: 'asc' },
  },
  comentario: { select: { tipo: true, texto: true } },
  // Só os 4 últimos dígitos: o telefone cifrado não sai daqui.
  contato: { select: { id: true, telefoneFinal: true, status: true } },
} satisfies Prisma.RespostaSelect

export type PartesDoDetalhe = Prisma.RespostaGetPayload<{ select: typeof PARTES_DO_DETALHE }>

export const respostasRepository = {
  /**
   * As respostas dos filtros e do escopo, na ordem pedida e na página pedida, e o total de todas as páginas,
   * numa transação só. No empate da ordem, a de ID maior primeiro na ordem `desc`, e a de ID menor na `asc`.
   */
  async listar(
    filtros: FiltrosDoPainel,
    filtrosDasRespostas: FiltrosDasRespostas,
    { ordenarPor, ordem }: OrdemDaLista,
    paginacao: Paginacao,
    setorIds: readonly number[] | null,
  ): Promise<{ respostas: RespostaDoBanco[]; total: number }> {
    const { skip, take } = paginar(paginacao)
    const condicoes = condicoesDaLista(filtros, filtrosDasRespostas, setorIds)
    const sentido = SENTIDOS[ordem]
    const [respostas, [contagem]] = await prisma.$transaction([
      prisma.$queryRaw<RespostaDoBanco[]>`
        SELECT ${COLUNAS_DO_RESUMO}
        ${RESPOSTAS_COM_AS_PARTES}
        WHERE ${condicoes}
        ORDER BY ${COLUNAS_DA_ORDEM[ordenarPor]} ${sentido}, r.id ${sentido}
        LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        ${RESPOSTAS_COM_AS_PARTES}
        WHERE ${condicoes}`,
    ])
    return { respostas, total: contagem?.total ?? 0 }
  },

  /** O resumo de uma resposta pelo ID, com as mesmas colunas da lista; `undefined` se ela não existir. */
  async buscar(id: number): Promise<RespostaDoBanco | undefined> {
    const [resposta] = await prisma.$queryRaw<RespostaDoBanco[]>`
      SELECT ${COLUNAS_DO_RESUMO}
      ${RESPOSTAS_COM_AS_PARTES}
      WHERE r.id = ${id}`
    return resposta
  },

  /** Os itens, o comentário e o pedido de retorno (sem o telefone cifrado) de uma resposta. */
  partesDoDetalhe(id: number): Promise<PartesDoDetalhe | null> {
    return prisma.resposta.findUnique({ where: { id }, select: PARTES_DO_DETALHE })
  },
}
