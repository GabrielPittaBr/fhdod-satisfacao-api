import { linhaDeAuditoria, type Autor } from '../../database/auditoria'
import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import { TIPO_COM_OPCOES } from '../../shared/constants/tipos-de-pergunta'
import type { ConteudoDaPergunta, Pergunta } from './perguntas.schemas'

// Linhas da auditoria: as mudanças nas perguntas são ações sensíveis ("Modelo de dados", no plano).
const ENTIDADE = 'perguntas'

/** Os campos gravados da pergunta. O `temRespostas` do contrato vem dos itens das respostas. */
const CAMPOS = {
  id: true,
  setorId: true,
  categoriaId: true,
  texto: true,
  tipo: true,
  opcoes: true,
  ordem: true,
  ativa: true,
} satisfies Prisma.PerguntaSelect

type PerguntaGravada = Prisma.PerguntaGetPayload<{ select: typeof CAMPOS }>

/** Onde está cada pergunta do setor: o ID e a posição gravada. */
export interface Posicao {
  id: number
  ordem: number
}

/** Ativas e inativas, na ordem; no empate, a mais antiga primeiro. */
const NA_ORDEM = [{ ordem: 'asc' }, { id: 'asc' }] satisfies Prisma.PerguntaOrderByWithRelationInput[]

/** A pergunta no formato do contrato: o banco guarda a lista vazia nos tipos sem opções, e a API devolve `null`. */
function paraContrato(
  { id, setorId, categoriaId, texto, tipo, opcoes, ordem, ativa }: PerguntaGravada,
  temRespostas: boolean,
): Pergunta {
  return {
    id,
    setorId,
    categoriaId,
    texto,
    tipo,
    opcoes: tipo === TIPO_COM_OPCOES ? opcoes : null,
    ordem,
    ativa,
    temRespostas,
  }
}

/** O que se grava de uma pergunta nova ou editada. */
function gravavel({ texto, categoriaId, tipo, opcoes }: ConteudoDaPergunta) {
  return { texto, categoriaId, tipo, opcoes: opcoes ?? [] }
}

/** O conteúdo de uma pergunta, para a auditoria. */
function conteudo({ texto, categoriaId, tipo, opcoes }: ConteudoDaPergunta): ConteudoDaPergunta {
  return { texto, categoriaId, tipo, opcoes }
}

export const perguntasRepository = {
  async setorExiste(setorId: number): Promise<boolean> {
    return (await prisma.setor.count({ where: { id: setorId } })) > 0
  },

  buscarCategoria(id: number): Promise<{ ativa: boolean } | null> {
    return prisma.categoria.findUnique({ where: { id }, select: { ativa: true } })
  },

  /**
   * As perguntas do setor, ativas e inativas, na ordem. Quais já têm respostas sai de uma segunda consulta,
   * que só pergunta se existe algum item de cada uma (`some`) e usa o índice de `resposta_itens.pergunta_id`,
   * sem contar os itens.
   */
  async listar(setorId: number): Promise<Pergunta[]> {
    const [perguntas, respondidas] = await Promise.all([
      prisma.pergunta.findMany({ where: { setorId }, select: CAMPOS, orderBy: NA_ORDEM }),
      prisma.pergunta.findMany({ where: { setorId, itens: { some: {} } }, select: { id: true } }),
    ])
    const comRespostas = new Set(respondidas.map(({ id }) => id))
    return perguntas.map((pergunta) => paraContrato(pergunta, comRespostas.has(pergunta.id)))
  },

  async buscar(id: number): Promise<Pergunta | null> {
    const [pergunta, item] = await Promise.all([
      prisma.pergunta.findUnique({ where: { id }, select: CAMPOS }),
      prisma.respostaItem.findFirst({ where: { perguntaId: id }, select: { id: true } }),
    ])
    return pergunta && paraContrato(pergunta, item !== null)
  },

  /** Cria a pergunta, ativa, no fim da ordem do setor (a maior posição + 1), e registra na auditoria. */
  criar(setorId: number, nova: ConteudoDaPergunta, autor: Autor): Promise<Pergunta> {
    return prisma.$transaction(async (tx) => {
      const { _max } = await tx.pergunta.aggregate({ where: { setorId }, _max: { ordem: true } })
      const pergunta = await tx.pergunta.create({
        data: { setorId, ...gravavel(nova), ordem: (_max.ordem ?? 0) + 1 },
        select: CAMPOS,
      })
      await tx.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'criacao_de_pergunta',
          entidade: ENTIDADE,
          entidadeId: pergunta.id,
          dados: { setorId, ...conteudo(nova) },
        }),
      })
      return paraContrato(pergunta, false)
    })
  },

  /** Troca o texto, a categoria, o tipo e as opções, e registra o antes e o depois na auditoria. */
  editar(atual: Pergunta, nova: ConteudoDaPergunta, autor: Autor): Promise<Pergunta> {
    return prisma.$transaction(async (tx) => {
      const pergunta = await tx.pergunta.update({
        where: { id: atual.id },
        data: gravavel(nova),
        select: CAMPOS,
      })
      await tx.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'edicao_de_pergunta',
          entidade: ENTIDADE,
          entidadeId: atual.id,
          dados: { setorId: atual.setorId, antes: conteudo(atual), depois: conteudo(nova) },
        }),
      })
      return paraContrato(pergunta, atual.temRespostas)
    })
  },

  /** As perguntas do setor na ordem atual, com a posição gravada de cada uma. */
  posicoes(setorId: number): Promise<Posicao[]> {
    return prisma.pergunta.findMany({
      where: { setorId },
      select: { id: true, ordem: true },
      orderBy: NA_ORDEM,
    })
  },

  /**
   * Grava a nova ordem, tudo ou nada: cada pergunta vai para a posição dela na lista (1, 2, 3...), e só as
   * que mudam de posição são gravadas. A auditoria guarda a ordem de antes e a de depois.
   */
  async ordenar(setorId: number, atuais: Posicao[], ids: number[], autor: Autor): Promise<void> {
    const posicaoAtual = new Map(atuais.map(({ id, ordem }) => [id, ordem]))
    const mudancas = ids.flatMap((id, indice) =>
      posicaoAtual.get(id) === indice + 1 ? [] : [{ id, ordem: indice + 1 }],
    )
    await prisma.$transaction([
      ...mudancas.map(({ id, ordem }) => prisma.pergunta.update({ where: { id }, data: { ordem } })),
      prisma.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'reordenacao_de_perguntas',
          entidade: ENTIDADE,
          entidadeId: null,
          dados: { setorId, antes: atuais.map(({ id }) => id), depois: ids },
        }),
      }),
    ])
  },

  /** Ativa ou desativa, e registra na auditoria. */
  async alterarStatus(pergunta: Pergunta, ativa: boolean, autor: Autor): Promise<void> {
    await prisma.$transaction([
      prisma.pergunta.update({ where: { id: pergunta.id }, data: { ativa } }),
      prisma.auditoria.create({
        data: linhaDeAuditoria(autor, {
          acao: 'alteracao_de_status_de_pergunta',
          entidade: ENTIDADE,
          entidadeId: pergunta.id,
          dados: { setorId: pergunta.setorId, ativa },
        }),
      }),
    ])
  },
}
