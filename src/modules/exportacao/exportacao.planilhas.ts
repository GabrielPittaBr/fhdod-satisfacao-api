import ExcelJS from 'exceljs'
import { finished } from 'node:stream/promises'
import {
  ROTULO_CANAL,
  ROTULO_CLASSIFICACAO,
  ROTULO_COMENTARIO,
  ROTULO_SIM_NAO,
  ROTULO_TIPO_PERGUNTA,
} from '../../shared/constants/rotulos'
import { DownloadInterrompido, type Saida } from '../../shared/http/download'
import { horarioDeBrasilia } from '../../shared/rules/calendario'
import type { ComentarioExportado, ItemExportado, RespostaExportada } from './exportacao.repository'
import {
  AUTOR_DO_ARQUIVO,
  descreverFiltros,
  indicadoresDoResumo,
  linhaDaCategoria,
  linhaDoSetor,
  SEM_DADOS,
  TEXTOS_DO_RESUMO,
  type DadosDoResumo,
  type Numero,
  type TipoDeNumero,
} from './exportacao.resumo'
import { LINHAS_POR_ABA } from './exportacao.schemas'

// As planilhas da exportação, escritas direto na resposta pelo `exceljs`, sem montar o arquivo na memória. As
// datas e os números vão como data e número, com o formato brasileiro de exibição: o Excel em português mostra
// 4,3 e 1.234, e a coluna continua servindo para somar, filtrar e ordenar. Os textos vão como texto: um comentário
// que começa com "=" nunca vira fórmula.

/** Os formatos de exibição. O Excel troca o ponto e a vírgula pelos do idioma de quem abre o arquivo. */
export const FORMATOS = {
  data: 'dd/mm/yyyy',
  dataEHora: 'dd/mm/yyyy hh:mm',
  inteiro: '0',
  contagem: '#,##0',
  media: '0.0',
  percentual: '0%',
} as const

/** O formato de exibição de cada tipo de número do resumo. */
const FORMATO_DO_TIPO: Record<TipoDeNumero, string> = {
  inteiro: FORMATOS.inteiro,
  contagem: FORMATOS.contagem,
  media: FORMATOS.media,
  percentual: FORMATOS.percentual,
}

/** O verde-petróleo do painel, bem claro, no fundo dos cabeçalhos. */
const FUNDO_DO_CABECALHO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEBEB' } }

/** Texto longo, como o comentário: quebra a linha dentro da célula e começa no topo dela. */
const ALINHAMENTO_DO_TEXTO_LONGO: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' }

type Livro = ExcelJS.stream.xlsx.WorkbookWriter

type Valor = string | number | Date | null

// ---------- Resumo ----------

/** `AAAA-MM-DD` como data da planilha: a meia-noite em UTC, que o Excel mostra como o próprio dia. */
function dataDaPlanilha(data: string): Date {
  return new Date(`${data}T00:00:00Z`)
}

function destacarCabecalho(linha: ExcelJS.Row): void {
  linha.eachCell((celula) => {
    celula.font = { bold: true }
    celula.fill = FUNDO_DO_CABECALHO
  })
}

