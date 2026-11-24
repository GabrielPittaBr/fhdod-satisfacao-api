import { ROTULO_BASE, ROTULO_CANAL } from '../../shared/constants/rotulos'
import type { FiltrosDoDashboard } from '../../shared/http/filtros-do-painel'
import { DETRATOR_ATE, PROMOTOR_A_PARTIR_DE } from '../../shared/rules/calcular-nps'
import { NOTA_BOA_A_PARTIR_DE } from '../../shared/rules/notas-da-escala'
import type { IndicadorCategoria, NpsSetor, Resumo } from '../dashboard/dashboard.schemas'

// O resumo dos indicadores, como a planilha e o PDF o mostram: os mesmos textos, os mesmos números e a mesma
// ordem. Cada arquivo decide só como desenhar: a planilha guarda o número com o formato de exibição, e o PDF
// escreve o número já formatado.

/** No lugar de um número que não existe, como o NPS de um período sem respostas. */
export const SEM_DADOS = '—'

export const AUTOR_DO_ARQUIVO = 'Sistema de Satisfação Hospitalar da FHDOD'

/** Os filtros do arquivo, com os nomes que ele mostra no lugar dos IDs. */
export interface FiltrosDoArquivo extends FiltrosDoDashboard {
  /** O nome do setor do `setorId`, ou `null` se nenhum setor tem esse ID. */
  setor?: string | null
  /** O nome do turno do `turnoId`, ou `null` se nenhum turno tem esse ID. */
  turno?: string | null
  /**
   * Sem `setorId`, os setores de quem exporta, em ordem alfabética, ou `null` quando a pessoa enxerga todos (Super
   * Admin e Ouvidoria). Com `setorId`, não é lido.
   */
  setoresDoEscopo: string[] | null
}

/** O que o resumo mostra: os filtros, quem gerou e quando, e os números do dashboard com os mesmos filtros. */
export interface DadosDoResumo {
  filtros: FiltrosDoArquivo
  indicadores: Resumo
  setores: NpsSetor[]
  categorias: IndicadorCategoria[]
  geradoEm: Date
  geradoPor: string
}

/** Como cada número se mostra: o NPS inteiro, as contagens com o ponto do milhar, a média com uma casa e o %. */
export type TipoDeNumero = 'inteiro' | 'contagem' | 'media' | 'percentual'

/** Um número do resumo e o tipo dele; a porcentagem vai de 0 a 1, como o Excel a guarda. */
export interface Numero {
  valor: number | null
  tipo: TipoDeNumero
}

export const TEXTOS_DO_RESUMO = {
  titulo: 'Pesquisa de satisfação: resumo dos indicadores',
  geradoEm: 'Gerado em',
  geradoPor: 'Gerado por',
  filtros: 'Filtros aplicados',
  indicadores: 'Indicadores',
  setores: 'NPS por setor',
  categorias: 'Médias por categoria',
  cabecalhoDosSetores: ['Setor', 'NPS', 'Respostas'],
  cabecalhoDasCategorias: ['Categoria', 'Média (1 a 5)', `% de notas ${NOTA_BOA_A_PARTIR_DE} e 5`, 'Notas'],
  semSetores: 'Nenhuma resposta no período.',
  semCategorias: 'Nenhuma nota de 1 a 5 no período.',
} as const

/** `AAAA-MM-DD` como se escreve no Brasil: 01/11/2026. */
export function dataBrasileira(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function descreverSetor({ setorId, setor, setoresDoEscopo }: FiltrosDoArquivo): string {
  if (setorId !== undefined) return setor ?? `Nenhum setor tem o código ${setorId}`
  if (setoresDoEscopo === null) return 'Todos os setores'
  if (setoresDoEscopo.length === 0) return 'Nenhum: a sua conta ainda não tem setores'
  return `Os seus setores: ${setoresDoEscopo.join(', ')}`
}

/** Os filtros como o arquivo os mostra, um por linha: o rótulo e o valor. */
export function descreverFiltros(filtros: FiltrosDoArquivo): [string, string][] {
  const { inicio, fim, base, turnoId, turno, canal } = filtros
  return [
    ['Período', `${dataBrasileira(inicio)} a ${dataBrasileira(fim)}`],
    ['Data considerada', ROTULO_BASE[base]],
    ['Setor', descreverSetor(filtros)],
    ['Turno', turnoId === undefined ? 'Todos os turnos' : (turno ?? `Nenhum turno tem o código ${turnoId}`)],
    ['Canal', canal === undefined ? 'Todos os canais' : ROTULO_CANAL[canal]],
  ]
}

/** Os números do resumo, com o rótulo de cada um. */
export function indicadoresDoResumo(resumo: Resumo): [string, Numero][] {
  return [
    ['NPS', { valor: resumo.nps, tipo: 'inteiro' }],
    ['Respostas', { valor: resumo.total, tipo: 'contagem' }],
    [`Promotores (notas ${PROMOTOR_A_PARTIR_DE} e 10)`, { valor: resumo.promotores, tipo: 'contagem' }],
    [
      `Neutros (notas ${DETRATOR_ATE + 1} e ${PROMOTOR_A_PARTIR_DE - 1})`,
      { valor: resumo.neutros, tipo: 'contagem' },
    ],
    [`Detratores (notas 0 a ${DETRATOR_ATE})`, { valor: resumo.detratores, tipo: 'contagem' }],
    ['Avaliações com nota baixa ou baixíssima', { valor: resumo.notasBaixas, tipo: 'contagem' }],
    ['Avaliações com nota baixíssima', { valor: resumo.baixissimas, tipo: 'contagem' }],
    ['Média das notas de 1 a 5', { valor: resumo.mediaEscala, tipo: 'media' }],
  ]
}

/** Uma linha da tabela do NPS por setor: o nome e os números. */
export function linhaDoSetor({ setor, nps, total }: NpsSetor): [string, Numero, Numero] {
  return [setor, { valor: nps, tipo: 'inteiro' }, { valor: total, tipo: 'contagem' }]
}

/** Uma linha da tabela das categorias: o nome, a média, o % de notas boas (de 0 a 1) e o total de notas. */
export function linhaDaCategoria({
  categoria,
  media,
  percentual45,
  total,
}: IndicadorCategoria): [string, Numero, Numero, Numero] {
  return [
    categoria,
    { valor: media, tipo: 'media' },
    { valor: percentual45 === null ? null : percentual45 / 100, tipo: 'percentual' },
    { valor: total, tipo: 'contagem' },
  ]
}

const FORMATADORES: Record<TipoDeNumero, Intl.NumberFormat> = {
  inteiro: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0, useGrouping: false }),
  contagem: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
  media: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  percentual: new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }),
}

/** O número escrito como no Brasil: 42, 1.234, 4,3 e 67%; o que não existe, como `SEM_DADOS`. */
export function numeroBrasileiro({ valor, tipo }: Numero): string {
  return valor === null ? SEM_DADOS : FORMATADORES[tipo].format(valor)
}
