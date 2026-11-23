import { prisma } from '../../src/database/prisma'

let criados = 0

export interface DadosDoTurno {
  nome?: string
  horaInicio?: string
  horaFim?: string
  ordem?: number
}

/** Cria um turno de teste: das 07:00 às 13:00, se o teste não pedir outro horário. */
export async function criarTurno({
  nome,
  horaInicio = '07:00',
  horaFim = '13:00',
  ordem,
}: DadosDoTurno = {}) {
  criados += 1
  return prisma.turno.create({
    data: { nome: nome ?? `Turno de Teste ${criados}`, horaInicio, horaFim, ordem: ordem ?? criados },
  })
}
