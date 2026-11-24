import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { documentarRota, EXIGE_LOGIN, respostaJson } from '../../shared/http/documentacao'
import { MENSAGENS_DOS_FILTROS } from '../../shared/http/filtros-do-painel'
import { POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO } from '../../shared/http/pagination'
import { envelope, lista } from '../../shared/http/respond'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import {
  buscarResposta,
  listarRespostas,
  MENSAGEM_RESPOSTA_NAO_ENCONTRADA,
  respostaDetalheSchema,
  respostaResumoSchema,
  type RespostaDetalhe,
  type RespostaResumo,
} from './respostas.schemas'

const TAGS = ['Respostas']

const RESPOSTAS: RespostaResumo[] = [
  {
    id: 845,
    setorId: 1,
    setor: 'Pronto Atendimento',
    canal: 'TOTEM',
    dataAtendimento: '2026-11-10',
    turno: 'Manhã',
    nps: 3,
    classificacao: 'BAIXA',
    enviadoEm: '2026-11-10T14:22:00.000Z',
    temComentario: true,
    pediuRetorno: true,
  },
  {
    id: 844,
    setorId: 3,
    setor: 'Pediatria',
    canal: 'WEB',
    dataAtendimento: '2026-11-09',
    turno: 'Tarde',
    nps: 10,
    classificacao: 'NORMAL',
    enviadoEm: '2026-11-10T12:05:00.000Z',
    temComentario: false,
    pediuRetorno: false,
  },
]

const DETALHE: RespostaDetalhe = {
  ...RESPOSTAS[0]!,
  itens: [
    {
      perguntaId: 12,
      perguntaTexto: 'Como você avalia o atendimento na recepção?',
      categoria: 'Recepção',
      tipo: 'ESCALA_1_5',
      valorNumero: 2,
      valorTexto: null,
      classificacao: 'BAIXA',
    },
    {
      perguntaId: 13,
      perguntaTexto: 'Você foi chamado pelo nome?',
      categoria: 'Triagem',
      tipo: 'SIM_NAO',
      valorNumero: null,
      valorTexto: 'NAO',
      classificacao: null,
    },
  ],
  comentario: { tipo: 'RECLAMACAO', texto: 'Esperei mais de duas horas sem nenhuma informação.' },
  contato: { id: 31, telefoneMascarado: '•••• 0042', status: 'NOVO' },
}

const ACESSO =
  'Exige `respostas:ver`: o Super Admin, o Gestor e a Ouvidoria; o Visualizador não tem. Super Admin e ' +
  'Ouvidoria veem todos os setores; o Gestor, só os seus.'

export function documentarRespostas(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/respostas',
    tags: TAGS,
    summary: 'Avaliações uma a uma, com filtros e ordenação',
    description:
      'Os filtros do painel são todos opcionais aqui: sem `inicio` ou sem `fim`, o período fica aberto daquele ' +
      'lado, e sem `base` vale o dia do atendimento. Além deles, a classificação e se a avaliação tem ' +
      `comentário ou pedido de retorno. ${POR_PAGINA_PADRAO} por página se o pedido não disser outro número; ` +
      '`meta.total` conta todas as páginas. Sem `ordenarPor` e `ordem`, do envio mais recente para o mais ' +
      `antigo. O telefone nunca aparece na lista. ${ACESSO}`,
    security: EXIGE_LOGIN,
    requisicao: listarRespostas,
    respostas: {
      200: respostaJson('As avaliações da página.', lista(respostaResumoSchema), {
        data: RESPOSTAS,
        meta: { pagina: 1, porPagina: POR_PAGINA_PADRAO, total: 134 },
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'data fora do formato AAAA-MM-DD ou que não existe; `fim` antes de `inicio`; ou `base`, `setorId`, ' +
          '`turnoId`, `canal`, `classificacao`, `comComentario`, `comRetorno`, `pagina`, `porPagina` (de 1 a ' +
          `${POR_PAGINA_MAXIMO}), \`ordenarPor\` ou \`ordem\` fora dos valores aceitos.`,
        detalhes: [{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }],
      },
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `respostas:ver` (o Visualizador não a tem), num `setorId` que não é da pessoa ou ' +
          'com a senha provisória.',
      },
    ],
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/respostas/{id}',
    tags: TAGS,
    summary: 'Uma avaliação inteira',
    description:
      'O resumo da lista, as perguntas como o paciente as viu (o texto, a categoria e o tipo do momento da ' +
      'resposta), a nota de cada uma, o comentário e o pedido de retorno. Cada nota de 1 a 5 vem classificada ' +
      'com os limites de agora. O telefone vem mascarado, com os 4 últimos dígitos; o número completo só sai em ' +
      `\`POST /contatos/{id}/revelar-telefone\`, com \`contatos:ver\`. ${ACESSO}`,
    security: EXIGE_LOGIN,
    requisicao: buscarResposta,
    respostas: {
      200: respostaJson('A avaliação.', envelope(respostaDetalheSchema), { data: DETALHE }),
    },
    erros: [
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando:
          'sem a permissão `respostas:ver` (o Visualizador não a tem), numa resposta de um setor que não é da ' +
          'pessoa ou com a senha provisória.',
        mensagem: MENSAGEM_FORA_DO_SETOR,
      },
      {
        codigo: 'NAO_ENCONTRADO',
        quando: 'a resposta não existe.',
        mensagem: MENSAGEM_RESPOSTA_NAO_ENCONTRADA,
      },
    ],
  })
}
