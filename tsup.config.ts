import { defineConfig } from 'tsup'

// Build da API em dist/: o servidor (server.js) e os dois comandos do banco que a imagem Docker roda sem o tsx,
// o seed base (seed.js) e os dados de demonstração (demonstracao.js). As dependências do package.json ficam de
// fora do pacote e são lidas do node_modules; o cliente gerado do Prisma (src/generated) entra junto. O código
// que mais de um deles usa fica em arquivos chunk-*.js, que cada um importa.
export default defineConfig({
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts', demonstracao: 'prisma/demonstracao.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node26',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
})
