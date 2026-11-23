import { describe, expect, it } from 'vitest'
import { CONFIGURACOES_PADRAO } from '../constants/configuracoes'
import { classificarNota } from './classificar-nota'

const PADRAO = CONFIGURACOES_PADRAO

describe('classificarNota', () => {
  it('NPS sozinho, com os limites padrão: 0 a 2 é baixíssima, 3 a 6 é baixa, 7 a 10 é normal', () => {
    const porNota = Array.from({ length: 11 }, (_, nps) => classificarNota(nps, [], PADRAO))

    expect(porNota).toEqual([
      'BAIXISSIMA',
      'BAIXISSIMA',
      'BAIXISSIMA',
      'BAIXA',
      'BAIXA',
      'BAIXA',
      'BAIXA',
      'NORMAL',
      'NORMAL',
      'NORMAL',
      'NORMAL',
    ])
  })

  it('nota de 1 a 5, com os limites padrão: 1 é baixíssima, 2 e 3 são baixas, 4 e 5 são normais', () => {
    expect([1, 2, 3, 4, 5].map((nota) => classificarNota(10, [nota], PADRAO))).toEqual([
      'BAIXISSIMA',
      'BAIXA',
      'BAIXA',
      'NORMAL',
      'NORMAL',
    ])
  })

  it('vale a pior entre o NPS e cada nota', () => {
    expect(classificarNota(9, [5, 4, 5], PADRAO)).toBe('NORMAL')
    expect(classificarNota(9, [5, 3, 5], PADRAO)).toBe('BAIXA')
    expect(classificarNota(9, [5, 1, 3], PADRAO)).toBe('BAIXISSIMA')
    expect(classificarNota(5, [5, 5], PADRAO)).toBe('BAIXA')
    expect(classificarNota(1, [5, 5], PADRAO)).toBe('BAIXISSIMA')
    expect(classificarNota(6, [2], PADRAO)).toBe('BAIXA')
  })

  it('segue os limites que recebe, e não os padrão', () => {
    const exigente = {
      nps_limite_baixa: 8,
      nps_limite_baixissima: 4,
      escala_limite_baixa: 4,
      escala_limite_baixissima: 2,
    }

    expect(classificarNota(8, [], exigente)).toBe('BAIXA')
    expect(classificarNota(4, [], exigente)).toBe('BAIXISSIMA')
    expect(classificarNota(9, [4], exigente)).toBe('BAIXA')
    expect(classificarNota(9, [2], exigente)).toBe('BAIXISSIMA')
    expect(classificarNota(9, [5], exigente)).toBe('NORMAL')
  })
})
