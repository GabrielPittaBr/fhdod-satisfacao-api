import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { gerarDocumentoOpenApi } from '../../config/openapi'

const OPCOES_DO_SWAGGER = {
  customSiteTitle: 'API de Satisfação FHDOD',
  // A página carrega o documento da rota abaixo; `validatorUrl: null` não manda o documento para fora.
  swaggerOptions: { url: '/api/docs/openapi.json', validatorUrl: null },
}

// O documento não muda enquanto a API roda: é gerado uma vez só.
let documento: ReturnType<typeof gerarDocumentoOpenApi> | undefined

/**
 * Montado em /api/docs, só com o DOCS_ENABLED ligado: o Swagger UI em /api/docs/ e o documento OpenAPI em
 * /api/docs/openapi.json. O documento é o mesmo do openapi.json da raiz do repositório.
 */
export function criarDocsRoutes() {
  documento ??= gerarDocumentoOpenApi()
  const router = Router()

  router.get('/openapi.json', (_req, res) => {
    res.json(documento)
  })
  // CSS, scripts e ícones do Swagger UI. Também leva /api/docs para /api/docs/: a página pede os arquivos por
  // caminho relativo (./swagger-ui.css), que sem a barra no fim seriam procurados em /api/.
  router.use(swaggerUi.serveFiles(undefined, OPCOES_DO_SWAGGER))
  router.get('/', swaggerUi.setup(undefined, OPCOES_DO_SWAGGER))
  return router
}
