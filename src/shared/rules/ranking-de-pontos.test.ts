import { describe, expect, it } from 'vitest'
import {
  destacarPontos,
  MINIMO_DE_NOTAS_DO_PONTO,
  ranquearPontos,
  SETORES_NOS_DESTAQUES,
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

describe('destacarPontos', () => {
  /** Um ponto do setor pedido (o ID e o nome), numa categoria de nome único. */
  function doSetor(setorId: number, media: number, percentual45: number, total = 10): PontoAvaliado {
    criados += 1
    return {
      setorId,
      setor: `Setor ${setorId}`,
      categoriaId: criados,
      categoria: `Categoria ${String(criados).padStart(3, '0')}`,
      media,
      percentual45,
      total,
    }
  }

  const resumo = (pontos: PontoAvaliado[]) => pontos.map(({ setorId, media }) => [setorId, media])

  it('três setores, no máximo, com 5 notas ou mais', () => {
    expect(SETORES_NOS_DESTAQUES).toBe(3)
  })

  it('o melhor ponto de cada setor, do melhor para baixo, sem repetir o setor', () => {
    const pontos = [
      doSetor(1, 4.9, 95),
      doSetor(1, 4.8, 90),
      doSetor(1, 4.7, 90),
      doSetor(2, 4.1, 80),
      doSetor(3, 3.2, 40),
      doSetor(2, 4.6, 85),
      doSetor(4, 2.0, 10),
    ]

    expect(resumo(destacarPontos(pontos))).toEqual([
      [1, 4.9],
      [2, 4.6],
      [3, 3.2],
    ])
  })

  it('o ponto com menos de 5 notas fica de fora, e o setor entra com o seu próximo ponto', () => {
    const pontos = [doSetor(1, 5, 100, 4), doSetor(1, 3, 50, 5), doSetor(2, 4, 75, 4)]

    expect(resumo(destacarPontos(pontos))).toEqual([[1, 3]])
  })

  it('com menos de três setores, a lista fica curta; sem pontos, vazia', () => {
    expect(resumo(destacarPontos([doSetor(1, 4, 80), doSetor(1, 4.5, 90)]))).toEqual([[1, 4.5]])
    expect(destacarPontos([])).toEqual([])
  })

  it('no empate da média, vale o % de notas 4 e 5 e depois o ponto com mais notas, como no ranking', () => {
    const pontos = [doSetor(1, 4.2, 70), doSetor(2, 4.2, 80, 6), doSetor(3, 4.2, 80, 12), doSetor(4, 4.2, 60)]

    expect(destacarPontos(pontos).map(({ setorId }) => setorId)).toEqual([3, 2, 1])
  })

  it('não muda a ordem da lista recebida', () => {
    const pontos = [doSetor(1, 3, 50), doSetor(2, 4, 80)]
    const antes = [...pontos]

    destacarPontos(pontos)

    expect(pontos).toEqual(antes)
  })
})
