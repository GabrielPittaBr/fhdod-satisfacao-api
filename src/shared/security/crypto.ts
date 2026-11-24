import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../../config/env'

// Cifra dos telefones de retorno, com AES-256-GCM e a chave do ENCRYPTION_KEY. O GCM cifra e autentica: um
// texto cifrado adulterado, ou decifrado com outra chave, falha em vez de devolver um telefone errado.

const ALGORITMO = 'aes-256-gcm'
/** A versão do formato abre o texto gravado: uma troca de chave ou de formato convive com o que já está no banco. */
const VERSAO = 'v1'
/** IV de 12 bytes, o tamanho recomendado para o GCM, sorteado a cada cifra. */
const BYTES_DO_IV = 12
const BYTES_DA_ETIQUETA = 16
const CHAVE = Buffer.from(env.ENCRYPTION_KEY, 'base64')

/**
 * Cifra um texto curto, como o telefone. Sai como `v1.<iv>.<etiqueta>.<cifrado>`, cada parte em base64url.
 * Com o IV sorteado, o mesmo telefone dá um texto diferente a cada vez, e o banco não revela quem repetiu
 * o número.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(BYTES_DO_IV)
  const cifra = createCipheriv(ALGORITMO, CHAVE, iv, { authTagLength: BYTES_DA_ETIQUETA })
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [VERSAO, ...[iv, cifra.getAuthTag(), cifrado].map((parte) => parte.toString('base64url'))].join('.')
}

/**
 * Decifra o que o `cifrar` gravou. Lança erro se o texto foi adulterado, se veio de outra chave ou se não está
 * no formato `v1`. O erro nunca traz o texto, só o que deu errado.
 */
export function decifrar(gravado: string): string {
  const partes = gravado.split('.')
  const [versao, iv, etiqueta, cifrado] = partes
  if (partes.length !== 4 || versao !== VERSAO || !iv || !etiqueta || cifrado === undefined) {
    throw new Error('Texto cifrado em formato desconhecido')
  }
  const decifra = createDecipheriv(ALGORITMO, CHAVE, Buffer.from(iv, 'base64url'), {
    authTagLength: BYTES_DA_ETIQUETA,
  })
  decifra.setAuthTag(Buffer.from(etiqueta, 'base64url'))
  return Buffer.concat([decifra.update(Buffer.from(cifrado, 'base64url')), decifra.final()]).toString('utf8')
}
