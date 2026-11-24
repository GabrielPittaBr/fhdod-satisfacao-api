import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  alterarStatusDaTela,
  CABECALHO_DA_TELA,
  criarTela,
  indicadoresTvSchema,
  MENSAGEM_TELA_INATIVA,
  MENSAGEM_TELA_NAO_ENCONTRADA,
  MINUTOS_ENTRE_ACESSOS,
  telaTvCriadaSchema,
  telaTvSchema,
  type IndicadoresTv,
  type TelaTv,
  type TelaTvCriada,
} from './tv-wall.schemas'

const TAGS = ['TV Wall']

/** Nome, no documento, do esquema de segurança do token da tela (`X-Tv-Token`). */
const ESQUEMA_DO_TOKEN_DA_TELA = 'tokenTv'

const RECEPCAO: TelaTv = {
  id: 1,
  nome: 'Recepção principal',
  ativa: true,
  ultimoAcessoEm: '2026-11-24T14:55:02.318Z',
}

const TELAS: TelaTv[] = [
  { id: 2, nome: 'Corredor da Internação', ativa: false, ultimoAcessoEm: '2026-11-10T21:40:11.006Z' },
  { id: 3, nome: 'Pronto Atendimento', ativa: true, ultimoAcessoEm: null },
  RECEPCAO,
]

const CRIADA: TelaTvCriada = {
  tela: { id: 3, nome: 'Pronto Atendimento', ativa: true, ultimoAcessoEm: null },
  token: 'jIWDi92T12y8w3ZdkfQFXBxKOtO28BLzEKAK84UyMNs',
}

const INDICADORES: IndicadoresTv = {
  tela: 'Recepção principal',
  geradoEm: '2026-11-24T15:00:00.000Z',
  mes: { nps: 42, total: 134, promotores: 78, neutros: 34, detratores: 22, mediaEscala: 4.3 },
  npsPorSetor: [
    { setor: 'Pediatria', nps: 71, total: 28 },
    { setor: 'Pronto Atendimento', nps: 38, total: 81 },
    { setor: 'Ambulatório', nps: -4, total: 25 },
  ],
  evolucao: [
    { periodo: '2026-09-07', nps: 35, total: 22 },
    { periodo: '2026-09-14', nps: 41, total: 30 },
    { periodo: '2026-09-21', nps: 38, total: 27 },
    { periodo: '2026-09-28', nps: 44, total: 33 },
    { periodo: '2026-10-05', nps: null, total: 0 },
    { periodo: '2026-10-12', nps: 40, total: 29 },
    { periodo: '2026-10-19', nps: 46, total: 35 },
    { periodo: '2026-10-26', nps: 39, total: 31 },
    { periodo: '2026-11-02', nps: 48, total: 41 },
    { periodo: '2026-11-09', nps: 36, total: 30 },
    { periodo: '2026-11-16', nps: 40, total: 37 },
    { periodo: '2026-11-23', nps: 50, total: 12 },
  ],
  destaques: [
    { setor: 'Pediatria', categoria: 'Limpeza', media: 4.8, percentual45: 96 },
    { setor: 'Pronto Atendimento', categoria: 'Recepção', media: 4.5, percentual45: 90 },
    { setor: 'Ambulatório', categoria: 'Enfermagem', media: 4.4, percentual45: 88 },
  ],
}

/** Quem não tem a permissão de gerenciar as telas e, como em toda rota do painel, quem está com a senha provisória. */
const SEM_PERMISSAO_PARA_GERENCIAR: ErroDaRota = {
  codigo: 'SEM_PERMISSAO',
  quando: 'sem a permissão `tvwall:gerenciar` (só o Super Admin a tem) ou com a senha provisória.',
}

const TELA_INEXISTENTE: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe tela com este ID.',
  mensagem: MENSAGEM_TELA_NAO_ENCONTRADA,
}

export function documentarTvWall(registry: OpenAPIRegistry) {
  registry.registerComponent('securitySchemes', ESQUEMA_DO_TOKEN_DA_TELA, {
    type: 'apiKey',
    in: 'header',
    name: CABECALHO_DA_TELA,
    description:
      'O token do link da tela, o que vem depois do `#` em `/tv#<token>`, devolvido uma vez só pelo ' +
      '`POST /tv-telas`. Vale enquanto a tela estiver ativa.',
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/tv-telas',
    tags: TAGS,
    summary: 'Telas de TV cadastradas',
    description:
      'Ativas e desativadas, em ordem alfabética e sem paginação. O token não volta: ele só aparece na criação. ' +
      `O \`ultimoAcessoEm\` mostra se a TV está ligada; ele é gravado no máximo a cada ${MINUTOS_ENTRE_ACESSOS} ` +
      'minutos, e a TV consulta os indicadores a cada 30 s.',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('As telas, em ordem alfabética.', envelope(z.array(telaTvSchema)), { data: TELAS }),
    },
    erros: ['NAO_AUTENTICADO', SEM_PERMISSAO_PARA_GERENCIAR],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/tv-telas',
    tags: TAGS,
    summary: 'Cria uma tela e devolve o token do link, uma única vez',
    description:
      'A tela nasce ativa. O `token` só aparece nesta resposta, que não fica em cache (`Cache-Control: ' +
      'no-store`): o banco guarda o hash, e o link não pode ser mostrado de novo. O front monta o link ' +
      '`/tv#<token>`, com o token depois do `#`, a parte da URL que o navegador não envia ao servidor. Perdido o ' +
      'link, a tela é desativada e outra é criada.',
    security: EXIGE_LOGIN,
    requisicao: criarTela,
    respostas: {
      201: respostaJson('Tela criada, com o token do link.', envelope(telaTvCriadaSchema), { data: CRIADA }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'nome com menos de 2 ou mais de 100 caracteres, sem contar os espaços das pontas (em `nome`).',
        detalhes: [{ campo: 'nome', mensagem: 'Informe onde a tela fica' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/tv-telas/{id}/status',
    tags: TAGS,
    summary: 'Ativa ou desativa uma tela',
    description:
      'Desativada, a tela para de abrir na consulta seguinte da TV, em até 30 s: o link recebe 401. Ativada de ' +
      'novo, o mesmo link volta a abrir. Nada é apagado.',
    security: EXIGE_LOGIN,
    requisicao: alterarStatusDaTela,
    respostas: { 204: { description: 'Situação da tela atualizada.' } },
    erros: [
      { codigo: 'VALIDACAO', detalhes: [{ campo: 'ativa', mensagem: 'Obrigatório' }] },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      TELA_INEXISTENTE,
    ],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/tv/indicadores',
    tags: TAGS,
    summary: 'Indicadores gerais para a TV',
    description:
      `Sem login: vale o token do link da tela, no cabeçalho \`${CABECALHO_DA_TELA}\`. A TV consulta a cada 30 s. ` +
      'Os números juntam todos os setores, também os desativados, com as mesmas contas do dashboard e pela data ' +
      'do atendimento, e são só contagens e médias: nenhum comentário, telefone ou texto escrito pelo paciente. ' +
      `O último acesso da tela é gravado no máximo a cada ${MINUTOS_ENTRE_ACESSOS} minutos.`,
    security: [{ [ESQUEMA_DO_TOKEN_DA_TELA]: [] }],
    respostas: {
      200: respostaJson('Os números da TV.', envelope(indicadoresTvSchema), { data: INDICADORES }),
    },
    erros: [
      {
        codigo: 'NAO_AUTENTICADO',
        quando: 'sem o token, com um que não existe ou com o de uma tela desativada.',
        mensagem: MENSAGEM_TELA_INATIVA,
      },
    ],
  })
}
