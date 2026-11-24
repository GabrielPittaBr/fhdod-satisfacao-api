import { describe, expect, it } from 'vitest'
import { ErroDeAmbiente, lerEnv } from './env'

const validas = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:senha-do-banco@postgres:5432/satisfacao',
  CORS_ORIGIN: 'https://pesquisa.exemplo.com.br',
  JWT_ACCESS_SECRET: 'segredo-de-exemplo-com-mais-de-32-caracteres',
  ENCRYPTION_KEY: Buffer.from('chave-de-exemplo-com-32-bytes!!!').toString('base64'),
}

/** Uma chave de `bytes` bytes, em base64. */
function chaveDe(bytes: number) {
  return Buffer.alloc(bytes, 7).toString('base64')
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
      DOCS_ENABLED: false,
      JWT_ACCESS_SECRET: validas.JWT_ACCESS_SECRET,
      ACCESS_TOKEN_TTL: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      ENCRYPTION_KEY: validas.ENCRYPTION_KEY,
      RATE_LIMIT_ALLOWLIST: [],
    })
  })

  it('separa os IPs fora do limite de envios e recusa o que não for IP', () => {
    expect(
      lerEnv({ ...validas, RATE_LIMIT_ALLOWLIST: '203.0.113.10, 2001:db8::1' }).RATE_LIMIT_ALLOWLIST,
    ).toEqual(['203.0.113.10', '2001:db8::1'])
    expect(mensagemDoErro({ ...validas, RATE_LIMIT_ALLOWLIST: 'hospital.exemplo.com.br' })).toContain(
      'RATE_LIMIT_ALLOWLIST está inválida',
    )
  })

  it('converte a validade do token de acesso para segundos e a do refresh para número de dias', () => {
    expect(lerEnv({ ...validas, ACCESS_TOKEN_TTL: '15m' }).ACCESS_TOKEN_TTL).toBe(900)
    expect(lerEnv({ ...validas, ACCESS_TOKEN_TTL: '90s' }).ACCESS_TOKEN_TTL).toBe(90)
    expect(lerEnv({ ...validas, ACCESS_TOKEN_TTL: '2h' }).ACCESS_TOKEN_TTL).toBe(7200)
    expect(lerEnv({ ...validas, REFRESH_TOKEN_TTL_DAYS: '30' }).REFRESH_TOKEN_TTL_DAYS).toBe(30)
  })

  it('liga o Swagger fora de produção e deixa o DOCS_ENABLED decidir quando ele vem definido', () => {
    expect(lerEnv({ ...validas, NODE_ENV: 'development' }).DOCS_ENABLED).toBe(true)
    expect(lerEnv({ ...validas, NODE_ENV: 'test' }).DOCS_ENABLED).toBe(true)
    expect(lerEnv({ ...validas, NODE_ENV: 'production' }).DOCS_ENABLED).toBe(false)
    expect(lerEnv({ ...validas, NODE_ENV: 'production', DOCS_ENABLED: 'true' }).DOCS_ENABLED).toBe(true)
    expect(lerEnv({ ...validas, NODE_ENV: 'development', DOCS_ENABLED: 'false' }).DOCS_ENABLED).toBe(false)
    expect(lerEnv({ ...validas, NODE_ENV: 'production', DOCS_ENABLED: '' }).DOCS_ENABLED).toBe(false)
  })

  it('aceita na chave dos telefones só 32 bytes em base64', () => {
    expect(lerEnv({ ...validas, ENCRYPTION_KEY: chaveDe(32) }).ENCRYPTION_KEY).toBe(chaveDe(32))
    for (const invalida of [
      chaveDe(16),
      chaveDe(31),
      chaveDe(33),
      chaveDe(32).slice(0, -1),
      'chave sem base64 com espaços e acentuação!!',
    ]) {
      expect(mensagemDoErro({ ...validas, ENCRYPTION_KEY: invalida })).toContain(
        'ENCRYPTION_KEY está inválida',
      )
    }
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
    expect(mensagem).toContain('JWT_ACCESS_SECRET não foi definida')
    expect(mensagem).toContain('ENCRYPTION_KEY não foi definida')
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
      DOCS_ENABLED: 'talvez',
      JWT_ACCESS_SECRET: 'curto-demais-31-caracteres-xxxx',
      ACCESS_TOKEN_TTL: '15 minutos',
      REFRESH_TOKEN_TTL_DAYS: '0',
      ENCRYPTION_KEY: 'chave-secreta-curta',
    })

    for (const variavel of [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'CORS_ORIGIN',
      'LOG_LEVEL',
      'DOCS_ENABLED',
      'JWT_ACCESS_SECRET',
      'ACCESS_TOKEN_TTL',
      'REFRESH_TOKEN_TTL_DAYS',
      'ENCRYPTION_KEY',
    ]) {
      expect(mensagem).toContain(`${variavel} está inválida`)
    }
    expect(mensagem).not.toContain('senha-secreta')
    expect(mensagem).not.toContain('curto-demais')
    expect(mensagem).not.toContain('chave-secreta')
  })
})
