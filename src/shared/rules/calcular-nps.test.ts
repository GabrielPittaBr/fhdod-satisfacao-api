import { describe, expect, it } from 'vitest'
import { calcularNps, DETRATOR_ATE, PROMOTOR_A_PARTIR_DE } from './calcular-nps'

/** As contagens de uma lista de notas de 0 a 10. */
function contar(notas: number[]) {
  return {
    total: notas.length,
    promotores: notas.filter((nota) => nota >= PROMOTOR_A_PARTIR_DE).length,
    detratores: notas.filter((nota) => nota <= DETRATOR_ATE).length,
  }
}

describe('calcularNps', () => {
  it('promotores são 9 e 10, detratores são 0 a 6, e 7 e 8 são neutros', () => {
    expect(PROMOTOR_A_PARTIR_DE).toBe(9)
    expect(DETRATOR_ATE).toBe(6)
    expect(contar([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ total: 11, promotores: 2, detratores: 7 })
  })

  it('é a % de promotores menos a % de detratores', () => {
    expect(calcularNps(contar([10, 9, 8, 7]))).toBe(50)
    expect(calcularNps(contar([10, 9, 3, 0]))).toBe(0)
    expect(calcularNps(contar([10, 10, 10]))).toBe(100)
    expect(calcularNps(contar([0, 6, 5]))).toBe(-100)
    expect(calcularNps(contar([8, 7]))).toBe(0)
    expect(calcularNps({ total: 10, promotores: 6, detratores: 1 })).toBe(50)
  })

  it('arredonda para o inteiro mais próximo', () => {
    // 1 de 3 promotores: 33,3...
    expect(calcularNps({ total: 3, promotores: 1, detratores: 0 })).toBe(33)
    // 2 de 3: 66,6...
    expect(calcularNps({ total: 3, promotores: 2, detratores: 0 })).toBe(67)
    expect(calcularNps({ total: 3, promotores: 0, detratores: 2 })).toBe(-67)
    expect(calcularNps({ total: 7, promotores: 4, detratores: 1 })).toBe(43)
  })

  it('no meio, arredonda para longe do zero, dos dois lados', () => {
    // 1 de 8: 12,5
    expect(calcularNps({ total: 8, promotores: 1, detratores: 0 })).toBe(13)
    expect(calcularNps({ total: 8, promotores: 0, detratores: 1 })).toBe(-13)
    // 3 de 40: 7,5
    expect(calcularNps({ total: 40, promotores: 4, detratores: 1 })).toBe(8)
    expect(calcularNps({ total: 40, promotores: 1, detratores: 4 })).toBe(-8)
  })

  it('uma diferença pequena demais para aparecer dá 0, e não -0', () => {
    const nps = calcularNps({ total: 1000, promotores: 0, detratores: 1 })

    expect(nps).toBe(0)
    expect(Object.is(nps, -0)).toBe(false)
  })

  it('sem respostas, é null', () => {
    expect(calcularNps({ total: 0, promotores: 0, detratores: 0 })).toBeNull()
  })
})
