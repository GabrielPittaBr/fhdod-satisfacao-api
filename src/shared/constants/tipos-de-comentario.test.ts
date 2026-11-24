import { describe, expect, it } from 'vitest'
import { TipoComentario as TipoComentarioDoBanco } from '../../generated/prisma/enums'
import { TIPOS_DE_COMENTARIO } from './tipos-de-comentario'

describe('tipos de comentário', () => {
  it('são os mesmos do tipo tipo_comentario do banco', () => {
    expect([...TIPOS_DE_COMENTARIO].sort()).toEqual(Object.values(TipoComentarioDoBanco).sort())
  })
})
