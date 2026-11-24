import { FUSO_DE_BRASILIA } from '../constants/fuso-horario'

// Contas com os dias do calendário, em `AAAA-MM-DD`. O dia não tem hora nem fuso: as contas andam de dia em dia,
// sem passar por horas, e por isso nenhuma mudança de fuso no meio desloca o resultado. O dia de hoje é o do
// horário de Brasília.

const MS_POR_DIA = 86_400_000

/** Hoje no horário de Brasília, como `AAAA-MM-DD`: o dia vira à meia-noite de Brasília, e não à de UTC. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DE_BRASILIA }).format(agora)
}

/** Data e hora no relógio de Brasília, em partes numéricas. O `h23` evita o "24" que alguns motores dão à meia-noite. */
const RELOGIO_DE_BRASILIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DE_BRASILIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * O instante como o relógio de Brasília o mostrava, num `Date` com esses números em UTC: às 02h30 de 11/11 em UTC,
 * devolve 23h30 de 10/11. É o que uma planilha precisa, porque a data e a hora dela não têm fuso: o Excel mostra o
 * que recebe. A conversão vem do `Intl`, e não de três horas a menos fixas: vale também para as datas do horário
 * de verão, que o Brasil teve até 2019.
 */
export function horarioDeBrasilia(instante: Date): Date {
  const partes = Object.fromEntries(
    RELOGIO_DE_BRASILIA.formatToParts(instante).map(({ type, value }) => [type, Number(value)]),
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, number>>
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = partes
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, instante.getUTCMilliseconds()))
}

/** `AAAA-MM-DD` em dias desde 1970-01-01, sem fuso: só a data conta. */
export function diaDoCalendario(data: string): number {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number)
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA
}

/** O contrário do `diaDoCalendario`: o dia, contado desde 1970-01-01, em `AAAA-MM-DD`. */
export function dataDoDia(dia: number): string {
  return new Date(dia * MS_POR_DIA).toISOString().slice(0, 10)
}

/** A segunda-feira da semana de um dia, em dias desde 1970-01-01 (que foi uma quinta). */
export function segundaDaSemana(dia: number): number {
  // O `%` do JavaScript é negativo antes de 1970: o `+ 7` o traz de volta para 0 a 6.
  return dia - ((((dia + 3) % 7) + 7) % 7)
}

/** O dia `AAAA-MM-DD` mais `dias` dias; com `dias` negativo, antes dele. */
export function somarDias(data: string, dias: number): string {
  return dataDoDia(diaDoCalendario(data) + dias)
}

/** O dia 1 do mês de um dia `AAAA-MM-DD`. */
export function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 8)}01`
}