/** A aba Resumo: quem gerou e quando, os filtros, os indicadores, o NPS por setor e as médias por categoria. */
function escreverResumo(
  livro: Livro,
  { filtros, indicadores, setores, categorias, geradoEm, geradoPor }: DadosDoResumo,
) {
  const aba = livro.addWorksheet('Resumo')
  aba.columns = [{ width: 44 }, { width: 24 }, { width: 18 }, { width: 10 }]

  const linha = (valores: Valor[], formatos: (string | undefined)[] = [], negrito = false) => {
    const nova = aba.addRow(valores)
    formatos.forEach((formato, indice) => {
      if (formato) nova.getCell(indice + 1).numFmt = formato
    })
    if (negrito) nova.font = { bold: true }
    nova.commit()
  }
  const titulo = (texto: string) => linha([texto], [], true)
  /** O texto e os números de uma linha; o número que não existe vira `SEM_DADOS`, sem formato. */
  const linhaDeNumeros = ([texto, ...numeros]: [string, ...Numero[]]) =>
    linha(
      [texto, ...numeros.map(({ valor }) => valor ?? SEM_DADOS)],
      [undefined, ...numeros.map(({ valor, tipo }) => (valor === null ? undefined : FORMATO_DO_TIPO[tipo]))],
    )
  const cabecalho = (titulos: readonly string[]) => {
    const nova = aba.addRow([...titulos])
    destacarCabecalho(nova)
    nova.commit()
  }
  const vazia = () => aba.addRow([]).commit()

  const principal = aba.addRow([TEXTOS_DO_RESUMO.titulo])
  principal.font = { bold: true, size: 14 }
  principal.commit()
  linha([TEXTOS_DO_RESUMO.geradoEm, horarioDeBrasilia(geradoEm)], [undefined, FORMATOS.dataEHora])
  linha([TEXTOS_DO_RESUMO.geradoPor, geradoPor])
  vazia()

  titulo(TEXTOS_DO_RESUMO.filtros)
  for (const [rotulo, valor] of descreverFiltros(filtros)) linha([rotulo, valor])
  vazia()

  titulo(TEXTOS_DO_RESUMO.indicadores)
  for (const [rotulo, numero] of indicadoresDoResumo(indicadores)) linhaDeNumeros([rotulo, numero])
  vazia()

  titulo(TEXTOS_DO_RESUMO.setores)
  cabecalho(TEXTOS_DO_RESUMO.cabecalhoDosSetores)
  for (const setor of setores) linhaDeNumeros(linhaDoSetor(setor))
  if (setores.length === 0) linha([TEXTOS_DO_RESUMO.semSetores])
  vazia()

  titulo(TEXTOS_DO_RESUMO.categorias)
  cabecalho(TEXTOS_DO_RESUMO.cabecalhoDasCategorias)
  for (const categoria of categorias) linhaDeNumeros(linhaDaCategoria(categoria))
  if (categorias.length === 0) linha([TEXTOS_DO_RESUMO.semCategorias])

  aba.commit()
}

// ---------- Tabelas ----------

interface Coluna<T> {
  titulo: string
  largura: number
  formato?: string
  /** Texto longo, como o comentário: quebra a linha dentro da célula. */
  quebrarTexto?: boolean
  valor: (item: T) => Valor
}

/** Uma tabela numa aba: uma linha por item, com o cabeçalho fixo no topo e o filtro do Excel nele. */
interface Tabela<T> {
  nome: string
  colunas: Coluna<T>[]
}

function abrirAba<T>(livro: Livro, { nome, colunas }: Tabela<T>, parte: number): ExcelJS.Worksheet {
  const aba = livro.addWorksheet(parte === 1 ? nome : `${nome} (${parte})`, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  aba.columns = colunas.map(({ largura, formato, quebrarTexto }) => ({
    width: largura,
    style: {
      ...(formato !== undefined && { numFmt: formato }),
      ...(quebrarTexto && { alignment: ALINHAMENTO_DO_TEXTO_LONGO }),
    },
  }))
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } }
  const cabecalho = aba.addRow(colunas.map(({ titulo }) => titulo))
  destacarCabecalho(cabecalho)
  cabecalho.commit()
  return aba
}

/**
 * Escreve a tabela lote a lote, na ordem em que os lotes chegam: o próximo lote só é lido do banco quando o
 * anterior já foi escrito. Depois de cada linha, se a resposta pediu uma pausa, a escrita espera a rede.
 */
async function escreverTabela<T>(
  livro: Livro,
  saida: Saida,
  tabela: Tabela<T>,
  lotes: AsyncIterable<readonly T[]>,
  linhasPorAba: number,
): Promise<void> {
  let parte = 1
  let aba = abrirAba(livro, tabela, parte)
  let linhas = 0
  for await (const lote of lotes) {
    for (const item of lote) {
      if (linhas === linhasPorAba) {
        aba.commit()
        parte += 1
        aba = abrirAba(livro, tabela, parte)
        linhas = 0
      }
      aba.addRow(tabela.colunas.map(({ valor }) => valor(item))).commit()
      linhas += 1
      if (saida.cheia) await saida.esvaziar()
    }
  }
  aba.commit()
}

