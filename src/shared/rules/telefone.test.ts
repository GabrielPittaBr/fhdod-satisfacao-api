import { describe, expect, it } from 'vitest'
import { digitosDoTelefone, finalDoTelefone, mascararTelefone, telefoneValido } from './telefone'

describe('telefoneValido', () => {
  it('aceita celular e fixo com DDD, com ou sem a máscara', () => {
    for (const telefone of [
      '51999990000',
      '5133334444',
      '(51) 99999-0000',
      '(51) 3333-4444',
      '51 99999 0000',
      '51.99999.0000',
      ' (11) 98765-4321 ',
    ]) {
      expect(telefoneValido(telefone), telefone).toBe(true)
    }
  })

  it('recusa sem DDD, com dígitos a mais ou a menos, DDD com zero, letras e outros sinais', () => {
    for (const telefone of [
      '',
      '99999-0000',
      '519999900',
      '519999900001',
      '+55 51 99999-0000',
      '01999990000',
      '50999990000',
      '(51) 9999A-0000',
      '51999990000#',
      '51_99999_0000',
    ]) {
      expect(telefoneValido(telefone), telefone).toBe(false)
    }
  })
})

describe('digitosDoTelefone e finalDoTelefone', () => {
  it('tiram a máscara e separam os 4 últimos dígitos', () => {
    const digitos = digitosDoTelefone('(51) 99999-0123')

    expect(digitos).toBe('51999990123')
    expect(finalDoTelefone(digitos)).toBe('0123')
    expect(finalDoTelefone(digitosDoTelefone('(51) 3333-4444'))).toBe('4444')
  })
})

describe('mascararTelefone', () => {
  it('mostra só os 4 últimos dígitos, depois dos pontos', () => {
    expect(mascararTelefone('0042')).toBe('•••• 0042')
    expect(mascararTelefone(finalDoTelefone(digitosDoTelefone('(51) 3333-4444')))).toBe('•••• 4444')
  })
})
