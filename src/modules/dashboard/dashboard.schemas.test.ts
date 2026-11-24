import { describe, expect, it } from 'vitest'
import {
  buscarEvolucao,
  MAXIMO_DE_PONTOS,
  MENSAGENS_DE_PONTOS_DEMAIS,
  quantidadeDePeriodos,
} from './dashboard.schemas'

describe('quantidadeDePeriodos', () => {
  it('por dia, conta os dois dias das pontas', () => {
    expect(quantidadeDePeriodos('2026-11-10', '2026-11-10', 'DIA')).toBe(1)
    expect(quantidadeDePeriodos('2026-11-01', '2026-11-30', 'DIA')).toBe(30)
    expect(quantidadeDePeriodos('2024-01-01', '2024-12-31', 'DIA')).toBe(366)
    expect(quantidadeDePeriodos('2026-02-28', '2026-03-01', 'DIA')).toBe(2)
  })

  it('por semana, de segunda a domingo, contando as semanas das pontas inteiras', () => {
    // Domingo e segunda: duas semanas.
    expect(quantidadeDePeriodos('2026-11-01', '2026-11-02', 'SEMANA')).toBe(2)
    // Segunda a domingo: uma.
    expect(quantidadeDePeriodos('2026-11-02', '2026-11-08', 'SEMANA')).toBe(1)
    // Quarta, 4/11, a terça, 17/11: as semanas de 2, 9 e 16/11.
    expect(quantidadeDePeriodos('2026-11-04', '2026-11-17', 'SEMANA')).toBe(3)
    // Antes de 1970: domingo, 28/12/1969, e segunda, 29/12/1969.
    expect(quantidadeDePeriodos('1969-12-28', '1969-12-29', 'SEMANA')).toBe(2)
    expect(quantidadeDePeriodos('1969-12-22', '1969-12-28', 'SEMANA')).toBe(1)
  })

  it('por mês, contando os meses das pontas inteiros', () => {
    expect(quantidadeDePeriodos('2026-11-30', '2026-11-30', 'MES')).toBe(1)
    expect(quantidadeDePeriodos('2026-09-15', '2026-11-01', 'MES')).toBe(3)
    expect(quantidadeDePeriodos('2025-12-31', '2026-01-01', 'MES')).toBe(2)
  })
})

describe('filtros da evolução', () => {
  const filtros = { inicio: '2024-01-01', fim: '2024-12-31', base: 'ATENDIMENTO' }

  it(`recusa mais de ${MAXIMO_DE_PONTOS} pontos, com a saída que cabe em cada granularidade`, () => {
    expect(buscarEvolucao.query.safeParse({ ...filtros, granularidade: 'DIA' }).success).toBe(true)

    const resultado = buscarEvolucao.query.safeParse({ ...filtros, fim: '2025-01-01', granularidade: 'DIA' })
    expect(resultado.error?.issues).toMatchObject([
      { path: ['granularidade'], message: MENSAGENS_DE_PONTOS_DEMAIS.DIA },
    ])

    const semanas = buscarEvolucao.query.safeParse({ ...filtros, fim: '2031-12-31', granularidade: 'SEMANA' })
    expect(semanas.error?.issues).toMatchObject([
      { path: ['granularidade'], message: MENSAGENS_DE_PONTOS_DEMAIS.SEMANA },
    ])

    const meses = buscarEvolucao.query.safeParse({
      inicio: '1990-01-01',
      fim: '2026-11-23',
      base: 'ENVIO',
      granularidade: 'MES',
    })
    expect(meses.error?.issues).toMatchObject([
      { path: ['granularidade'], message: MENSAGENS_DE_PONTOS_DEMAIS.MES },
    ])
  })

  it('com uma data inválida, só acusa a data', () => {
    for (const inicio of ['2026-13-01', '01/01/1900', '0001-01-01T00:00']) {
      const resultado = buscarEvolucao.query.safeParse({
        inicio,
        fim: '2026-11-30',
        base: 'ATENDIMENTO',
        granularidade: 'DIA',
      })

      expect(
        resultado.error?.issues.map(({ path }) => path),
        inicio,
      ).toEqual([['inicio']])
    }
  })

  it('com o período invertido, só acusa o período', () => {
    const resultado = buscarEvolucao.query.safeParse({
      inicio: '2026-11-10',
      fim: '1990-01-01',
      base: 'ATENDIMENTO',
      granularidade: 'DIA',
    })

    expect(resultado.error?.issues.map(({ path }) => path)).toEqual([['fim']])
  })
})
