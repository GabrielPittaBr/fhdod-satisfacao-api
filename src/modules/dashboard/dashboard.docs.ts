import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { MENSAGENS_DOS_FILTROS } from '../../shared/http/filtros-do-painel'
import { envelope } from '../../shared/http/respond'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import {
  buscarEvolucao,
  buscarNpsPorSetor,
  buscarResumo,
  MAXIMO_DE_PONTOS,
  MENSAGENS_DE_PONTOS_DEMAIS,
  npsSetorSchema,
  pontoEvolucaoSchema,
  resumoSchema,
  type NpsSetor,
  type PontoEvolucao,
  type Resumo,
} from './dashboard.schemas'

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
}
