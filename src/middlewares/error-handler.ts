import type { ErrorRequestHandler } from 'express'
import { AppError } from '../shared/errors/app-error'

const MENSAGEM_ERRO_INTERNO = 'Erro inesperado. Tente de novo em instantes.'
const MENSAGEM_CORPO_GRANDE = 'Os dados enviados passam do tamanho permitido.'
const MENSAGEM_CORPO_ILEGIVEL = 'Não foi possível ler os dados enviados.'

/**
 * Erros 4xx que o próprio Express lança antes de chegar a uma rota: JSON malformado, corpo acima de 100 kB,
 * codificação desconhecida, endereço com caractere inválido. Todos são problema nos dados enviados.
 */
function erroDosDadosEnviados(erro: unknown): AppError | undefined {
  const { status, type } = (erro ?? {}) as { status?: unknown; type?: unknown }
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined
  return AppError.validacao([], type === 'entity.too.large' ? MENSAGEM_CORPO_GRANDE : MENSAGEM_CORPO_ILEGIVEL)
}

/**
 * Último da cadeia: converte qualquer erro na resposta padrão
 * `{ erro: { codigo, mensagem, detalhes, requestId } }`. Erro inesperado vira 500 `ERRO_INTERNO` com
 * mensagem genérica; o detalhe vai só para o log, na linha de saída da requisição (o pino-http lê o `res.err`).
 */
export const errorHandler: ErrorRequestHandler = (erro, req, res, next) => {
  // A resposta já começou a sair e não dá mais para trocá-la: o Express encerra a conexão.
  if (res.headersSent) return next(erro)

  const appError =
    erro instanceof AppError
      ? erro
      : (erroDosDadosEnviados(erro) ?? new AppError('ERRO_INTERNO', MENSAGEM_ERRO_INTERNO))

  if (appError.codigo === 'ERRO_INTERNO') res.err = erro instanceof Error ? erro : new Error(String(erro))

  res.status(appError.status).json({
    erro: {
      codigo: appError.codigo,
      mensagem: appError.message,
      detalhes: appError.detalhes,
      requestId: String(req.id),
    },
  })
}
