import { lerConfiguracoes } from '../../database/configuracoes'
import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'

/** O que a pesquisa usa de cada pergunta ativa: o que o paciente vê e a categoria que o item copia. */
const CAMPOS_DA_PERGUNTA = {
  id: true,
  categoriaId: true,
  texto: true,
  tipo: true,
  opcoes: true,
} satisfies Prisma.PerguntaSelect

export type PerguntaDaPesquisa = Prisma.PerguntaGetPayload<{ select: typeof CAMPOS_DA_PERGUNTA }>

/** O que se confere numa avaliação já gravada, ao receber a mesma chave de novo. */
const CAMPOS_DA_GRAVADA = {
  id: true,
  setorId: true,
  classificacao: true,
} satisfies Prisma.RespostaSelect

export type RespostaGravada = Prisma.RespostaGetPayload<{ select: typeof CAMPOS_DA_GRAVADA }>

/** A avaliação gravada com a chave dela, para casar o reenvio da pesquisa geral com cada setor do pedido. */
const CAMPOS_DA_GRAVADA_COM_CHAVE = {
  ...CAMPOS_DA_GRAVADA,
  chaveIdempotencia: true,
} satisfies Prisma.RespostaSelect

export type RespostaGravadaComChave = Prisma.RespostaGetPayload<{
  select: typeof CAMPOS_DA_GRAVADA_COM_CHAVE
}>

