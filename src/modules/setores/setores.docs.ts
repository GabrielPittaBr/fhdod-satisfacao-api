import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  alterarStatusDoSetor,
  criarSetor,
  editarSetor,
  MENSAGEM_SETOR_NAO_ENCONTRADO,
  MENSAGEM_SLUG_REPETIDO,
  setorSchema,
  type Setor,
} from './setores.schemas'

const TAGS = ['Setores']

const PRONTO_ATENDIMENTO: Setor = {
  id: 1,
  nome: 'Pronto Atendimento',
  slug: 'pronto-atendimento',
  descricao: 'Urgência e emergência, 24 horas',
  ativo: true,
}

const SETORES_DE_EXEMPLO: Setor[] = [
  { id: 5, nome: 'Ambulatório', slug: 'ambulatorio', descricao: 'Consultas agendadas', ativo: true },
  {
    id: 6,
    nome: 'Maternidade',
    slug: 'maternidade',
    descricao: 'Em reforma: pesquisa pausada',
    ativo: false,
  },
  PRONTO_ATENDIMENTO,
]

/** Quem não tem a permissão de gerenciar setores e, como em toda rota do painel, quem está com a senha provisória. */
const SEM_PERMISSAO_PARA_GERENCIAR = {
  codigo: 'SEM_PERMISSAO',
  quando: 'sem a permissão `setores:gerenciar` (só o Super Admin a tem) ou com a senha provisória.',
} as const

const SLUG_REPETIDO = {
  codigo: 'CONFLITO',
  quando: 'o slug já é de outro setor.',
  mensagem: MENSAGEM_SLUG_REPETIDO,
} as const

const SETOR_INEXISTENTE = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe setor com este ID.',
  mensagem: MENSAGEM_SETOR_NAO_ENCONTRADO,
} as const

export function documentarSetores(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/setores',
    tags: TAGS,
    summary: 'Setores que a pessoa enxerga',
    description:
      'Ativos e inativos, em ordem alfabética e sem paginação. Super Admin e Ouvidoria recebem todos; ' +
      'Gestor e Visualizador, só os seus. Qualquer perfil pode listar; só o Super Admin cria e edita.',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('Os setores, em ordem alfabética.', envelope(z.array(setorSchema)), {
        data: SETORES_DE_EXEMPLO,
      }),
    },
    erros: [
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando: 'com a senha provisória, até a troca.',
        mensagem: 'Troque a senha provisória para continuar.',
      },
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/setores',
    tags: TAGS,
    summary: 'Cria um setor',
    description: 'O setor nasce ativo, e a pesquisa dele já fica no ar em `/s/<slug>` e `/totem/<slug>`.',
    security: EXIGE_LOGIN,
    requisicao: criarSetor,
    respostas: {
      201: respostaJson('Setor criado.', envelope(setorSchema), { data: PRONTO_ATENDIMENTO }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando: 'nome com menos de 2 caracteres (em `nome`) ou slug fora do formato (em `slug`).',
        detalhes: [{ campo: 'slug', mensagem: 'Use só letras minúsculas, números e hífen, sem espaços' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      SLUG_REPETIDO,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/setores/{id}',
    tags: TAGS,
    summary: 'Edita nome, slug ou descrição',
    description:
      'Só os campos enviados mudam. Mudar o slug muda os links da pesquisa e do totem, e os QR Codes já ' +
      'impressos deixam de abrir a pesquisa.',
    security: EXIGE_LOGIN,
    requisicao: editarSetor,
    respostas: {
      200: respostaJson('Setor editado.', envelope(setorSchema), { data: PRONTO_ATENDIMENTO }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'nome com menos de 2 caracteres (em `nome`), slug fora do formato (em `slug`) ou nenhum campo ' +
          'para mudar.',
        detalhes: [{ campo: 'nome', mensagem: 'Informe o nome do setor' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      SETOR_INEXISTENTE,
      SLUG_REPETIDO,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/setores/{id}/status',
    tags: TAGS,
    summary: 'Ativa ou desativa um setor',
    description:
      'Nada é apagado. O setor inativo sai da pesquisa pública, mas as respostas dele continuam nos ' +
      'indicadores, e ele continua na lista de setores do painel.',
    security: EXIGE_LOGIN,
    requisicao: alterarStatusDoSetor,
    respostas: { 204: { description: 'Situação do setor atualizada.' } },
    erros: [
      { codigo: 'VALIDACAO', detalhes: [{ campo: 'ativo', mensagem: 'Obrigatório' }] },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      SETOR_INEXISTENTE,
    ],
  })
}
