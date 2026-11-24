import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { documentarRota, EXIGE_LOGIN, respostaArquivo, type ErroDaRota } from '../../shared/http/documentacao'
import { MENSAGENS_DOS_FILTROS } from '../../shared/http/filtros-do-painel'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import {
  exportarRespostas,
  exportarResumo,
  exportarResumoEmPdf,
  LINHAS_POR_ABA,
  nomeDoArquivo,
  PAGINAS_DO_PDF,
  TIPO_PDF,
  TIPO_XLSX,
} from './exportacao.schemas'

const TAGS = ['Exportações']

const PERIODO_DE_EXEMPLO = { inicio: '2026-11-01', fim: '2026-11-30' }

const FILTROS =
  'Os filtros e o escopo são os do dashboard: o período (`inicio` e `fim`, incluídos) comparado com a `base`, o ' +
  'setor, o turno e o canal. Super Admin e Ouvidoria exportam todos os setores; o Gestor e o Visualizador, só os ' +
  'seus, mesmo sem pedir um setor.'

const ENVIO =
  'O arquivo é gerado na hora e enviado em streaming, com o nome no `Content-Disposition`, os cabeçalhos em ' +
  'português e as datas e os números como data e número, no formato brasileiro. Um erro antes de o arquivo ' +
  'começar a sair vem no formato padrão; depois disso, a conexão é encerrada e o download fica incompleto. Cada ' +
  'exportação vai para a auditoria, com os filtros usados e se levou telefones.'

const FILTROS_INVALIDOS: ErroDaRota = {
  codigo: 'VALIDACAO',
  quando:
    'sem `inicio`, `fim` ou `base`; data fora do formato AAAA-MM-DD ou que não existe; `fim` antes de `inicio`; ' +
    'ou `base`, `setorId`, `turnoId` ou `canal` fora dos valores aceitos.',
  detalhes: [{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }],
}

export function documentarExportacao(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/exportacoes/resumo.xlsx',
    tags: TAGS,
    summary: 'Resumo dos indicadores em Excel',
    description:
      'Uma aba, Resumo: quem gerou e quando, os filtros aplicados, os números de `/dashboard/resumo`, o NPS por ' +
      'setor de `/dashboard/nps-por-setor` e as médias por categoria de `/dashboard/categorias`, com os mesmos ' +
      `filtros. Os quatro perfis têm \`exportacao:resumo\`. ${FILTROS} ${ENVIO}`,
    security: EXIGE_LOGIN,
    requisicao: exportarResumo,
    respostas: {
      200: respostaArquivo(
        'A planilha do resumo.',
        TIPO_XLSX,
        nomeDoArquivo('resumo', PERIODO_DE_EXEMPLO, 'xlsx'),
      ),
    },
    erros: [
      FILTROS_INVALIDOS,
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `exportacao:resumo`, num `setorId` que não é da pessoa ou com a senha provisória.',
        mensagem: MENSAGEM_FORA_DO_SETOR,
      },
    ],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/exportacoes/resumo.pdf',
    tags: TAGS,
    summary: 'Resumo dos indicadores em PDF',
    description:
      `O mesmo conteúdo do resumo em Excel, em no máximo ${PAGINAS_DO_PDF} páginas A4, para imprimir ou mandar à ` +
      'direção: quem gerou e quando, os filtros aplicados, os indicadores, o NPS por setor e as médias por ' +
      'categoria, com os números escritos como no Brasil (4,3, 1.234 e 67%). Se as tabelas não couberem nem com a ' +
      'letra menor, mostram as primeiras e as últimas linhas, com o aviso de quantas ficaram de fora. Sem gráficos. ' +
      'Gerado no servidor, sem navegador, e enviado na hora, com o nome no `Content-Disposition`; cada exportação ' +
      `vai para a auditoria. Os quatro perfis têm \`exportacao:resumo\`. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: exportarResumoEmPdf,
    respostas: {
      200: respostaArquivo('O PDF do resumo.', TIPO_PDF, nomeDoArquivo('resumo', PERIODO_DE_EXEMPLO, 'pdf')),
    },
    erros: [
      FILTROS_INVALIDOS,
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `exportacao:resumo`, num `setorId` que não é da pessoa ou com a senha provisória.',
        mensagem: MENSAGEM_FORA_DO_SETOR,
      },
    ],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/exportacoes/respostas.xlsx',
    tags: TAGS,
    summary: 'Respostas, itens e comentários em Excel',
    description:
      'As abas Resumo (a mesma do arquivo do resumo), Respostas (uma linha por envio), Itens (uma linha por ' +
      'pergunta respondida) e Comentários, do envio mais recente para o mais antigo; o código da resposta liga ' +
      'as abas. Quem tem `contatos:ver` (Super Admin e Ouvidoria) recebe na aba Respostas a coluna "Telefone para ' +
      'retorno", com o número completo; para os outros, a coluna não existe. Uma aba com mais de ' +
      `${LINHAS_POR_ABA.toLocaleString('pt-BR')} linhas, o limite do Excel, continua noutra, como "Itens (2)". ` +
      `Exige \`exportacao:detalhada\`, que o Visualizador não tem. ${FILTROS} ${ENVIO}`,
    security: EXIGE_LOGIN,
    requisicao: exportarRespostas,
    respostas: {
      200: respostaArquivo(
        'A planilha das respostas.',
        TIPO_XLSX,
        nomeDoArquivo('respostas', PERIODO_DE_EXEMPLO, 'xlsx'),
      ),
    },
    erros: [
      FILTROS_INVALIDOS,
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `exportacao:detalhada` (o Visualizador não a tem), num `setorId` que não é da pessoa ' +
          'ou com a senha provisória.',
        mensagem: MENSAGEM_FORA_DO_SETOR,
      },
    ],
  })
}
