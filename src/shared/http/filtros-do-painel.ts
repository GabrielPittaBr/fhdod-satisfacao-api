import { z } from 'zod'
import { canalSchema } from './canal'
import { idSchema } from './parametros'

// Os filtros do painel ("Endpoints da API", no plano): um só, para o dashboard, as respostas e as exportações,
// que mostram os mesmos números com a mesma visão. O front os guarda na URL, e a exportação sai com o que está
// na tela. A consulta de cada filtro fica no `condicoesDoPainel`, de `src/database/filtros-do-painel.ts`.

/** A data comparada com o período: a do atendimento, que o paciente informa, ou a do envio da avaliação. */
export const BASES_DA_DATA = ['ATENDIMENTO', 'ENVIO'] as const

export type BaseData = (typeof BASES_DA_DATA)[number]

export const MENSAGENS_DOS_FILTROS = {
  inicio: 'Informe a data inicial',
  fim: 'Informe a data final',
  data: 'Use uma data válida, no formato AAAA-MM-DD',
  base: 'Escolha a data do atendimento ou a do envio',
  periodo: 'A data final precisa ser igual ou depois da inicial',
} as const

export const baseDataSchema = z.enum(BASES_DA_DATA, { error: MENSAGENS_DOS_FILTROS.base }).meta({
  id: 'BaseData',
  description:
    '`ATENDIMENTO` compara o período com o dia do atendimento; `ENVIO`, com o dia do envio da avaliação no ' +
    'horário de Brasília (uma resposta enviada às 23h30 do dia 10 conta no dia 10).',
})

/** Uma data `AAAA-MM-DD` que existe no calendário: 2026-02-30 não passa. */
function data(obrigatoria: string, description: string, example: string) {
  return z.iso
    .date({
      error: (problema) => (problema.input === undefined ? obrigatoria : MENSAGENS_DOS_FILTROS.data),
    })
    .meta({ description, example })
}

const CAMPOS = {
  inicio: data(
    MENSAGENS_DOS_FILTROS.inicio,
    'Primeiro dia do período, em AAAA-MM-DD, incluído.',
    '2026-11-01',
  ),
  fim: data(
    MENSAGENS_DOS_FILTROS.fim,
    'Último dia do período, em AAAA-MM-DD, incluído; igual ou depois do início.',
    '2026-11-30',
  ),
  setorId: idSchema.meta({
    description:
      'Só este setor. Sem ele, todos os que a pessoa enxerga; o Gestor e o Visualizador que pedem um setor ' +
      'que não é seu recebem 403.',
    example: 1,
  }),
  turnoId: idSchema.meta({ description: 'Só as respostas deste turno.', example: 1 }),
}

const dataValida = z.iso.date()

/** As duas datas vieram e existem no calendário: só então o período pode ser comparado. */
export function periodoValido(inicio: string | undefined, fim: string | undefined): boolean {
  return dataValida.safeParse(inicio).success && dataValida.safeParse(fim).success
}

/**
 * A data final antes da inicial é erro em `fim`. Só compara duas datas válidas: no Zod 4, a data fora do
 * formato não interrompe o objeto, e a regra recebe o texto como veio.
 */
export function periodoEmOrdem(
  { inicio, fim }: { inicio?: string; fim?: string },
  contexto: z.RefinementCtx,
): void {
  if (inicio && fim && periodoValido(inicio, fim) && fim < inicio) {
    contexto.addIssue({ code: 'custom', path: ['fim'], message: MENSAGENS_DOS_FILTROS.periodo })
  }
}

/**
 * Os campos dos filtros no dashboard, onde o período e a base são obrigatórios. Uma rota que recebe mais
 * alguma coisa, como a `granularidade` da evolução, estende estes campos e repete o `periodoEmOrdem`.
 */
export const CAMPOS_DOS_FILTROS_DO_DASHBOARD = {
  inicio: CAMPOS.inicio,
  fim: CAMPOS.fim,
  base: baseDataSchema,
  setorId: CAMPOS.setorId.optional(),
  turnoId: CAMPOS.turnoId.optional(),
  canal: canalSchema.optional(),
}

/** Os filtros do dashboard: `inicio`, `fim` e `base` obrigatórios; `setorId`, `turnoId` e `canal` opcionais. */
export const filtrosDoDashboardSchema = z.object(CAMPOS_DOS_FILTROS_DO_DASHBOARD).superRefine(periodoEmOrdem)

/**
 * Os mesmos filtros com tudo opcional, para as listas de respostas e as exportações: sem `inicio` ou sem `fim`,
 * o período fica aberto daquele lado. Sem `base`, vale a data do atendimento.
 */
export const filtrosDoPainelSchema = z
  .object({
    ...CAMPOS_DOS_FILTROS_DO_DASHBOARD,
    inicio: CAMPOS.inicio.optional(),
    fim: CAMPOS.fim.optional(),
    base: baseDataSchema.default('ATENDIMENTO'),
  })
  .superRefine(periodoEmOrdem)

/** Os filtros já validados: o que o `condicoesDoPainel` recebe, do dashboard ou de qualquer outra lista. */
export type FiltrosDoPainel = z.output<typeof filtrosDoPainelSchema>

export type FiltrosDoDashboard = z.output<typeof filtrosDoDashboardSchema>
