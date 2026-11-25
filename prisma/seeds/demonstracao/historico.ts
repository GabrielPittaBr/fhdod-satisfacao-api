import type { Canal, Classificacao, TipoComentario, TipoPergunta } from '../../../src/generated/prisma/enums'
import { horarioDeBrasilia, hojeEmBrasilia, somarDias } from '../../../src/shared/rules/calendario'
import { classificarNota, type LimitesDeNota } from '../../../src/shared/rules/classificar-nota'
import { COMENTARIOS_DE_DEMONSTRACAO, ELOGIOS_A_PROFISSIONAIS, type NomeDaCategoria } from './dados'

// O histórico de avaliações da demonstração: o mesmo gerador que o mock do front usava
// (src/mocks/seed/historico.ts do fhdod-satisfacao-web, apagado no ticket 10 de lá), com a semente fixa por
// dia. Rodado no mesmo dia, dá sempre as mesmas avaliações, as mesmas que o mock mostrava nesse dia. Num
// outro dia, o histórico anda junto: a tendência de cada setor vai do começo ao fim do período, então os dias
// que já passaram também mudam um pouco.

/** Quantos dias antes de hoje o histórico começa: cerca de quatro meses. */
export const DIAS_DO_HISTORICO = 120

/** Uma pergunta ativa de um setor, como está no banco. */
export interface PerguntaDoHistorico {
  id: number
  categoriaId: number
  categoria: NomeDaCategoria
  texto: string
  tipo: TipoPergunta
  opcoes: string[]
}

/** Um setor com as perguntas ativas, na ordem da pesquisa. */
export interface SetorDoHistorico {
  id: number
  slug: string
  perguntas: PerguntaDoHistorico[]
}

/** Um turno, na ordem dos turnos. */
export interface TurnoDoHistorico {
  id: number
  horaInicio: string
  horaFim: string
}

export interface ItemGerado {
  perguntaId: number
  categoriaId: number
  perguntaTexto: string
  tipo: TipoPergunta
  valorNumero: number | null
  valorTexto: string | null
}

/** Uma avaliação gerada, pronta para gravar como a pesquisa grava. */
export interface AvaliacaoGerada {
  setorId: number
  canal: Extract<Canal, 'WEB' | 'TOTEM'>
  /** `AAAA-MM-DD`. */
  dataAtendimento: string
  turnoId: number
  nps: number
  classificacao: Classificacao
  enviadoEm: Date
  itens: ItemGerado[]
  comentario: { tipo: TipoComentario; texto: string } | null
  /** Os dígitos do telefone do pedido de retorno, que o comando cifra; `null` sem pedido. */
  telefone: string | null
}

type Sorteio = () => number

/** Gerador de números pseudoaleatórios de 32 bits: a mesma semente dá sempre a mesma sequência. */
function mulberry32(semente: number): Sorteio {
  let a = semente
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a: transforma o texto do dia na semente. */
function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return h >>> 0
}

const limitar = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor))

function escolher<T>(r: Sorteio, itens: readonly T[]): T {
  return itens[Math.floor(r() * itens.length)] as T
}

function escolherPorPeso<T>(r: Sorteio, opcoes: readonly (readonly [T, number])[]): T {
  let alvo = r() * opcoes.reduce((soma, [, peso]) => soma + peso, 0)
  for (const [valor, peso] of opcoes) if ((alvo -= peso) < 0) return valor
  return opcoes[opcoes.length - 1]![0]
}

function poisson(r: Sorteio, media: number): number {
  const limite = Math.exp(-media)
  let k = 0
  let produto = 1
  do {
    k++
    produto *= r()
  } while (produto > limite)
  return k - 1
}

interface PerfilDoSetor {
  /** Avaliações num dia útil, em média. */
  volume: number
  /** O volume do sábado e do domingo, em relação ao dia útil. */
  fimDeSemana: number
  /** A satisfação média do setor, de 0 a 1. */
  qualidade: number
  /** Quanto a satisfação muda do começo ao fim do histórico. */
  tendencia: number
  /** A parte das avaliações feitas no totem; o resto vem do celular. */
  totem: number
  /** O peso de cada turno, na ordem dos turnos. */
  turnos: readonly number[]
  /** Os pontos fortes e fracos do setor, somados à satisfação nas perguntas de cada categoria. */
  vies: Partial<Record<NomeDaCategoria, number>>
}

