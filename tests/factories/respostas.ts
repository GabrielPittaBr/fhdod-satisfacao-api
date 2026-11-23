import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/database/prisma'
import { criarTurno } from './turnos'

export interface DadosDaResposta {
  setorId: number
  /** Sem turno, a factory cria um. */
  turnoId?: number
  nps?: number
  /** As perguntas respondidas: cada uma vira um item, com o texto, o tipo e a categoria copiados dela. */
  perguntaIds?: number[]
}

/**
 * Cria uma resposta de teste enviada pela web, com um item para cada pergunta, como a pesquisa grava: a nota
 * 4 na escala de 1 a 5, a primeira opção na múltipla escolha e "Sim" nos outros tipos. A classificação é
 * sempre `NORMAL`; a regra que a calcula é da pesquisa (ticket 10).
 */
export async function criarResposta({ setorId, turnoId, nps = 9, perguntaIds = [] }: DadosDaResposta) {
  const perguntas = await prisma.pergunta.findMany({ where: { id: { in: perguntaIds } } })
  return prisma.resposta.create({
    data: {
      setorId,
      canal: 'WEB',
      dataAtendimento: new Date('2026-11-20T00:00:00Z'),
      turnoId: turnoId ?? (await criarTurno()).id,
      nps,
      classificacao: 'NORMAL',
      chaveIdempotencia: randomUUID(),
      itens: {
        create: perguntas.map(({ id, categoriaId, texto, tipo, opcoes }) => ({
          perguntaId: id,
          categoriaId,
          perguntaTexto: texto,
          tipo,
          valorNumero: tipo === 'ESCALA_1_5' ? 4 : null,
          valorTexto: tipo === 'ESCALA_1_5' ? null : (opcoes[0] ?? 'Sim'),
        })),
      },
    },
  })
}
