import { decodeJwt, decodeProtectedHeader, SignJWT, UnsecuredJWT } from 'jose'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { emitirTokenDeAcesso, gerarTokenOpaco, hashDoToken, lerTokenDeAcesso } from './tokens'

const SEGREDO = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET)

/** Um JWT assinado com o segredo dos testes, com o `sub` e as datas que o teste quiser. */
function assinar({ sub = '7', emitidoHaSegundos = 0, validadeSegundos = 900, segredo = SEGREDO } = {}) {
  const emitidoEm = Math.floor(Date.now() / 1000) - emitidoHaSegundos
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt(emitidoEm)
    .setExpirationTime(emitidoEm + validadeSegundos)
    .sign(segredo)
}

describe('token de acesso', () => {
  it('é um JWT HS256 de 15 minutos só com o ID do usuário, sem perfil nem permissões', async () => {
    const token = await emitirTokenDeAcesso(7)
    const conteudo = decodeJwt(token)

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(Object.keys(conteudo).sort()).toEqual(['exp', 'iat', 'sub'])
    expect(conteudo.sub).toBe('7')
    expect(conteudo.exp! - conteudo.iat!).toBe(15 * 60)
    await expect(lerTokenDeAcesso(token)).resolves.toBe(7)
  })

  it('recusa o token vencido', async () => {
    await expect(lerTokenDeAcesso(await assinar({ emitidoHaSegundos: 901 }))).resolves.toBeNull()
    await expect(lerTokenDeAcesso(await assinar({ emitidoHaSegundos: 60 }))).resolves.toBe(7)
  })

  it('recusa o token assinado com outro segredo, adulterado ou sem assinatura', async () => {
    const outroSegredo = new TextEncoder().encode('outro-segredo-com-mais-de-32-caracteres-aqui')
    const [cabecalho, , assinatura] = (await emitirTokenDeAcesso(7)).split('.')
    const comOutroUsuario = Buffer.from(JSON.stringify({ sub: '1', iat: 0, exp: 9_999_999_999 })).toString(
      'base64url',
    )
    const semAssinatura = new UnsecuredJWT({}).setSubject('7').setExpirationTime('15m').encode()

    for (const token of [
      await assinar({ segredo: outroSegredo }),
      `${cabecalho}.${comOutroUsuario}.${assinatura}`,
      semAssinatura,
      'nao-e-um-jwt',
      '',
    ]) {
      await expect(lerTokenDeAcesso(token)).resolves.toBeNull()
    }
  })

  it('recusa o token cujo sub não é o ID de um usuário', async () => {
    for (const sub of ['0', '-1', 'abc', '1.5', '01']) {
      await expect(lerTokenDeAcesso(await assinar({ sub }))).resolves.toBeNull()
    }
  })
})

describe('tokens opacos', () => {
  it('têm 32 bytes aleatórios em base64url e nunca se repetem', () => {
    const tokens = Array.from({ length: 50 }, gerarTokenOpaco)

    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(tokens).size).toBe(50)
  })

  it('vão para o banco como SHA-256 em hexadecimal', () => {
    const token = gerarTokenOpaco()

    expect(hashDoToken(token)).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashDoToken(token)).toMatch(/^[0-9a-f]{64}$/)
  })
})
