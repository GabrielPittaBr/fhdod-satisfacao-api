import { describe, expect, it } from 'vitest'
import { mediaComUmaCasa } from './media'

describe('mediaComUmaCasa', () => {
  it('é a média, com uma casa decimal', () => {
    expect(mediaComUmaCasa(4 + 5 + 5, 3)).toBe(4.7)
    expect(mediaComUmaCasa(1 + 2, 2)).toBe(1.5)
    expect(mediaComUmaCasa(4 * 7, 7)).toBe(4)
    expect(mediaComUmaCasa(5 + 4 + 4, 3)).toBe(4.3)
    expect(mediaComUmaCasa(1, 3)).toBe(0.3)
  })

  it('no meio da segunda casa, arredonda para cima', () => {
    // 4,25 e 2,75
    expect(mediaComUmaCasa(17, 4)).toBe(4.3)
    expect(mediaComUmaCasa(11, 4)).toBe(2.8)
  })

  it('sem notas, é null', () => {
    expect(mediaComUmaCasa(0, 0)).toBeNull()
  })
})
