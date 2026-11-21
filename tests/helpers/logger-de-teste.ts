import { Writable } from 'node:stream'
import { criarLogger } from '../../src/config/logger'

export type LinhaDeLog = Record<string, unknown> & { msg?: string; requestId?: string; level?: string }

/** Logger com a configuração da API que guarda cada linha na memória, para o teste ler o log. */
export function criarLoggerDeTeste() {
  const linhas: LinhaDeLog[] = []
  const destino = new Writable({
    write(pedaco, _codificacao, pronto) {
      for (const linha of String(pedaco).split('\n').filter(Boolean)) linhas.push(JSON.parse(linha))
      pronto()
    },
  })
  return { logger: criarLogger(destino, 'info'), linhas, texto: () => JSON.stringify(linhas) }
}
