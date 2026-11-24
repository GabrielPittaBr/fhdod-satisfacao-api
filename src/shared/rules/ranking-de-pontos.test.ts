import { describe, expect, it } from 'vitest'
import {
  MINIMO_DE_NOTAS_DO_PONTO,
  ranquearPontos,
  TAMANHO_DO_RANKING,
  type PontoAvaliado,
} from './ranking-de-pontos'

let criados = 0

/** Um ponto com os números pedidos e um setor de nome único, se o teste não der outro. */
function ponto(media: number, percentual45: number, total = 10, setor?: string): PontoAvaliado {
  criados += 1
  return {
    setorId: criados,
    setor: setor ?? `Setor ${String(criados).padStart(3, '0')}`,
    categoriaId: 1,
    categoria: 'Atendimento',
    media,
    percentual45,
    total,
  }
}

const nomes = (pontos: PontoAvaliado[]) => pontos.map(({ setor }) => setor)

describe('ranquearPontos', () => {
  it('três em cada lista, no máximo, e com 5 notas ou mais', () => {
    expect(MINIMO_DE_NOTAS_DO_PONTO).toBe(5)
    expect(TAMANHO_DO_RANKING).toBe(3)
  })

  it('os melhores do maior para baixo, os piores do menor para cima, sem repetir', () => {
    const pontos = [
      ponto(4.1, 80, 10, 'C'),
      ponto(2.0, 20, 10, 'H'),
      ponto(4.8, 95, 10, 'A'),
      ponto(3.0, 40, 10, 'F'),
      ponto(4.5, 90, 10, 'B'),
      ponto(1.5, 10, 10, 'I'),
      ponto(3.5, 60, 10, 'E'),
      ponto(2.5, 30, 10, 'G'),
      ponto(3.9, 70, 10, 'D'),
    ]

    const { melhores, piores } = ranquearPontos(pontos)

    expect(nomes(melhores)).toEqual(['A', 'B', 'C'])
    expect(nomes(piores)).toEqual(['I', 'H', 'G'])
  })

  it('o ponto com menos de 5 notas fica de fora, mesmo com a maior média', () => {
    const pontos = [ponto(5, 100, 4, 'Quatro notas'), ponto(4, 75, 5, 'Cinco notas')]

    expect(nomes(ranquearPontos(pontos).melhores)).toEqual(['Cinco notas'])
  })

  it('com poucos pontos, os piores saem só dos que sobram', () => {
    const quatro = [ponto(4, 80, 9, 'A'), ponto(3, 50, 9, 'B'), ponto(2, 20, 9, 'C'), ponto(1, 0, 9, 'D')]
    expect(nomes(ranquearPontos(quatro).melhores)).toEqual(['A', 'B', 'C'])
    expect(nomes(ranquearPontos(quatro).piores)).toEqual(['D'])

    const dois = [ponto(4, 80, 9, 'A'), ponto(2, 20, 9, 'B')]
    expect(ranquearPontos(dois)).toEqual({ melhores: dois, piores: [] })

    expect(ranquearPontos([])).toEqual({ melhores: [], piores: [] })
  })

  it('no empate da média, vale o % de notas 4 e 5; depois, o ponto com mais notas; depois, o nome', () => {
    const pontos = [
      ponto(4.2, 70, 10, 'Menor %'),
      ponto(4.2, 80, 6, 'Maior %, menos notas'),
      ponto(4.2, 80, 12, 'Maior %, mais notas'),
      ponto(4.2, 80, 6, 'Ambulatório'),
    ]

    expect(nomes(ranquearPontos(pontos).melhores)).toEqual([
      'Maior %, mais notas',
      'Ambulatório',
      'Maior %, menos notas',
    ])
  })

  it('entre os piores, o empate também favorece o ponto com mais notas', () => {
    const pontos = [
      ...[4.9, 4.8, 4.7].map((media) => ponto(media, 100)),
      ponto(1.8, 10, 6, 'Poucas notas'),
      ponto(1.8, 10, 20, 'Muitas notas'),
      ponto(1.8, 0, 6, 'Menor %'),
    ]

    expect(nomes(ranquearPontos(pontos).piores)).toEqual(['Menor %', 'Muitas notas', 'Poucas notas'])
  })

  it('o mesmo setor em duas categorias é ordenado pela categoria no empate', () => {
    const recepcao = { ...ponto(4, 80, 10, 'Pediatria'), categoriaId: 2, categoria: 'Recepção' }
    const limpeza = { ...recepcao, categoriaId: 3, categoria: 'Limpeza' }

    expect(ranquearPontos([recepcao, limpeza]).melhores.map(({ categoria }) => categoria)).toEqual([
      'Limpeza',
      'Recepção',
    ])
  })
})
