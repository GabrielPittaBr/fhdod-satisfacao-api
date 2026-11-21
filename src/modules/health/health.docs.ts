import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { documentarRota, respostaJson } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import { saudeSchema, type Saude } from './health.schemas'

const NO_AR: Saude = { status: 'ok', banco: 'ok' }
const SEM_BANCO: Saude = { status: 'indisponivel', banco: 'indisponivel' }

export function documentarHealth(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/health',
    tags: ['Saúde'],
    summary: 'Estado da API e do banco',
    description:
      'Chamada pelo Docker e pelo monitoramento. Fica em `/api/health`, fora do `/api/v1`, porque o endereço ' +
      'não muda com a versão da API. Cada chamada consulta o banco, sem cache.',
    respostas: {
      200: respostaJson('A API e o banco estão no ar.', envelope(saudeSchema), { data: NO_AR }),
      503: respostaJson(
        'O banco não respondeu. O corpo é o mesmo do 200 e diz o que caiu.',
        envelope(saudeSchema),
        {
          data: SEM_BANCO,
        },
      ),
    },
  })
}
