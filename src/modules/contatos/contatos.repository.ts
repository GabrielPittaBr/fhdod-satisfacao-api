import { linhaDeAuditoria, type Autor } from '../../database/auditoria'
import { condicoesDoPainel } from '../../database/filtros-do-painel'
import { prisma } from '../../database/prisma'
import type { TipoComentario } from '../../shared/constants/tipos-de-comentario'
import type { StatusRetorno } from '../../shared/constants/status-de-retorno'
import type { FiltrosDoPainel } from '../../shared/http/filtros-do-painel'
import { paginar, type Paginacao } from '../../shared/http/pagination'
import type { Classificacao } from '../../shared/rules/classificar-nota'

const ENTIDADE = 'contatos_retorno'

/** Um pedido de retorno como a lista o lê: só os 4 últimos dígitos do telefone, nunca o cifrado. */
export interface PedidoDoBanco {
  id: number
  respostaId: number
  setor: string
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  nps: number
  classificacao: Classificacao
  comentarioTipo: TipoComentario | null
  comentarioTexto: string | null
  telefoneFinal: string
  consentimentoEm: Date
  status: StatusRetorno
}

/** O que a revelação do telefone precisa: o número cifrado e o setor da avaliação, para conferir o escopo. */
export interface TelefoneDoPedido {
  id: number
  respostaId: number
  setorId: number
  telefoneCifrado: string
}

export const contatosRepository = {
  /**
   * Os pedidos de retorno das respostas dos filtros e do escopo, do consentimento mais recente para o mais
   * antigo, na página pedida, e o total de todas as páginas, numa transação só.
   */
  async listar(
    filtros: FiltrosDoPainel,
    paginacao: Paginacao,
    setorIds: readonly number[] | null,
  ): Promise<{ pedidos: PedidoDoBanco[]; total: number }> {
    const { skip, take } = paginar(paginacao)
    const condicoes = condicoesDoPainel(filtros, setorIds)
    const [pedidos, [contagem]] = await prisma.$transaction([
      prisma.$queryRaw<PedidoDoBanco[]>`
        SELECT cr.id, cr.resposta_id AS "respostaId", s.nome AS setor,
               to_char(r.data_atendimento, 'YYYY-MM-DD') AS "dataAtendimento", r.nps::int AS nps,
               r.classificacao::text AS classificacao, co.tipo::text AS "comentarioTipo",
               co.texto AS "comentarioTexto", cr.telefone_final AS "telefoneFinal",
               cr.consentimento_em AS "consentimentoEm", cr.status::text AS status
        FROM contatos_retorno cr
        JOIN respostas r ON r.id = cr.resposta_id
        JOIN setores s ON s.id = r.setor_id
        LEFT JOIN comentarios co ON co.resposta_id = r.id
        WHERE ${condicoes}
        ORDER BY cr.consentimento_em DESC, cr.id DESC
        LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        FROM contatos_retorno cr
        JOIN respostas r ON r.id = cr.resposta_id
        WHERE ${condicoes}`,
    ])
    return { pedidos, total: contagem?.total ?? 0 }
  },

  /** O telefone cifrado de um pedido, com o setor da avaliação; `null` se o pedido não existir. */
  async buscarTelefone(id: number): Promise<TelefoneDoPedido | null> {
    const pedido = await prisma.contatoRetorno.findUnique({
      where: { id },
      select: { id: true, respostaId: true, telefoneCifrado: true, resposta: { select: { setorId: true } } },
    })
    if (!pedido) return null
    const { resposta, ...telefone } = pedido
    return { ...telefone, setorId: resposta.setorId }
  },

  /** Registra na auditoria quem viu o número completo de um pedido, e quando. O telefone não vai em `dados`. */
  async registrarRevelacao(pedido: TelefoneDoPedido, autor: Autor): Promise<void> {
    await prisma.auditoria.create({
      data: linhaDeAuditoria(autor, {
        acao: 'revelacao_de_telefone',
        entidade: ENTIDADE,
        entidadeId: pedido.id,
        dados: { respostaId: pedido.respostaId, setorId: pedido.setorId },
      }),
    })
  },
}
