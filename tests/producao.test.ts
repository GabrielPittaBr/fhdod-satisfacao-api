import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VARIAVEIS } from '../src/config/env'

// O compose de produção (infra/docker-compose.prod.yml) passa à API, uma a uma, as variáveis de que ela
// precisa, e o infra/.env.example explica cada variável que o compose lê do .env do servidor. Estes testes
// falham quando uma variável nova entra na API sem entrar no compose, ou no compose sem entrar no modelo.

const COMPOSE = readFileSync('infra/docker-compose.prod.yml', 'utf8')
const MODELO_DO_SERVIDOR = readFileSync('infra/.env.example', 'utf8')
const MODELO_DE_DESENVOLVIMENTO = readFileSync('.env.example', 'utf8')

/** Variáveis do .env.example da raiz que não são da API em produção. */
const SO_DO_DESENVOLVIMENTO = ['TEST_DATABASE_URL']

/** As chaves do `environment` de um serviço. O compose é escrito à mão, com dois espaços por nível. */
function variaveisDoServico(servico: string): string[] {
  const linhas = COMPOSE.split('\n')
  const inicio = linhas.indexOf(`  ${servico}:`)
  expect(inicio, `o serviço ${servico} não está no compose`).toBeGreaterThan(-1)
  const ambiente = linhas.indexOf('    environment:', inicio)
  const chaves: string[] = []
  for (const linha of linhas.slice(ambiente + 1)) {
    if (linha.trim() === '' || linha.trimStart().startsWith('#')) continue
    const chave = /^ {6}([A-Z][A-Z0-9_]*):/.exec(linha)
    if (!chave) break
    chaves.push(chave[1])
  }
  return chaves
}

/** Os nomes de um modelo de .env, também os das linhas comentadas (`# DEMO_PASSWORD_GESTOR=`). */
function variaveisDoModelo(modelo: string): string[] {
  return [...modelo.matchAll(/^(?:# )?([A-Z][A-Z0-9_]*)=/gm)].map(([, nome]) => nome)
}

/** As variáveis que o compose lê do .env do servidor: as do `${NOME}`, `${NOME:-}` e `${NOME:?mensagem}`. */
function variaveisLidasPeloCompose(): string[] {
  return [...new Set([...COMPOSE.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map(([, nome]) => nome))]
}

describe('compose de produção', () => {
  it('passa à API todas as variáveis que ela lê', () => {
    expect(variaveisDoServico('api')).toEqual(expect.arrayContaining(VARIAVEIS))
  })

  it('passa à API as variáveis do seed base e dos dados de demonstração', () => {
    const daRaiz = variaveisDoModelo(MODELO_DE_DESENVOLVIMENTO).filter(
      (nome) => !SO_DO_DESENVOLVIMENTO.includes(nome),
    )
    expect(daRaiz).toEqual(expect.arrayContaining(['SEED_ADMIN_EMAIL', 'DEMO_PASSWORD_GESTOR']))
    expect(variaveisDoServico('api')).toEqual(expect.arrayContaining(daRaiz))
  })

  it('só lê do .env do servidor variáveis que o infra/.env.example explica, e o modelo não tem sobras', () => {
    expect(variaveisDoModelo(MODELO_DO_SERVIDOR).toSorted()).toEqual(variaveisLidasPeloCompose().toSorted())
  })

  it('não entrega os segredos da API ao Caddy nem ao backup', () => {
    const segredos = /^(JWT_ACCESS_SECRET|ENCRYPTION_KEY|SEED_ADMIN_|DEMO_PASSWORD_)/
    for (const servico of ['caddy', 'backup']) {
      expect(variaveisDoServico(servico)).not.toHaveLength(0)
      expect(variaveisDoServico(servico).filter((nome) => segredos.test(nome))).toEqual([])
    }
  })
})
