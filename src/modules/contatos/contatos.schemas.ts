import { z } from 'zod'
import { CAMPOS_DOS_FILTROS_DO_PAINEL, periodoEmOrdem } from '../../shared/http/filtros-do-painel'
import { paginacaoSchema } from '../../shared/http/pagination'
import { idParams } from '../../shared/http/parametros'
import { classificacaoSchema } from '../pesquisa/pesquisa.schemas'
import {
  comentarioDaRespostaSchema,
  statusRetornoSchema,
  telefoneMascaradoSchema,
} from '../respostas/respostas.schemas'

export const MENSAGEM_PEDIDO_NAO_ENCONTRADO = 'Pedido de retorno não encontrado.'

// ---------- Respostas ----------

export const pedidoRetornoSchema = z
  .object({
    id: z.number().int().meta({ description: 'O ID do pedido, o de `/contatos/{id}/revelar-telefone`.' }),
    respostaId: z.number().int().meta({ description: 'A avaliação do pedido, a de `/respostas/{id}`.' }),
    setor: z
      .string()
      .meta({ description: 'O nome do setor da avaliação, também se ele estiver desativado.' }),
    dataAtendimento: z.iso.date().meta({ description: 'O dia do atendimento, em AAAA-MM-DD.' }),
    nps: z.number().int().meta({ description: 'A nota de 0 a 10.', example: 3 }),
    classificacao: classificacaoSchema,
    comentario: comentarioDaRespostaSchema
      .nullable()
      .meta({ description: 'O comentário da avaliação, se houver.' }),
    telefoneMascarado: telefoneMascaradoSchema,
    consentimentoEm: z.iso.datetime().meta({
      description: 'O instante em que o paciente deixou o telefone e autorizou o contato, em UTC.',
    }),
    status: statusRetornoSchema,
  })
  .meta({ id: 'PedidoRetorno', description: 'Um paciente que pediu para o hospital ligar.' })

export type PedidoRetorno = z.output<typeof pedidoRetornoSchema>

export const telefoneReveladoSchema = z.object({
  telefone: z.string().meta({
    description: 'O número completo, só os dígitos, com o DDD (10 ou 11 dígitos).',
    example: '51999990042',
  }),
})

export type TelefoneRevelado = z.output<typeof telefoneReveladoSchema>

// ---------- Requisições ----------

const listaQuery = z
  .object({
    inicio: CAMPOS_DOS_FILTROS_DO_PAINEL.inicio,
    fim: CAMPOS_DOS_FILTROS_DO_PAINEL.fim,
    base: CAMPOS_DOS_FILTROS_DO_PAINEL.base,
    setorId: CAMPOS_DOS_FILTROS_DO_PAINEL.setorId,
    pagina: paginacaoSchema.shape.pagina,
    porPagina: paginacaoSchema.shape.porPagina,
  })
  .superRefine(periodoEmOrdem)

export const listarContatos = { query: listaQuery }

export type FiltrosDosContatos = z.output<typeof listaQuery>

export const revelarTelefone = { params: idParams }
