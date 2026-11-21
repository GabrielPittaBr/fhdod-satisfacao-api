import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { gerarDocumentoOpenApi } from '../../src/config/openapi'

describe('Swagger em /api/docs', () => {
  it('serve o documento OpenAPI em /api/docs/openapi.json', async () => {
    const resposta = await request(createApp({ docs: true })).get('/api/docs/openapi.json')

    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toMatch(/^application\/json/)
    expect(resposta.body).toEqual(gerarDocumentoOpenApi())
  })

  it('serve a interface, que carrega o documento de /api/docs/openapi.json', async () => {
    const app = createApp({ docs: true })

    const pagina = await request(app).get('/api/docs/')
    expect(pagina.status).toBe(200)
    expect(pagina.headers['content-type']).toMatch(/^text\/html/)
    expect(pagina.text).toContain('<div id="swagger-ui"></div>')
    expect(pagina.text).toContain('<title>API de Satisfação FHDOD</title>')

    const inicializacao = await request(app).get('/api/docs/swagger-ui-init.js')
    expect(inicializacao.status).toBe(200)
    expect(inicializacao.text).toContain('"url": "/api/docs/openapi.json"')

    const estilos = await request(app).get('/api/docs/swagger-ui.css')
    expect(estilos.status).toBe(200)
    expect(estilos.headers['content-type']).toMatch(/^text\/css/)
  })

  it('leva /api/docs para /api/docs/, onde os arquivos da página são encontrados', async () => {
    const resposta = await request(createApp({ docs: true })).get('/api/docs')

    expect(resposta.status).toBe(301)
    expect(resposta.headers.location).toBe('/api/docs/')
  })

  it('responde 404 no padrão da API num arquivo que não existe', async () => {
    const resposta = await request(createApp({ docs: true })).get('/api/docs/nao-existe.js')

    expect(resposta.status).toBe(404)
    expect(resposta.body.erro).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
  })

  it.each(['/api/docs', '/api/docs/', '/api/docs/openapi.json', '/api/docs/swagger-ui.css'])(
    'fica fora do ar com o DOCS_ENABLED desligado: %s responde 404',
    async (caminho) => {
      const resposta = await request(createApp({ docs: false })).get(caminho)

      expect(resposta.status).toBe(404)
      expect(resposta.body.erro).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    },
  )

  it('segue o DOCS_ENABLED quando o app não diz nada (nos testes, ligado)', async () => {
    const resposta = await request(createApp()).get('/api/docs/openapi.json')

    expect(resposta.status).toBe(200)
  })
})
