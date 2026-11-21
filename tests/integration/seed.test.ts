import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { semearBase } from '../../prisma/seeds/base'
import { prisma } from '../../src/database/prisma'
import { limparBanco } from '../helpers/banco'
import { rodarPrisma } from '../helpers/prisma-cli'

// O que o plano manda o seed base criar, escrito aqui de novo para o teste não conferir o código com ele mesmo.
const CATEGORIAS = [
  'Recepção',
  'Triagem',
  'Enfermagem',
  'Médico',
  'Higiene e Limpeza',
  'Estrutura',
  'Tempo de Espera',
]
const TURNOS = [
  { nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 },
  { nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00', ordem: 2 },
  { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 3 },
]
const CONFIGURACOES = {
  nps_limite_baixa: 6,
  nps_limite_baixissima: 2,
  escala_limite_baixa: 3,
  escala_limite_baixissima: 1,
  totem_reinicio_segundos: 15,
  totem_inatividade_segundos: 60,
  texto_limite_caracteres: 500,
  nps_texto: 'De 0 a 10, qual a probabilidade de você recomendar o hospital a alguém?',
}

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  await limparBanco()
})

async function lerBanco() {
  const [categorias, turnos, configuracoes] = await Promise.all([
    prisma.categoria.findMany({
      orderBy: { ordem: 'asc' },
      select: { nome: true, ordem: true, ativa: true },
    }),
    prisma.turno.findMany({
      orderBy: { ordem: 'asc' },
      select: { nome: true, horaInicio: true, horaFim: true, ordem: true },
    }),
    prisma.configuracao.findMany({ select: { chave: true, valor: true } }),
  ])
  return {
    categorias,
    turnos,
    configuracoes: Object.fromEntries(configuracoes.map(({ chave, valor }) => [chave, valor])),
  }
}

describe('seed base', () => {
  it('cria as 7 categorias, os 3 turnos provisórios e as 8 configurações do plano', async () => {
    await expect(semearBase(prisma)).resolves.toEqual({ categorias: 7, turnos: 3, configuracoes: 8 })

    await expect(lerBanco()).resolves.toEqual({
      categorias: CATEGORIAS.map((nome, indice) => ({ nome, ordem: indice + 1, ativa: true })),
      turnos: TURNOS,
      configuracoes: CONFIGURACOES,
    })
  })

  it('rodado de novo, não cria nem muda nada', async () => {
    await semearBase(prisma)
    const antes = await lerBanco()

    await expect(semearBase(prisma)).resolves.toEqual({ categorias: 0, turnos: 0, configuracoes: 0 })
    await expect(lerBanco()).resolves.toEqual(antes)
  })

  it('não desfaz o que foi mudado depois da instalação', async () => {
    await semearBase(prisma)
    await prisma.categoria.updateMany({ where: { nome: 'Médico' }, data: { nome: 'Equipe médica' } })
    await prisma.categoria.updateMany({ where: { nome: 'Estrutura' }, data: { ativa: false } })
    await prisma.turno.updateMany({ where: { nome: 'Noite' }, data: { horaFim: '06:00' } })
    await prisma.configuracao.update({ where: { chave: 'nps_limite_baixa' }, data: { valor: 5 } })

    await semearBase(prisma)

    const { categorias, turnos, configuracoes } = await lerBanco()
    expect(categorias.map(({ nome }) => nome)).toEqual(
      CATEGORIAS.map((nome) => (nome === 'Médico' ? 'Equipe médica' : nome)),
    )
    expect(categorias.find(({ nome }) => nome === 'Estrutura')).toMatchObject({ ativa: false })
    expect(turnos.find(({ nome }) => nome === 'Noite')).toMatchObject({ horaFim: '06:00' })
    expect(configuracoes).toMatchObject({ nps_limite_baixa: 5 })
  })

  it('completa só as configurações que faltam', async () => {
    await semearBase(prisma)
    await prisma.configuracao.delete({ where: { chave: 'nps_texto' } })
    await prisma.configuracao.update({ where: { chave: 'totem_reinicio_segundos' }, data: { valor: 10 } })

    await expect(semearBase(prisma)).resolves.toEqual({ categorias: 0, turnos: 0, configuracoes: 1 })

    await expect(lerBanco()).resolves.toMatchObject({
      configuracoes: { ...CONFIGURACOES, totem_reinicio_segundos: 10 },
    })
  })

  it('roda pelo comando do projeto, o pnpm db:seed (prisma db seed)', { timeout: 60_000 }, async () => {
    const saida = rodarPrisma(['db', 'seed'], process.env.DATABASE_URL ?? '')

    expect(saida).toContain('Seed base concluído. Novos registros: 7 categorias, 3 turnos e 8 configurações.')
    await expect(lerBanco()).resolves.toMatchObject({ configuracoes: CONFIGURACOES })
  })
})
