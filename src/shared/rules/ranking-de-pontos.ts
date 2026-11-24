import { porNome } from './ordem-alfabetica'

/**
 * Notas que um ponto (um setor numa categoria) precisa ter para entrar no ranking e nos destaques da TV: a
 * média de poucas notas engana.
 */
export const MINIMO_DE_NOTAS_DO_PONTO = 5

/** Pontos em cada lista do ranking, no máximo. */
export const TAMANHO_DO_RANKING = 3

/** Um setor numa categoria, com a média e o % de notas 4 e 5 das notas do período. */
export interface PontoAvaliado {
  setorId: number
  setor: string
  categoriaId: number
  categoria: string
  media: number
  percentual45: number
  total: number
}

/** No empate dos números, o setor e depois a categoria em ordem alfabética, para a ordem nunca variar. */
function porNomeDoPonto(a: PontoAvaliado, b: PontoAvaliado): number {
  return (
    porNome({ id: a.setorId, nome: a.setor }, { id: b.setorId, nome: b.setor }) ||
    porNome({ id: a.categoriaId, nome: a.categoria }, { id: b.categoriaId, nome: b.categoria })
  )
}

/**
 * Do mais bem avaliado para baixo: a maior média, depois o maior % de notas 4 e 5 e, no empate, o ponto com
 * mais notas, que mostra a mesma coisa com mais gente.
 */
export function melhorPrimeiro(a: PontoAvaliado, b: PontoAvaliado): number {
  return b.media - a.media || b.percentual45 - a.percentual45 || b.total - a.total || porNomeDoPonto(a, b)
}

/** Do pior para cima: a menor média, depois o menor % de notas 4 e 5 e, no empate, o ponto com mais notas. */
export function piorPrimeiro(a: PontoAvaliado, b: PontoAvaliado): number {
  return a.media - b.media || a.percentual45 - b.percentual45 || b.total - a.total || porNomeDoPonto(a, b)
}

/**
 * Os melhores e os piores pontos, até `TAMANHO_DO_RANKING` em cada lista, só com os que têm pelo menos
 * `MINIMO_DE_NOTAS_DO_PONTO` notas. Os piores saem dos que não estão nos melhores: com poucos pontos, a lista
 * dos piores fica curta ou vazia, e nenhum ponto aparece nas duas.
 */
export function ranquearPontos<P extends PontoAvaliado>(
  pontos: readonly P[],
): { melhores: P[]; piores: P[] } {
  const elegiveis = pontos.filter(({ total }) => total >= MINIMO_DE_NOTAS_DO_PONTO)
  const melhores = [...elegiveis].sort(melhorPrimeiro).slice(0, TAMANHO_DO_RANKING)
  const piores = elegiveis
    .filter((ponto) => !melhores.includes(ponto))
    .sort(piorPrimeiro)
    .slice(0, TAMANHO_DO_RANKING)
  return { melhores, piores }
}
