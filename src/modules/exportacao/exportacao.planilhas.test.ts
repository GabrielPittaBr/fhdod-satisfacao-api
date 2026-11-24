import ExcelJS from 'exceljs'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { Saida } from '../../shared/http/download'
import { escreverPlanilhaDasRespostas, type DadosDasRespostas } from './exportacao.planilhas'
import type { ItemExportado } from './exportacao.repository'
import type { DadosDoResumo } from './exportacao.resumo'

const RESUMO_VAZIO: DadosDoResumo = {
  filtros: { inicio: '2026-11-01', fim: '2026-11-30', base: 'ATENDIMENTO', setoresDoEscopo: null },
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
  geradoEm: new Date('2026-11-24T18:00:00.000Z'),
  geradoPor: 'Pessoa de Teste',
}

async function* emLotes<T>(...lotes: T[][]): AsyncGenerator<T[]> {
  for (const lote of lotes) yield lote
}

function item(respostaId: number): ItemExportado {
  return {
    respostaId,
    setor: 'Pediatria',
    dataAtendimento: '2026-11-20',
    pergunta: 'Como você avalia o atendimento?',
    categoria: 'Recepção',
    tipo: 'ESCALA_1_5',
    valorNumero: 4,
    valorTexto: null,
  }
}

function dados(itens: AsyncIterable<ItemExportado[]>): DadosDasRespostas {
  return { resumo: RESUMO_VAZIO, comTelefones: false, respostas: emLotes(), itens, comentarios: emLotes() }
}

/** Gera a planilha na memória e a abre com o leitor do exceljs. */
async function gerar(entrada: DadosDasRespostas, linhasPorAba: number) {
  const destino = new PassThrough()
  const partes: Buffer[] = []
  destino.on('data', (parte: Buffer) => partes.push(parte))
  await escreverPlanilhaDasRespostas(new Saida(destino), entrada, linhasPorAba)
  const livro = new ExcelJS.Workbook()
  await livro.xlsx.load(new Uint8Array(Buffer.concat(partes)).buffer)
  return livro
}

/** Os códigos das linhas de dados de uma aba, sem o cabeçalho. */
function codigos(livro: ExcelJS.Workbook, nome: string) {
  const aba = livro.getWorksheet(nome)
  if (!aba) throw new Error(`Sem a aba ${nome}`)
  expect(aba.getRow(1).getCell(1).value, nome).toBe('Código da resposta')
  return aba
    .getSheetValues()
    .slice(2)
    .map((linha) => (linha as ExcelJS.CellValue[])[1])
}

describe('escreverPlanilhaDasRespostas', () => {
  it('uma tabela que passa do limite de linhas continua em abas novas, cada uma com o cabeçalho', async () => {
    const livro = await gerar(dados(emLotes([item(1), item(2)], [item(3), item(4), item(5)])), 2)

    expect(livro.worksheets.map(({ name }) => name)).toEqual([
      'Resumo',
      'Respostas',
      'Itens',
      'Itens (2)',
      'Itens (3)',
      'Comentários',
    ])
    expect(codigos(livro, 'Itens')).toEqual([1, 2])
    expect(codigos(livro, 'Itens (2)')).toEqual([3, 4])
    expect(codigos(livro, 'Itens (3)')).toEqual([5])
  })

  it('no limite exato, não abre uma aba vazia', async () => {
    const livro = await gerar(dados(emLotes([item(1)], [item(2)])), 2)

    expect(livro.worksheets.map(({ name }) => name)).toEqual(['Resumo', 'Respostas', 'Itens', 'Comentários'])
    expect(codigos(livro, 'Itens')).toEqual([1, 2])
  })

  it('num erro no meio, o erro sobe e a saída não é encerrada como se o arquivo estivesse completo', async () => {
    async function* falhaNoSegundoLote(): AsyncGenerator<ItemExportado[]> {
      yield [item(1)]
      throw new Error('O banco caiu no meio')
    }
    const destino = new PassThrough()
    destino.resume()

    await expect(
      escreverPlanilhaDasRespostas(new Saida(destino), dados(falhaNoSegundoLote()), 10),
    ).rejects.toThrow('O banco caiu no meio')
    await new Promise((pronto) => setTimeout(pronto, 20))

    expect(destino.writableEnded).toBe(false)
  })
})
