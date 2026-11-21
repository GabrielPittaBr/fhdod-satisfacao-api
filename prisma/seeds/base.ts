import type { PrismaClient } from '../../src/generated/prisma/client'
import { CONFIGURACOES_PADRAO } from '../../src/shared/constants/configuracoes'

/** As etapas do plano, comparáveis entre setores, na ordem da jornada do paciente. */
export const CATEGORIAS_INICIAIS = [
  'Recepção',
  'Triagem',
  'Enfermagem',
  'Médico',
  'Higiene e Limpeza',
  'Estrutura',
  'Tempo de Espera',
] as const

/**
 * Turnos provisórios: os horários oficiais dependem do hospital ("Riscos e pontos em aberto", no plano). O da
 * noite termina antes de começar, porque passa da meia-noite.
 */
export const TURNOS_PROVISORIOS = [
  { nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00' },
  { nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00' },
  { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' },
] as const

/** Quantos registros o seed criou em cada tabela: zero onde não havia nada a criar. */
export interface ResultadoDoSeedBase {
  categorias: number
  turnos: number
  configuracoes: number
}

/**
 * Seed base: o mínimo para o sistema funcionar. Pode rodar em produção e quantas vezes for preciso, porque
 * nunca muda nem apaga o que já existe:
 * - categorias e turnos só entram com a tabela vazia, na primeira instalação. Depois, quem cuida deles é o
 *   Super Admin: uma categoria renomeada não volta com o nome antigo, e um turno com o horário oficial não
 *   volta ao provisório;
 * - cada configuração entra só se a chave ainda não existe. Um valor alterado continua valendo, e a
 *   configuração que uma versão nova trouxer entra sozinha.
 *
 * Roda numa transação: se algo falhar, nada fica pela metade.
 */
export async function semearBase(prisma: PrismaClient): Promise<ResultadoDoSeedBase> {
  return prisma.$transaction(async (tx) => {
    const categorias =
      (await tx.categoria.count()) > 0
        ? 0
        : (
            await tx.categoria.createMany({
              data: CATEGORIAS_INICIAIS.map((nome, indice) => ({ nome, ordem: indice + 1 })),
            })
          ).count

    const turnos =
      (await tx.turno.count()) > 0
        ? 0
        : (
            await tx.turno.createMany({
              data: TURNOS_PROVISORIOS.map((turno, indice) => ({ ...turno, ordem: indice + 1 })),
            })
          ).count

    const { count: configuracoes } = await tx.configuracao.createMany({
      data: Object.entries(CONFIGURACOES_PADRAO).map(([chave, valor]) => ({ chave, valor })),
      skipDuplicates: true,
    })

    return { categorias, turnos, configuracoes }
  })
}
