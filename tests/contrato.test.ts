import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { gerarDocumentoOpenApi, serializarDocumento } from '../src/config/openapi'
import { STATUS_DO_CODIGO } from '../src/shared/errors/app-error'

// O contrato com o front: o openapi.json commitado, as rotas que ele descreve e o erro padrão.

const documento = gerarDocumentoOpenApi()
const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** O que o `router.listRoutes()` do Express 5 devolve: uma rota, com os métodos, ou um roteador montado. */
interface RotaListada {
  path: string | RegExp
  methods?: string[]
  router?: RoteadorListavel
}
interface RoteadorListavel {
  listRoutes(): RotaListada[]
}

function juntar(prefixo: string, caminho: string) {
  return `${prefixo}/${caminho}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
}

/** Cada rota do app como `GET /api/v1/setores/{id}`, com os parâmetros no formato do OpenAPI. */
function rotasDoExpress(roteador: RoteadorListavel, prefixo = ''): string[] {
  return roteador.listRoutes().flatMap(({ path, methods = [], router }) => {
    if (typeof path !== 'string') throw new Error(`Rota com expressão regular em "${prefixo}": use texto`)
    const caminho = juntar(prefixo, path)
    if (router) return rotasDoExpress(router, caminho)
    const openApi = caminho.replace(/:([A-Za-z_$][\w$]*)/g, '{$1}')
    // O Express responde HEAD sozinho em toda rota GET.
    return methods.filter((metodo) => metodo !== 'HEAD').map((metodo) => `${metodo} ${openApi}`)
  })
}

function operacoes() {
  return Object.entries(documento.paths ?? {}).flatMap(([caminho, item]) =>
    METODOS.flatMap((metodo) => {
      const operacao = item[metodo]
      return operacao ? [{ rota: `${metodo.toUpperCase()} ${caminho}`, operacao }] : []
    }),
  )
}

describe('contrato da API', () => {
  it('o openapi.json commitado é o documento que o código gera', () => {
    const commitado = readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')

    expect(commitado, 'O openapi.json está desatualizado: rode `pnpm openapi:exportar` e commite').toBe(
      serializarDocumento(documento),
    )
  })

  it('documenta todas as rotas do app, e só elas', () => {
    const app = createApp({ docs: false }) as unknown as { router: RoteadorListavel }
    const doExpress = rotasDoExpress(app.router).sort()
    const documentadas = operacoes()
      .map(({ rota }) => rota)
      .sort()

    expect(doExpress).toContain('GET /api/health')
    expect(documentadas, 'Cada rota do Express tem o seu registro no <modulo>.docs.ts, e vice-versa').toEqual(
      doExpress,
    )
  })

  it('começa pelo /api/health', () => {
    expect(operacoes()[0]?.rota).toBe('GET /api/health')
  })

  it('usa o componente Erro em toda resposta com o status de um código de erro, e toda rota tem o 500', () => {
    const statusDeErro = new Set(Object.values(STATUS_DO_CODIGO).map(String))

    for (const { rota, operacao } of operacoes()) {
      const respostas = Object.entries(operacao.responses ?? {})
      expect(
        respostas.map(([status]) => status),
        rota,
      ).toContain('500')
      for (const [status, resposta] of respostas) {
        if (!statusDeErro.has(status)) continue
        expect(resposta.content?.['application/json']?.schema, `${rota} ${status}`).toEqual({
          $ref: '#/components/schemas/Erro',
        })
      }
    }
  })

  it('registra com nome os schemas que viram tipos no front', () => {
    expect(Object.keys(documento.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'Erro',
        'DetalheErro',
        'CodigoDeErro',
        'Meta',
        'Saude',
        'Sessao',
        'Perfil',
        'Permissao',
        'Setor',
      ]),
    )
  })

  it('descreve como as rotas do painel se autenticam: o token de acesso e o cookie de refresh', () => {
    expect(documento.components?.securitySchemes).toMatchObject({
      tokenAcesso: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieDeRefresh: { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
    })
    expect(documento.paths?.['/api/v1/auth/me']?.get?.security).toEqual([{ tokenAcesso: [] }])
    expect(documento.paths?.['/api/v1/auth/refresh']?.post?.security).toEqual([{ cookieDeRefresh: [] }])
  })

  it('descreve o erro padrão com os códigos que a API usa', () => {
    expect(documento.components?.schemas?.CodigoDeErro).toMatchObject({
      enum: Object.keys(STATUS_DO_CODIGO),
    })
    expect(documento.components?.schemas?.Erro).toMatchObject({
      required: ['erro'],
      properties: { erro: { required: ['codigo', 'mensagem', 'detalhes', 'requestId'] } },
    })
  })
})
