/**
 * Configurações do sistema, com os valores padrão da tabela "Configurações do sistema" do plano. O seed base
 * grava estes valores na tabela `configuracoes` (em JSONB) na primeira instalação; daí em diante, vale o que
 * estiver no banco.
 */
export interface Configuracoes {
  /** NPS até este valor é avaliação baixa. */
  nps_limite_baixa: number
  /** NPS até este valor é avaliação baixíssima. */
  nps_limite_baixissima: number
  /** Nota de 1 a 5 até este valor é baixa. */
  escala_limite_baixa: number
  /** Nota de 1 a 5 até este valor é baixíssima. */
  escala_limite_baixissima: number
  /** Espera, em segundos, antes de o totem reiniciar a pesquisa (de 10 a 15). */
  totem_reinicio_segundos: number
  /** Segundos sem toque até o totem perguntar se a pessoa ainda está lá. */
  totem_inatividade_segundos: number
  /** Tamanho máximo dos comentários, em caracteres. */
  texto_limite_caracteres: number
  /** Texto da pergunta do NPS. */
  nps_texto: string
}

export type ChaveConfiguracao = keyof Configuracoes

export const CONFIGURACOES_PADRAO: Readonly<Configuracoes> = Object.freeze({
  nps_limite_baixa: 6,
  nps_limite_baixissima: 2,
  escala_limite_baixa: 3,
  escala_limite_baixissima: 1,
  totem_reinicio_segundos: 15,
  totem_inatividade_segundos: 60,
  texto_limite_caracteres: 500,
  nps_texto: 'De 0 a 10, qual a probabilidade de você recomendar o hospital a alguém?',
})
