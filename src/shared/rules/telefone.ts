// Telefone de retorno ao paciente: brasileiro, com DDD, digitado com ou sem a máscara do front.

/** Só o que a máscara põe entre os dígitos: espaços, parênteses, hífen e ponto, como em "(51) 99999-0000". */
const COM_MASCARA = /^[\d ().-]+$/

/** DDD de dois dígitos sem zero (não há DDD 10, 20...) e o número: 8 dígitos no fixo, 9 no celular. */
const DDD_E_NUMERO = /^[1-9]{2}\d{8,9}$/

/** Só os dígitos, como o banco cifra o telefone: "(51) 99999-0000" vira "51999990000". */
export function digitosDoTelefone(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

/** Telefone com DDD, de 10 ou 11 dígitos, com ou sem a máscara. Letras e outros sinais não passam. */
export function telefoneValido(telefone: string): boolean {
  return COM_MASCARA.test(telefone) && DDD_E_NUMERO.test(digitosDoTelefone(telefone))
}

/** Os 4 últimos dígitos, gravados em claro para a tela mostrar o número mascarado sem decifrar. */
export function finalDoTelefone(digitos: string): string {
  return digitos.slice(-4)
}
