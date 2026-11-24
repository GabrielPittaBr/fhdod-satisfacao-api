import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { finished } from 'node:stream/promises'
import pdfmake from 'pdfmake'
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import { DownloadInterrompido, type Saida } from '../../shared/http/download'
import { horarioDeBrasilia } from '../../shared/rules/calendario'
import {
  AUTOR_DO_ARQUIVO,
  dataBrasileira,
  descreverFiltros,
  indicadoresDoResumo,
  linhaDaCategoria,
  linhaDoSetor,
  numeroBrasileiro,
  TEXTOS_DO_RESUMO,
  type DadosDoResumo,
  type Numero,
} from './exportacao.resumo'
import { PAGINAS_DO_PDF } from './exportacao.schemas'

// O resumo dos indicadores em PDF, montado no servidor pelo `pdfmake`, sem navegador: o mesmo conteúdo da aba
// Resumo do Excel, em no máximo duas páginas A4, pronto para imprimir ou mandar à direção do hospital.

/** O tamanho da letra das tabelas, do maior para o menor: o PDF usa o maior que cabe nas duas páginas. */
export const TAMANHOS_DAS_TABELAS = [9, 8, 7] as const

/** O azul-marinho do texto, o verde-petróleo dos títulos e o fundo claro dos cabeçalhos, como no painel. */
const CORES = { texto: '#12303F', titulo: '#0A6C6C', cabecalho: '#DCEBEB', nota: '#4A6170' }

// A Roboto que vem com o pdfmake: tem todos os acentos e fica dentro do arquivo, então o PDF sai igual em qualquer
// leitor. O pdfmake só lê arquivos da pasta dela, e nada da internet.
const PASTA_DA_ROBOTO = join(
  dirname(createRequire(import.meta.url).resolve('pdfmake/fonts/Roboto.js')),
  'Roboto',
)
pdfmake.addFonts({
  Roboto: {
    normal: join(PASTA_DA_ROBOTO, 'Roboto-Regular.ttf'),
    bold: join(PASTA_DA_ROBOTO, 'Roboto-Medium.ttf'),
    italics: join(PASTA_DA_ROBOTO, 'Roboto-Italic.ttf'),
    bolditalics: join(PASTA_DA_ROBOTO, 'Roboto-MediumItalic.ttf'),
  },
})
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((caminho) => caminho.startsWith(PASTA_DA_ROBOTO + sep))

/** O instante no relógio de Brasília, como a planilha o mostra: 24/11/2026 16:48. */
function dataEHoraBrasileiras(instante: Date): string {
  const iso = horarioDeBrasilia(instante).toISOString()
  return `${dataBrasileira(iso.slice(0, 10))} ${iso.slice(11, 16)}`
}

const numeroNaCelula = (numero: Numero): TableCell => ({ text: numeroBrasileiro(numero), alignment: 'right' })

function secao(titulo: string): Content {
  return { text: titulo, style: 'secao' }
}

/** Pares de rótulo e valor, sem bordas: os filtros e os indicadores. */
function pares(linhas: [string, TableCell][]): Content {
  return {
    table: {
      widths: ['auto', '*'],
      body: linhas.map(([rotulo, valor]) => [{ text: rotulo, bold: true }, valor]),
    },
    layout: 'noBorders',
  }
}

/**
 * As linhas que cabem, quando a lista não cabe inteira: as primeiras e as últimas, com uma linha no meio que diz
 * quantas ficaram de fora. No NPS por setor, assim continuam à vista os melhores e os piores.
 */
export function recortar<T>(itens: readonly T[], limite: number): (T | { escondidos: number })[] {
  if (itens.length <= limite) return [...itens]
  const antes = Math.ceil(limite / 2)
  const depois = Math.floor(limite / 2)
  return [
    ...itens.slice(0, antes),
    { escondidos: itens.length - limite },
    ...itens.slice(itens.length - depois),
  ]
}

/** Uma tabela com o cabeçalho destacado; a linha do recorte ocupa todas as colunas. */
function tabela<T>(
  cabecalho: readonly string[],
  itens: readonly T[],
  linha: (item: T) => TableCell[],
  {
    tamanho,
    limite,
    vazia,
    nomeDosItens,
  }: { tamanho: number; limite: number; vazia: string; nomeDosItens: string },
): Content {
  if (itens.length === 0) return { text: vazia, style: 'nota' }
  const colunas = cabecalho.length
  const corpo: TableCell[][] = recortar(itens, limite).map((item) =>
    typeof item === 'object' && item !== null && 'escondidos' in item
      ? [
          {
            text:
              `… mais ${item.escondidos} ${nomeDosItens} entre estes. A lista inteira está no resumo em ` +
              'Excel, com os mesmos filtros.',
            colSpan: colunas,
            style: 'nota',
          },
          ...Array.from({ length: colunas - 1 }, () => ({})),
        ]
      : linha(item as T),
  )
  return {
    table: {
      headerRows: 1,
      widths: ['*', ...Array.from({ length: colunas - 1 }, () => 'auto' as const)],
      body: [
        cabecalho.map((titulo, indice) => ({
          text: titulo,
          bold: true,
          fillColor: CORES.cabecalho,
          alignment: indice === 0 ? ('left' as const) : ('right' as const),
        })),
        ...corpo,
      ],
    },
    layout: 'lightHorizontalLines',
    fontSize: tamanho,
  }
}

