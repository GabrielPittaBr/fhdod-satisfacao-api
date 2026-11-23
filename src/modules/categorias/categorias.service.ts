import { traduzirErroDoPrisma } from '../../database/erros'
import { AppError } from '../../shared/errors/app-error'
import { categoriasRepository } from './categorias.repository'
import {
  MENSAGEM_CATEGORIA_NAO_ENCONTRADA,
  MENSAGEM_NOME_REPETIDO,
  type Categoria,
  type DadosDaEdicaoDaCategoria,
} from './categorias.schemas'

/** O nome é a única coluna única das categorias: o `P2002` só pode ser ele. */
function traduzirErroDeGravacao(erro: unknown): unknown {
  return traduzirErroDoPrisma(erro, {
    valorRepetido: AppError.conflito(MENSAGEM_NOME_REPETIDO),
    naoEncontrado: AppError.naoEncontrado(MENSAGEM_CATEGORIA_NAO_ENCONTRADA),
  })
}

export const categoriasService = {
  /** Todas as categorias, ativas e inativas, na ordem. Qualquer perfil lê a lista inteira. */
  listar(): Promise<Categoria[]> {
    return categoriasRepository.listar()
  },

  /** Cria a categoria, ativa, no fim da ordem. Nome repetido, mesmo com outras maiúsculas, dá 409. */
  async criar(nome: string): Promise<Categoria> {
    try {
      return await categoriasRepository.criar(nome)
    } catch (erro) {
      throw traduzirErroDeGravacao(erro)
    }
  },

  /**
   * Muda o nome, ativa ou desativa, ou faz os dois; a ordem não muda. Nada é apagado: a categoria inativa
   * continua nas perguntas e nas respostas que já a usam. Categoria inexistente dá 404, e o nome de outra, 409.
   */
  async editar(id: number, dados: DadosDaEdicaoDaCategoria): Promise<Categoria> {
    try {
      return await categoriasRepository.editar(id, dados)
    } catch (erro) {
      throw traduzirErroDeGravacao(erro)
    }
  },
}
