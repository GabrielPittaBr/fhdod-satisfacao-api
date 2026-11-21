/** Códigos de erro da API e o status HTTP de cada um. São os que o front já trata: código novo só com o front. */
export const STATUS_DO_CODIGO = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  SEM_PERMISSAO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  LIMITE_ATINGIDO: 429,
  ERRO_INTERNO: 500,
} as const

export type CodigoDeErro = keyof typeof STATUS_DO_CODIGO

/** Problema num campo: `campo` é o caminho no corpo (`nome`, `contato.telefone`). */
export interface DetalheErro {
  campo: string
  mensagem: string
}

/**
 * Erro esperado, com uma mensagem para quem está na tela: frase curta, em português, sem detalhe técnico.
 * Pode ser lançado em qualquer camada; o error-handler o converte na resposta padrão.
 */
export class AppError extends Error {
  readonly codigo: CodigoDeErro
  readonly status: number
  readonly detalhes: DetalheErro[]

  constructor(codigo: CodigoDeErro, mensagem: string, detalhes: DetalheErro[] = []) {
    super(mensagem)
    this.name = 'AppError'
    this.codigo = codigo
    this.status = STATUS_DO_CODIGO[codigo]
    this.detalhes = detalhes
  }

  static validacao(detalhes: DetalheErro[], mensagem = 'Dados inválidos') {
    return new AppError('VALIDACAO', mensagem, detalhes)
  }

  static naoAutenticado(mensagem = 'Sua sessão terminou. Entre de novo.') {
    return new AppError('NAO_AUTENTICADO', mensagem)
  }

  static semPermissao(mensagem = 'Você não tem permissão para isso.') {
    return new AppError('SEM_PERMISSAO', mensagem)
  }

  static naoEncontrado(mensagem = 'Não encontrado.') {
    return new AppError('NAO_ENCONTRADO', mensagem)
  }

  static conflito(mensagem: string) {
    return new AppError('CONFLITO', mensagem)
  }

  static limiteAtingido(mensagem = 'Muitas tentativas. Espere um pouco e tente de novo.') {
    return new AppError('LIMITE_ATINGIDO', mensagem)
  }
}
