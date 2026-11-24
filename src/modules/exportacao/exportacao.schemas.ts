import { filtrosDoDashboardSchema } from '../../shared/http/filtros-do-painel'

/** O `Content-Type` de uma planilha do Excel (.xlsx). */
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** O `Content-Type` do PDF. */
export const TIPO_PDF = 'application/pdf'

/** Os arquivos da exportação: o resumo, para todos os perfis, em Excel e em PDF, e as respostas, o detalhado. */
export const ARQUIVOS = ['resumo', 'respostas'] as const

export type Arquivo = (typeof ARQUIVOS)[number]

export type Extensao = 'xlsx' | 'pdf'

/**
 * Linhas de dados de uma aba, no máximo: o Excel abre até 1.048.576 linhas por aba, a do cabeçalho incluída.
 * Passou disso, a tabela continua numa aba nova, com o mesmo cabeçalho, como "Itens (2)".
 */
export const LINHAS_POR_ABA = 1_048_575

/** Páginas do resumo em PDF, no máximo. */
export const PAGINAS_DO_PDF = 2

/** O nome do arquivo no download, com o período: `fhdod-resumo-2026-11-01-a-2026-11-30.xlsx`. */
export function nomeDoArquivo(
  arquivo: Arquivo,
  { inicio, fim }: { inicio: string; fim: string },
  extensao: Extensao,
): string {
  return `fhdod-${arquivo}-${inicio}-a-${fim}.${extensao}`
}

// ---------- Requisições ----------

// As exportações aceitam os filtros do dashboard, com o período e a base obrigatórios: o arquivo sai com o que
// está na tela, e o período dá o nome do arquivo.

export const exportarResumo = { query: filtrosDoDashboardSchema }

export const exportarResumoEmPdf = { query: filtrosDoDashboardSchema }

export const exportarRespostas = { query: filtrosDoDashboardSchema }
