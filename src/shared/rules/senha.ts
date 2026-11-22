// Regra de senha do plano ("Senhas e contas"): no mínimo 10 caracteres, misturando letras e números. Vale para
// a troca de senha, para a senha do primeiro Super Admin (seed) e para as senhas provisórias (ticket 09).

export const SENHA_MINIMO = 10

export const MENSAGEM_SENHA_FRACA = `Use pelo menos ${SENHA_MINIMO} caracteres, com letras e números.`

/** Pelo menos uma letra (com ou sem acento) e um algarismo. */
export function temLetrasENumeros(senha: string): boolean {
  return /\p{L}/u.test(senha) && /\d/.test(senha)
}

export function senhaSegueARegra(senha: string): boolean {
  return senha.length >= SENHA_MINIMO && temLetrasENumeros(senha)
}
