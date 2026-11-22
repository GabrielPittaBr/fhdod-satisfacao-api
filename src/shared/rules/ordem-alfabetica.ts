const colacao = new Intl.Collator('pt-BR')

/**
 * Ordem alfabética do português, a mesma do front (`localeCompare(..., 'pt-BR')`): acento e maiúscula não
 * tiram um nome do lugar, e "Ética" fica entre "Enfermaria" e "Farmácia". No empate, vale o ID, para a ordem
 * nunca variar entre duas chamadas.
 *
 * As listas são ordenadas aqui, e não no `ORDER BY`, porque a ordem do banco depende do locale com que ele foi
 * criado: com `C`, as maiúsculas vêm antes das minúsculas, e as letras acentuadas, depois do "z".
 */
export function porNome(a: { id: number; nome: string }, b: { id: number; nome: string }): number {
  return colacao.compare(a.nome, b.nome) || a.id - b.id
}
