import { describe, expect, it } from 'vitest'
import { porNome } from './ordem-alfabetica'

function nomes(lista: { id: number; nome: string }[]) {
  return [...lista].sort(porNome).map(({ nome }) => nome)
}

describe('porNome', () => {
  it('segue o alfabeto do português, sem jogar acentos e maiúsculas para o fim', () => {
    const lista = ['Zeladoria', 'Ética', 'Pronto Atendimento', 'ambulatório', 'Enfermaria', 'Banco de Sangue']

    expect(nomes(lista.map((nome, id) => ({ id, nome })))).toEqual([
      'ambulatório',
      'Banco de Sangue',
      'Enfermaria',
      'Ética',
      'Pronto Atendimento',
      'Zeladoria',
    ])
  })

  it('no empate, ordena pelo ID', () => {
    const lista = [
      { id: 7, nome: 'Raio-X' },
      { id: 2, nome: 'Raio-X' },
      { id: 5, nome: 'Raio-X' },
    ]

    expect([...lista].sort(porNome).map(({ id }) => id)).toEqual([2, 5, 7])
  })
})
