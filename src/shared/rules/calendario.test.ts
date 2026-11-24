import { describe, expect, it } from 'vitest'
import {
  dataDoDia,
  diaDoCalendario,
  hojeEmBrasilia,
  primeiroDiaDoMes,
  segundaDaSemana,
  somarDias,
} from './calendario'

describe('hojeEmBrasilia', () => {
  it('vira o dia à meia-noite de Brasília (03:00 em UTC), e não à meia-noite de UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-11-24T02:59:59Z'))).toBe('2026-11-23')
    expect(hojeEmBrasilia(new Date('2026-11-24T03:00:00Z'))).toBe('2026-11-24')
  })
})

describe('diaDoCalendario e dataDoDia', () => {
  it('contam os dias desde 1970-01-01, sem fuso, e um desfaz o outro', () => {
    expect(diaDoCalendario('1970-01-01')).toBe(0)
    expect(diaDoCalendario('1970-01-02')).toBe(1)
    expect(diaDoCalendario('1969-12-31')).toBe(-1)
    for (const data of ['2026-11-24', '2024-02-29', '1969-12-31', '2000-01-01']) {
      expect(dataDoDia(diaDoCalendario(data))).toBe(data)
    }
  })
})

describe('segundaDaSemana', () => {
  it('de segunda a domingo, a semana começa na segunda', () => {
    const segunda = diaDoCalendario('2026-11-23')
    for (const data of ['2026-11-23', '2026-11-24', '2026-11-28', '2026-11-29']) {
      expect(segundaDaSemana(diaDoCalendario(data)), data).toBe(segunda)
    }
    expect(dataDoDia(segundaDaSemana(diaDoCalendario('2026-11-30')))).toBe('2026-11-30')
  })

  it('vale também antes de 1970', () => {
    // 1969-12-31 foi uma quarta.
    expect(dataDoDia(segundaDaSemana(diaDoCalendario('1969-12-31')))).toBe('1969-12-29')
  })
})

describe('somarDias', () => {
  it('passa de um mês e de um ano para o outro, e volta com dias negativos', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-11-24', -29)).toBe('2026-10-26')
    expect(somarDias('2024-03-01', -1)).toBe('2024-02-29')
    expect(somarDias('2026-11-24', 0)).toBe('2026-11-24')
  })

  it('não muda com o horário de verão: 2018-11-04, em Brasília, teve 23 horas', () => {
    expect(somarDias('2018-11-03', 1)).toBe('2018-11-04')
    expect(somarDias('2018-11-04', 1)).toBe('2018-11-05')
  })
})

describe('primeiroDiaDoMes', () => {
  it('troca só o dia', () => {
    expect(primeiroDiaDoMes('2026-11-24')).toBe('2026-11-01')
    expect(primeiroDiaDoMes('2026-12-01')).toBe('2026-12-01')
    expect(primeiroDiaDoMes('2024-02-29')).toBe('2024-02-01')
  })
})
