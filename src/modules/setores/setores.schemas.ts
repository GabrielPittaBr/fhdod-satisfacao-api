import { z } from 'zod'
import { idParams } from '../../shared/http/parametros'

export const MENSAGEM_SLUG_REPETIDO = 'Já existe um setor com este endereço. Escolha outro.'
export const MENSAGEM_SETOR_NAO_ENCONTRADO = 'Setor não encontrado.'

/** Letras minúsculas sem acento, números e hífen, sem hífen no começo, no fim ou repetido: `raio-x-e-imagem`. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const NOME_MINIMO = 2
const NOME_MAXIMO = 100
const SLUG_MAXIMO = 100
/** O mesmo limite do formulário do front. */
const DESCRICAO_MAXIMO = 120

const nomeSchema = z
  .string()
  .trim()
  .min(NOME_MINIMO, 'Informe o nome do setor')
  .max(NOME_MAXIMO, `Use no máximo ${NOME_MAXIMO} caracteres`)
  .meta({
    description: `De ${NOME_MINIMO} a ${NOME_MAXIMO} caracteres; os espaços das pontas saem.`,
    example: 'Pronto Atendimento',
  })

const slugSchema = z
  .string()
  .max(SLUG_MAXIMO, `Use no máximo ${SLUG_MAXIMO} caracteres`)
  .regex(SLUG, 'Use só letras minúsculas, números e hífen, sem espaços')
  .meta({
    description:
      'Endereço do setor, que forma os links `/s/<slug>` e `/totem/<slug>` e o QR Code: só letras ' +
      'minúsculas, números e hífen. Não se repete entre setores. Mudá-lo invalida os QR Codes já impressos.',
    example: 'pronto-atendimento',
  })

const descricaoSchema = z
  .string()
  .trim()
  .max(DESCRICAO_MAXIMO, `Use no máximo ${DESCRICAO_MAXIMO} caracteres`)
  .nullable()
  .meta({
    description: `Opcional, até ${DESCRICAO_MAXIMO} caracteres. Vazia, só com espaços ou \`null\`, é gravada como \`null\`.`,
    example: 'Urgência e emergência, 24 horas',
  })

export const setorSchema = z
  .object({
    id: z.number().int(),
    nome: z.string(),
    slug: z.string().meta({ description: 'Forma os links `/s/<slug>` e `/totem/<slug>` e o QR Code.' }),
    descricao: z.string().nullable(),
    ativo: z.boolean().meta({
      description: 'Setor inativo sai da pesquisa pública, mas o histórico dele continua nos indicadores.',
    }),
  })
  .meta({ id: 'Setor', description: 'Unidade do hospital com pesquisa própria.' })

export type Setor = z.output<typeof setorSchema>

// ---------- POST /setores ----------

const criarSetorBody = z.object({
  nome: nomeSchema,
  slug: slugSchema,
  descricao: descricaoSchema.optional(),
})

export const criarSetor = { body: criarSetorBody }

export type DadosDoNovoSetor = z.output<typeof criarSetorBody>

// ---------- PATCH /setores/:id ----------

const editarSetorBody = z
  .object({
    nome: nomeSchema.optional(),
    slug: slugSchema.optional(),
    descricao: descricaoSchema.optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Envie o que vai mudar: nome, slug ou descrição.',
  })
  .meta({ description: 'Só os campos enviados mudam; os outros ficam como estão.' })

export const editarSetor = { params: idParams, body: editarSetorBody }

export type DadosDaEdicaoDoSetor = z.output<typeof editarSetorBody>

// ---------- PATCH /setores/:id/status ----------

const alterarStatusBody = z.object({
  ativo: z.boolean().meta({ description: '`true` ativa o setor; `false` o desativa.' }),
})

export const alterarStatusDoSetor = { params: idParams, body: alterarStatusBody }
