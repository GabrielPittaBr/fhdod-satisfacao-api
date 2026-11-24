import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/database/prisma'
import type { Canal, Classificacao, TipoComentario } from '../../src/generated/prisma/enums'
import { digitosDoTelefone, finalDoTelefone } from '../../src/shared/rules/telefone'
import { cifrar } from '../../src/shared/security/crypto'
import { criarTurno } from './turnos'

export interface DadosDaResposta {
  setorId: number
  /** Sem turno, a factory cria um. */
  turnoId?: number
  nps?: number
  /** As perguntas respondidas: cada uma vira um item, com o texto, o tipo e a categoria copiados dela. */
  perguntaIds?: number[]
  /** A nota dos itens de escala de 1 a 5. Padrão: 4. */
  nota?: number
  /** Padrão: `WEB`. */
  canal?: Canal
  /** O dia do atendimento, em `AAAA-MM-DD`. Padrão: 2026-11-20. */
  dataAtendimento?: string
  /** O instante do envio, em ISO com o fuso (`2026-11-11T02:30:00Z`). Padrão: agora, como no banco. */
  enviadoEm?: string
  /** Padrão: `NORMAL`, sem passar pelo `classificarNota`. */
  classificacao?: Classificacao
  /** O comentário do complemento. Padrão: nenhum. */
  comentario?: { tipo: TipoComentario; texto: string }
  /**
   * O pedido de retorno do complemento, gravado como a pesquisa grava: os dígitos cifrados e os 4 últimos em
   * claro. O consentimento, em ISO com o fuso, é o instante do envio se o teste não pedir outro. Padrão: nenhum.
   */
  contato?: { telefone: string; consentimentoEm?: string }
}

/** O pedido de retorno como o complemento grava: os dígitos cifrados e os 4 últimos em claro. */
function pedidoDeRetorno(
  { telefone, consentimentoEm }: NonNullable<DadosDaResposta['contato']>,
  enviadoEm: string | undefined,
) {
  const digitos = digitosDoTelefone(telefone)
  return {
    telefoneCifrado: cifrar(digitos),
    telefoneFinal: finalDoTelefone(digitos),
    consentimentoEm: new Date(consentimentoEm ?? enviadoEm ?? Date.now()),
  }
}

/**
 * Cria uma resposta de teste enviada pela web, com um item para cada pergunta, como a pesquisa grava: a nota
 * 4 (ou a `nota` pedida) na escala de 1 a 5, a primeira opção na múltipla escolha, `SIM` no sim ou não e "Sim"
 * no texto livre. A classificação é a pedida, ou `NORMAL`, sem passar pelo `classificarNota`.
 */
export async function criarResposta({
  setorId,
  turnoId,
  nps = 9,
  perguntaIds = [],
  nota = 4,
  canal = 'WEB',
  dataAtendimento = '2026-11-20',
  enviadoEm,
  classificacao = 'NORMAL',
  comentario,
  contato,
}: DadosDaResposta) {
  const perguntas = await prisma.pergunta.findMany({ where: { id: { in: perguntaIds } } })
  return prisma.resposta.create({
    data: {
      setorId,
      canal,
      dataAtendimento: new Date(`${dataAtendimento}T00:00:00Z`),
      turnoId: turnoId ?? (await criarTurno()).id,
      nps,
      classificacao,
      ...(enviadoEm !== undefined && { enviadoEm: new Date(enviadoEm) }),
      ...(comentario !== undefined && { comentario: { create: comentario } }),
      ...(contato !== undefined && { contato: { create: pedidoDeRetorno(contato, enviadoEm) } }),
      chaveIdempotencia: randomUUID(),
      itens: {
        create: perguntas.map(({ id, categoriaId, texto, tipo, opcoes }) => ({
          perguntaId: id,
          categoriaId,
          perguntaTexto: texto,
          tipo,
          valorNumero: tipo === 'ESCALA_1_5' ? nota : null,
          valorTexto: tipo === 'ESCALA_1_5' ? null : tipo === 'SIM_NAO' ? 'SIM' : (opcoes[0] ?? 'Sim'),
        })),
      },
    },
  })
}
