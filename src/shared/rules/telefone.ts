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

/** O DDD, o começo e os 4 últimos dígitos de um telefone como o banco o cifra: só os dígitos, 10 ou 11. */
const PARTES_DO_TELEFONE = /^(\d{2})(\d{4,5})(\d{4})$/

/**
 * O número completo como se lê e se disca, "(51) 99999-0042" no celular e "(51) 3333-0042" no fixo, a partir dos
 * dígitos decifrados. Um texto fora desse formato volta como veio: na planilha, nenhum número some.
 */
export function formatarTelefone(digitos: string): string {
  const partes = PARTES_DO_TELEFONE.exec(digitos)
  return partes ? `(${partes[1]}) ${partes[2]}-${partes[3]}` : digitos
}

/** O que a tela mostra no lugar dos dígitos escondidos. */
export const DIGITOS_ESCONDIDOS = '••••'

/**
 * O telefone mascarado, como `•••• 0042`, montado com os 4 últimos dígitos gravados em claro: as listas e o
 * detalhe nunca decifram o número. O número completo só sai pelo `POST /contatos/:id/revelar-telefone`.
 */
export function mascararTelefone(final: string): string {
  return `${DIGITOS_ESCONDIDOS} ${final}`
}
