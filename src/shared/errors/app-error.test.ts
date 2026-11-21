import { describe, expect, it } from 'vitest'
import { AppError, STATUS_DO_CODIGO } from './app-error'

describe('AppError', () => {
  it('usa só os códigos que o front já trata, cada um com o seu status', () => {
    expect(STATUS_DO_CODIGO).toEqual({
      VALIDACAO: 400,
      NAO_AUTENTICADO: 401,
      SEM_PERMISSAO: 403,
      NAO_ENCONTRADO: 404,
      CONFLITO: 409,
      LIMITE_ATINGIDO: 429,
      ERRO_INTERNO: 500,
    })
  })

  it('monta cada erro com o código, o status e uma mensagem para o usuário', () => {
    const detalhes = [{ campo: 'nps', mensagem: 'Obrigatório, de 0 a 10' }]

    expect(AppError.validacao(detalhes)).toMatchObject({ codigo: 'VALIDACAO', status: 400, detalhes })
    expect(AppError.naoAutenticado()).toMatchObject({ codigo: 'NAO_AUTENTICADO', status: 401 })
    expect(AppError.semPermissao()).toMatchObject({ codigo: 'SEM_PERMISSAO', status: 403 })
    expect(AppError.naoEncontrado()).toMatchObject({ codigo: 'NAO_ENCONTRADO', status: 404 })
    expect(AppError.conflito('Já existe um setor com este endereço')).toMatchObject({
      codigo: 'CONFLITO',
      status: 409,
      message: 'Já existe um setor com este endereço',
    })
    expect(AppError.limiteAtingido()).toMatchObject({ codigo: 'LIMITE_ATINGIDO', status: 429 })
    expect(AppError.interno()).toMatchObject({
      codigo: 'ERRO_INTERNO',
      status: 500,
      message: 'Erro inesperado. Tente de novo em instantes.',
    })
  })
})
