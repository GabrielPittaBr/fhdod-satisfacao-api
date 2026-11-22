import { describe, expect, it } from 'vitest'
import { MENSAGEM_SENHA_FRACA, senhaSegueARegra } from './senha'

describe('regra de senha', () => {
  it.each(['senha12345', 'abcdefghi1', 'Hospital2026!', 'ação-segura-9'])('aceita %s', (senha) => {
    expect(senhaSegueARegra(senha)).toBe(true)
  })

  it.each([
    ['curta com 9 caracteres', 'senha1234'],
    ['só letras', 'somenteletras'],
    ['só números', '1234567890'],
    ['sem letra nem número', '!!!!!!!!!!'],
    ['vazia', ''],
  ])('recusa senha %s', (_caso, senha) => {
    expect(senhaSegueARegra(senha)).toBe(false)
  })

  it('explica a regra para quem está na tela', () => {
    expect(MENSAGEM_SENHA_FRACA).toBe('Use pelo menos 10 caracteres, com letras e números.')
  })
})
