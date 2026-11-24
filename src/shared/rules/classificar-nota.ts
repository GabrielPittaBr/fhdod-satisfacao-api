import type { Classificacao as ClassificacaoDoBanco } from '../../generated/prisma/enums'
import type { Configuracoes } from '../constants/configuracoes'

/**
 * Classificações de uma avaliação, da mais leve à mais grave, as mesmas do tipo `classificacao` do banco. A
 * lista fica aqui, e não só no cliente do Prisma, porque os schemas e a documentação não importam o Prisma.
 */
export const CLASSIFICACOES = [
  'NORMAL',
  'BAIXA',
  'BAIXISSIMA',
] as const satisfies readonly ClassificacaoDoBanco[]

export type Classificacao = (typeof CLASSIFICACOES)[number]

/** Os limites de nota baixa, lidos das configurações. */
export type LimitesDeNota = Pick<
  Configuracoes,
  'nps_limite_baixa' | 'nps_limite_baixissima' | 'escala_limite_baixa' | 'escala_limite_baixissima'
>

/** A posição em `CLASSIFICACOES`: até o limite da baixíssima é 2, até o da baixa é 1, acima dele é 0. */
function gravidade(valor: number, limiteBaixissima: number, limiteBaixa: number): number {
  if (valor <= limiteBaixissima) return 2
  if (valor <= limiteBaixa) return 1
  return 0
}

/**
 * Classifica uma avaliação: vale a pior entre a do NPS (0 a 10) e a de cada nota de 1 a 5 ("Configurações do
 * sistema", no plano). É a única regra de nota baixa da API; o front exibe o que ela devolve.
 */
export function classificarNota(
  nps: number,
  notas: readonly number[],
  limites: LimitesDeNota,
): Classificacao {
  const pior = Math.max(
    gravidade(nps, limites.nps_limite_baixissima, limites.nps_limite_baixa),
    ...notas.map((nota) => gravidade(nota, limites.escala_limite_baixissima, limites.escala_limite_baixa)),
  )
  return CLASSIFICACOES[pior]
}

/**
 * Classifica uma nota de 1 a 5 sozinha, com os limites da escala: a de cada item no detalhe de uma resposta.
 * É a mesma conta que o `classificarNota` faz com cada nota.
 */
export function classificarNotaDaEscala(
  nota: number,
  limites: Pick<LimitesDeNota, 'escala_limite_baixa' | 'escala_limite_baixissima'>,
): Classificacao {
  return CLASSIFICACOES[gravidade(nota, limites.escala_limite_baixissima, limites.escala_limite_baixa)]
}
