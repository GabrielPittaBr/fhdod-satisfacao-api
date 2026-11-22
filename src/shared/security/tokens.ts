import { createHash, randomBytes } from 'node:crypto'
import { errors, jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env'

const ALGORITMO = 'HS256'
const CHAVE = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
const ID_DE_USUARIO = /^[1-9]\d{0,9}$/

/**
 * Token de acesso: um JWT assinado com HS256, válido por ACCESS_TOKEN_TTL (15 min no padrão), só com o ID do
 * usuário no `sub`. Perfil, permissões e setores não vão no token: o `authenticate` os lê do banco a cada
 * requisição, e assim uma mudança feita pelo Super Admin vale na hora.
 */
export async function emitirTokenDeAcesso(usuarioId: number): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)
  return new SignJWT()
    .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
    .setSubject(String(usuarioId))
    .setIssuedAt(agora)
    .setExpirationTime(agora + env.ACCESS_TOKEN_TTL)
    .sign(CHAVE)
}

/** O ID do usuário de um token de acesso válido, ou `null` se o token estiver vencido, adulterado ou malformado. */
export async function lerTokenDeAcesso(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, CHAVE, { algorithms: [ALGORITMO] })
    return payload.sub && ID_DE_USUARIO.test(payload.sub) ? Number(payload.sub) : null
  } catch (erro) {
    if (erro instanceof errors.JOSEError) return null
    throw erro
  }
}

/** Token opaco, como o refresh: 32 bytes aleatórios em base64url (43 caracteres). */
export function gerarTokenOpaco(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 em hexadecimal (64 caracteres): é o que o banco guarda no lugar do token. */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
