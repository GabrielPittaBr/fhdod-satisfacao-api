import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** O PDF como quem o lê: as páginas e as linhas de texto de cada uma, de cima para baixo e da esquerda para a direita. */
export interface PdfLido {
  paginas: number
  /** Cada linha é a lista dos textos na mesma altura de uma página, sem os espaços soltos. */
  linhas: string[][]
  /** Os metadados do arquivo (o título, o autor...). */
  info: Record<string, unknown>
}

/** Lê o texto de um PDF com o pdf.js, o leitor do Firefox, para os testes conferirem o que está escrito. */
export async function lerPdf(bytes: Uint8Array): Promise<PdfLido> {
  const tarefa = getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const pdf = await tarefa.promise
  const linhas: string[][] = []
  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const { items } = await (await pdf.getPage(numero)).getTextContent()
    const porAltura = new Map<number, { x: number; texto: string }[]>()
    for (const item of items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const [, , , , x = 0, y = 0] = item.transform as number[]
      const altura = Math.round(y)
      porAltura.set(altura, [...(porAltura.get(altura) ?? []), { x, texto: item.str.trim() }])
    }
    for (const [, textos] of [...porAltura].sort(([a], [b]) => b - a)) {
      linhas.push(textos.sort((a, b) => a.x - b.x).map(({ texto }) => texto))
    }
  }
  const { info } = await pdf.getMetadata()
  const paginas = pdf.numPages
  await tarefa.destroy()
  return { paginas, linhas, info: info as Record<string, unknown> }
}

/** A primeira linha que começa com o texto; falha se não houver. */
export function linhaQueComeca(pdf: PdfLido, texto: string): string[] {
  const linha = pdf.linhas.find(([primeiro]) => primeiro === texto)
  if (!linha) throw new Error(`O PDF não tem a linha ${texto}`)
  return linha
}

/** O texto logo à direita do rótulo, na mesma linha. */
export const valorAoLado = (pdf: PdfLido, rotulo: string) => linhaQueComeca(pdf, rotulo)[1]
