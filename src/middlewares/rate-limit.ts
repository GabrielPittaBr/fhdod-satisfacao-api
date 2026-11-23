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
  /** Requisições que ficam fora do limite e nem entram na conta. */
  pular?: (req: Request) => boolean
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
  pular = () => false,
}: OpcoesDoLimite): RequestHandler {
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    skipSuccessfulRequests: soFalhas,
    skip: (req) => pular(req),
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

/** O IP como o Express o lê, sem o prefixo `::ffff:` do IPv4 escrito como IPv6. */
function ipSemPrefixo(req: Request): string {
  return (req.ip ?? '').replace(/^::ffff:/, '')
}

/**
 * Pesquisa pública: até 30 envios a cada 15 minutos por IP; o seguinte recebe 429 ("Segurança", no plano).
 * Conta todo envio, aceito ou não, para um robô não testar à vontade. Os IPs de `ipsSemLimite` (o
 * RATE_LIMIT_ALLOWLIST, com o IP do hospital, por onde saem os totens) ficam fora do limite.
 *
 * ponytail: 30 por IP é folgado para uma pessoa e cobre vários celulares atrás do mesmo IP da operadora (CGNAT);
 * se o hospital vir pacientes barrados pela rede móvel, suba o número aqui.
 */
export function criarLimiteDeEnvios(ipsSemLimite: readonly string[]): RequestHandler {
  const semLimite = new Set(ipsSemLimite)
  return limitarTentativas({
    janelaMs: QUINZE_MINUTOS_MS,
    maximo: 30,
    chave: (req) => ipKeyGenerator(req.ip ?? ''),
    pular: (req) => semLimite.has(ipSemPrefixo(req)),
    mensagem: 'Muitas avaliações enviadas desta rede. Espere alguns minutos e tente de novo.',
  })
}
