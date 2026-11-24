import { mediaComUmaCasa } from './media'

/** Nota de 1 a 5 a partir da qual a avaliação é boa: o "% de notas 4 e 5" dos indicadores. */
export const NOTA_BOA_A_PARTIR_DE = 4

/** As contagens das notas de 1 a 5 de um grupo (uma categoria, um ponto), como saem das consultas. */
export interface ContagemDasNotas {
  /** Quantas notas. */
  quantidade: number
  soma: number
  /** Quantas são 4 ou 5. */
  boas: number
}

export interface IndicadoresDasNotas {
  /** Média com uma casa decimal; `null` sem notas. */
  media: number | null
  /** % de notas 4 e 5, arredondado; `null` sem notas. */
  percentual45: number | null
  /** Quantas notas. */
  total: number
}

/**
 * A % de `parte` em `total`, arredondada para o inteiro mais próximo (o meio vai para cima: 12,5% dá 13%);
 * `null` com o total 0. A conta é feita em inteiros, para o meio não depender do ponto flutuante.
 */
export function percentualInteiro(parte: number, total: number): number | null {
  if (total === 0) return null
  return Math.floor((200 * parte + total) / (2 * total))
}

/**
 * A média e o % de notas 4 e 5 de um grupo de notas da escala. É a conta das categorias, do ranking, dos
 * destaques da TV e das exportações: as consultas só contam.
 */
export function indicadoresDasNotas({ quantidade, soma, boas }: ContagemDasNotas): IndicadoresDasNotas {
  return {
    media: mediaComUmaCasa(soma, quantidade),
    percentual45: percentualInteiro(boas, quantidade),
    total: quantidade,
  }
}