/** Os setores com avaliações, na ordem do mock. A Maternidade, desativada, não tem nenhuma. */
const PERFIS: Readonly<Record<string, PerfilDoSetor>> = {
  'pronto-atendimento': {
    volume: 3,
    fimDeSemana: 1.1,
    qualidade: 0.66,
    tendencia: 0.08,
    totem: 0.6,
    turnos: [36, 36, 28],
    vies: { 'Tempo de Espera': -0.27, Triagem: -0.04, Enfermagem: 0.08, Médico: 0.06 },
  },
  internacao: {
    volume: 1.5,
    fimDeSemana: 0.8,
    qualidade: 0.8,
    tendencia: 0,
    totem: 0.3,
    turnos: [50, 35, 15],
    vies: { Estrutura: -0.16, Enfermagem: 0.1, Médico: 0.05 },
  },
  'raio-x': {
    volume: 1.4,
    fimDeSemana: 0.3,
    qualidade: 0.8,
    tendencia: 0.02,
    totem: 0.5,
    turnos: [55, 42, 3],
    vies: { 'Tempo de Espera': -0.05, Enfermagem: 0.08, Estrutura: -0.04 },
  },
  laboratorio: {
    volume: 1.3,
    fimDeSemana: 0.3,
    qualidade: 0.82,
    tendencia: 0,
    totem: 0.45,
    turnos: [75, 25],
    vies: { 'Tempo de Espera': -0.1, Enfermagem: 0.1, 'Higiene e Limpeza': 0.06 },
  },
  ambulatorio: {
    volume: 1.6,
    fimDeSemana: 0.1,
    qualidade: 0.76,
    tendencia: -0.03,
    totem: 0.4,
    turnos: [50, 50],
    vies: { 'Tempo de Espera': -0.18, Recepção: -0.03, Médico: 0.1 },
  },
}

/** `HH:mm` em horas, com a fração: "19:30" é 19,5. */
function emHoras(horario: string): number {
  const [horas = 0, minutos = 0] = horario.split(':').map(Number)
  return horas + minutos / 60
}

/**
 * A hora de início e a de fim de cada turno. O turno que passa da meia-noite (o fim antes do início, como o da
 * noite) vai até as 24h: a avaliação fica no dia do atendimento.
 */
function horasDoTurno({ horaInicio, horaFim }: TurnoDoHistorico): readonly [number, number] {
  const inicio = emHoras(horaInicio)
  const fim = emHoras(horaFim)
  return [inicio, fim > inicio ? fim : 24]
}

const MS_POR_MINUTO = 60_000

/**
 * O instante em que o relógio de Brasília marca `minutos` depois da meia-noite do dia `AAAA-MM-DD` (mais de
 * 1.440 minutos caem no dia seguinte). O fuso vem do `Intl`, como no resto da API.
 */
export function instanteEmBrasilia(data: string, minutos: number): Date {
  const comoSeFosseUtc = new Date(`${data}T00:00:00Z`).getTime() + minutos * MS_POR_MINUTO
  const desvio = horarioDeBrasilia(new Date(comoSeFosseUtc)).getTime() - comoSeFosseUtc
  return new Date(comoSeFosseUtc - desvio)
}

/** 0 no domingo, 6 no sábado. */
const diaDaSemana = (data: string) => new Date(`${data}T00:00:00Z`).getUTCDay()

export interface EntradaDoHistorico {
  /** O instante em que o comando roda: o histórico vai até hoje, em Brasília, sem nenhum envio no futuro. */
  agora: Date
  setores: readonly SetorDoHistorico[]
  turnos: readonly TurnoDoHistorico[]
  /** Os limites de nota baixa das configurações do banco, para a mesma classificação da pesquisa. */
  limites: LimitesDeNota
}

/**
 * Gera as avaliações dos `DIAS_DO_HISTORICO` dias antes de hoje e as de hoje até `agora`, com a semente de cada
 * dia. A sequência dos sorteios é a do mock do front: os mesmos setores e perguntas dão as mesmas avaliações.
 */
