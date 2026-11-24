import { describe, expect, it } from 'vitest'
import { lerPdf, valorAoLado } from '../../../tests/helpers/pdf'
import type { IndicadorCategoria, NpsSetor } from '../dashboard/dashboard.schemas'
import { gerarPdfDoResumo, recortar } from './exportacao.pdf'
import type { DadosDoResumo } from './exportacao.resumo'

function setores(quantos: number): NpsSetor[] {
  return Array.from({ length: quantos }, (_, indice) => ({
    setorId: indice + 1,
    setor: `Setor de Teste ${String(indice + 1).padStart(3, '0')}`,
    nps: 90 - indice,
    total: 1000 + indice,
  }))
}

function categorias(quantas: number): IndicadorCategoria[] {
  return Array.from({ length: quantas }, (_, indice) => ({
    categoriaId: indice + 1,
    categoria: `Categoria ${indice + 1}`,
    media: 4.3,
    percentual45: 67,
    total: 1234,
  }))
}

function dados(entrada: Partial<DadosDoResumo> = {}): DadosDoResumo {
  return {
    filtros: { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO', setoresDoEscopo: null },
    indicadores: {
      nps: 42,
      total: 1234,
      promotores: 700,
      neutros: 300,
      detratores: 234,
      notasBaixas: 25,
      baixissimas: 6,
      mediaEscala: 4.3,
    },
    setores: setores(3),
    categorias: categorias(3),
    geradoEm: new Date('2026-11-24T19:48:00.000Z'),
    geradoPor: 'Renata Ouvidoria',
    ...entrada,
  }
}

/** Gera o PDF e o lê como um leitor de PDF. */
async function gerarELer(entrada: DadosDoResumo) {
  const documento = await gerarPdfDoResumo(entrada)
  const partes: Buffer[] = []
  documento.on('data', (parte: Buffer) => partes.push(parte))
  const fim = new Promise((pronto) => documento.on('end', pronto))
  documento.end()
  await fim
  return lerPdf(Buffer.concat(partes))
}

const nomes = (pdf: Awaited<ReturnType<typeof lerPdf>>) => pdf.linhas.map(([primeiro]) => primeiro)

describe('gerarPdfDoResumo', () => {
  it('escreve os números como no Brasil, com quem gerou e quando no horário de Brasília', async () => {
    const pdf = await gerarELer(dados())

    expect(pdf.paginas).toBe(1)
    expect(valorAoLado(pdf, 'Gerado em')).toBe('24/11/2026 16:48')
    expect(valorAoLado(pdf, 'Gerado por')).toBe('Renata Ouvidoria')
    expect(valorAoLado(pdf, 'Período')).toBe('01/11/2026 a 30/11/2026')
    expect(valorAoLado(pdf, 'NPS')).toBe('42')
    expect(valorAoLado(pdf, 'Respostas')).toBe('1.234')
    expect(valorAoLado(pdf, 'Média das notas de 1 a 5')).toBe('4,3')
    expect(pdf.linhas).toContainEqual(['Setor de Teste 001', '90', '1.000'])
    expect(pdf.linhas).toContainEqual(['Categoria 1', '4,3', '67%', '1.234'])
    // O rodapé numa linha só, sem a hora quebrada embaixo.
    expect(pdf.linhas).toContainEqual([
      'Sistema de Satisfação Hospitalar da FHDOD · gerado em 24/11/2026 16:48',
      'Página 1 de 1',
    ])
    expect(pdf.info).toMatchObject({
      Title: 'Pesquisa de satisfação: resumo dos indicadores',
      Author: 'Renata Ouvidoria',
    })
  })

  it('os setores e as categorias de um hospital cabem inteiros, em até duas páginas', async () => {
    const pdf = await gerarELer(dados({ setores: setores(45), categorias: categorias(15) }))

    expect(pdf.paginas).toBeLessThanOrEqual(2)
    for (const { setor } of setores(45)) expect(nomes(pdf)).toContain(setor)
    for (const { categoria } of categorias(15)) expect(nomes(pdf)).toContain(categoria)
    expect(pdf.linhas.flat().join(' ')).not.toContain('… mais')
  })

  it('uma lista que não cabe com a letra maior cabe inteira com a menor, sem recorte', async () => {
    // Com a letra 9, 65 setores passam de duas páginas; com a 7, cabem.
    const pdf = await gerarELer(dados({ setores: setores(65), categorias: categorias(10) }))

    expect(pdf.paginas).toBe(2)
    for (const { setor } of setores(65)) expect(nomes(pdf)).toContain(setor)
    expect(pdf.linhas.flat().join(' ')).not.toContain('… mais')
  })

  it('uma lista que não cabe mostra as primeiras e as últimas linhas e avisa quantas ficaram de fora', async () => {
    const pdf = await gerarELer(dados({ setores: setores(400), categorias: categorias(10) }))

    expect(pdf.paginas).toBe(2)
    expect(nomes(pdf)).toContain('Setor de Teste 001')
    expect(nomes(pdf)).toContain('Setor de Teste 400')
    const texto = pdf.linhas.flat().join(' ')
    expect(texto).toMatch(/… mais \d+ setores entre estes\. A lista inteira está no resumo em Excel/)
    const escondidos = Number(/… mais (\d+) setores/.exec(texto)?.[1])
    const mostrados = nomes(pdf).filter((nome) => nome?.startsWith('Setor de Teste')).length
    expect(mostrados + escondidos).toBe(400)
    for (const { categoria } of categorias(10)) expect(nomes(pdf)).toContain(categoria)
  })

  it('sem respostas, os números sem valor e as tabelas avisam', async () => {
    const vazio = dados({
      indicadores: {
        nps: null,
        total: 0,
        promotores: 0,
        neutros: 0,
        detratores: 0,
        notasBaixas: 0,
        baixissimas: 0,
        mediaEscala: null,
      },
      setores: [],
      categorias: [],
    })

    const pdf = await gerarELer(vazio)

    expect(valorAoLado(pdf, 'NPS')).toBe('—')
    expect(valorAoLado(pdf, 'Respostas')).toBe('0')
    expect(nomes(pdf)).toContain('Nenhuma resposta no período.')
    expect(nomes(pdf)).toContain('Nenhuma nota de 1 a 5 no período.')
  })
})

describe('recortar', () => {
  it('fica com a metade do limite no começo, a outra no fim e o aviso no meio', () => {
    expect(recortar([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([1, 2, { escondidos: 3 }, 6, 7])
    expect(recortar([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 2, { escondidos: 4 }, 7])
    expect(recortar([1, 2, 3], 3)).toEqual([1, 2, 3])
  })
})
