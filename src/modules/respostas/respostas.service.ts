import { lerConfiguracoes } from '../../database/configuracoes'
import { AppError } from '../../shared/errors/app-error'
import type { Meta } from '../../shared/http/pagination'
import { classificarNotaDaEscala } from '../../shared/rules/classificar-nota'
import { mascararTelefone } from '../../shared/rules/telefone'
import {
  MENSAGEM_FORA_DO_SETOR,
  podeAcessarSetor,
  type UsuarioAutenticado,
} from '../../shared/security/acesso'
import { respostasRepository, type RespostaDoBanco } from './respostas.repository'
import {
  MENSAGEM_RESPOSTA_NAO_ENCONTRADA,
  type FiltrosDaListaDeRespostas,
  type RespostaDetalhe,
  type RespostaResumo,
} from './respostas.schemas'

function resumoDe({ enviadoEm, ...resposta }: RespostaDoBanco): RespostaResumo {
  return { ...resposta, enviadoEm: enviadoEm.toISOString() }
}

/**
 * As respostas do painel. Quem chama já passou pelo `authorize('respostas:ver')`; na lista, o `setorScope`
 * barrou o `?setorId=` de fora, e a consulta conta só os setores que a pessoa enxerga. No detalhe, pelo ID, quem
 * confere o setor é o service.
 */
export const respostasService = {
  /** As respostas dos filtros, na ordem e na página pedidas. */
  async listar(
    usuario: UsuarioAutenticado,
    {
      classificacao,
      comComentario,
      comRetorno,
      pagina,
      porPagina,
      ordenarPor,
      ordem,
      ...filtros
    }: FiltrosDaListaDeRespostas,
  ): Promise<{ respostas: RespostaResumo[]; meta: Meta }> {
    const { respostas, total } = await respostasRepository.listar(
      filtros,
      { classificacao, comComentario, comRetorno },
      { ordenarPor, ordem },
      { pagina, porPagina },
      usuario.setorIds,
    )
    return { respostas: respostas.map(resumoDe), meta: { pagina, porPagina, total } }
  },

  /**
   * Uma resposta inteira: 404 se não existir, 403 se for de um setor que a pessoa não enxerga. Cada nota de 1 a
   * 5 vem classificada com os limites de agora; o telefone, mascarado com os 4 últimos dígitos, sem decifrar.
   */
  async detalhar(usuario: UsuarioAutenticado, id: number): Promise<RespostaDetalhe> {
    const resposta = await respostasRepository.buscar(id)
    if (!resposta) throw AppError.naoEncontrado(MENSAGEM_RESPOSTA_NAO_ENCONTRADA)
    if (!podeAcessarSetor(usuario, resposta.setorId)) throw AppError.semPermissao(MENSAGEM_FORA_DO_SETOR)

    const [partes, limites] = await Promise.all([respostasRepository.partesDoDetalhe(id), lerConfiguracoes()])
    // As partes saem junto com a resposta (`ON DELETE CASCADE`), e nada apaga uma resposta.
    if (!partes) throw new Error(`Resposta ${id} sem as partes do detalhe`)

    return {
      ...resumoDe(resposta),
      itens: partes.itens.map(({ categoria, valorNumero, ...item }) => ({
        ...item,
        categoria: categoria.nome,
        valorNumero,
        classificacao:
          item.tipo === 'ESCALA_1_5' && valorNumero !== null
            ? classificarNotaDaEscala(valorNumero, limites)
            : null,
      })),
      comentario: partes.comentario,
      contato: partes.contato && {
        id: partes.contato.id,
        telefoneMascarado: mascararTelefone(partes.contato.telefoneFinal),
        status: partes.contato.status,
      },
    }
  },
}
