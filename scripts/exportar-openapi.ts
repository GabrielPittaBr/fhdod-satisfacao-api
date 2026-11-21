import { writeFileSync } from 'node:fs'
import { gerarDocumentoOpenApi, serializarDocumento } from '../src/config/openapi'

// `pnpm openapi:exportar`: grava o contrato da API em openapi.json, na raiz do repositório. O front gera os
// tipos dele a partir desse arquivo, e o CI falha se o arquivo commitado não for o que o código gera.

const destino = new URL('../openapi.json', import.meta.url)
writeFileSync(destino, serializarDocumento(gerarDocumentoOpenApi()))
console.log('Contrato gravado em openapi.json. Commite o arquivo junto com a mudança que o alterou.')
