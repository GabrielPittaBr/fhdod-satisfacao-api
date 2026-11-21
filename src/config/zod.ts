import { z } from 'zod'

// Mensagens de validação em português: o front mostra a `mensagem` de cada campo direto para o usuário.
// Estas são as mensagens padrão; cada schema pode trocar pela sua (por exemplo, "Obrigatório, de 0 a 10").
z.config(z.locales.ptBR())
z.config({
  customError: (problema) =>
    problema.code === 'invalid_type' && problema.input === undefined ? 'Obrigatório' : undefined,
})
