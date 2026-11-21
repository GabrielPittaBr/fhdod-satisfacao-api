// Campos que a API acrescenta ao Request do Express. O `id` e o `log` vêm do pino-http.

declare global {
  namespace Express {
    interface Request {
      /** Params, query e body já validados e convertidos pelo middleware `validate`. */
      valid: { params?: unknown; query?: unknown; body?: unknown }
    }
  }
}

export {}
