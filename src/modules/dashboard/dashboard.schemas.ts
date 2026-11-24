import { z } from 'zod'
import {
  CAMPOS_DOS_FILTROS_DO_DASHBOARD,
  filtrosDoDashboardSchema,
  periodoEmOrdem,
  periodoValido,
} from '../../shared/http/filtros-do-painel'

/** Como a evolução agrupa as respostas. A semana começa na segunda, como a do `date_trunc` do PostgreSQL. */
export const GRANULARIDADES = ['DIA', 'SEMANA', 'MES'] as const

export type Granularidade = (typeof GRANULARIDADES)[number]

/**
 * Pontos de uma evolução, no máximo: um ano inteiro por dia. Sem limite, um período de séculos por dia faria o
 * banco gerar e a API devolver milhões de pontos.
 */
export const MAXIMO_DE_PONTOS = 366

export const MENSAGEM_GRANULARIDADE = 'Escolha por dia, por semana ou por mês'

/** O que fazer quando o período tem pontos demais, em cada granularidade. */
export const MENSAGENS_DE_PONTOS_DEMAIS: Record<Granularidade, string> = {
  DIA: `Escolha um período de até ${MAXIMO_DE_PONTOS} dias ou veja por semana ou por mês`,
  SEMANA: `Escolha um período de até ${MAXIMO_DE_PONTOS} semanas ou veja por mês`,
  MES: `Escolha um período de até ${MAXIMO_DE_PONTOS} meses`,
}

// ---------- Respostas ----------

export const npsSchema = z.number().int().nullable().meta({
  description:
    '% de promotores (9 e 10) menos % de detratores (0 a 6), arredondado, de -100 a 100; `null` sem respostas.',
  example: 42,
})

export const resumoSchema = z
  .object({
    nps: npsSchema,
    total: z.number().int().meta({ description: 'Respostas no período.' }),
    promotores: z.number().int().meta({ description: 'Respostas com NPS 9 ou 10.' }),
    neutros: z.number().int().meta({ description: 'Respostas com NPS 7 ou 8.' }),
    detratores: z.number().int().meta({ description: 'Respostas com NPS de 0 a 6.' }),
    notasBaixas: z
      .number()
      .int()
      .meta({
        description:
          'Respostas com classificação baixa ou baixíssima: a pior entre o NPS e as notas de 1 a 5, com os ' +
          'limites das configurações do momento do envio.',
      }),
    baixissimas: z.number().int().meta({ description: 'Respostas com classificação baixíssima.' }),
    mediaEscala: z
      .number()
      .nullable()
      .meta({
        description:
          'Média das notas de 1 a 5 de todas as perguntas de escala respondidas, com uma casa decimal; ' +
          '`null` sem nenhuma nota.',
        example: 4.3,
      }),
  })
  .meta({ id: 'Resumo', description: 'Os números principais da pesquisa no período e nos filtros pedidos.' })

export type Resumo = z.output<typeof resumoSchema>

export const npsSetorSchema = z
  .object({
    setorId: z.number().int(),
    setor: z.string().meta({ description: 'O nome do setor, também se ele estiver desativado.' }),
    nps: npsSchema,
    total: z.number().int().meta({ description: 'Respostas do setor no período.' }),
  })
  .meta({ id: 'NpsSetor', description: 'O NPS de um setor no período, com o número de respostas.' })

export type NpsSetor = z.output<typeof npsSetorSchema>

export const pontoEvolucaoSchema = z
  .object({
    periodo: z.string().meta({
      description:
        'Primeiro dia do período, em AAAA-MM-DD: o dia, a segunda-feira da semana ou o dia 1 do mês.',
      example: '2026-11-02',
    }),
    nps: npsSchema,
    total: z.number().int().meta({ description: 'Respostas no período; 0 no período sem resposta.' }),
  })
  .meta({ id: 'PontoEvolucao', description: 'Um ponto da evolução do NPS.' })

export type PontoEvolucao = z.output<typeof pontoEvolucaoSchema>

// ---------- Requisições ----------

export const granularidadeSchema = z.enum(GRANULARIDADES, { error: MENSAGEM_GRANULARIDADE }).meta({
  id: 'Granularidade',
  description: 'Um ponto por dia, por semana (de segunda a domingo) ou por mês.',
})

/** `AAAA-MM-DD` em dias desde 1970-01-01, sem fuso: só a data conta. */
function diaDoCalendario(data: string): number {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number)
  return Date.UTC(ano, mes - 1, dia) / 86_400_000
}

/** A segunda-feira da semana de um dia, em dias desde 1970-01-01 (que foi uma quinta). */
function segundaDaSemana(dia: number): number {
  // O `%` do JavaScript é negativo antes de 1970: o `+ 7` o traz de volta para 0 a 6.
  return dia - ((((dia + 3) % 7) + 7) % 7)
}

/** Quantos pontos a evolução tem de `inicio` a `fim`, contando o período de cada ponta inteiro. */
export function quantidadeDePeriodos(inicio: string, fim: string, granularidade: Granularidade): number {
  if (granularidade === 'MES') {
    const [anoInicio = 0, mesInicio = 0] = inicio.split('-').map(Number)
    const [anoFim = 0, mesFim = 0] = fim.split('-').map(Number)
    return (anoFim - anoInicio) * 12 + (mesFim - mesInicio) + 1
  }
  const [primeiro, ultimo] = [diaDoCalendario(inicio), diaDoCalendario(fim)]
  if (granularidade === 'DIA') return ultimo - primeiro + 1
  return (segundaDaSemana(ultimo) - segundaDaSemana(primeiro)) / 7 + 1
}

const evolucaoQuery = z
  .object({ ...CAMPOS_DOS_FILTROS_DO_DASHBOARD, granularidade: granularidadeSchema })
  .superRefine(periodoEmOrdem)
  .superRefine(({ inicio, fim, granularidade }, contexto) => {
    // A data inválida e o período invertido já têm o seu erro.
    if (!periodoValido(inicio, fim) || inicio > fim) return
    if (quantidadeDePeriodos(inicio, fim, granularidade) > MAXIMO_DE_PONTOS) {
      contexto.addIssue({
        code: 'custom',
        path: ['granularidade'],
        message: MENSAGENS_DE_PONTOS_DEMAIS[granularidade],
      })
    }
  })

export const buscarResumo = { query: filtrosDoDashboardSchema }

export const buscarNpsPorSetor = { query: filtrosDoDashboardSchema }

export const buscarEvolucao = { query: evolucaoQuery }

export type FiltrosDaEvolucao = z.output<typeof evolucaoQuery>
