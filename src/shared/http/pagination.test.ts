import { describe, expect, it } from 'vitest'
import { criarMeta, paginacaoSchema, paginar } from './pagination'

describe('paginação', () => {
  it('usa a página 1 com 20 itens quando a query não diz nada', () => {
    expect(paginacaoSchema.parse({})).toEqual({ pagina: 1, porPagina: 20 })
  })

  it('converte os números que chegam como texto na query', () => {
    expect(paginacaoSchema.parse({ pagina: '3', porPagina: '50' })).toEqual({ pagina: 3, porPagina: 50 })
  })

  it.each([{ pagina: '0' }, { pagina: '1.5' }, { porPagina: '101' }, { porPagina: 'dez' }])(
    'recusa %o',
    (query) => {
      expect(paginacaoSchema.safeParse(query).success).toBe(false)
    },
  )

  it('calcula o skip e o take do Prisma e o meta da resposta', () => {
    const paginacao = { pagina: 3, porPagina: 20 }

    expect(paginar(paginacao)).toEqual({ skip: 40, take: 20 })
    expect(criarMeta(paginacao, 134)).toEqual({ pagina: 3, porPagina: 20, total: 134 })
  })
})
