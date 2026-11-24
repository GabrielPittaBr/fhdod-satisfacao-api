import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { DownloadInterrompido, Saida } from './download'

/** Uma saída de 4 bytes que só termina de mandar um pedaço quando o teste libera: a rede lenta. */
function redeLenta() {
  const pendentes: (() => void)[] = []
  const destino = new Writable({
    highWaterMark: 4,
    write(_pedaco, _codificacao, pronto) {
      pendentes.push(() => pronto())
    },
  })
  return { destino, liberar: () => pendentes.splice(0).forEach((pronto) => pronto()) }
}

const umaVoltaDoLoop = () => new Promise((pronto) => setImmediate(pronto))

describe('Saida', () => {
  it('não pede pausa enquanto a rede dá conta', async () => {
    const { destino } = redeLenta()
    const saida = new Saida(destino)

    expect(saida.cheia).toBe(false)
    await expect(saida.esvaziar()).resolves.toBeUndefined()
  })

  it('pede pausa quando a saída enche e só segue depois de ela esvaziar', async () => {
    const { destino, liberar } = redeLenta()
    const saida = new Saida(destino)
    destino.write('12345')
    expect(saida.cheia).toBe(true)

    let seguiu = false
    const espera = saida.esvaziar().then(() => {
      seguiu = true
    })
    await umaVoltaDoLoop()
    expect(seguiu).toBe(false)

    liberar()
    await espera
    expect(seguiu).toBe(true)
    expect(saida.cheia).toBe(false)
  })

  it('a conexão fechada durante a espera para a geração', async () => {
    const { destino } = redeLenta()
    const saida = new Saida(destino)
    destino.write('12345')

    const espera = saida.esvaziar()
    destino.destroy()

    await expect(espera).rejects.toBeInstanceOf(DownloadInterrompido)
  })

  it('a conexão já fechada também: a saída fica cheia para sempre, e nada mais é escrito', async () => {
    const { destino } = redeLenta()
    const saida = new Saida(destino)
    destino.destroy()
    await umaVoltaDoLoop()

    // Fechada a conexão, o Node volta o `writableNeedDrain` a `false`: sem olhar o `close`, a geração seguiria.
    expect(destino.writableNeedDrain).toBe(false)
    expect(saida.cheia).toBe(true)
    await expect(saida.esvaziar()).rejects.toBeInstanceOf(DownloadInterrompido)
  })
})
