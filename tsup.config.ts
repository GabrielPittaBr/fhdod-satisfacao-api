import { defineConfig } from 'tsup'

// Build da API num único arquivo, dist/server.js. As dependências do package.json ficam de fora do
// pacote e são lidas do node_modules; o cliente gerado do Prisma (src/generated) entra junto.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
})
