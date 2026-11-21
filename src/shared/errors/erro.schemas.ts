import { z } from 'zod'
import { CODIGOS_DE_ERRO, type DetalheErro } from './app-error'

// O erro padrão da API no contrato (openapi.json). É o corpo que o error-handler devolve em todo erro, e o front
// gera dele os tipos com estes mesmos nomes.

export const detalheErroSchema = z
  .object({
    campo: z
      .string()
      .meta({ description: 'Caminho do campo no que foi enviado, como `nome` ou `contato.telefone`.' }),
    mensagem: z
      .string()
      .meta({ description: 'O que está errado no campo, em português, para mostrar na tela.' }),
  })
  .meta({ id: 'DetalheErro', description: 'Problema num campo.' }) satisfies z.ZodType<DetalheErro>

export const codigoDeErroSchema = z.enum(CODIGOS_DE_ERRO).meta({
  id: 'CodigoDeErro',
  description: 'Código do erro. Cada um tem o seu status HTTP; código novo só entra combinado com o front.',
})

export const erroSchema = z
  .object({
    erro: z.object({
      codigo: codigoDeErroSchema,
      mensagem: z
        .string()
        .meta({ description: 'Frase curta em português, que o front mostra direto ao usuário.' }),
      detalhes: z
        .array(detalheErroSchema)
        .meta({ description: 'Um item por campo inválido, no erro `VALIDACAO`; vazio nos outros erros.' }),
      requestId: z.string().meta({
        description: 'ID da requisição, o mesmo do cabeçalho `X-Request-Id`. Liga a mensagem à linha do log.',
      }),
    }),
  })
  .meta({ id: 'Erro', description: 'Corpo de toda resposta de erro da API.' })

export type Erro = z.infer<typeof erroSchema>
