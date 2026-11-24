/**
 * O fuso do hospital. Os instantes ficam no banco em UTC, e o dia de cada um (o do envio, o de "hoje") é o do
 * horário de Brasília: os relatórios convertem com `AT TIME ZONE`, e o código, com o `Intl`.
 */
export const FUSO_DE_BRASILIA = 'America/Sao_Paulo'
