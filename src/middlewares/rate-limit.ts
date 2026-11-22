import type { Request, RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { logger } from '../config/logger'
import { AppError } from '../shared/errors/app-error'

const QUINZE_MINUTOS_MS = 15 * 60 * 1000

export interface OpcoesDoLimite {
  /** Duração da janela, em milissegundos. */
  janelaMs: number
  /** Tentativas aceitas na janela; a seguinte recebe 429. */
  maximo: number
  /** O que identifica quem tenta, como o IP e o e-mail. */
  chave: (req: Request) => string
  /** Mensagem do 429 `LIMITE_ATINGIDO`, para quem está na tela. */
  mensagem: string
  /** Conta só as tentativas que falharam (resposta com status 400 ou mais). */
  soFalhas?: boolean
}

/**
 * Limite de tentativas por chave, na memória do processo. Cada chamada cria um contador novo: o app cria o
 * seu ao montar as rotas, e cada app dos testes começa do zero. A API roda num processo só; com mais de um,
 * o contador teria de ir para um lugar comum, como o banco.
 *
 * Passado o limite, responde 429 `LIMITE_ATINGIDO` no formato padrão, com os cabeçalhos `RateLimit` e
 * `Retry-After` (segundos até a janela acabar).
 */
export function limitarTentativas({
  janelaMs,
  maximo,
  chave,
  mensagem,
  soFalhas = false,
}: OpcoesDoLimite): RequestHandler {
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    skipSuccessfulRequests: soFalhas,
    keyGenerator: (req) => chave(req),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.limiteAtingido(mensagem)),
    logger: {
      error: (erro, detalhe) => logger.error({ err: erro }, detalhe ?? 'erro no limite de tentativas'),
      warn: (erro, detalhe) => logger.warn({ err: erro }, detalhe ?? 'aviso do limite de tentativas'),
    },
  })
}

/** O e-mail do corpo, como o login o compara. O limite vem antes da validação, então o corpo ainda é cru. */
function emailDoCorpo(req: Request): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Login: depois de 5 tentativas erradas em 15 minutos para o mesmo IP e e-mail, a próxima recebe 429, mesmo
 * com a senha certa, até a janela acabar ("Segurança", no plano). O login que dá certo não conta.
 */
export function criarLimiteDeLogin(): RequestHandler {
  return limitarTentativas({
    janelaMs: QUINZE_MINUTOS_MS,
    maximo: 5,
    soFalhas: true,
    chave: (req) => `${ipKeyGenerator(req.ip ?? '')} ${emailDoCorpo(req)}`,
    mensagem: 'Muitas tentativas. Espere 15 minutos e tente de novo.',
  })
}
