import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import pacote from '../../package.json' with { type: 'json' }
import { documentarAuth } from '../modules/auth/auth.docs'
import { documentarCategorias } from '../modules/categorias/categorias.docs'
import { documentarDashboard } from '../modules/dashboard/dashboard.docs'
import { documentarHealth } from '../modules/health/health.docs'
import { documentarPerguntas } from '../modules/perguntas/perguntas.docs'
import { documentarPesquisa } from '../modules/pesquisa/pesquisa.docs'
import { documentarSetores } from '../modules/setores/setores.docs'
import { documentarTurnos } from '../modules/turnos/turnos.docs'
import { documentarUsuarios } from '../modules/usuarios/usuarios.docs'
import { codigoDeErroSchema, detalheErroSchema, erroSchema } from '../shared/errors/erro.schemas'
import { ESQUEMA_DO_TOKEN_DE_ACESSO } from '../shared/http/documentacao'
import { metaSchema } from '../shared/http/pagination'

// Monta o documento OpenAPI da API, o mesmo do Swagger (/api/docs) e do openapi.json que o front usa para
// gerar os tipos. Este arquivo e os `*.docs.ts` não leem variáveis de ambiente: o `pnpm openapi:exportar`
// roda sem .env, inclusive no CI.

/**
 * A documentação de cada módulo, na ordem em que as rotas aparecem no documento. Módulo novo entra aqui
 * com a função do seu `<modulo>.docs.ts`; o teste de contrato acusa rota sem documentação.
 */
const MODULOS: ((registry: OpenAPIRegistry) => void)[] = [
  documentarHealth,
  documentarAuth,
  documentarPesquisa,
  documentarSetores,
  documentarCategorias,
  documentarTurnos,
  documentarPerguntas,
  documentarUsuarios,
  documentarDashboard,
]

/**
 * O erro padrão e o `meta` das listas entram no documento mesmo antes de uma rota usá-los. Vão como
 * definições `{ type: 'schema' }`: soltos, os schemas do Zod 4 são ignorados pelo gerador, porque já têm
 * uma propriedade `type`.
 */
const COMPONENTES_COMUNS = [erroSchema, detalheErroSchema, codigoDeErroSchema, metaSchema].map((schema) => ({
  type: 'schema' as const,
  schema,
}))

/** O token de acesso vale para todas as rotas do painel, que o citam com o `EXIGE_LOGIN` da documentação. */
function registrarTokenDeAcesso(registry: OpenAPIRegistry) {
  registry.registerComponent('securitySchemes', ESQUEMA_DO_TOKEN_DE_ACESSO, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Token de acesso de 15 minutos, devolvido por `/auth/login` e `/auth/refresh`, no cabeçalho ' +
      '`Authorization: Bearer <token>`.',
  })
}

const DESCRICAO = `Contrato da API do Sistema de Satisfação Hospitalar da FHDOD.

- Sucesso: \`{ "data": ... }\`. Listas paginadas: \`{ "data": [...], "meta": { "pagina", "porPagina", "total" } }\`.
- Erro: sempre o componente \`Erro\`, \`{ "erro": { "codigo", "mensagem", "detalhes", "requestId" } }\`. A \`mensagem\` é escrita para quem está na tela.
- Toda resposta traz o cabeçalho \`X-Request-Id\`, o mesmo \`requestId\` dos erros e do log.
- Rotas do painel: token de acesso em \`Authorization: Bearer <token>\`. Sem ele, vencido ou com o usuário inativo, 401 \`NAO_AUTENTICADO\`; sem a permissão ou fora dos setores da pessoa, 403 \`SEM_PERMISSAO\`. Com a senha provisória, as rotas do painel respondem 403 até a troca em \`/auth/senha\`; \`/auth/me\` funciona.
- Rotas \`/publico\`: a pesquisa do paciente, sem login. O complemento da avaliação leva o token devolvido pelo envio no cabeçalho \`X-Complemento-Token\`.`

export function gerarDocumentoOpenApi() {
  const registry = new OpenAPIRegistry()
  registrarTokenDeAcesso(registry)
  for (const documentar of MODULOS) documentar(registry)

  const gerador = new OpenApiGeneratorV31([...COMPONENTES_COMUNS, ...registry.definitions], {
    sortComponents: 'alphabetically',
  })
  return gerador.generateDocument({
    openapi: '3.1.0',
    info: { title: 'API de Satisfação Hospitalar da FHDOD', version: pacote.version, description: DESCRICAO },
  })
}

/** O documento como fica no openapi.json: JSON com dois espaços e quebra de linha no fim. */
export function serializarDocumento(documento: object) {
  return `${JSON.stringify(documento, null, 2)}\n`
}
