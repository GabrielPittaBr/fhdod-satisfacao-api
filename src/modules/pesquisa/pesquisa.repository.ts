import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import { CONFIGURACOES_PADRAO, type Configuracoes } from '../../shared/constants/configuracoes'

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
   * As configurações do banco. Uma chave que falta, ou com valor de outro tipo, vale o padrão de
   * `CONFIGURACOES_PADRAO`: a pesquisa não para por causa de uma configuração errada.
   */
  async lerConfiguracoes(): Promise<Configuracoes> {
    const linhas = await prisma.configuracao.findMany({ select: { chave: true, valor: true } })
    const noBanco = new Map(linhas.map(({ chave, valor }) => [chave, valor]))
    return Object.fromEntries(
      Object.entries(CONFIGURACOES_PADRAO).map(([chave, padrao]) => {
        const valor = noBanco.get(chave)
        return [chave, typeof valor === typeof padrao ? valor : padrao]
      }),
    ) as unknown as Configuracoes
  },

  /** As perguntas ativas do setor, na ordem; no empate, a mais antiga primeiro. */
  perguntasAtivas(setorId: number): Promise<PerguntaDaPesquisa[]> {
    return prisma.pergunta.findMany({
      where: { setorId, ativa: true },
      select: CAMPOS_DA_PERGUNTA,
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    })
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

  /** Grava a avaliação e os itens juntos. Lança o `P2002` do Prisma se a chave já foi usada. */
  async criar({ itens, ...resposta }: NovaResposta): Promise<RespostaGravada> {
    return prisma.resposta.create({
      data: { ...resposta, itens: { create: itens } },
      select: CAMPOS_DA_GRAVADA,
    })
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
}
