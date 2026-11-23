import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import type { DadosDoTurno, Turno } from './turnos.schemas'

/** Os campos do `Turno` do contrato. */
const CAMPOS = {
  id: true,
  nome: true,
  horaInicio: true,
  horaFim: true,
  ordem: true,
} satisfies Prisma.TurnoSelect

export const turnosRepository = {
  /** Todos os turnos, na ordem definida; no empate, o mais antigo primeiro. */
  listar(): Promise<Turno[]> {
    return prisma.turno.findMany({ select: CAMPOS, orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })
  },

  /** Cria o turno no fim da ordem. */
  async criar(dados: DadosDoTurno): Promise<Turno> {
    const { _max } = await prisma.turno.aggregate({ _max: { ordem: true } })
    return prisma.turno.create({ data: { ...dados, ordem: (_max.ordem ?? 0) + 1 }, select: CAMPOS })
  },

  /** Troca o nome e os horários. Lança o erro `P2025` do Prisma se o turno não existir. */
  editar(id: number, dados: DadosDoTurno): Promise<Turno> {
    return prisma.turno.update({ where: { id }, data: dados, select: CAMPOS })
  },
}
