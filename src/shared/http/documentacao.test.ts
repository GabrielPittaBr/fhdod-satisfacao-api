import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { documentarRota, respostaJson } from './documentacao'
import { paginacaoSchema } from './pagination'
import { envelope, lista } from './respond'

const ERRO = { $ref: '#/components/schemas/Erro' }

const itemSchema = z.object({ id: z.number().int(), nome: z.string() }).meta({ id: 'ItemDeTeste' })

/** Os mesmos esquemas que iriam para o `validate` da rota. */
const editarItem = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: paginacaoSchema,
  body: z.object({ nome: z.string().min(3) }),
}

function gerar(documentar: (registry: OpenAPIRegistry) => void) {
  const registry = new OpenAPIRegistry()
  documentar(registry)
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Teste', version: '0.0.0' },
  })
}

describe('documentarRota', () => {
  const documento = gerar((registry) => {
    documentarRota(registry, {
      method: 'patch',
      path: '/api/v1/itens/{id}',
      requisicao: editarItem,
      respostas: { 200: respostaJson('Item editado.', envelope(itemSchema)) },
      erros: ['NAO_ENCONTRADO', 'CONFLITO'],
    })
    documentarRota(registry, {
      method: 'get',
      path: '/api/v1/itens',
      respostas: { 200: respostaJson('Itens.', lista(itemSchema)) },
    })
  })
  const editar = documento.paths?.['/api/v1/itens/{id}']?.patch
  const listar = documento.paths?.['/api/v1/itens']?.get

  it('descreve params, query e corpo com os esquemas do validate', () => {
    expect(editar?.parameters).toEqual([
      expect.objectContaining({
        in: 'path',
        name: 'id',
        required: true,
        schema: expect.objectContaining({ type: 'integer' }),
      }),
      expect.objectContaining({ in: 'query', name: 'pagina', required: false }),
      expect.objectContaining({ in: 'query', name: 'porPagina', required: false }),
    ])
    expect(editar?.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { type: 'object', required: ['nome'] } } },
    })
  })

  it('acrescenta o 400 de quem valida e o 500 de toda rota aos erros da rota, todos com o erro padrão', () => {
    expect(Object.keys(editar?.responses ?? {})).toEqual(['200', '400', '404', '409', '500'])
    for (const [status, codigo] of [
      ['400', 'VALIDACAO'],
      ['404', 'NAO_ENCONTRADO'],
      ['409', 'CONFLITO'],
      ['500', 'ERRO_INTERNO'],
    ]) {
      expect(editar?.responses?.[status]?.content?.['application/json']).toMatchObject({
        schema: ERRO,
        example: { erro: { codigo, detalhes: expect.any(Array), requestId: expect.any(String) } },
      })
    }
  })

  it('usa a descrição, a mensagem e os detalhes que a rota der para um erro', () => {
    const documento = gerar((registry) => {
      documentarRota(registry, {
        method: 'post',
        path: '/api/v1/entrar',
        requisicao: { body: z.object({ email: z.email() }) },
        respostas: { 204: { description: 'Entrou.' } },
        erros: [
          { codigo: 'VALIDACAO', detalhes: [{ campo: 'email', mensagem: 'Digite um e-mail válido' }] },
          {
            codigo: 'NAO_AUTENTICADO',
            quando: 'e-mail ou senha errados.',
            mensagem: 'E-mail ou senha incorretos.',
          },
          'LIMITE_ATINGIDO',
        ],
      })
    })
    const respostas = documento.paths?.['/api/v1/entrar']?.post?.responses ?? {}

    expect(Object.keys(respostas)).toEqual(['204', '400', '401', '429', '500'])
    expect(respostas['400']?.content?.['application/json']?.example).toMatchObject({
      erro: { codigo: 'VALIDACAO', detalhes: [{ campo: 'email', mensagem: 'Digite um e-mail válido' }] },
    })
    expect(respostas['401']).toMatchObject({
      description: '`NAO_AUTENTICADO`: e-mail ou senha errados.',
      content: {
        'application/json': {
          schema: ERRO,
          example: {
            erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'E-mail ou senha incorretos.', detalhes: [] },
          },
        },
      },
    })
    expect(respostas['429']?.content?.['application/json']?.example).toMatchObject({
      erro: { codigo: 'LIMITE_ATINGIDO', mensagem: 'Muitas tentativas. Espere um pouco e tente de novo.' },
    })
  })

  it('dá só o 500 a uma rota que não valida nada', () => {
    expect(listar?.parameters).toBeUndefined()
    expect(listar?.requestBody).toBeUndefined()
    expect(Object.keys(listar?.responses ?? {})).toEqual(['200', '500'])
  })

  it('descreve o { data } e as listas com { data, meta }', () => {
    expect(editar?.responses?.['200']?.content?.['application/json']?.schema).toEqual({
      type: 'object',
      properties: { data: { $ref: '#/components/schemas/ItemDeTeste' } },
      required: ['data'],
    })
    expect(listar?.responses?.['200']?.content?.['application/json']?.schema).toEqual({
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/ItemDeTeste' } },
        meta: { $ref: '#/components/schemas/Meta' },
      },
      required: ['data', 'meta'],
    })
  })
})
