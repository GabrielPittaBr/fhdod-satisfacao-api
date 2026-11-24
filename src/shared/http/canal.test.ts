import { describe, expect, it } from 'vitest'
import { Canal as CanalDoBanco } from '../../generated/prisma/enums'
import { CANAIS } from './canal'

describe('canais', () => {
  it('são os do tipo canal do banco, menos o WhatsApp, que fica para a fase 3', () => {
    const doBanco = Object.values(CanalDoBanco)

    expect(CANAIS.every((canal) => doBanco.includes(canal))).toBe(true)
    expect(doBanco.filter((canal) => !(CANAIS as readonly string[]).includes(canal))).toEqual(['WHATSAPP'])
  })
})
