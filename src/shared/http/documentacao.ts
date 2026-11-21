import type { OpenAPIRegistry, ResponseConfig, RouteConfig } from '@asteasolutions/zod-to-openapi'
import type { ZodType } from 'zod'
import type { EsquemasDaRota } from '../../middlewares/validate'
import { AppError, STATUS_DO_CODIGO, type CodigoDeErro } from '../errors/app-error'
import { erroSchema, type Erro } from '../errors/erro.schemas'

// Ajudantes para os `<modulo>.docs.ts` registrarem as rotas no documento OpenAPI (Swagger e openapi.json).

const REQUEST_ID_DE_EXEMPLO = '01JC9W2K7QXZ4N5M8R3T6V0B1D'

/** Quando cada erro acontece, para a descrição da resposta, e o erro que a API monta, para o exemplo. */
const ERROS: Record<CodigoDeErro, { quando: string; exemplo: AppError }> = {
  VALIDACAO: {
    quando: 'dados inválidos, com um item em `detalhes` para cada campo errado.',
    exemplo: AppError.validacao([{ campo: 'contato.telefone', mensagem: 'Telefone com DDD, só números' }]),
  },
  NAO_AUTENTICADO: {
    quando: 'sem login, com a sessão expirada ou com o usuário inativo.',
    exemplo: AppError.naoAutenticado(),
  },
  SEM_PERMISSAO: {
    quando: 'logado, mas sem a permissão ou fora dos setores do usuário.',
    exemplo: AppError.semPermissao(),
  },
  NAO_ENCONTRADO: { quando: 'o recurso não existe.', exemplo: AppError.naoEncontrado() },
  CONFLITO: {
    quando: 'conflito com um dado que já existe, como um slug ou um e-mail já usado.',
    exemplo: AppError.conflito('Já existe um setor com este endereço.'),
  },
  LIMITE_ATINGIDO: { quando: 'limite de requisições atingido.', exemplo: AppError.limiteAtingido() },
  ERRO_INTERNO: {
    quando: 'erro inesperado. A mensagem é sempre a mesma, e o detalhe fica só no log.',
    exemplo: AppError.interno(),
  },
}

/** Resposta de erro no formato padrão (o componente `Erro`), com um exemplo do código. */
export function respostaDeErro(codigo: CodigoDeErro): ResponseConfig {
  const { quando, exemplo } = ERROS[codigo]
  const corpo: Erro = {
    erro: { codigo, mensagem: exemplo.message, detalhes: exemplo.detalhes, requestId: REQUEST_ID_DE_EXEMPLO },
  }
  return {
    description: `\`${codigo}\`: ${quando}`,
    content: { 'application/json': { schema: erroSchema, example: corpo } },
  }
}

/** Resposta JSON com o schema do corpo (`envelope` ou `lista`) e, quando ajuda, um exemplo. */
export function respostaJson(descricao: string, schema: ZodType, exemplo?: unknown): ResponseConfig {
  return {
    description: descricao,
    content: { 'application/json': { schema, ...(exemplo !== undefined && { example: exemplo }) } },
  }
}

export type RotaDocumentada = Omit<RouteConfig, 'request' | 'responses'> & {
  /** Os mesmos esquemas passados ao `validate` da rota. Com eles, a rota ganha também o 400 `VALIDACAO`. */
  requisicao?: EsquemasDaRota
  /** Respostas de sucesso e as que fogem do erro padrão, como o 503 do health. */
  respostas: RouteConfig['responses']
  /** Erros que a rota devolve além do 400 de validação e do 500, que entram sozinhos. */
  erros?: CodigoDeErro[]
}

/**
 * Registra uma rota no documento do jeito da API: a requisição sai dos mesmos esquemas do `validate`, e
 * as respostas de erro usam o componente `Erro`. Toda rota ganha o 500 `ERRO_INTERNO`; as que validam
 * alguma coisa, também o 400 `VALIDACAO`.
 */
export function documentarRota(
  registry: OpenAPIRegistry,
  { requisicao = {}, respostas, erros = [], ...rota }: RotaDocumentada,
) {
  const { params, query, body } = requisicao
  const validaAlgo = Boolean(params || query || body)
  const codigos = new Set<CodigoDeErro>([
    ...(validaAlgo ? ['VALIDACAO' as const] : []),
    ...erros,
    'ERRO_INTERNO',
  ])

  registry.registerPath({
    ...rota,
    ...(validaAlgo && {
      request: {
        params,
        query,
        ...(body && { body: { required: true, content: { 'application/json': { schema: body } } } }),
      },
    }),
    responses: {
      ...respostas,
      ...Object.fromEntries([...codigos].map((codigo) => [STATUS_DO_CODIGO[codigo], respostaDeErro(codigo)])),
    },
  })
}