/** Uma resposta na aba Respostas, com o telefone completo e formatado, para quem tem `contatos:ver`. */
export interface RespostaDaPlanilha extends RespostaExportada {
  /** `null` sem pedido de retorno ou para quem não pode ver telefones: a coluna nem existe no arquivo dele. */
  telefone: string | null
}

const CODIGO_DA_RESPOSTA = { titulo: 'Código da resposta', largura: 12, formato: FORMATOS.inteiro }
const SETOR = { titulo: 'Setor', largura: 28 }
const DATA_DO_ATENDIMENTO = { titulo: 'Data do atendimento', largura: 14, formato: FORMATOS.data }
const ENVIADA_EM = { titulo: 'Enviada em', largura: 17, formato: FORMATOS.dataEHora }

function tabelaDasRespostas(comTelefones: boolean): Tabela<RespostaDaPlanilha> {
  const colunas: Coluna<RespostaDaPlanilha>[] = [
    { ...CODIGO_DA_RESPOSTA, valor: (resposta) => resposta.id },
    { ...SETOR, valor: (resposta) => resposta.setor },
    { ...DATA_DO_ATENDIMENTO, valor: (resposta) => dataDaPlanilha(resposta.dataAtendimento) },
    { titulo: 'Turno', largura: 16, valor: (resposta) => resposta.turno },
    { titulo: 'Canal', largura: 22, valor: (resposta) => ROTULO_CANAL[resposta.canal] },
    { ...ENVIADA_EM, valor: (resposta) => horarioDeBrasilia(resposta.enviadoEm) },
    {
      titulo: 'Nota de recomendação (0 a 10)',
      largura: 16,
      formato: FORMATOS.inteiro,
      valor: (resposta) => resposta.nps,
    },
    {
      titulo: 'Classificação',
      largura: 14,
      valor: (resposta) => ROTULO_CLASSIFICACAO[resposta.classificacao],
    },
    {
      titulo: 'Tipo do comentário',
      largura: 18,
      valor: ({ tipoDoComentario }) =>
        tipoDoComentario === null ? null : ROTULO_COMENTARIO[tipoDoComentario],
    },
    { titulo: 'Pediu retorno', largura: 13, valor: (resposta) => (resposta.pediuRetorno ? 'Sim' : 'Não') },
  ]
  if (comTelefones) {
    colunas.push({ titulo: 'Telefone para retorno', largura: 18, valor: (resposta) => resposta.telefone })
  }
  return { nome: 'Respostas', colunas }
}

/** O que o paciente respondeu, em texto: `SIM` e `NAO` viram "Sim" e "Não"; na escala, a nota fica na coluna dela. */
function textoDaResposta({ tipo, valorTexto }: ItemExportado): string | null {
  if (valorTexto === null) return null
  return tipo === 'SIM_NAO' ? (ROTULO_SIM_NAO[valorTexto] ?? valorTexto) : valorTexto
}

const TABELA_DOS_ITENS: Tabela<ItemExportado> = {
  nome: 'Itens',
  colunas: [
    { ...CODIGO_DA_RESPOSTA, valor: (item) => item.respostaId },
    { ...SETOR, valor: (item) => item.setor },
    { ...DATA_DO_ATENDIMENTO, valor: (item) => dataDaPlanilha(item.dataAtendimento) },
    { titulo: 'Pergunta', largura: 50, quebrarTexto: true, valor: (item) => item.pergunta },
    { titulo: 'Categoria', largura: 22, valor: (item) => item.categoria },
    { titulo: 'Tipo da pergunta', largura: 18, valor: (item) => ROTULO_TIPO_PERGUNTA[item.tipo] },
    { titulo: 'Nota (1 a 5)', largura: 11, formato: FORMATOS.inteiro, valor: (item) => item.valorNumero },
    { titulo: 'Resposta', largura: 50, quebrarTexto: true, valor: textoDaResposta },
  ],
}

