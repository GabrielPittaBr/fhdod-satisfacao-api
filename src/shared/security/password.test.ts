import { describe, expect, it } from 'vitest'
import { gerarHashDaSenha, senhaConfere } from './password'

describe('hash de senha', () => {
  it('usa argon2id com os parâmetros mínimos da OWASP', async () => {
    const hash = await gerarHashDaSenha('senha-de-teste-123')

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/)
    expect(hash).not.toContain('senha-de-teste-123')
  })

  it('confere a senha certa e recusa as outras', async () => {
    const hash = await gerarHashDaSenha('senha-de-teste-123')

    await expect(senhaConfere(hash, 'senha-de-teste-123')).resolves.toBe(true)
    await expect(senhaConfere(hash, 'Senha-de-teste-123')).resolves.toBe(false)
    await expect(senhaConfere(hash, '')).resolves.toBe(false)
  })

  it('gera um sal novo a cada hash, então a mesma senha nunca dá o mesmo hash', async () => {
    const [primeiro, segundo] = await Promise.all([
      gerarHashDaSenha('mesma-senha-1'),
      gerarHashDaSenha('mesma-senha-1'),
    ])

    expect(primeiro).not.toBe(segundo)
  })
})
