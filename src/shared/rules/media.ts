/**
 * A média de notas positivas, com uma casa decimal (o meio vai para cima: 4,25 dá 4,3), a partir da soma e da
 * quantidade, como saem das consultas. Sem notas, é `null`. A conta é feita em inteiros, para o meio não
 * depender do arredondamento do ponto flutuante.
 */
export function mediaComUmaCasa(soma: number, quantidade: number): number | null {
  if (quantidade === 0) return null
  return Math.floor((20 * soma + quantidade) / (2 * quantidade)) / 10
}