const TABELA_DOS_COMENTARIOS: Tabela<ComentarioExportado> = {
  nome: 'Comentários',
  colunas: [
    { ...CODIGO_DA_RESPOSTA, valor: (comentario) => comentario.respostaId },
    { ...SETOR, valor: (comentario) => comentario.setor },
    { ...DATA_DO_ATENDIMENTO, valor: (comentario) => dataDaPlanilha(comentario.dataAtendimento) },
    { ...ENVIADA_EM, valor: (comentario) => horarioDeBrasilia(comentario.enviadoEm) },
    { titulo: 'Tipo', largura: 14, valor: (comentario) => ROTULO_COMENTARIO[comentario.tipo] },
    { titulo: 'Comentário', largura: 80, quebrarTexto: true, valor: (comentario) => comentario.texto },
    {
      titulo: 'Classificação da avaliação',
      largura: 16,
      valor: (comentario) => ROTULO_CLASSIFICACAO[comentario.classificacao],
    },
  ],
}

// ---------- Arquivos ----------

/** O zip interno do `exceljs` (o `archiver`), que os tipos do pacote não mostram. */
interface ZipDoLivro {
  unpipe(destino: NodeJS.WritableStream): unknown
  abort(): unknown
  on(evento: 'error', ouvinte: () => void): unknown
}

/**
 * Para o zip e o tira da saída. Sem isso, o que ele ainda tinha para mandar chegaria depois da resposta de erro, e o
 * fim dele encerraria a resposta como se o arquivo estivesse completo.
 */
function pararOZip(livro: Livro, { destino }: Saida): void {
  const { zip } = livro as unknown as { zip: ZipDoLivro }
  zip.unpipe(destino)
  // Parado de propósito, um erro do zip não interessa a mais ninguém.
  zip.on('error', () => {})
  zip.abort()
}

/**
 * Gera uma planilha direto na saída. O `exceljs` começa a mandar bytes assim que o livro é criado: quem chama já fez
 * tudo o que podia falhar antes. Num erro, o zip para antes de o erro subir.
 */
async function escreverLivro(saida: Saida, escrever: (livro: Livro) => Promise<void>): Promise<void> {
  const livro = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: saida.destino,
    useStyles: true,
    // Cada texto entra uma vez no arquivo, como o próprio Excel grava: o arquivo fica menor e abre em qualquer
    // leitor de planilhas. A tabela dos textos fica na memória até o fim, do tamanho dos textos diferentes.
    useSharedStrings: true,
  })
  livro.creator = AUTOR_DO_ARQUIVO
  livro.lastModifiedBy = AUTOR_DO_ARQUIVO
  try {
    await escrever(livro)
    // O `commit` só termina quando a resposta acaba de sair; se a conexão fechar antes, ele não termina nunca.
    const saiu = finished(saida.destino).catch(() => {
      throw new DownloadInterrompido()
    })
    await Promise.all([livro.commit(), saiu])
  } catch (erro) {
    pararOZip(livro, saida)
    throw erro
  }
}

/** O arquivo do resumo: só a aba Resumo. */
export async function escreverPlanilhaDoResumo(saida: Saida, resumo: DadosDoResumo): Promise<void> {
  await escreverLivro(saida, async (livro) => {
    escreverResumo(livro, resumo)
  })
}

/** O que o arquivo detalhado precisa: o resumo e as linhas das outras abas, que chegam em lotes do banco. */
export interface DadosDasRespostas {
  resumo: DadosDoResumo
  /** Quem exporta tem `contatos:ver`: a aba Respostas ganha a coluna do telefone. */
  comTelefones: boolean
  respostas: AsyncIterable<readonly RespostaDaPlanilha[]>
  itens: AsyncIterable<readonly ItemExportado[]>
  comentarios: AsyncIterable<readonly ComentarioExportado[]>
}

/** O arquivo detalhado: as abas Resumo, Respostas, Itens e Comentários, uma depois da outra. */
export async function escreverPlanilhaDasRespostas(
  saida: Saida,
  { resumo, comTelefones, respostas, itens, comentarios }: DadosDasRespostas,
  linhasPorAba = LINHAS_POR_ABA,
): Promise<void> {
  await escreverLivro(saida, async (livro) => {
    escreverResumo(livro, resumo)
    await escreverTabela(livro, saida, tabelaDasRespostas(comTelefones), respostas, linhasPorAba)
    await escreverTabela(livro, saida, TABELA_DOS_ITENS, itens, linhasPorAba)
    await escreverTabela(livro, saida, TABELA_DOS_COMENTARIOS, comentarios, linhasPorAba)
  })
}
