import { describe, expect, it } from 'vitest'
import { senhaSegueARegra } from '../rules/senha'
import { gerarSenhaProvisoria } from './senha-provisoria'

describe('senha provisória', () => {
  const senhas = Array.from({ length: 500 }, gerarSenhaProvisoria)

  it('tem 3 grupos de 4 caracteres e segue a regra de senha', () => {
    for (const senha of senhas) {
      expect(senha).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/)
      expect(senhaSegueARegra(senha), senha).toBe(true)
    }
  })

  it('não usa os caracteres que se confundem na leitura', () => {
    for (const senha of senhas) expect(senha).not.toMatch(/[0O1lI]/)
  })

  it('nunca se repete', () => {
    expect(new Set(senhas).size).toBe(senhas.length)
  })
})
