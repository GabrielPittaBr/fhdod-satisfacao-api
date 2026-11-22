// Campos que a API acrescenta ao Request do Express. O `id` e o `log` vêm do pino-http.
import type { UsuarioAutenticado } from '../security/acesso'

declare global {
  namespace Express {
    interface Request {
      /** Params, query e body já validados e convertidos pelo middleware `validate`. */
      valid: { params?: unknown; query?: unknown; body?: unknown }
      /**
       * Quem está logado, lido do banco pelo `authenticate`. Só existe nas rotas com `authenticate`; os
       * controllers o leem com `usuarioLogado(req)`.
       */
      usuario?: UsuarioAutenticado
    }
  }
}

export {}
