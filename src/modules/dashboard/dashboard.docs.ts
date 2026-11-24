import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { MENSAGENS_DOS_FILTROS } from '../../shared/http/filtros-do-painel'
import { POR_PAGINA_MAXIMO } from '../../shared/http/pagination'
import { envelope, lista } from '../../shared/http/respond'
import { MINIMO_DE_NOTAS_DO_PONTO, TAMANHO_DO_RANKING } from '../../shared/rules/ranking-de-pontos'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import {
  buscarCategorias,
  buscarComentarios,
  buscarEvolucao,
  buscarNpsPorSetor,
  buscarRanking,
  buscarResumo,
  COMENTARIOS_POR_PAGINA,
  comentarioRecenteSchema,
  indicadorCategoriaSchema,
  MAXIMO_DE_PONTOS,
  MENSAGENS_DE_PONTOS_DEMAIS,
  npsSetorSchema,
  pontoEvolucaoSchema,
  rankingSchema,
  resumoSchema,
  type ComentarioRecente,
  type IndicadorCategoria,
  type NpsSetor,
  type PontoEvolucao,
  type Ranking,
  type Resumo,
} from './dashboard.schemas'
import { MENSAGENS_DO_COMPLEMENTO } from '../pesquisa/pesquisa.schemas'

const TAGS = ['Dashboard']

const FILTROS =
  'Os filtros são os mesmos em todos os blocos: o período (`inicio` e `fim`, incluídos) comparado com a ' +
  '`base` (o dia do atendimento ou o dia do envio em Brasília), o setor, o turno e o canal. Super Admin e ' +
  'Ouvidoria veem todos os setores; o Gestor e o Visualizador, só os seus, mesmo sem pedir um setor.'

const RESUMO: Resumo = {
  nps: 42,
  total: 134,
  promotores: 78,
  neutros: 34,
  detratores: 22,
  notasBaixas: 25,
  baixissimas: 6,
  mediaEscala: 4.3,
}

const SETORES: NpsSetor[] = [
  { setorId: 3, setor: 'Pediatria', nps: 71, total: 28 },
  { setorId: 1, setor: 'Pronto Atendimento', nps: 38, total: 81 },
  { setorId: 2, setor: 'Ambulatório', nps: -4, total: 25 },
]

const EVOLUCAO: PontoEvolucao[] = [
  { periodo: '2026-10-26', nps: 35, total: 20 },
  { periodo: '2026-11-02', nps: 48, total: 41 },
  { periodo: '2026-11-09', nps: null, total: 0 },
  { periodo: '2026-11-16', nps: 40, total: 37 },
]

const CATEGORIAS: IndicadorCategoria[] = [
  { categoriaId: 1, categoria: 'Recepção', media: 4.4, percentual45: 86, total: 212 },
  { categoriaId: 2, categoria: 'Tempo de espera', media: 3.1, percentual45: 41, total: 198 },
  { categoriaId: 4, categoria: 'Limpeza', media: 4.6, percentual45: 91, total: 150 },
]

const RANKING: Ranking = {
  melhores: [
    {
      setorId: 3,
      setor: 'Pediatria',
      categoriaId: 4,
      categoria: 'Limpeza',
      media: 4.8,
      percentual45: 96,
      total: 25,
    },
    {
      setorId: 1,
      setor: 'Pronto Atendimento',
      categoriaId: 1,
      categoria: 'Recepção',
      media: 4.5,
      percentual45: 90,
      total: 61,
    },
  ],
  piores: [
    {
      setorId: 1,
      setor: 'Pronto Atendimento',
      categoriaId: 2,
      categoria: 'Tempo de espera',
      media: 2.6,
      percentual45: 22,
      total: 58,
    },
  ],
}

const COMENTARIOS: ComentarioRecente[] = [
  {
    id: 91,
    respostaId: 845,
    tipo: 'ELOGIO',
    texto: 'A equipe da recepção foi muito atenciosa com a minha mãe.',
    setor: 'Pronto Atendimento',
    dataAtendimento: '2026-11-10',
    enviadoEm: '2026-11-10T14:22:00.000Z',
    classificacao: 'NORMAL',
  },
  {
    id: 90,
    respostaId: 842,
    tipo: 'RECLAMACAO',
    texto: 'Esperei mais de duas horas sem nenhuma informação.',
    setor: 'Pronto Atendimento',
    dataAtendimento: '2026-11-10',
    enviadoEm: '2026-11-10T13:05:00.000Z',
    classificacao: 'BAIXA',
  },
]

const FILTROS_INVALIDOS =
  'sem `inicio`, `fim` ou `base`; data fora do formato AAAA-MM-DD ou que não existe; `fim` antes de ' +
  '`inicio`; ou `base`, `setorId`, `turnoId` ou `canal` fora dos valores aceitos'

const FILTROS_DO_DASHBOARD_INVALIDOS: ErroDaRota = {
  codigo: 'VALIDACAO',
  quando: `${FILTROS_INVALIDOS}.`,
  detalhes: [{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }],
}

/** Todos os perfis têm `dashboard:ver`: o 403 é o setor de fora ou a senha provisória. */
const SEM_PERMISSAO: ErroDaRota = {
  codigo: 'SEM_PERMISSAO',
  quando:
    'o Gestor ou o Visualizador pediu um `setorId` que não é seu, ou a pessoa está com a senha provisória. ' +
    'Os quatro perfis têm `dashboard:ver`.',
  mensagem: MENSAGEM_FORA_DO_SETOR,
}

