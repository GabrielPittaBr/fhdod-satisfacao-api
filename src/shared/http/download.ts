import type { Response } from 'express'
import type { Writable } from 'node:stream'

/** A pessoa fechou a conexão antes do fim do download: não há mais para quem escrever. */
export class DownloadInterrompido extends Error {
  constructor() {
    super('A conexão do download foi fechada antes do fim do arquivo')
    this.name = 'DownloadInterrompido'
  }
}

/**
 * Para onde vai um arquivo gerado na hora, com a vazão da rede. Quem gera escreve um pedaço e, se a saída está
 * `cheia`, espera o `esvaziar()`: assim a memória do servidor não cresce quando a rede é mais lenta que o banco.
 * Se a pessoa fechou a conexão, o `esvaziar()` lança `DownloadInterrompido`, e a geração para. Fechada a conexão,
 * o `writableNeedDrain` da resposta volta a `false`: por isso a saída olha também o `close`.
 */
export class Saida {
  #fechada = false

  constructor(readonly destino: Writable) {
    destino.once('close', () => {
      this.#fechada = true
    })
  }

  get #encerrada(): boolean {
    return this.#fechada || this.destino.destroyed
  }

  /** A resposta pediu uma pausa (a rede ainda não mandou o que recebeu) ou já foi fechada. */
  get cheia(): boolean {
    return this.#encerrada || this.destino.writableNeedDrain
  }

  /** Espera a resposta esvaziar; se a conexão foi fechada, lança `DownloadInterrompido`. */
  async esvaziar(): Promise<void> {
    if (!this.#encerrada && this.destino.writableNeedDrain) {
      await new Promise<void>((seguir) => {
        const continuar = () => {
          this.destino.off('drain', continuar)
          this.destino.off('close', continuar)
          seguir()
        }
        this.destino.on('drain', continuar)
        this.destino.on('close', continuar)
      })
    }
    if (this.#encerrada) throw new DownloadInterrompido()
  }
}

/** Um arquivo para baixar, gerado na hora. */
export interface ArquivoParaBaixar {
  /** O nome que o navegador dá ao arquivo, no `Content-Disposition`. */
  nome: string
  /** O `Content-Type`. */
  tipo: string
  /**
   * Gera o arquivo na saída. Só é chamado depois de tudo o que pode falhar antes do primeiro byte (consultas,
   * auditoria): um erro ali ainda vira a resposta de erro padrão.
   */
  escrever(saida: Saida): Promise<void>
}

/**
 * Manda um arquivo gerado na hora, em streaming, com o nome no `Content-Disposition` e sem cache, porque os
 * arquivos do painel podem ter dados pessoais. Um erro antes do primeiro byte vira a resposta de erro padrão, sem
 * o cabeçalho do download. Depois dele, a resposta não tem mais como virar JSON: a conexão é derrubada, para o
 * navegador mostrar o download como falho em vez de salvar um arquivo pela metade, e o erro vai para o log da
 * requisição (o pino-http lê o `res.err`). A conexão fechada por quem pediu não é erro: o log a mostra como
 * interrompida.
 */
export async function enviarArquivo(
  res: Response,
  { nome, tipo, escrever }: ArquivoParaBaixar,
): Promise<void> {
  res.status(200).attachment(nome).type(tipo).set('Cache-Control', 'no-store')
  try {
    await escrever(new Saida(res))
  } catch (erro) {
    if (erro instanceof DownloadInterrompido) return
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition')
      throw erro
    }
    res.err = erro instanceof Error ? erro : new Error(String(erro))
    res.destroy()
  }
}
