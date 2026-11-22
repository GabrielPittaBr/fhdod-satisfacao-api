import { ehErroDoPrisma } from '../../database/erros'
import { AppError } from '../../shared/errors/app-error'
import type { UsuarioAutenticado } from '../../shared/security/acesso'
import { setoresRepository } from './setores.repository'
import {
  MENSAGEM_SETOR_NAO_ENCONTRADO,
  MENSAGEM_SLUG_REPETIDO,
  type DadosDaEdicaoDoSetor,
  type DadosDoNovoSetor,
  type Setor,
} from './setores.schemas'

/** A descrição vazia (ou só com espaços, que o schema já tirou) é gravada como `null`. */
function normalizarDescricao(descricao: string | null | undefined): string | null {
  return descricao || null
}

/** O slug é a única coluna única dos setores: o `P2002` só pode ser ele. */
function traduzirErroDeGravacao(erro: unknown): unknown {
  if (ehErroDoPrisma(erro, 'valorRepetido')) return AppError.conflito(MENSAGEM_SLUG_REPETIDO)
  if (ehErroDoPrisma(erro, 'naoEncontrado')) return AppError.naoEncontrado(MENSAGEM_SETOR_NAO_ENCONTRADO)
  return erro
}

export const setoresService = {
  /**
   * Os setores que a pessoa enxerga, ativos e inativos: todos para Super Admin e Ouvidoria, só os seus para
   * Gestor e Visualizador. Quem cuida disso é a própria consulta, com os `setorIds` de quem está logado.
   */
  listar(usuario: UsuarioAutenticado): Promise<Setor[]> {
    return setoresRepository.listar(usuario.setorIds)
  },

  /** Cria o setor, já ativo. Slug repetido dá 409. */
  async criar({ nome, slug, descricao }: DadosDoNovoSetor): Promise<Setor> {
    try {
      return await setoresRepository.criar({ nome, slug, descricao: normalizarDescricao(descricao) })
    } catch (erro) {
      throw traduzirErroDeGravacao(erro)
    }
  },

  /** Muda o nome, o slug ou a descrição. Setor inexistente dá 404, e slug de outro setor, 409. */
  async editar(id: number, { nome, slug, descricao }: DadosDaEdicaoDoSetor): Promise<Setor> {
    try {
      return await setoresRepository.editar(id, {
        nome,
        slug,
        ...(descricao !== undefined && { descricao: normalizarDescricao(descricao) }),
      })
    } catch (erro) {
      throw traduzirErroDeGravacao(erro)
    }
  },

  /**
   * Ativa ou desativa. Nada é apagado: o setor inativo sai da pesquisa pública e continua, com as respostas,
   * nos indicadores e nas listas do painel. Setor inexistente dá 404.
   */
  async alterarStatus(id: number, ativo: boolean): Promise<void> {
    if (!(await setoresRepository.alterarStatus(id, ativo))) {
      throw AppError.naoEncontrado(MENSAGEM_SETOR_NAO_ENCONTRADO)
    }
  },
}