/** O documento do resumo, com a letra das tabelas e o máximo de linhas de cada uma. */
export function definicaoDoResumo(
  { filtros, indicadores, setores, categorias, geradoEm, geradoPor }: DadosDoResumo,
  { tamanho, limite }: { tamanho: number; limite: number },
): TDocumentDefinitions {
  const geradoEmTexto = dataEHoraBrasileiras(geradoEm)
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 48],
    info: {
      title: TEXTOS_DO_RESUMO.titulo,
      subject: `${dataBrasileira(filtros.inicio)} a ${dataBrasileira(filtros.fim)}`,
      author: geradoPor,
      creator: AUTOR_DO_ARQUIVO,
      producer: AUTOR_DO_ARQUIVO,
      creationDate: geradoEm,
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: CORES.texto },
    styles: {
      titulo: { fontSize: 15, bold: true, color: CORES.titulo, margin: [0, 0, 0, 8] },
      secao: { fontSize: 11, bold: true, color: CORES.titulo, margin: [0, 12, 0, 4] },
      nota: { fontSize: 8, italics: true, color: CORES.nota },
    },
    footer: (pagina, total) => ({
      columns: [
        { text: `${AUTOR_DO_ARQUIVO} · gerado em ${geradoEmTexto}`, style: 'nota' },
        { text: `Página ${pagina} de ${total}`, style: 'nota', alignment: 'right', width: 'auto' },
      ],
      margin: [40, 16, 40, 0],
    }),
    content: [
      { text: TEXTOS_DO_RESUMO.titulo, style: 'titulo' },
      pares([
        [TEXTOS_DO_RESUMO.geradoEm, geradoEmTexto],
        [TEXTOS_DO_RESUMO.geradoPor, geradoPor],
      ]),
      secao(TEXTOS_DO_RESUMO.filtros),
      pares(descreverFiltros(filtros)),
      secao(TEXTOS_DO_RESUMO.indicadores),
      pares(indicadoresDoResumo(indicadores).map(([rotulo, numero]) => [rotulo, numeroBrasileiro(numero)])),
      secao(TEXTOS_DO_RESUMO.setores),
      tabela(
        TEXTOS_DO_RESUMO.cabecalhoDosSetores,
        setores,
        (setor) => {
          const [nome, ...numeros] = linhaDoSetor(setor)
          return [nome, ...numeros.map(numeroNaCelula)]
        },
        { tamanho, limite, vazia: TEXTOS_DO_RESUMO.semSetores, nomeDosItens: 'setores' },
      ),
      secao(TEXTOS_DO_RESUMO.categorias),
      tabela(
        TEXTOS_DO_RESUMO.cabecalhoDasCategorias,
        categorias,
        (categoria) => {
          const [nome, ...numeros] = linhaDaCategoria(categoria)
          return [nome, ...numeros.map(numeroNaCelula)]
        },
        { tamanho, limite, vazia: TEXTOS_DO_RESUMO.semCategorias, nomeDosItens: 'categorias' },
      ),
    ],
  }
}

/** Monta o PDF na memória, ainda sem mandar nada, e diz quantas páginas ele teve. */
async function montar(definicao: TDocumentDefinitions) {
  const documento = await pdfmake.createPdf(definicao, { bufferPages: true }).getStream()
  return { documento, paginas: documento.bufferedPageRange().count }
}

/**
 * O PDF do resumo, já montado e com no máximo `PAGINAS_DO_PDF` páginas. Primeiro diminui a letra das tabelas; se
 * nem com a menor cabe, as tabelas mostram as primeiras e as últimas linhas, com o aviso de quantas ficaram de fora.
 * Com umas dez categorias, cabem uns 55 setores com a letra 9 e uns 70 com a 7 (medido no ticket 18).
 */
export async function gerarPdfDoResumo(dados: DadosDoResumo): Promise<PDFKit.PDFDocument> {
  for (const tamanho of TAMANHOS_DAS_TABELAS) {
    const { documento, paginas } = await montar(definicaoDoResumo(dados, { tamanho, limite: Infinity }))
    if (paginas <= PAGINAS_DO_PDF) return documento
  }
  const tamanho = TAMANHOS_DAS_TABELAS.at(-1) ?? 7
  let limite = Math.max(dados.setores.length, dados.categorias.length)
  while (limite > 1) {
    limite = Math.floor(limite * 0.8)
    const { documento, paginas } = await montar(definicaoDoResumo(dados, { tamanho, limite }))
    if (paginas <= PAGINAS_DO_PDF) return documento
  }
  throw new Error(`O resumo não coube em ${PAGINAS_DO_PDF} páginas`)
}

/**
 * Manda o PDF já montado, respeitando a vazão da rede (o `pipe`). Se a conexão fechar antes do fim, lança
 * `DownloadInterrompido`; um erro do PDF sobe sem derrubar a resposta, para o `enviarArquivo` registrá-lo.
 */
export async function enviarPdf(documento: PDFKit.PDFDocument, { destino }: Saida): Promise<void> {
  await new Promise<void>((terminou, falhou) => {
    documento.once('error', falhou)
    finished(destino).then(terminou, () => falhou(new DownloadInterrompido()))
    documento.pipe(destino)
    documento.end()
  })
}
