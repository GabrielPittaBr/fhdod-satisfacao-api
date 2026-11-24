import { filtrosDoDashboardSchema } from '../../shared/http/filtros-do-painel'

/** O `Content-Type` de uma planilha do Excel (.xlsx). */
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Os arquivos da exportação em Excel: o resumo, para todos os perfis, e as respostas, o detalhado. */
export const ARQUIVOS = ['resumo', 'respostas'] as const

export type Arquivo = (typeof ARQUIVOS)[number]

/**
 * Linhas de dados de uma aba, no máximo: o Excel abre até 1.048.576 linhas por aba, a do cabeçalho incluída.
 * Passou disso, a tabela continua numa aba nova, com o mesmo cabeçalho, como "Itens (2)".
 */
export const LINHAS_POR_ABA = 1_048_575

/** O nome do arquivo no download, com o período: `fhdod-resumo-2026-11-01-a-2026-11-30.xlsx`. */
export function nomeDaPlanilha(arquivo: Arquivo, { inicio, fim }: { inicio: string; fim: string }): string {
  return `fhdod-${arquivo}-${inicio}-a-${fim}.xlsx`
}

// ---------- Requisições ----------

// As exportações aceitam os filtros do dashboard, com o período e a base obrigatórios: o arquivo sai com o que
// está na tela, e o período dá o nome do arquivo.

export const exportarResumo = { query: filtrosDoDashboardSchema }

export const exportarRespostas = { query: filtrosDoDashboardSchema }
