import { SignJWT } from 'jose'
import request, { type Response } from 'supertest'
import { COOKIE_DO_REFRESH } from '../../src/modules/auth/auth.schemas'
import { SENHA_DE_TESTE } from '../factories/usuarios'

type App = Parameters<typeof request>[0]

export interface CookieGravado {
  valor: string
  /** Atributos com o nome em minúsculas (`httponly`, `path`...); os que não têm valor ficam `true`. */
  atributos: Record<string, string | true>
}

/** O cookie de refresh que a resposta gravou ou apagou, com os atributos, ou `undefined` se ela não mexeu nele. */
export function cookieDoRefresh(resposta: Response): CookieGravado | undefined {
  const cabecalho: unknown = resposta.headers['set-cookie']
  const linhas = Array.isArray(cabecalho)
    ? (cabecalho as string[])
    : typeof cabecalho === 'string'
      ? [cabecalho]
      : []
  const linha = linhas.find((cookie) => cookie.startsWith(`${COOKIE_DO_REFRESH}=`))
  if (!linha) return undefined

  const [par = '', ...atributos] = linha.split(';').map((parte) => parte.trim())
  return {
    valor: decodeURIComponent(par.slice(COOKIE_DO_REFRESH.length + 1)),
    atributos: Object.fromEntries(
      atributos.map((atributo) => {
        const [nome = '', ...valor] = atributo.split('=')
        return [nome.toLowerCase(), valor.length > 0 ? valor.join('=') : true]
      }),
    ),
  }
}

/** O cabeçalho `Cookie` que o navegador mandaria às rotas de /api/v1/auth. */
export function cookie(refresh: string): string {
  return `${COOKIE_DO_REFRESH}=${refresh}`
}

/** O cabeçalho `Authorization` com o token de acesso. */
export function bearer(tokenAcesso: string): string {
  return `Bearer ${tokenAcesso}`
}

/** Entra pelo POST /auth/login e devolve o token de acesso e o refresh do cookie. */
export async function entrar(app: App, email: string, senha = SENHA_DE_TESTE) {
  const resposta = await request(app).post('/api/v1/auth/login').send({ email, senha })
  const refresh = cookieDoRefresh(resposta)?.valor
  if (resposta.status !== 200 || !refresh) {
    throw new Error(`O login de ${email} falhou: ${resposta.status} ${JSON.stringify(resposta.body)}`)
  }
  return { tokenAcesso: (resposta.body as { data: { tokenAcesso: string } }).data.tokenAcesso, refresh }
}

/**
 * Um token de acesso assinado como a API assina, com o segredo dos testes. Com `emitidoHaSegundos` acima de
 * 900, já venceu; com outro `segredo`, foi forjado.
 */
export function tokenDeAcesso(
  usuarioId: number,
  { emitidoHaSegundos = 0, segredo = process.env.JWT_ACCESS_SECRET ?? '' } = {},
): Promise<string> {
  const emitidoEm = Math.floor(Date.now() / 1000) - emitidoHaSegundos
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(usuarioId))
    .setIssuedAt(emitidoEm)
    .setExpirationTime(emitidoEm + 15 * 60)
    .sign(new TextEncoder().encode(segredo))
}
