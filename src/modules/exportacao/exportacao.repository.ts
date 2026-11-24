import { linhaDeAuditoria, type Autor } from '../../database/auditoria'
import { condicoesDoPainel } from '../../database/filtros-do-painel'
import { prisma } from '../../database/prisma'
import type { Prisma } from '../../generated/prisma/client'
import type { TipoComentario } from '../../shared/constants/tipos-de-comentario'
import type { TipoPergunta } from '../../shared/constants/tipos-de-pergunta'
import type { Canal } from '../../shared/http/canal'
import type { FiltrosDoPainel } from '../../shared/http/filtros-do-painel'
import type { Classificacao } from '../../shared/rules/classificar-nota'

// As consultas das exportações. As respostas de um arquivo saem de uma consulta só, com os filtros e o escopo do
// painel (`condicoesDoPainel`); as abas leem depois as respostas, os itens e os comentários dessa lista em lotes,
// pelos IDs, para a memória do servidor não depender do tamanho do período. Todas as abas seguem a ordem da
// lista: do envio mais recente para o mais antigo e, no mesmo instante, o ID maior primeiro.

/** A linha da auditoria de uma exportação fica na tabela de onde os dados saíram. */
const ENTIDADE = 'respostas'

/** Uma resposta do arquivo e, só para quem tem `contatos:ver`, o telefone cifrado do pedido de retorno. */
export interface RespostaDoArquivo {
  id: number
  telefoneCifrado: string | null
}

/** Uma resposta na aba Respostas. */
export interface RespostaExportada {
  id: number
  setor: string
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  turno: string
  canal: Canal
  enviadoEm: Date
  nps: number
  classificacao: Classificacao
  tipoDoComentario: TipoComentario | null
  pediuRetorno: boolean
}

/** Uma pergunta respondida na aba Itens, com o texto, o tipo e a categoria do momento da resposta. */
export interface ItemExportado {
  respostaId: number
  setor: string
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  pergunta: string
  categoria: string
  tipo: TipoPergunta
  valorNumero: number | null
  valorTexto: string | null
}

/** Um comentário na aba Comentários. */
export interface ComentarioExportado {
  respostaId: number
  setor: string
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  enviadoEm: Date
  tipo: TipoComentario
  texto: string
  classificacao: Classificacao
}

export const exportacaoRepository = {
  /**
   * As respostas dos filtros e do escopo, na ordem do arquivo. Com `comTelefones`, junto vem o telefone cifrado
   * de cada pedido de retorno; sem ele, a consulta nem lê a tabela dos pedidos.
   */
  respostasDoArquivo(
    filtros: FiltrosDoPainel,
    setorIds: readonly number[] | null,
    comTelefones: boolean,
  ): Promise<RespostaDoArquivo[]> {
    const condicoes = condicoesDoPainel(filtros, setorIds)
    return comTelefones
      ? prisma.$queryRaw<RespostaDoArquivo[]>`
          SELECT r.id, cr.telefone_cifrado AS "telefoneCifrado"
          FROM respostas r
          LEFT JOIN contatos_retorno cr ON cr.resposta_id = r.id
          WHERE ${condicoes}
          ORDER BY r.enviado_em DESC, r.id DESC`
      : prisma.$queryRaw<RespostaDoArquivo[]>`
          SELECT r.id, NULL::text AS "telefoneCifrado"
          FROM respostas r
          WHERE ${condicoes}
          ORDER BY r.enviado_em DESC, r.id DESC`
  },

  /** Um lote de respostas pelos IDs, na ordem do arquivo, sem o telefone. */
  respostas(ids: readonly number[]): Promise<RespostaExportada[]> {
    return prisma.$queryRaw<RespostaExportada[]>`
      SELECT r.id, s.nome AS setor, to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento",
             t.nome AS turno, r.canal::text AS canal, r.enviado_em AS "enviadoEm", r.nps::int AS nps,
             r.classificacao::text AS classificacao, co.tipo::text AS "tipoDoComentario",
             (cr.id IS NOT NULL) AS "pediuRetorno"
      FROM respostas r
      JOIN setores s ON s.id = r.setor_id
      JOIN turnos t ON t.id = r.turno_id
      LEFT JOIN comentarios co ON co.resposta_id = r.id
      LEFT JOIN contatos_retorno cr ON cr.resposta_id = r.id
      WHERE r.id = ANY(${[...ids]}::int[])
      ORDER BY r.enviado_em DESC, r.id DESC`
  },

  /**
   * Os itens de um lote de respostas, na ordem do arquivo e, dentro de cada resposta, na ordem em que foram
   * gravados (a que o paciente viu).
   */
  itens(ids: readonly number[]): Promise<ItemExportado[]> {
    return prisma.$queryRaw<ItemExportado[]>`
      SELECT i.resposta_id AS "respostaId", s.nome AS setor,
             to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento", i.pergunta_texto AS pergunta,
             c.nome AS categoria, i.tipo::text AS tipo, i.valor_numero::int AS "valorNumero",
             i.valor_texto AS "valorTexto"
      FROM resposta_itens i
      JOIN respostas r ON r.id = i.resposta_id
      JOIN setores s ON s.id = r.setor_id
      JOIN categorias c ON c.id = i.categoria_id
      WHERE i.resposta_id = ANY(${[...ids]}::int[])
      ORDER BY r.enviado_em DESC, r.id DESC, i.id`
  },

  /** Os comentários de um lote de respostas, na ordem do arquivo. */
  comentarios(ids: readonly number[]): Promise<ComentarioExportado[]> {
    return prisma.$queryRaw<ComentarioExportado[]>`
      SELECT co.resposta_id AS "respostaId", s.nome AS setor,
             to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento", r.enviado_em AS "enviadoEm",
             co.tipo::text AS tipo, co.texto, r.classificacao::text AS classificacao
      FROM comentarios co
      JOIN respostas r ON r.id = co.resposta_id
      JOIN setores s ON s.id = r.setor_id
      WHERE co.resposta_id = ANY(${[...ids]}::int[])
      ORDER BY r.enviado_em DESC, r.id DESC`
  },

  /** O nome de um setor; `null` se ele não existir. */
  async nomeDoSetor(id: number): Promise<string | null> {
    const setor = await prisma.setor.findUnique({ where: { id }, select: { nome: true } })
    return setor?.nome ?? null
  },

  /** O nome de um turno; `null` se ele não existir. */
  async nomeDoTurno(id: number): Promise<string | null> {
    const turno = await prisma.turno.findUnique({ where: { id }, select: { nome: true } })
    return turno?.nome ?? null
  },

  /** O ID e o nome de cada setor da lista, sem ordem. */
  setores(ids: readonly number[]): Promise<{ id: number; nome: string }[]> {
    return prisma.setor.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nome: true } })
  },

  /** A linha da auditoria de uma exportação: quem exportou, de onde, com quais filtros e se levou telefones. */
  async registrarExportacao(autor: Autor, acao: string, dados: Prisma.InputJsonObject): Promise<void> {
    await prisma.auditoria.create({
      data: linhaDeAuditoria(autor, { acao, entidade: ENTIDADE, entidadeId: null, dados }),
    })
  },
}
