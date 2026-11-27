import { defineConfig } from 'vitest/config'

/**
 * Banco dos testes de integração: o `postgres-teste` do docker-compose.yml, separado do de desenvolvimento.
 * Para usar outro (no CI, por exemplo), defina TEST_DATABASE_URL.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5433/satisfacao_teste'

export default defineConfig({
  test: {
    // Os testes nunca leem o .env: usam estas variáveis e o banco de teste. O segredo do JWT é só dos testes.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      CORS_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'segredo-dos-testes-nao-usar-fora-deles-0123456789',
      // "chave-dos-testes-nao-usar-fora!!" em base64: 32 bytes, a chave da cifra dos telefones nos testes.
      ENCRYPTION_KEY: 'Y2hhdmUtZG9zLXRlc3Rlcy1uYW8tdXNhci1mb3JhISE=',
      // Um IP de documentação (TEST-NET-3) no papel do IP do hospital, fora do limite de envios da pesquisa.
      RATE_LIMIT_ALLOWLIST: '203.0.113.10',
    },
    // Só com `pnpm test:cobertura`: o `pnpm test` e o CI rodam sem instrumentar o código. Mede o código da API
    // (`src/`) com os testes unitários e os de integração juntos; o cliente gerado pelo Prisma fica de fora.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.test.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts', 'tests/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/setup.ts'],
          // Os arquivos dividem o mesmo banco de teste: um de cada vez.
          fileParallelism: false,
        },
      },
    ],
  },
})
