/** Nota de 0 a 10 a partir da qual quem respondeu é promotor (9 e 10). */
export const PROMOTOR_A_PARTIR_DE = 9

/** Nota de 0 a 10 até a qual quem respondeu é detrator (0 a 6). Entre as duas, 7 e 8, fica o neutro. */
export const DETRATOR_ATE = 6

/** As contagens de que o NPS precisa, como saem das consultas do dashboard. */
export interface ContagemDoNps {
  total: number
  promotores: number
  detratores: number
}

/**
 * O NPS: a % de promotores menos a % de detratores, de -100 a 100, arredondado para o inteiro mais próximo
 * (o meio vai para longe do zero, como o `round` do PostgreSQL: 12,5 dá 13, e -12,5 dá -13). Sem respostas, é
 * `null`. É a única regra de NPS da API: as consultas só contam, e o front exibe o que ela devolve.
 *
 * A conta é feita em inteiros, para o meio não depender do arredondamento do ponto flutuante.
 */
export function calcularNps({ total, promotores, detratores }: ContagemDoNps): number | null {
  if (total === 0) return null
  const diferenca = promotores - detratores
  const arredondado = Math.floor((200 * Math.abs(diferenca) + total) / (2 * total))
  // Sem o `arredondado > 0`, uma diferença negativa pequena daria -0.
  return diferenca < 0 && arredondado > 0 ? -arredondado : arredondado
}
