import { describe, expect, it } from 'vitest'
import { hojeEmBrasilia } from './pesquisa.schemas'

describe('hojeEmBrasilia', () => {
  it('vira o dia à meia-noite de Brasília (03:00 em UTC), e não à meia-noite de UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-11-24T02:59:59Z'))).toBe('2026-11-23')
    expect(hojeEmBrasilia(new Date('2026-11-24T03:00:00Z'))).toBe('2026-11-24')
  })
})
