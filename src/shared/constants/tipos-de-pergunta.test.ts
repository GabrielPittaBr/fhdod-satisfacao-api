import { describe, expect, it } from 'vitest'
import { TipoPergunta as TipoPerguntaDoBanco } from '../../generated/prisma/enums'
import { TIPO_COM_OPCOES, TIPOS_DE_PERGUNTA } from './tipos-de-pergunta'

describe('tipos de pergunta', () => {
  it('são os mesmos do tipo tipo_pergunta do banco', () => {
    expect([...TIPOS_DE_PERGUNTA].sort()).toEqual(Object.values(TipoPerguntaDoBanco).sort())
  })

  it('só a múltipla escolha tem opções', () => {
    expect(TIPO_COM_OPCOES).toBe('MULTIPLA_ESCOLHA')
  })
})
