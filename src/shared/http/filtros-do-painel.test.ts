import { describe, expect, it } from 'vitest'
import { filtrosDoDashboardSchema, filtrosDoPainelSchema, MENSAGENS_DOS_FILTROS } from './filtros-do-painel'

/** O primeiro problema de cada campo, como o `validate` monta os `detalhes`. */
function problemas(resultado: ReturnType<typeof filtrosDoPainelSchema.safeParse>) {
  return resultado.error?.issues.map(({ path, message }) => ({ campo: path.join('.'), mensagem: message }))
}

describe('filtros do dashboard', () => {
  it('converte o setor e o turno para número e deixa o resto como veio', () => {
    const resultado = filtrosDoDashboardSchema.parse({
      inicio: '2026-11-01',
      fim: '2026-11-30',
      base: 'ENVIO',
      setorId: '3',
      turnoId: '2',
      canal: 'TOTEM',
      outro: 'ignorado',
    })

    expect(resultado).toEqual({
      inicio: '2026-11-01',
      fim: '2026-11-30',
      base: 'ENVIO',
      setorId: 3,
      turnoId: 2,
      canal: 'TOTEM',
    })
  })

  it('exige o início, o fim e a base', () => {
    expect(problemas(filtrosDoDashboardSchema.safeParse({}))).toEqual([
      { campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.inicio },
      { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.fim },
      { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
    ])
  })

  it('não compara o período quando uma das datas é inválida', () => {
    const resultado = filtrosDoDashboardSchema.safeParse({
      inicio: '2026-13-01',
      fim: '2026-11-30',
      base: 'ENVIO',
    })

    expect(problemas(resultado)).toEqual([{ campo: 'inicio', mensagem: MENSAGENS_DOS_FILTROS.data }])
  })
})

describe('filtros do painel (respostas e exportações)', () => {
  it('tudo é opcional, e a base, sem valor, é a do atendimento', () => {
    expect(filtrosDoPainelSchema.parse({})).toEqual({ base: 'ATENDIMENTO' })
    expect(filtrosDoPainelSchema.parse({ fim: '2026-11-30' })).toEqual({
      fim: '2026-11-30',
      base: 'ATENDIMENTO',
    })
  })

  it('valida os mesmos campos, com as mesmas mensagens', () => {
    expect(
      problemas(
        filtrosDoPainelSchema.safeParse({
          inicio: '2026-11-30',
          fim: '2026-11-01',
          base: 'HOJE',
          canal: 'FAX',
        }),
      ),
    ).toEqual([
      { campo: 'base', mensagem: MENSAGENS_DOS_FILTROS.base },
      { campo: 'canal', mensagem: 'Canal inválido' },
    ])
    expect(problemas(filtrosDoPainelSchema.safeParse({ inicio: '2026-11-30', fim: '2026-11-01' }))).toEqual([
      { campo: 'fim', mensagem: MENSAGENS_DOS_FILTROS.periodo },
    ])
  })
})