export function documentarDashboard(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/resumo',
    tags: TAGS,
    summary: 'NPS, respostas, promotores, neutros, detratores e notas baixas',
    description: `Os cartões do topo do painel. ${FILTROS} Sem respostas, \`nps\` e \`mediaEscala\` vêm \`null\` e as contagens, 0.`,
    security: EXIGE_LOGIN,
    requisicao: buscarResumo,
    respostas: {
      200: respostaJson('Os números do período.', envelope(resumoSchema), { data: RESUMO }),
    },
    erros: [FILTROS_DO_DASHBOARD_INVALIDOS, 'NAO_AUTENTICADO', SEM_PERMISSAO],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/nps-por-setor',
    tags: TAGS,
    summary: 'NPS de cada setor, do maior para o menor',
    description:
      `Só os setores com respostas no período, também os desativados; a lista vazia quando nenhum teve. No ` +
      `empate do NPS, vem antes o setor com mais respostas e, depois, a ordem alfabética. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: buscarNpsPorSetor,
    respostas: {
      200: respostaJson('O NPS de cada setor.', envelope(z.array(npsSetorSchema)), { data: SETORES }),
    },
    erros: [FILTROS_DO_DASHBOARD_INVALIDOS, 'NAO_AUTENTICADO', SEM_PERMISSAO],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/evolucao',
    tags: TAGS,
    summary: 'NPS por dia, semana ou mês',
    description:
      'Um ponto por período, do que contém o `inicio` ao que contém o `fim`, em ordem, inclusive os sem ' +
      'resposta (`nps` `null` e `total` 0). O `periodo` é o primeiro dia: o próprio dia, a segunda-feira da ' +
      'semana ou o dia 1 do mês, mesmo antes do `inicio`; só contam as respostas de `inicio` a `fim`. No ' +
      `máximo ${MAXIMO_DE_PONTOS} pontos. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: buscarEvolucao,
    respostas: {
      200: respostaJson('Os pontos da evolução.', envelope(z.array(pontoEvolucaoSchema)), {
        data: EVOLUCAO,
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          `${FILTROS_INVALIDOS}; ou \`granularidade\` ausente, fora dos valores aceitos ou com mais de ` +
          `${MAXIMO_DE_PONTOS} pontos no período (em \`granularidade\`).`,
        detalhes: [{ campo: 'granularidade', mensagem: MENSAGENS_DE_PONTOS_DEMAIS.DIA }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
    ],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/categorias',
    tags: TAGS,
    summary: 'Média e % de notas 4 e 5 de cada categoria',
    description:
      'As notas de 1 a 5 de cada categoria, somando os setores, na ordem das categorias. Só vêm as ' +
      'categorias com notas no período, também as desativadas; a categoria de cada nota é a da pergunta no ' +
      `momento da resposta. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: buscarCategorias,
    respostas: {
      200: respostaJson('As notas de cada categoria.', envelope(z.array(indicadorCategoriaSchema)), {
        data: CATEGORIAS,
      }),
    },
    erros: [FILTROS_DO_DASHBOARD_INVALIDOS, 'NAO_AUTENTICADO', SEM_PERMISSAO],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/ranking',
    tags: TAGS,
    summary: 'Melhores e piores pontos (setor e categoria)',
    description:
      `Até ${TAMANHO_DO_RANKING} pontos em cada lista, só os com ${MINIMO_DE_NOTAS_DO_PONTO} notas de 1 a 5 ou ` +
      'mais no período. A ordem é a da média, depois a do % de notas 4 e 5 e, no empate, a do ponto com mais ' +
      'notas. Os piores saem dos que não estão nos melhores, então nenhum ponto aparece nas duas listas, e com ' +
      `poucos pontos a lista dos piores fica curta ou vazia. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: buscarRanking,
    respostas: {
      200: respostaJson('Os melhores e os piores pontos.', envelope(rankingSchema), { data: RANKING }),
    },
    erros: [FILTROS_DO_DASHBOARD_INVALIDOS, 'NAO_AUTENTICADO', SEM_PERMISSAO],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/dashboard/comentarios',
    tags: TAGS,
    summary: 'Comentários recentes',
    description:
      'Os comentários deixados depois das avaliações do período, do envio mais recente para o mais antigo, ' +
      `${COMENTARIOS_POR_PAGINA} por página se o pedido não disser outro número; \`meta.total\` conta todas as ` +
      'páginas. O `tipo` mostra só elogios, reclamações, sugestões ou outros. Exige também ' +
      `\`comentarios:ver\`, que o Visualizador não tem. ${FILTROS}`,
    security: EXIGE_LOGIN,
    requisicao: buscarComentarios,
    respostas: {
      200: respostaJson('Os comentários da página.', lista(comentarioRecenteSchema), {
        data: COMENTARIOS,
        meta: { pagina: 1, porPagina: COMENTARIOS_POR_PAGINA, total: 2 },
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          `${FILTROS_INVALIDOS}; ou \`tipo\`, \`pagina\` ou \`porPagina\` fora dos valores aceitos ` +
          `(\`porPagina\` de 1 a ${POR_PAGINA_MAXIMO}).`,
        detalhes: [{ campo: 'tipo', mensagem: MENSAGENS_DO_COMPLEMENTO.tipo }],
      },
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `comentarios:ver` (o Visualizador não a tem), num `setorId` que não é da pessoa ou ' +
          'com a senha provisória.',
      },
    ],
  })
}
