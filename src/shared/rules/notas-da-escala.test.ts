import { describe, expect, it } from 'vitest'
import { indicadoresDasNotas, NOTA_BOA_A_PARTIR_DE, percentualInteiro } from './notas-da-escala'

/** As contagens de uma lista de notas de 1 a 5. */
function contar(notas: number[]) {
  return {
    quantidade: notas.length,
    soma: notas.reduce((soma, nota) => soma + nota, 0),
    boas: notas.filter((nota) => nota >= NOTA_BOA_A_PARTIR_DE).length,
  }
}

describe('notas da escala', () => {
  it('as notas boas são 4 e 5', () => {
    expect(NOTA_BOA_A_PARTIR_DE).toBe(4)
    expect(contar([1, 2, 3, 4, 5]).boas).toBe(2)
  })

  it('a média tem uma casa decimal, e o % de notas 4 e 5 é inteiro', () => {
    expect(indicadoresDasNotas(contar([5, 5, 4, 3, 1]))).toEqual({ media: 3.6, percentual45: 60, total: 5 })
    expect(indicadoresDasNotas(contar([4, 4, 4]))).toEqual({ media: 4, percentual45: 100, total: 3 })
    expect(indicadoresDasNotas(contar([3, 2, 4]))).toEqual({ media: 3, percentual45: 33, total: 3 })
    expect(indicadoresDasNotas(contar([5, 4, 1]))).toEqual({ media: 3.3, percentual45: 67, total: 3 })
  })

  it('sem notas, a média e o % vêm null', () => {
    expect(indicadoresDasNotas({ quantidade: 0, soma: 0, boas: 0 })).toEqual({
      media: null,
      percentual45: null,
      total: 0,
    })
  })
})

describe('percentualInteiro', () => {
  it('arredonda para o inteiro mais próximo, com o meio para cima', () => {
    expect(percentualInteiro(1, 3)).toBe(33)
    expect(percentualInteiro(2, 3)).toBe(67)
    expect(percentualInteiro(1, 8)).toBe(13)
    expect(percentualInteiro(1, 200)).toBe(1)
    expect(percentualInteiro(1, 201)).toBe(0)
    expect(percentualInteiro(0, 5)).toBe(0)
    expect(percentualInteiro(5, 5)).toBe(100)
  })

  it('com o total 0, é null', () => {
    expect(percentualInteiro(0, 0)).toBeNull()
  })
})
