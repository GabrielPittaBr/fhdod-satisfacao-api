import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import { MENSAGEM_SETOR_NAO_ENCONTRADO } from '../setores/setores.schemas'
import {
  alterarStatusDaPergunta,
  criarPergunta,
  editarPergunta,
  listarPerguntas,
  MENSAGEM_LISTA_INCOMPLETA,
  MENSAGEM_PERGUNTA_NAO_ENCONTRADA,
  MENSAGEM_TIPO_TRAVADO,
  MENSAGENS_DAS_OPCOES,
  ordenarPerguntas,
  perguntaSchema,
  type Pergunta,
} from './perguntas.schemas'

const TAGS = ['Perguntas']

const RECEPCAO: Pergunta = {
  id: 12,
  setorId: 1,
  categoriaId: 1,
  texto: 'Como foi o atendimento na recepção?',
  tipo: 'ESCALA_1_5',
  opcoes: null,
  ordem: 1,
  ativa: true,
  temRespostas: true,
}

const ORIENTACOES: Pergunta = {
  id: 13,
  setorId: 1,
  categoriaId: 4,
  texto: 'Você recebeu as orientações sobre o exame?',
  tipo: 'MULTIPLA_ESCOLHA',
  opcoes: ['Sim, e entendi tudo', 'Sim, mas fiquei com dúvidas', 'Não'],
  ordem: 2,
  ativa: true,
  temRespostas: false,
}

const PERGUNTAS_DE_EXEMPLO: Pergunta[] = [
  RECEPCAO,
  ORIENTACOES,
  {
    id: 14,
    setorId: 1,
    categoriaId: 7,
    texto: 'O tempo de espera foi informado?',
    tipo: 'SIM_NAO',
    opcoes: null,
    ordem: 3,
    ativa: false,
    temRespostas: true,
  },
]

/** Quem não tem `perguntas:gerenciar`, quem pede um setor que não é seu e, como em toda rota do painel, quem está com a senha provisória. */
const SEM_PERMISSAO: ErroDaRota = {
  codigo: 'SEM_PERMISSAO',
  quando:
    'sem a permissão `perguntas:gerenciar` (Super Admin e Gestor a têm), num setor que não é da pessoa ou ' +
    'com a senha provisória.',
  mensagem: MENSAGEM_FORA_DO_SETOR,
}

const SETOR_INEXISTENTE: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe setor com este ID.',
  mensagem: MENSAGEM_SETOR_NAO_ENCONTRADO,
}

const PERGUNTA_INEXISTENTE: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe pergunta com este ID.',
  mensagem: MENSAGEM_PERGUNTA_NAO_ENCONTRADA,
}

const PERGUNTA_INVALIDA: ErroDaRota = {
  codigo: 'VALIDACAO',
  quando:
    'texto fora de 5 a 140 caracteres (em `texto`), categoria inexistente ou desativada (em `categoriaId`), ' +
    'tipo desconhecido (em `tipo`) ou opções erradas para o tipo (em `opcoes`).',
  detalhes: [{ campo: 'opcoes', mensagem: MENSAGENS_DAS_OPCOES.repetida }],
}

export function documentarPerguntas(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/setores/{setorId}/perguntas',
    tags: TAGS,
    summary: 'Perguntas do setor, na ordem',
    description:
      'Ativas e inativas, na ordem da pesquisa e sem paginação. O Gestor só lê as dos seus setores; o Super ' +
      'Admin, as de qualquer um.',
    security: EXIGE_LOGIN,
    requisicao: listarPerguntas,
    respostas: {
      200: respostaJson('As perguntas do setor, na ordem.', envelope(z.array(perguntaSchema)), {
        data: PERGUNTAS_DE_EXEMPLO,
      }),
    },
    erros: ['NAO_AUTENTICADO', SEM_PERMISSAO, SETOR_INEXISTENTE],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/setores/{setorId}/perguntas',
    tags: TAGS,
    summary: 'Cria uma pergunta no setor',
    description: 'A pergunta nasce ativa e entra no fim da ordem do setor. A criação vai para a auditoria.',
    security: EXIGE_LOGIN,
    requisicao: criarPergunta,
    respostas: {
      201: respostaJson('Pergunta criada.', envelope(perguntaSchema), {
        data: { ...ORIENTACOES, id: 15, ordem: 4 },
      }),
    },
    erros: [PERGUNTA_INVALIDA, 'NAO_AUTENTICADO', SEM_PERMISSAO, SETOR_INEXISTENTE],
  })

  documentarRota(registry, {
    method: 'put',
    path: '/api/v1/setores/{setorId}/perguntas/ordem',
    tags: TAGS,
    summary: 'Salva a nova ordem das perguntas do setor',
    description:
      'Recebe os IDs de todas as perguntas do setor, ativas e inativas, na ordem nova. A mudança vai para a ' +
      'auditoria, com a ordem de antes e a de depois.',
    security: EXIGE_LOGIN,
    requisicao: ordenarPerguntas,
    respostas: { 204: { description: 'Ordem salva.' } },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando: 'a lista não tem todas as perguntas do setor, uma vez cada, e só elas (em `ids`).',
        detalhes: [{ campo: 'ids', mensagem: MENSAGEM_LISTA_INCOMPLETA }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      SETOR_INEXISTENTE,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/perguntas/{id}',
    tags: TAGS,
    summary: 'Edita o texto, a categoria, o tipo e as opções',
    description:
      'Recebe a pergunta inteira, como na criação; a ordem e a situação não mudam. As respostas antigas ' +
      'guardam o texto que o paciente leu. Uma pergunta que já tem respostas não muda de tipo. A edição vai ' +
      'para a auditoria, com o antes e o depois.',
    security: EXIGE_LOGIN,
    requisicao: editarPergunta,
    respostas: {
      200: respostaJson('Pergunta editada.', envelope(perguntaSchema), { data: RECEPCAO }),
    },
    erros: [
      PERGUNTA_INVALIDA,
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      PERGUNTA_INEXISTENTE,
      {
        codigo: 'CONFLITO',
        quando: 'a pergunta já tem respostas e o tipo mudou.',
        mensagem: MENSAGEM_TIPO_TRAVADO,
      },
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/perguntas/{id}/status',
    tags: TAGS,
    summary: 'Ativa ou desativa uma pergunta',
    description:
      'Nada é apagado: a pergunta inativa sai da pesquisa, e as respostas dela continuam nos indicadores. ' +
      'A mudança vai para a auditoria.',
    security: EXIGE_LOGIN,
    requisicao: alterarStatusDaPergunta,
    respostas: { 204: { description: 'Situação da pergunta atualizada.' } },
    erros: [
      { codigo: 'VALIDACAO', detalhes: [{ campo: 'ativa', mensagem: 'Obrigatório' }] },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      PERGUNTA_INEXISTENTE,
    ],
  })
}
