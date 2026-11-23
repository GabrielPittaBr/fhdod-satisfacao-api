import type { Autor } from '../../database/auditoria'
import { TIPO_COM_OPCOES } from '../../shared/constants/tipos-de-pergunta'
import { AppError } from '../../shared/errors/app-error'
import {
  MENSAGEM_FORA_DO_SETOR,
  podeAcessarSetor,
  type UsuarioAutenticado,
} from '../../shared/security/acesso'
import { MENSAGEM_SETOR_NAO_ENCONTRADO } from '../setores/setores.schemas'
import { perguntasRepository } from './perguntas.repository'
import {
  MENSAGEM_CATEGORIA_INATIVA,
  MENSAGEM_ESCOLHA_UMA_CATEGORIA,
  MENSAGEM_LISTA_INCOMPLETA,
  MENSAGEM_PERGUNTA_NAO_ENCONTRADA,
  MENSAGEM_TIPO_TRAVADO,
  type ConteudoDaPergunta,
  type DadosDaPergunta,
  type Pergunta,
} from './perguntas.schemas'

function autorDe(usuario: UsuarioAutenticado, ip: string | null): Autor {
  return { usuarioId: usuario.id, ip }
}

/** O setor da rota existe. Para o Gestor, o `setorScope` já barrou o que não é dele; aqui sobra o Super Admin. */
async function exigirSetor(setorId: number): Promise<void> {
  if (!(await perguntasRepository.setorExiste(setorId))) {
    throw AppError.naoEncontrado(MENSAGEM_SETOR_NAO_ENCONTRADO)
  }
}

/**
 * A categoria existe e está ativa. Na edição, a categoria que a pergunta já tem continua valendo mesmo
 * desativada: a pessoa pode mudar o texto sem trocar a categoria.
 */
async function exigirCategoria(categoriaId: number, categoriaAtual?: number): Promise<void> {
  const categoria = await perguntasRepository.buscarCategoria(categoriaId)
  if (!categoria) {
    throw AppError.validacao([{ campo: 'categoriaId', mensagem: MENSAGEM_ESCOLHA_UMA_CATEGORIA }])
  }
  if (!categoria.ativa && categoriaId !== categoriaAtual) {
    throw AppError.validacao([{ campo: 'categoriaId', mensagem: MENSAGEM_CATEGORIA_INATIVA }])
  }
}

/** A pergunta pelo ID, se for de um setor que a pessoa enxerga: 404 se não existir, 403 se for de outro setor. */
async function buscarNoEscopo(usuario: UsuarioAutenticado, id: number): Promise<Pergunta> {
  const pergunta = await perguntasRepository.buscar(id)
  if (!pergunta) throw AppError.naoEncontrado(MENSAGEM_PERGUNTA_NAO_ENCONTRADA)
  if (!podeAcessarSetor(usuario, pergunta.setorId)) throw AppError.semPermissao(MENSAGEM_FORA_DO_SETOR)
  return pergunta
}

/** O conteúdo validado no formato do contrato: fora da múltipla escolha, `opcoes` é `null`. */
function conteudoDe({ texto, categoriaId, tipo, opcoes }: DadosDaPergunta): ConteudoDaPergunta {
  return { texto, categoriaId, tipo, opcoes: tipo === TIPO_COM_OPCOES ? (opcoes ?? []) : null }
}

function mesmoConteudo(atual: ConteudoDaPergunta, novo: ConteudoDaPergunta): boolean {
  return (
    atual.texto === novo.texto &&
    atual.categoriaId === novo.categoriaId &&
    atual.tipo === novo.tipo &&
    JSON.stringify(atual.opcoes) === JSON.stringify(novo.opcoes)
  )
}

/**
 * A lista tem cada pergunta do setor uma vez só, e nenhuma outra. Com o mesmo tamanho e todas as do setor
 * dentro, não sobra lugar para uma repetida nem para uma de fora.
 */
function temTodas(doSetor: readonly { id: number }[], ids: readonly number[]): boolean {
  const recebidos = new Set(ids)
  return ids.length === doSetor.length && doSetor.every(({ id }) => recebidos.has(id))
}

// Quem pode chamar cada função já passou pelo `authorize('perguntas:gerenciar')`. Nas rotas com `:setorId`, o
// `setorScope` barrou o setor de fora; nas rotas pelo ID da pergunta, quem confere o setor é o service.
// Um pedido que não muda nada responde como os outros, mas não grava nem vai para a auditoria.

export const perguntasService = {
  /** As perguntas do setor, ativas e inativas, na ordem. Setor inexistente dá 404. */
  async listar(setorId: number): Promise<Pergunta[]> {
    await exigirSetor(setorId)
    return perguntasRepository.listar(setorId)
  },

  /** Cria a pergunta, ativa, no fim da ordem do setor. */
  async criar(
    usuario: UsuarioAutenticado,
    setorId: number,
    dados: DadosDaPergunta,
    ip: string | null,
  ): Promise<Pergunta> {
    await exigirSetor(setorId)
    await exigirCategoria(dados.categoriaId)
    return perguntasRepository.criar(setorId, conteudoDe(dados), autorDe(usuario, ip))
  },

  /**
   * Troca o texto, a categoria, o tipo e as opções; a ordem e a situação não mudam. Quem já respondeu viu a
   * pergunta com o tipo de agora, então, com respostas gravadas, o tipo não muda: 409.
   */
  async editar(
    usuario: UsuarioAutenticado,
    id: number,
    dados: DadosDaPergunta,
    ip: string | null,
  ): Promise<Pergunta> {
    const atual = await buscarNoEscopo(usuario, id)
    await exigirCategoria(dados.categoriaId, atual.categoriaId)
    if (atual.temRespostas && dados.tipo !== atual.tipo) throw AppError.conflito(MENSAGEM_TIPO_TRAVADO)

    const nova = conteudoDe(dados)
    if (mesmoConteudo(atual, nova)) return atual
    return perguntasRepository.editar(atual, nova, autorDe(usuario, ip))
  },

  /**
   * Salva a nova ordem. A lista traz todas as perguntas do setor, ativas e inativas, cada uma uma vez: faltando
   * alguma, sobrando ou repetindo, dá 400 em `ids`.
   */
  async ordenar(
    usuario: UsuarioAutenticado,
    setorId: number,
    ids: number[],
    ip: string | null,
  ): Promise<void> {
    await exigirSetor(setorId)
    const atuais = await perguntasRepository.posicoes(setorId)
    if (!temTodas(atuais, ids))
      throw AppError.validacao([{ campo: 'ids', mensagem: MENSAGEM_LISTA_INCOMPLETA }])
    if (atuais.every(({ id }, indice) => id === ids[indice])) return
    await perguntasRepository.ordenar(setorId, atuais, ids, autorDe(usuario, ip))
  },

  /** Ativa ou desativa. Nada é apagado: a pergunta inativa sai da pesquisa, e as respostas dela continuam. */
  async alterarStatus(
    usuario: UsuarioAutenticado,
    id: number,
    ativa: boolean,
    ip: string | null,
  ): Promise<void> {
    const pergunta = await buscarNoEscopo(usuario, id)
    if (pergunta.ativa === ativa) return
    await perguntasRepository.alterarStatus(pergunta, ativa, autorDe(usuario, ip))
  },
}
