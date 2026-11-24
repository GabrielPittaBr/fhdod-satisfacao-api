import { describe, expect, it } from 'vitest'
import { StatusRetorno as StatusRetornoDoBanco } from '../../generated/prisma/enums'
import { STATUS_DE_RETORNO } from './status-de-retorno'

describe('status de retorno', () => {
  it('são os mesmos do tipo status_retorno do banco', () => {
    expect([...STATUS_DE_RETORNO].sort()).toEqual(Object.values(StatusRetornoDoBanco).sort())
  })
})
