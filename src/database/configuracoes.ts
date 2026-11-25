import type { Prisma } from '../generated/prisma/client'
import { CONFIGURACOES_PADRAO, type Configuracoes } from '../shared/constants/configuracoes'
import { prisma } from './prisma'

/** Onde ler: o cliente da API ou o de uma transação, como a dos dados de demonstração. */
type LeitorDasConfiguracoes = Pick<Prisma.TransactionClient, 'configuracao'>

/**
 * As configurações do banco, para a pesquisa e para o painel. Uma chave que falta, ou com valor de outro tipo,
 * vale o padrão de `CONFIGURACOES_PADRAO`: nada para por causa de uma configuração errada.
 */
export async function lerConfiguracoes(banco: LeitorDasConfiguracoes = prisma): Promise<Configuracoes> {
  const linhas = await banco.configuracao.findMany({ select: { chave: true, valor: true } })
  const noBanco = new Map(linhas.map(({ chave, valor }) => [chave, valor]))
  return Object.fromEntries(
    Object.entries(CONFIGURACOES_PADRAO).map(([chave, padrao]) => {
      const valor = noBanco.get(chave)
      return [chave, typeof valor === typeof padrao ? valor : padrao]
    }),
  ) as unknown as Configuracoes
}
