import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { CONFIGURACOES_PADRAO } from '../../shared/constants/configuracoes'
import { documentarRota, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import { z } from 'zod'
import {
  abrirPesquisa,
  CABECALHO_DO_COMPLEMENTO,
  complementarResposta,
  enviarResposta,
  enviarRespostasGerais,
  MAXIMO_DE_SETORES_NO_ENVIO,
  MENSAGEM_JA_ENVIADA,
  MENSAGEM_NPS,
  MENSAGEM_PESQUISA_INDISPONIVEL,
  MENSAGEM_PRAZO_DO_COMPLEMENTO,
  MENSAGENS_DO_COMPLEMENTO,
  MENSAGENS_DO_ENVIO_GERAL,
  pesquisaGeralSchema,
  pesquisaPublicaSchema,
  respostaCriadaDoSetorSchema,
  respostaCriadaSchema,
  type PesquisaGeral,
  type PesquisaPublica,
  type RespostaCriada,
  type RespostaCriadaDoSetor,
} from './pesquisa.schemas'

const TAGS = ['Pesquisa pública']

/** Nome, no documento, do esquema de segurança do token de complemento. */
const ESQUEMA_DO_TOKEN_DE_COMPLEMENTO = 'tokenComplemento'

const PESQUISA_DE_EXEMPLO: PesquisaPublica = {
  setor: { nome: 'Pronto Atendimento', slug: 'pronto-atendimento' },
  perguntas: [
    { id: 12, texto: 'Como foi o atendimento na recepção?', tipo: 'ESCALA_1_5', opcoes: null },
    {
      id: 13,
      texto: 'Você recebeu as orientações sobre o exame?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim, e entendi tudo', 'Sim, mas fiquei com dúvidas', 'Não'],
    },
    { id: 14, texto: 'O tempo de espera foi informado?', tipo: 'SIM_NAO', opcoes: null },
  ],
  turnos: [
    { id: 1, nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00' },
    { id: 2, nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00' },
    { id: 3, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' },
  ],
  npsTexto: CONFIGURACOES_PADRAO.nps_texto,
  textoLimiteCaracteres: CONFIGURACOES_PADRAO.texto_limite_caracteres,
  totem: {
    reinicioSegundos: CONFIGURACOES_PADRAO.totem_reinicio_segundos,
    inatividadeSegundos: CONFIGURACOES_PADRAO.totem_inatividade_segundos,
  },
}

const RESPOSTA_CRIADA: RespostaCriada = {
  id: 845,
  classificacao: 'BAIXA',
  tokenComplemento: 'kZ3pX9qT2vLm8RwYc4Nf6Hb1Jd7Ks0Ga5Ue3Oi9Py2',
  expiraEm: '2026-11-10T14:52:00.000Z',
}

const PESQUISA_GERAL_DE_EXEMPLO: PesquisaGeral = {
  setores: [
    {
      nome: 'Laboratório',
      slug: 'laboratorio',
      descricao: 'Coleta e exames',
      perguntas: [{ id: 21, texto: 'Como foi a coleta do exame?', tipo: 'ESCALA_1_5', opcoes: null }],
    },
    {
      nome: 'Pronto Atendimento',
      slug: 'pronto-atendimento',
      descricao: 'Urgência e emergência, 24 horas',
      perguntas: PESQUISA_DE_EXEMPLO.perguntas,
    },
  ],
  turnos: PESQUISA_DE_EXEMPLO.turnos,
  npsTexto: PESQUISA_DE_EXEMPLO.npsTexto,
  textoLimiteCaracteres: PESQUISA_DE_EXEMPLO.textoLimiteCaracteres,
}

const RESPOSTAS_CRIADAS_DOS_SETORES: RespostaCriadaDoSetor[] = [
  {
    slug: 'laboratorio',
    id: 846,
    classificacao: 'NORMAL',
    tokenComplemento: 'Qm7vT1xZ8cLp3RwYk5Nd2Hf9Jb6Ks4Ga0Ue1Oi7Py3',
    expiraEm: '2026-11-10T14:52:00.000Z',
  },
  {
    slug: 'pronto-atendimento',
    id: 847,
    classificacao: 'BAIXA',
    tokenComplemento: 'Vn2pR8yW5qMx1LsTc7Kd4Gh0Jf3Bz9Ea6Ui2Oo8Py5',
    expiraEm: '2026-11-10T14:52:00.000Z',
  },
]

const PESQUISA_INDISPONIVEL: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe setor com este endereço, ou ele está desativado.',
  mensagem: MENSAGEM_PESQUISA_INDISPONIVEL,
}

const LIMITE_DE_ENVIOS: ErroDaRota = {
  codigo: 'LIMITE_ATINGIDO',
  quando:
    'mais de 30 envios do mesmo IP em 15 minutos, somando os do envio de um setor e os da pesquisa geral ' +
    '(um envio geral conta uma vez, com qualquer número de setores).',
  mensagem: 'Muitas avaliações enviadas desta rede. Espere alguns minutos e tente de novo.',
}

export function documentarPesquisa(registry: OpenAPIRegistry) {
  registry.registerComponent('securitySchemes', ESQUEMA_DO_TOKEN_DE_COMPLEMENTO, {
    type: 'apiKey',
    in: 'header',
    name: CABECALHO_DO_COMPLEMENTO,
    description:
      'O `tokenComplemento` devolvido pelo envio da avaliação, para anexar o comentário e o telefone a ela. ' +
      'Vale uma vez só, até 30 minutos depois do envio.',
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/publico/setores/{slug}/pesquisa',
    tags: TAGS,
    summary: 'Abre a pesquisa do setor',
    description:
      'Sem login. O nome do setor, as perguntas ativas na ordem, os turnos e os textos e tempos que a tela ' +
      'usa, lidos das configurações.',
    requisicao: abrirPesquisa,
    respostas: {
      200: respostaJson('A pesquisa do setor.', envelope(pesquisaPublicaSchema), {
        data: PESQUISA_DE_EXEMPLO,
      }),
    },
    erros: [PESQUISA_INDISPONIVEL],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/publico/pesquisa',
    tags: TAGS,
    summary: 'Abre a pesquisa geral',
    description:
      'Sem login. A pesquisa do link geral (`/avaliar`), em que a pessoa escolhe um ou mais setores e responde ' +
      'só as perguntas deles: os setores ativos em ordem alfabética, cada um com a descrição e as perguntas ' +
      'ativas na ordem, os turnos e os textos que a tela usa. Sem setores ativos, a lista vem vazia.',
    respostas: {
      200: respostaJson('A pesquisa geral.', envelope(pesquisaGeralSchema), {
        data: PESQUISA_GERAL_DE_EXEMPLO,
      }),
    },
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/publico/setores/{slug}/respostas',
    tags: TAGS,
    summary: 'Envia a avaliação',
    description:
      'Sem login, com limite de envios por IP (os IPs do `RATE_LIMIT_ALLOWLIST`, como o do hospital, ficam ' +
      'fora dele). Grava a avaliação ao confirmar a nota de 0 a 10, mesmo sem nenhuma outra pergunta ' +
      'respondida, e devolve a classificação e o token de complemento, numa resposta sem cache. A mesma ' +
      '`chaveIdempotencia` enviada de novo devolve a avaliação já gravada (o mesmo `id` e a mesma ' +
      '`classificacao`), com um token novo, que substitui o anterior. O IP de quem envia não é gravado.',
    requisicao: enviarResposta,
    respostas: {
      201: respostaJson('Avaliação gravada (ou já gravada, num reenvio).', envelope(respostaCriadaSchema), {
        data: RESPOSTA_CRIADA,
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'um item em `detalhes` por problema: NPS fora de 0 a 10 (em `nps`), data futura (em ' +
          '`dataAtendimento`), turno inexistente (em `turnoId`), chave que não é UUID (em `chaveIdempotencia`), ' +
          'pergunta que não é uma ativa do setor ou repetida (em `itens.N`), valor errado para o tipo da ' +
          'pergunta (em `itens.N.valorNumero` ou `itens.N.valorTexto`) e o campo isca preenchido (em `site`).',
        detalhes: [{ campo: 'nps', mensagem: MENSAGEM_NPS }],
      },
      PESQUISA_INDISPONIVEL,
      {
        codigo: 'CONFLITO',
        quando: 'a chave já foi usada num envio de outro setor, ou no de uma avaliação já complementada.',
        mensagem: MENSAGEM_JA_ENVIADA,
      },
      LIMITE_DE_ENVIOS,
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/publico/respostas',
    tags: TAGS,
    summary: 'Envia a avaliação de um ou mais setores',
    description:
      'Sem login, com o mesmo limite de envios do envio de um setor. A pesquisa geral grava, ao confirmar a ' +
      'nota de 0 a 10, uma avaliação por setor escolhido, todas com a mesma nota, data, turno e canal; cada uma ' +
      'com os itens do próprio setor, a classificação pelas notas dele e um token de complemento. As avaliações ' +
      'entram numa transação só: com um problema em qualquer setor, nada é gravado. A resposta vem na ordem do ' +
      'pedido, sem cache. O comentário e o telefone vão depois, pelo complemento de uma delas. Reenviar as ' +
      'mesmas chaves devolve as avaliações já gravadas, com tokens novos. O IP de quem envia não é gravado.',
    requisicao: enviarRespostasGerais,
    respostas: {
      201: respostaJson(
        'Avaliações gravadas (ou já gravadas, num reenvio), uma por setor, na ordem do pedido.',
        envelope(z.array(respostaCriadaDoSetorSchema)),
        { data: RESPOSTAS_CRIADAS_DOS_SETORES },
      ),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'um item em `detalhes` por problema: nenhum setor ou mais de ' +
          `${MAXIMO_DE_SETORES_NO_ENVIO} (em \`setores\`), setor repetido, inexistente ou desativado (em ` +
          '`setores.N.slug`), chave repetida ou que não é UUID (em `setores.N.chaveIdempotencia`), pergunta que ' +
          'não é uma ativa daquele setor ou repetida (em `setores.N.itens.M`), valor errado para o tipo da ' +
          'pergunta (em `setores.N.itens.M.valorNumero` ou `setores.N.itens.M.valorTexto`), e o NPS, a data, o ' +
          'turno e o campo isca como no envio de um setor.',
        detalhes: [{ campo: 'setores.1.slug', mensagem: MENSAGENS_DO_ENVIO_GERAL.setorIndisponivel }],
      },
      {
        codigo: 'CONFLITO',
        quando:
          'só parte das chaves já foi gravada, uma chave foi usada noutro setor ou uma das avaliações já foi ' +
          'complementada.',
        mensagem: MENSAGEM_JA_ENVIADA,
      },
      LIMITE_DE_ENVIOS,
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/publico/respostas/{id}/complemento',
    tags: TAGS,
    summary: 'Anexa o comentário e o pedido de retorno',
    description:
      `Sem login: vale o token de complemento do envio, no cabeçalho \`${CABECALHO_DO_COMPLEMENTO}\`, uma vez ` +
      'só e até 30 minutos depois do envio. Anexa o comentário, o pedido de retorno ou os dois, numa chamada só: ' +
      'depois dela, o token não vale mais, mesmo dentro do prazo. O telefone é gravado cifrado (AES-256-GCM), ' +
      'com os 4 últimos dígitos em claro e a hora do consentimento, e o pedido de retorno nasce `NOVO`. Um ' +
      'erro de validação não gasta o token. O telefone não aparece em nenhuma resposta nem no log.',
    security: [{ [ESQUEMA_DO_TOKEN_DE_COMPLEMENTO]: [] }],
    requisicao: complementarResposta,
    respostas: { 204: { description: 'Complemento gravado.' } },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'um item em `detalhes` por problema: corpo sem o comentário nem o telefone (em `body`), tipo fora da ' +
          'lista (em `comentario.tipo`), texto vazio ou acima do `textoLimiteCaracteres` (em `comentario.texto`), ' +
          'telefone sem DDD ou sem 10 ou 11 dígitos (em `contato.telefone`) e consentimento que não é `true` (em ' +
          '`contato.consentimento`).',
        detalhes: [{ campo: 'contato.telefone', mensagem: MENSAGENS_DO_COMPLEMENTO.telefone }],
      },
      {
        codigo: 'NAO_AUTENTICADO',
        quando: 'sem o token, com o token de outra avaliação, vencido ou já usado.',
        mensagem: MENSAGEM_PRAZO_DO_COMPLEMENTO,
      },
    ],
  })
}
