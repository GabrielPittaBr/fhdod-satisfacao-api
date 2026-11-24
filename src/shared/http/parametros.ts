import { z } from 'zod'

/** Maior valor de uma coluna `integer` do PostgreSQL. Um ID acima dele não existe e faria o Prisma falhar. */
const MAIOR_ID = 2_147_483_647

const MENSAGEM_ID_INVALIDO = 'O ID precisa ser um número inteiro positivo.'

/** ID num parâmetro da rota, como o `:id` de `/setores/:id`: chega em texto e sai como número. */
export const idSchema = z.coerce
  .number({ error: MENSAGEM_ID_INVALIDO })
  .int(MENSAGEM_ID_INVALIDO)
  .positive(MENSAGEM_ID_INVALIDO)
  .max(MAIOR_ID, MENSAGEM_ID_INVALIDO)
  .meta({ example: 1 })

/** Os parâmetros das rotas `/<recurso>/:id`. */
export const idParams = z.object({ id: idSchema })

const MENSAGEM_SIM_OU_NAO = 'Escolha sim ou não'

/**
 * Um sim ou não na query, como o `?comComentario=true` da lista de respostas: só `true` e `false`, que saem
 * como booleano. O `z.coerce.boolean()` não serve, porque transforma o texto `"false"` em `true`. No documento,
 * o parâmetro é `boolean`, que os clientes do OpenAPI mandam assim.
 */
export const simOuNaoNaQuery = z
  .enum(['true', 'false'], { error: MENSAGEM_SIM_OU_NAO })
  .transform((valor) => valor === 'true')
  .meta({ type: 'boolean' })

/**
 * ID no corpo de um pedido, como o `categoriaId` de uma pergunta. Chega em JSON, então tem de ser número: o
 * texto `"3"` não vale. A mensagem pode dizer o que escolher ("Escolha uma categoria").
 */
export function idNoCorpo(mensagem = MENSAGEM_ID_INVALIDO) {
  return z.number({ error: mensagem }).int(mensagem).positive(mensagem).max(MAIOR_ID, mensagem)
}