/** A ordem das perguntas na pesquisa; no empate, a mais antiga primeiro. */
const ORDEM_DAS_PERGUNTAS = [
  { ordem: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.PerguntaOrderByWithRelationInput[]

/** O token novo de uma avaliação já gravada, no reenvio. */
export interface TrocaDeToken {
  id: number
  tokenComplementoHash: string
  tokenComplementoExpiraEm: Date
}

/** Interrompe a transação da troca de tokens quando uma das avaliações já foi complementada. */
class TokenJaUsado extends Error {}

/** O que o complemento grava: o comentário, o pedido de retorno (com o telefone já cifrado) ou os dois. */
export interface NovoComplemento {
  comentario?: Pick<Prisma.ComentarioUncheckedCreateInput, 'tipo' | 'texto'>
  contato?: Pick<
    Prisma.ContatoRetornoUncheckedCreateInput,
    'telefoneCifrado' | 'telefoneFinal' | 'consentimentoEm'
  >
}

/** Uma avaliação nova, pronta para gravar, com os itens já copiados das perguntas. */
export type NovaResposta = Omit<Prisma.RespostaUncheckedCreateInput, 'itens' | 'id' | 'enviadoEm'> & {
  itens: Prisma.RespostaItemUncheckedCreateWithoutRespostaInput[]
}

export const pesquisaRepository = {
  buscarSetor(slug: string) {
    return prisma.setor.findUnique({
      where: { slug },
      select: { id: true, nome: true, slug: true, ativo: true },
    })
  },

  /**
   * As configurações do banco. Uma chave que falta, ou com valor de outro tipo, vale o padrão: a pesquisa não
   * para por causa de uma configuração errada. A leitura fica em `src/database/configuracoes.ts`, também usada
   * pelo detalhe das respostas.
   */
  lerConfiguracoes,

  /** As perguntas ativas do setor, na ordem; no empate, a mais antiga primeiro. */
  perguntasAtivas(setorId: number): Promise<PerguntaDaPesquisa[]> {
    return prisma.pergunta.findMany({
      where: { setorId, ativa: true },
      select: CAMPOS_DA_PERGUNTA,
      orderBy: [...ORDEM_DAS_PERGUNTAS],
    })
  },

  /** Pesquisa geral: os setores ativos, sem ordem, cada um com as perguntas ativas na ordem da pesquisa. */
  setoresAtivosComPerguntas() {
    return prisma.setor.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        slug: true,
        descricao: true,
        perguntas: { where: { ativa: true }, select: CAMPOS_DA_PERGUNTA, orderBy: [...ORDEM_DAS_PERGUNTAS] },
      },
    })
  },

  /** Os setores destes endereços, ativos ou não; o que não existe simplesmente não vem. */
  buscarSetores(slugs: string[]) {
    return prisma.setor.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, nome: true, slug: true, ativo: true },
    })
  },

  /** As perguntas ativas de cada setor, na ordem da pesquisa, numa consulta só. */
  async perguntasAtivasDosSetores(setorIds: number[]): Promise<Map<number, PerguntaDaPesquisa[]>> {
    const perguntas = await prisma.pergunta.findMany({
      where: { setorId: { in: setorIds }, ativa: true },
      select: { ...CAMPOS_DA_PERGUNTA, setorId: true },
      orderBy: [...ORDEM_DAS_PERGUNTAS],
    })
    const porSetor = new Map<number, PerguntaDaPesquisa[]>(setorIds.map((id) => [id, []]))
    for (const { setorId, ...pergunta } of perguntas) porSetor.get(setorId)?.push(pergunta)
    return porSetor
  },

  /** Todos os turnos, na ordem definida, sem a posição. */
  turnos() {
    return prisma.turno.findMany({
      select: { id: true, nome: true, horaInicio: true, horaFim: true },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    })
  },

  async turnoExiste(id: number): Promise<boolean> {
    return (await prisma.turno.count({ where: { id } })) > 0
  },

  buscarPorChave(chaveIdempotencia: string): Promise<RespostaGravada | null> {
    return prisma.resposta.findUnique({ where: { chaveIdempotencia }, select: CAMPOS_DA_GRAVADA })
  },

  /** Pesquisa geral: as avaliações já gravadas com estas chaves, sem ordem. */
  buscarPorChaves(chaves: string[]): Promise<RespostaGravadaComChave[]> {
    return prisma.resposta.findMany({
      where: { chaveIdempotencia: { in: chaves } },
      select: CAMPOS_DA_GRAVADA_COM_CHAVE,
    })
  },

  /** Grava a avaliação e os itens juntos. Lança o `P2002` do Prisma se a chave já foi usada. */
  async criar({ itens, ...resposta }: NovaResposta): Promise<RespostaGravada> {
    return prisma.resposta.create({
      data: { ...resposta, itens: { create: itens } },
      select: CAMPOS_DA_GRAVADA,
    })
  },

  /**
   * Pesquisa geral: grava as avaliações de todos os setores, com os itens, numa transação só, e as devolve na
   * mesma ordem. Se uma chave já foi usada, o `P2002` desfaz todas: ou o envio entra inteiro, ou nada entra.
   */
  criarVarias(respostas: NovaResposta[]): Promise<RespostaGravada[]> {
    return prisma.$transaction(
      respostas.map(({ itens, ...resposta }) =>
        prisma.resposta.create({
          data: { ...resposta, itens: { create: itens } },
          select: CAMPOS_DA_GRAVADA,
        }),
      ),
    )
  },

  /**
   * Pesquisa geral: troca os tokens de complemento de várias avaliações, numa transação só. Se uma delas já foi
   * complementada (o token usado fica sem hash), nenhuma troca vale e a função devolve `false`.
   */
  async trocarTokens(trocas: TrocaDeToken[]): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        for (const { id, ...token } of trocas) {
          const { count } = await tx.resposta.updateMany({
            where: { id, tokenComplementoHash: { not: null } },
            data: token,
          })
          if (count === 0) throw new TokenJaUsado()
        }
      })
      return true
    } catch (erro) {
      if (erro instanceof TokenJaUsado) return false
      throw erro
    }
  },

  /**
   * Troca o token de complemento, se o complemento ainda não foi feito: o token usado fica sem hash (ticket
   * 11). Devolve `false` quando não havia token para trocar.
   */
  async trocarToken(
    id: number,
    tokenComplementoHash: string,
    tokenComplementoExpiraEm: Date,
  ): Promise<boolean> {
    const { count } = await prisma.resposta.updateMany({
      where: { id, tokenComplementoHash: { not: null } },
      data: { tokenComplementoHash, tokenComplementoExpiraEm },
    })
    return count > 0
  },

  /**
   * Usa o token e grava o complemento, numa transação só. O token só vale se for desta avaliação e estiver no
   * prazo; usado, perde o hash e a validade. O `updateMany` vira um `UPDATE` só, que confere o hash e o prazo
   * na mesma instrução que os apaga: num segundo uso ao mesmo tempo, o PostgreSQL espera o primeiro terminar,
   * confere de novo e não acha mais o token. Devolve `false`, sem gravar nada, quando o token não valia.
   */
  complementar(
    id: number,
    tokenComplementoHash: string,
    agora: Date,
    { comentario, contato }: NovoComplemento,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.resposta.updateMany({
        where: { id, tokenComplementoHash, tokenComplementoExpiraEm: { gt: agora } },
        data: { tokenComplementoHash: null, tokenComplementoExpiraEm: null },
      })
      if (count === 0) return false

      if (comentario) await tx.comentario.create({ data: { respostaId: id, ...comentario } })
      if (contato) await tx.contatoRetorno.create({ data: { respostaId: id, ...contato } })
      return true
    })
  },
}
