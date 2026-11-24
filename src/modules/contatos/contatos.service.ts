import type { Autor } from '../../database/auditoria'
import { AppError } from '../../shared/errors/app-error'
import type { Meta } from '../../shared/http/pagination'
import { mascararTelefone } from '../../shared/rules/telefone'
import {
  MENSAGEM_FORA_DO_SETOR,
  podeAcessarSetor,
  type UsuarioAutenticado,
} from '../../shared/security/acesso'
import { decifrar } from '../../shared/security/crypto'
import { contatosRepository } from './contatos.repository'
import {
  MENSAGEM_PEDIDO_NAO_ENCONTRADO,
  type FiltrosDosContatos,
  type PedidoRetorno,
  type TelefoneRevelado,
} from './contatos.schemas'

/**
 * Os pedidos de retorno. Quem chama já passou pelo `authorize('contatos:ver')` (Super Admin e Ouvidoria, que
 * enxergam todos os setores). O escopo vale mesmo assim, na consulta da lista e na revelação: se outro perfil
 * ganhar a permissão, ele continua preso aos seus setores.
 */
export const contatosService = {
  /** Os pedidos dos filtros, do mais recente para o mais antigo, com o telefone mascarado. */
  async listar(
    usuario: UsuarioAutenticado,
    { pagina, porPagina, ...filtros }: FiltrosDosContatos,
  ): Promise<{ pedidos: PedidoRetorno[]; meta: Meta }> {
    const { pedidos, total } = await contatosRepository.listar(
      filtros,
      { pagina, porPagina },
      usuario.setorIds,
    )
    return {
      pedidos: pedidos.map(
        ({ comentarioTipo, comentarioTexto, telefoneFinal, consentimentoEm, ...pedido }) => ({
          ...pedido,
          comentario:
            comentarioTipo !== null && comentarioTexto !== null
              ? { tipo: comentarioTipo, texto: comentarioTexto }
              : null,
          telefoneMascarado: mascararTelefone(telefoneFinal),
          consentimentoEm: consentimentoEm.toISOString(),
        }),
      ),
      meta: { pagina, porPagina, total },
    }
  },

  /**
   * O número completo de um pedido: 404 se ele não existir, 403 se for de um setor que a pessoa não enxerga.
   * Cada revelação vai para a auditoria, com quem viu e quando, antes de o número sair; se a linha não for
   * gravada, o número não sai.
   */
  async revelarTelefone(
    usuario: UsuarioAutenticado,
    id: number,
    ip: string | null,
  ): Promise<TelefoneRevelado> {
    const pedido = await contatosRepository.buscarTelefone(id)
    if (!pedido) throw AppError.naoEncontrado(MENSAGEM_PEDIDO_NAO_ENCONTRADO)
    if (!podeAcessarSetor(usuario, pedido.setorId)) throw AppError.semPermissao(MENSAGEM_FORA_DO_SETOR)

    const telefone = decifrar(pedido.telefoneCifrado)
    const autor: Autor = { usuarioId: usuario.id, ip }
    await contatosRepository.registrarRevelacao(pedido, autor)
    return { telefone }
  },
}
