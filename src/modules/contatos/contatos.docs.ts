import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { documentarRota, EXIGE_LOGIN, respostaJson } from '../../shared/http/documentacao'
import { MENSAGENS_DOS_FILTROS } from '../../shared/http/filtros-do-painel'
import { POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO } from '../../shared/http/pagination'
import { envelope, lista } from '../../shared/http/respond'
import { MENSAGEM_FORA_DO_SETOR } from '../../shared/security/acesso'
import {
  listarContatos,
  MENSAGEM_PEDIDO_NAO_ENCONTRADO,
  pedidoRetornoSchema,
  revelarTelefone,
  telefoneReveladoSchema,
  type PedidoRetorno,
} from './contatos.schemas'

const TAGS = ['Pedidos de retorno']

const PEDIDOS: PedidoRetorno[] = [
  {
    id: 31,
    respostaId: 845,
    setor: 'Pronto Atendimento',
    dataAtendimento: '2026-11-10',
    nps: 3,
    classificacao: 'BAIXA',
    comentario: { tipo: 'RECLAMACAO', texto: 'Esperei mais de duas horas sem nenhuma informação.' },
    telefoneMascarado: '•••• 0042',
    consentimentoEm: '2026-11-10T14:23:10.000Z',
    status: 'NOVO',
  },
  {
    id: 30,
    respostaId: 838,
    setor: 'Ambulatório',
    dataAtendimento: '2026-11-09',
    nps: 1,
    classificacao: 'BAIXISSIMA',
    comentario: null,
    telefoneMascarado: '•••• 7788',
    consentimentoEm: '2026-11-09T18:40:02.000Z',
    status: 'NOVO',
  },
]

const SEM_PERMISSAO =
  'sem a permissão `contatos:ver` (só o Super Admin e a Ouvidoria a têm; o Gestor e o Visualizador, não) ou ' +
  'com a senha provisória.'

export function documentarContatos(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/contatos',
    tags: TAGS,
    summary: 'Pacientes que pediram retorno',
    description:
      'Os pedidos de retorno, do consentimento mais recente para o mais antigo, com o telefone mascarado. O ' +
      'período (`inicio` e `fim`, incluídos e opcionais) é comparado com a `base`, como no painel: o dia do ' +
      `atendimento, se o pedido não disser outra coisa, ou o dia do envio em Brasília. ${POR_PAGINA_PADRAO} por ` +
      'página se o pedido não disser outro número; `meta.total` conta todas as páginas. Exige `contatos:ver`.',
    security: EXIGE_LOGIN,
    requisicao: listarContatos,
    respostas: {
      200: respostaJson('Os pedidos da página.', lista(pedidoRetornoSchema), {
        data: PEDIDOS,
        meta: { pagina: 1, porPagina: POR_PAGINA_PADRAO, total: 2 },
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'data fora do formato AAAA-MM-DD ou que não existe; `fim` antes de `inicio`; ou `base`, `setorId`, ' +
          `\`pagina\` ou \`porPagina\` (de 1 a ${POR_PAGINA_MAXIMO}) fora dos valores aceitos.`,
        detalhes: [{ campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo }],
      },
      'NAO_AUTENTICADO',
      { codigo: 'SEM_PERMISSAO', quando: SEM_PERMISSAO },
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/contatos/{id}/revelar-telefone',
    tags: TAGS,
    summary: 'Mostra o número completo, para ligar',
    description:
      'Decifra o telefone do pedido e registra na auditoria quem o viu e quando (`revelacao_de_telefone`), a ' +
      'cada vez que é chamado. A resposta não fica em cache (`Cache-Control: no-store`). Sem corpo. Exige ' +
      '`contatos:ver`.',
    security: EXIGE_LOGIN,
    requisicao: revelarTelefone,
    respostas: {
      200: respostaJson('O número completo.', envelope(telefoneReveladoSchema), {
        data: { telefone: '51999990042' },
      }),
    },
    erros: [
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando: `${SEM_PERMISSAO.slice(0, -1)}, ou num pedido de um setor que não é da pessoa.`,
        mensagem: MENSAGEM_FORA_DO_SETOR,
      },
      { codigo: 'NAO_ENCONTRADO', quando: 'o pedido não existe.', mensagem: MENSAGEM_PEDIDO_NAO_ENCONTRADO },
    ],
  })
}
