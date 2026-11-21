import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { encerrarAoReceberSinal, encerrarServidor } from './encerramento'

const logger = pino({ level: 'silent' })

/** Servidor HTTP cujas respostas só saem quando o teste manda. */
async function subirServidorDeTeste() {
  const pendentes: Array<() => void> = []
  const servidor = createServer((_req, res) => {
    pendentes.push(() => res.end('ok'))
  })
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
  const { port } = servidor.address() as AddressInfo
  return { servidor, url: `http://127.0.0.1:${port}/`, pendentes }
}

describe('encerrarServidor', () => {
  it('espera a requisição em curso terminar antes de fechar o banco e recusa conexões novas', async () => {
    const { servidor, url, pendentes } = await subirServidorDeTeste()
    const emCurso = fetch(url)
    await vi.waitFor(() => expect(pendentes).toHaveLength(1))
    const fecharRecursos = vi.fn(async () => {})

    const encerramento = encerrarServidor({ servidor, fecharRecursos, logger })

    await expect(fetch(url)).rejects.toThrow()
    expect(fecharRecursos).not.toHaveBeenCalled()

    pendentes[0]()
    const resposta = await emCurso
    expect(resposta.status).toBe(200)
    expect(await resposta.text()).toBe('ok')

    await encerramento
    expect(fecharRecursos).toHaveBeenCalledOnce()
    expect(servidor.listening).toBe(false)
  })

  it('corta as conexões que passam do prazo e fecha o banco mesmo assim', async () => {
    const { servidor, url, pendentes } = await subirServidorDeTeste()
    const travada = fetch(url).catch((erro: unknown) => erro)
    await vi.waitFor(() => expect(pendentes).toHaveLength(1))
    const fecharRecursos = vi.fn(async () => {})

    await encerrarServidor({ servidor, fecharRecursos, logger, prazoMs: 50 })

    expect(fecharRecursos).toHaveBeenCalledOnce()
    expect(await travada).toBeInstanceOf(Error)
  })
})

describe('encerrarAoReceberSinal', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'ao receber %s, encerra com segurança e sai com código 0',
    async (sinal) => {
      const { servidor } = await subirServidorDeTeste()
      const fecharRecursos = vi.fn(async () => {})
      const sair = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
      const desligar = encerrarAoReceberSinal({ servidor, fecharRecursos, logger })

      try {
        process.emit(sinal, sinal)
        await vi.waitFor(() => expect(sair).toHaveBeenCalledWith(0))
        expect(fecharRecursos).toHaveBeenCalledOnce()
        expect(servidor.listening).toBe(false)
      } finally {
        desligar()
        sair.mockRestore()
      }
    },
  )
})
