import { FUSO_DE_BRASILIA } from '../constants/fuso-horario'

// Contas com os dias do calendário, em `AAAA-MM-DD`. O dia não tem hora nem fuso: as contas andam de dia em dia,
// sem passar por horas, e por isso nenhuma mudança de fuso no meio desloca o resultado. O dia de hoje é o do
// horário de Brasília.

const MS_POR_DIA = 86_400_000

/** Hoje no horário de Brasília, como `AAAA-MM-DD`: o dia vira à meia-noite de Brasília, e não à de UTC. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_DE_BRASILIA }).format(agora)
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
