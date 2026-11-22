import { z } from 'zod'
import { idParams } from '../../shared/http/parametros'

export const MENSAGEM_NOME_REPETIDO = 'Já existe uma categoria com este nome.'
export const MENSAGEM_CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'

const NOME_MINIMO = 2
const NOME_MAXIMO = 100

const nomeSchema = z
  .string()
  .trim()
  .min(NOME_MINIMO, 'Informe o nome da categoria')
  .max(NOME_MAXIMO, `Use no máximo ${NOME_MAXIMO} caracteres`)
  .meta({
    description:
      `De ${NOME_MINIMO} a ${NOME_MAXIMO} caracteres; os espaços das pontas saem. Não se repete entre as ` +
      'categorias, nem com maiúsculas diferentes ("Recepção" e "RECEPÇÃO" são a mesma).',
    example: 'Recepção',
  })

export const categoriaSchema = z
  .object({
    id: z.number().int(),
    nome: z.string(),
    ordem: z.number().int().meta({ description: 'Posição na lista. A categoria nova entra no fim.' }),
    ativa: z.boolean().meta({
      description: 'Desativar não apaga nada: as perguntas e as respostas da categoria continuam.',
    }),
  })
  .meta({
    id: 'Categoria',
    description: 'Etapa do atendimento comparável entre setores, como Recepção ou Triagem.',
  })

export type Categoria = z.output<typeof categoriaSchema>

// ---------- POST /categorias ----------

const criarCategoriaBody = z.object({ nome: nomeSchema })

export const criarCategoria = { body: criarCategoriaBody }

// ---------- PATCH /categorias/:id ----------

const editarCategoriaBody = z
  .object({
    nome: nomeSchema.optional(),
    ativa: z.boolean().optional().meta({ description: '`true` ativa a categoria; `false` a desativa.' }),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Envie o que vai mudar: o nome, a situação ou os dois.',
  })
  .meta({ description: 'Muda o nome, ativa ou desativa, ou faz os dois; o que não vier fica como está.' })

export const editarCategoria = { params: idParams, body: editarCategoriaBody }

export type DadosDaEdicaoDaCategoria = z.output<typeof editarCategoriaBody>