export function gerarHistorico({ agora, setores, turnos, limites }: EntradaDoHistorico): AvaliacaoGerada[] {
  const hoje = hojeEmBrasilia(agora)
  const avaliacoes: AvaliacaoGerada[] = []

  for (let atras = DIAS_DO_HISTORICO; atras >= 0; atras--) {
    const dataAtendimento = somarDias(hoje, -atras)
    const r = mulberry32(hash(`fhdod:${dataAtendimento}`))
    const fimDeSemana = [0, 6].includes(diaDaSemana(dataAtendimento))
    const progresso = 1 - atras / DIAS_DO_HISTORICO

    for (const [slug, perfil] of Object.entries(PERFIS)) {
      const setor = setores.find((candidato) => candidato.slug === slug)
      if (!setor) continue
      const pesosDosTurnos = turnos.flatMap((turno, indice) => {
        const peso = perfil.turnos[indice] ?? 0
        return peso > 0 ? [[turno, peso] as const] : []
      })
      const quantidade = poisson(r, perfil.volume * (fimDeSemana ? perfil.fimDeSemana : 1))

      for (let i = 0; i < quantidade; i++) {
        const turno = escolherPorPeso(r, pesosDosTurnos)
        const canal = r() < perfil.totem ? 'TOTEM' : 'WEB'

        let q = perfil.qualidade + perfil.tendencia * progresso + (r() + r() + r() - 1.5) * 0.36
        if (slug === 'pronto-atendimento' && turno === turnos[2]) q -= 0.08 // a noite do PA é mais difícil
        if (r() < 0.05) q -= 0.45 // um dia ruim acontece em qualquer setor
        q = limitar(q, 0, 1)

        const nps = limitar(Math.round(10.6 * q ** 0.6 + (r() - 0.5) * 1.6), 0, 10)

        const itens: ItemGerado[] = []
        for (const pergunta of setor.perguntas) {
          if (r() > (pergunta.tipo === 'TEXTO' ? 0.12 : 0.84)) continue // pulada
          const s = limitar(q + (perfil.vies[pergunta.categoria] ?? 0), 0, 1)
          const item = {
            perguntaId: pergunta.id,
            categoriaId: pergunta.categoriaId,
            perguntaTexto: pergunta.texto,
            tipo: pergunta.tipo,
          }
          if (pergunta.tipo === 'ESCALA_1_5') {
            const nota = limitar(Math.round(1 + 4.4 * s ** 0.55 + (r() - 0.5) * 0.7), 1, 5)
            itens.push({ ...item, valorNumero: nota, valorTexto: null })
          } else if (pergunta.tipo === 'SIM_NAO') {
            const sim = r() < limitar(s + 0.15, 0.05, 0.97)
            itens.push({ ...item, valorNumero: null, valorTexto: sim ? 'SIM' : 'NAO' })
          } else if (pergunta.tipo === 'MULTIPLA_ESCOLHA') {
            const { opcoes } = pergunta
            const indice = limitar(
              Math.floor((1 - s + (r() - 0.5) * 0.3) * opcoes.length),
              0,
              opcoes.length - 1,
            )
            itens.push({ ...item, valorNumero: null, valorTexto: opcoes[indice] ?? null })
          } else {
            itens.push({ ...item, valorNumero: null, valorTexto: escolher(r, ELOGIOS_A_PROFISSIONAIS) })
          }
        }

        const notas = itens.flatMap(({ valorNumero }) => (valorNumero === null ? [] : [valorNumero]))
        const classificacao = classificarNota(nps, notas, limites)
        const baixa = classificacao !== 'NORMAL'

        // O totem é respondido na hora; pelo celular, muita gente responde à noite ou no dia seguinte.
        const [inicio, fim] = horasDoTurno(turno)
        const horaDoAtendimento = inicio + r() * (fim - inicio - 0.5)
        let enviadoEm: Date
        if (canal === 'TOTEM') {
          enviadoEm = instanteEmBrasilia(dataAtendimento, Math.round((horaDoAtendimento + 0.3) * 60))
        } else {
          const diasDepois = escolherPorPeso(r, [
            [0, 50],
            [1, 35],
            [2, 15],
          ] as const)
          const hora = diasDepois === 0 ? Math.max(horaDoAtendimento + 1, 19 + r() * 4.5) : 8 + r() * 14
          enviadoEm = instanteEmBrasilia(somarDias(dataAtendimento, diasDepois), Math.round(hora * 60))
        }
        // Quem ainda não teria respondido agora responde no fim do dia do atendimento.
        if (enviadoEm >= agora) enviadoEm = instanteEmBrasilia(dataAtendimento, 23 * 60 + 30)

        let comentario: AvaliacaoGerada['comentario'] = null
        if (r() < (classificacao === 'BAIXISSIMA' ? 0.6 : baixa ? 0.36 : 0.24)) {
          const tipo = escolherPorPeso<TipoComentario>(
            r,
            baixa
              ? [
                  ['RECLAMACAO', 72],
                  ['SUGESTAO', 20],
                  ['OUTRO', 8],
                ]
              : [
                  ['ELOGIO', 72],
                  ['SUGESTAO', 22],
                  ['OUTRO', 6],
                ],
          )
          comentario = { tipo, texto: escolher(r, COMENTARIOS_DE_DEMONSTRACAO[tipo]) }
        }

        // DDD 51 e o prefixo 90000, que não existe: nenhum destes números é de alguém.
        const telefone =
          baixa && r() < 0.16 ? `5190000${String(Math.floor(r() * 10_000)).padStart(4, '0')}` : null

        // Hoje, só entra o que já teria sido enviado: nada fica no futuro.
        if (enviadoEm >= agora) continue

        avaliacoes.push({
          setorId: setor.id,
          canal,
          dataAtendimento,
          turnoId: turno.id,
          nps,
          classificacao,
          enviadoEm,
          itens,
          comentario,
          telefone,
        })
      }
    }
  }
  return avaliacoes
}
