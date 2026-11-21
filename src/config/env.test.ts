import { describe, expect, it } from 'vitest'
import { ErroDeAmbiente, lerEnv } from './env'

const validas = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:senha-do-banco@postgres:5432/satisfacao',
  CORS_ORIGIN: 'https://pesquisa.exemplo.com.br',
}

function mensagemDoErro(fonte: Record<string, string | undefined>) {
  try {
    lerEnv(fonte)
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroDeAmbiente)
    return (erro as ErroDeAmbiente).message
  }
  throw new Error('lerEnv deveria ter recusado as variáveis')
}

describe('lerEnv', () => {
  it('aceita as variáveis obrigatórias e preenche as que têm padrão', () => {
    expect(lerEnv(validas)).toEqual({
      NODE_ENV: 'production',
      PORT: 3333,
      DATABASE_URL: validas.DATABASE_URL,
      CORS_ORIGIN: ['https://pesquisa.exemplo.com.br'],
      LOG_LEVEL: 'info',
    })
  })

  it('converte a porta e separa as origens do CORS', () => {
    const env = lerEnv({
      ...validas,
      PORT: '8080',
      CORS_ORIGIN: 'https://pesquisa.exemplo.com.br, http://localhost:5173',
      LOG_LEVEL: 'debug',
    })

    expect(env.PORT).toBe(8080)
    expect(env.CORS_ORIGIN).toEqual(['https://pesquisa.exemplo.com.br', 'http://localhost:5173'])
    expect(env.LOG_LEVEL).toBe('debug')
  })

  it('diz quais variáveis faltam, contando texto vazio como não definida', () => {
    const mensagem = mensagemDoErro({ NODE_ENV: 'development', DATABASE_URL: '' })

    expect(mensagem).toContain('A API não subiu')
    expect(mensagem).toContain('DATABASE_URL não foi definida')
    expect(mensagem).toContain('CORS_ORIGIN não foi definida')
    expect(mensagem).not.toContain('NODE_ENV')
    expect(mensagem).toContain('.env.example')
  })

  it('diz quais variáveis estão inválidas sem mostrar o valor delas', () => {
    const mensagem = mensagemDoErro({
      NODE_ENV: 'producao',
      PORT: '99999',
      DATABASE_URL: 'mysql://root:senha-secreta@banco:3306/satisfacao',
      CORS_ORIGIN: 'https://pesquisa.exemplo.com.br/',
      LOG_LEVEL: 'tudo',
    })

    for (const variavel of ['NODE_ENV', 'PORT', 'DATABASE_URL', 'CORS_ORIGIN', 'LOG_LEVEL']) {
      expect(mensagem).toContain(`${variavel} está inválida`)
    }
    expect(mensagem).not.toContain('senha-secreta')
  })
})
