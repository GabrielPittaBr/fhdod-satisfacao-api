import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cifrar, decifrar } from './crypto'

const TELEFONE = '51999990000'
/** A chave dos testes, a mesma do vitest.config.ts. */
const CHAVE_DOS_TESTES = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64')

/** Troca o primeiro caractere de uma parte do texto cifrado (0 = IV, 1 = etiqueta, 2 = cifrado). */
function adulterar(gravado: string, parte: 0 | 1 | 2) {
  const partes = gravado.split('.')
  const alvo = partes[parte + 1]!
  partes[parte + 1] = (alvo[0] === 'A' ? 'B' : 'A') + alvo.slice(1)
  return partes.join('.')
}

describe('cifrar e decifrar', () => {
  it('decifra de volta o que cifrou, também com acentos e emojis', () => {
    for (const texto of [TELEFONE, '5133334444', '', 'Observação com acento 😀']) {
      expect(decifrar(cifrar(texto))).toBe(texto)
    }
  })

  it('grava v1, o IV de 12 bytes, a etiqueta de 16 e o cifrado, em base64url, sem o texto em claro', () => {
    const gravado = cifrar(TELEFONE)

    expect(gravado).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/)
    expect(gravado).not.toContain(TELEFONE)
    expect(gravado).not.toContain(TELEFONE.slice(-4))
  })

  it('sorteia o IV: o mesmo telefone nunca dá o mesmo texto cifrado', () => {
    const gravados = new Set(Array.from({ length: 20 }, () => cifrar(TELEFONE)))

    expect(gravados.size).toBe(20)
  })

  it('é AES-256-GCM com a chave do ENCRYPTION_KEY: o node:crypto decifra o texto sozinho', () => {
    const [, iv, etiqueta, cifrado] = cifrar(TELEFONE).split('.')
    const decifra = createDecipheriv('aes-256-gcm', CHAVE_DOS_TESTES, Buffer.from(iv!, 'base64url'))
    decifra.setAuthTag(Buffer.from(etiqueta!, 'base64url'))

    const texto = Buffer.concat([decifra.update(Buffer.from(cifrado!, 'base64url')), decifra.final()])

    expect(texto.toString('utf8')).toBe(TELEFONE)
  })

  it('recusa o texto adulterado no IV, na etiqueta ou no cifrado, sem devolver outro telefone', () => {
    const gravado = cifrar(TELEFONE)

    for (const parte of [0, 1, 2] as const) {
      expect(() => decifrar(adulterar(gravado, parte))).toThrow()
    }
  })

  it('recusa o texto cifrado com outra chave', () => {
    const iv = randomBytes(12)
    const cifra = createCipheriv('aes-256-gcm', randomBytes(32), iv)
    const cifrado = Buffer.concat([cifra.update(TELEFONE, 'utf8'), cifra.final()])
    const deOutraChave = ['v1', iv, cifra.getAuthTag(), cifrado]
      .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
      .join('.')

    expect(() => decifrar(deOutraChave)).toThrow()
  })

  it('recusa outro formato, e o erro não mostra o que veio', () => {
    const [, iv, etiqueta, cifrado] = cifrar(TELEFONE).split('.')

    for (const gravado of [
      TELEFONE,
      `v2.${iv}.${etiqueta}.${cifrado}`,
      `v1.${iv}.${etiqueta}`,
      `v1.${iv}.${etiqueta}.${cifrado}.extra`,
      `v1..${etiqueta}.${cifrado}`,
    ]) {
      expect(() => decifrar(gravado)).toThrow('Texto cifrado em formato desconhecido')
    }
  })
})
