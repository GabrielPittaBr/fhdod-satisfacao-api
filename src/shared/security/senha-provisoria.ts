import { randomInt } from 'node:crypto'
import { senhaSegueARegra } from '../rules/senha'

/**
 * Letras e algarismos sem os que se confundem na leitura (0 e O, 1, l e I): a pessoa recebe a senha de outra e
 * a digita no primeiro acesso.
 */
const CARACTERES = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const GRUPOS = 3
const POR_GRUPO = 4

function grupo(): string {
  return Array.from({ length: POR_GRUPO }, () => CARACTERES[randomInt(CARACTERES.length)]).join('')
}

/**
 * Senha provisória, como `Kp7m-Qx3r-Tz9w`: 12 caracteres sorteados pelo gerador criptográfico do Node (cerca de
 * 70 bits), em 3 grupos para facilitar a leitura. Segue a regra de senha (pelo menos 10 caracteres, com letras
 * e números): se o sorteio sair sem letra ou sem algarismo, sorteia de novo.
 */
export function gerarSenhaProvisoria(): string {
  for (;;) {
    const senha = Array.from({ length: GRUPOS }, grupo).join('-')
    if (senhaSegueARegra(senha)) return senha
  }
}
