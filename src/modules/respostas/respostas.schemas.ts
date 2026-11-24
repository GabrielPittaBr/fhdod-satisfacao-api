import { z } from 'zod'
import { STATUS_DE_RETORNO } from '../../shared/constants/status-de-retorno'
import { canalSchema } from '../../shared/http/canal'
import { CAMPOS_DOS_FILTROS_DO_PAINEL, periodoEmOrdem } from '../../shared/http/filtros-do-painel'
import { paginacaoSchema } from '../../shared/http/pagination'
import { idParams, simOuNaoNaQuery } from '../../shared/http/parametros'
import { DIGITOS_ESCONDIDOS } from '../../shared/rules/telefone'
import { tipoPerguntaSchema } from '../perguntas/perguntas.schemas'
import { classificacaoSchema, tipoComentarioSchema } from '../pesquisa/pesquisa.schemas'

export const MENSAGEM_RESPOSTA_NAO_ENCONTRADA = 'Resposta não encontrada.'

/** Por onde a lista de respostas pode ser ordenada. */
export const ORDENACOES_DAS_RESPOSTAS = ['dataAtendimento', 'enviadoEm', 'nps'] as const

export type OrdenacaoDasRespostas = (typeof ORDENACOES_DAS_RESPOSTAS)[number]

export const ORDENS = ['asc', 'desc'] as const

export type Ordem = (typeof ORDENS)[number]

export const MENSAGENS_DA_LISTA = {
  ordenarPor: 'Ordene pela data do atendimento, pela data do envio ou pelo NPS',
  ordem: 'Escolha a ordem crescente ou decrescente',
} as const

// ---------- Respostas ----------

export const statusRetornoSchema = z.enum(STATUS_DE_RETORNO).meta({
  id: 'StatusRetorno',
  description:
    'Onde está o retorno ao paciente. No MVP, todo pedido fica `NOVO`; os outros status são do fluxo da fase 2.',
})

export const telefoneMascaradoSchema = z.string().meta({
  description:
    `Os 4 últimos dígitos depois de \`${DIGITOS_ESCONDIDOS}\`, montados sem decifrar o número. O número ` +
    'completo só sai em `POST /contatos/{id}/revelar-telefone`.',
  example: `${DIGITOS_ESCONDIDOS} 0042`,
})

/** O comentário de uma avaliação, no detalhe da resposta e nos pedidos de retorno. */
export const comentarioDaRespostaSchema = z.object({
  tipo: tipoComentarioSchema,
  texto: z.string(),
})

const dataAtendimentoSchema = z.iso.date().meta({ description: 'O dia do atendimento, em AAAA-MM-DD.' })

const npsDaRespostaSchema = z.number().int().meta({ description: 'A nota de 0 a 10.', example: 9 })

const CAMPOS_DO_RESUMO = {
  id: z.number().int(),
  setorId: z.number().int(),
  setor: z.string().meta({ description: 'O nome do setor, também se ele estiver desativado.' }),
  canal: canalSchema,
  dataAtendimento: dataAtendimentoSchema,
  turno: z.string().meta({ description: 'O nome do turno do atendimento.' }),
  nps: npsDaRespostaSchema,
  classificacao: classificacaoSchema,
  enviadoEm: z.iso.datetime().meta({ description: 'O instante do envio da avaliação, em UTC.' }),
  temComentario: z.boolean().meta({ description: 'O paciente deixou um comentário.' }),
  pediuRetorno: z.boolean().meta({ description: 'O paciente deixou o telefone para o hospital ligar.' }),
}

export const respostaResumoSchema = z
  .object(CAMPOS_DO_RESUMO)
  .meta({ id: 'RespostaResumo', description: 'Uma avaliação na lista de respostas.' })

export type RespostaResumo = z.output<typeof respostaResumoSchema>

export const itemRespostaSchema = z
  .object({
    perguntaId: z.number().int(),
    perguntaTexto: z.string().meta({
      description: 'O texto da pergunta como o paciente leu, copiado no momento da resposta.',
    }),
    categoria: z.string().meta({ description: 'A categoria da pergunta no momento da resposta.' }),
    tipo: tipoPerguntaSchema,
    valorNumero: z
      .number()
      .int()
      .nullable()
      .meta({ description: 'A nota de 1 a 5, na escala; `null` nos outros tipos.' }),
    valorTexto: z
      .string()
      .nullable()
      .meta({
        description:
          '`SIM` ou `NAO` no sim ou não, a opção escolhida na múltipla escolha e o texto no texto livre; ' +
          '`null` na escala.',
      }),
    classificacao: classificacaoSchema.nullable().meta({
      description:
        'A da nota de 1 a 5, com os limites da escala das configurações (no padrão, 1 é baixíssima e 2 e 3 ' +
        'são baixas); `null` nos outros tipos.',
    }),
  })
  .meta({ id: 'ItemResposta', description: 'Uma pergunta respondida, como o paciente a viu.' })

export type ItemResposta = z.output<typeof itemRespostaSchema>

export const respostaDetalheSchema = z
  .object({
    ...CAMPOS_DO_RESUMO,
    itens: z
      .array(itemRespostaSchema)
      .meta({ description: 'As perguntas, na ordem em que o paciente as viu.' }),
    comentario: comentarioDaRespostaSchema.nullable().meta({ description: 'O comentário, se houver.' }),
    contato: z
      .object({
        id: z.number().int().meta({ description: 'O ID do pedido de retorno, o de `/contatos/{id}`.' }),
        telefoneMascarado: telefoneMascaradoSchema,
        status: statusRetornoSchema,
      })
      .nullable()
      .meta({ description: 'O pedido de retorno, se o paciente deixou o telefone; o número vem mascarado.' }),
  })
  .meta({
    id: 'RespostaDetalhe',
    description: 'Uma avaliação inteira: o resumo, as perguntas, o comentário e o pedido de retorno.',
  })

export type RespostaDetalhe = z.output<typeof respostaDetalheSchema>

// ---------- Requisições ----------

const listaQuery = z
  .object({
    ...CAMPOS_DOS_FILTROS_DO_PAINEL,
    classificacao: classificacaoSchema.optional(),
    comComentario: simOuNaoNaQuery.optional().meta({
      description: '`true`: só as avaliações com comentário; `false`: só as sem. Sem ele, todas.',
    }),
    comRetorno: simOuNaoNaQuery.optional().meta({
      description: '`true`: só as avaliações com pedido de retorno; `false`: só as sem. Sem ele, todas.',
    }),
    pagina: paginacaoSchema.shape.pagina,
    porPagina: paginacaoSchema.shape.porPagina,
    ordenarPor: z
      .enum(ORDENACOES_DAS_RESPOSTAS, { error: MENSAGENS_DA_LISTA.ordenarPor })
      .default('enviadoEm')
      .meta({
        description:
          'O dia do atendimento, o instante do envio ou o NPS. No empate, a de ID maior primeiro na ordem ' +
          '`desc` e a de ID menor na `asc`.',
      }),
    ordem: z
      .enum(ORDENS, { error: MENSAGENS_DA_LISTA.ordem })
      .default('desc')
      .meta({ description: '`asc`, do menor para o maior; `desc`, do maior para o menor.' }),
  })
  .superRefine(periodoEmOrdem)

export const listarRespostas = { query: listaQuery }

export type FiltrosDaListaDeRespostas = z.output<typeof listaQuery>

export const buscarResposta = { params: idParams }
