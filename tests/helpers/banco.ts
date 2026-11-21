import { prisma } from '../../src/database/prisma'

/**
 * Esvazia todas as tabelas do banco de teste e zera as sequências dos IDs, para cada teste começar do mesmo
 * ponto. O histórico das migrations (`_prisma_migrations`) fica. A lista de tabelas vem do próprio banco,
 * então uma tabela nova entra sem mudar nada aqui.
 */
export async function limparBanco(): Promise<void> {
  await prisma.$executeRaw`
    DO $$
    BEGIN
      EXECUTE (
        SELECT 'TRUNCATE TABLE ' || string_agg(format('%I', tablename), ', ') || ' RESTART IDENTITY CASCADE'
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      );
    END
    $$`
}
