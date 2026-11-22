import type { Express } from 'express'
import { decodeJwt } from 'jose'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { authRepository } from '../../src/modules/auth/auth.repository'
import { PERMISSOES_POR_PERFIL } from '../../src/shared/constants/permissoes'
import { senhaConfere } from '../../src/shared/security/password'
import { hashDoToken } from '../../src/shared/security/tokens'
import { criarSetor } from '../factories/setores'
import { criarUsuario, SENHA_DE_TESTE } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer, cookie, cookieDoRefresh, entrar, tokenDeAcesso } from '../helpers/sessao'

const SETE_DIAS_S = 7 * 24 * 60 * 60
const QUINZE_MINUTOS_MS = 15 * 60 * 1000
const REFRESH = /^[A-Za-z0-9_-]{43}$/
const COOKIE_PROTEGIDO = { httponly: true, secure: true, samesite: 'Strict', path: '/api/v1/auth' }
const IP = '203.0.113.10'
const OUTRO_IP = '203.0.113.20'

let app: Express

beforeEach(async () => {
  await limparBanco()
  app = createApp()
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** POST /auth/login. Com `ip`, simula o IP de quem chega pelo Caddy (X-Forwarded-For). */
function login(corpo: { email?: string; senha?: string }, ip?: string) {
  const pedido = request(app).post('/api/v1/auth/login').send(corpo)
  return ip ? pedido.set('X-Forwarded-For', ip) : pedido
}

function renovar(refresh?: string) {
  const pedido = request(app).post('/api/v1/auth/refresh')
  return refresh ? pedido.set('Cookie', cookie(refresh)) : pedido
}

function sessao(tokenAcesso: string) {
  return request(app).get('/api/v1/auth/me').set('Authorization', bearer(tokenAcesso))
}

describe('POST /api/v1/auth/login', () => {
  it('confere a senha e devolve um token de acesso de 15 minutos, com o refresh num cookie protegido', async () => {
    const usuario = await criarUsuario()

    const resposta = await login({ email: usuario.email, senha: SENHA_DE_TESTE })

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: { tokenAcesso: expect.any(String) } })
    expect(resposta.headers['cache-control']).toBe('no-store')
    const conteudo = decodeJwt(resposta.body.data.tokenAcesso)
    expect(conteudo.sub).toBe(String(usuario.id))
    expect(conteudo.exp! - conteudo.iat!).toBe(15 * 60)

    const refresh = cookieDoRefresh(resposta)
    expect(refresh?.valor).toMatch(REFRESH)
    expect(refresh?.atributos).toMatchObject(COOKIE_PROTEGIDO)
    expect(Number(refresh?.atributos['max-age'])).toBeGreaterThan(SETE_DIAS_S - 5)
    expect(Number(refresh?.atributos['max-age'])).toBeLessThanOrEqual(SETE_DIAS_S)
  })

  it('guarda no banco só o hash do refresh, com validade de 7 dias', async () => {
    const usuario = await criarUsuario()

    const valor = cookieDoRefresh(await login({ email: usuario.email, senha: SENHA_DE_TESTE }))?.valor ?? ''

    const tokens = await prisma.refreshToken.findMany()
    expect(tokens).toEqual([
      expect.objectContaining({
        usuarioId: usuario.id,
        tokenHash: hashDoToken(valor),
        revogadoEm: null,
        substituidoPorId: null,
      }),
    ])
    expect(JSON.stringify(tokens)).not.toContain(valor)
    expect((tokens[0]!.expiraEm.getTime() - Date.now()) / (SETE_DIAS_S * 1000)).toBeCloseTo(1, 3)
  })

  it('aceita o e-mail com qualquer combinação de maiúsculas', async () => {
    const usuario = await criarUsuario({ email: 'ana.souza@hospital.test' })

    const resposta = await login({ email: 'Ana.SOUZA@Hospital.Test', senha: SENHA_DE_TESTE })

    expect(resposta.status).toBe(200)
    expect(decodeJwt(resposta.body.data.tokenAcesso).sub).toBe(String(usuario.id))
  })

  it('registra cada login na auditoria, com o IP, e atualiza o último login sem mudar o atualizadoEm', async () => {
    const usuario = await criarUsuario()
    const antes = Date.now()

    await login({ email: usuario.email, senha: SENHA_DE_TESTE }, '198.51.100.7').expect(200)
    // Um X-Forwarded-For que não é IP (sem o Caddy na frente) não impede o login: a auditoria fica sem IP.
    await login({ email: usuario.email, senha: SENHA_DE_TESTE }, 'nao-e-um-ip').expect(200)

    const linhas = await prisma.auditoria.findMany({ orderBy: { id: 'asc' } })
    const linhaDoLogin = {
      usuarioId: usuario.id,
      acao: 'login',
      entidade: 'usuarios',
      entidadeId: String(usuario.id),
    }
    expect(linhas).toEqual([
      expect.objectContaining({ ...linhaDoLogin, ip: '198.51.100.7', dados: null }),
      expect.objectContaining({ ...linhaDoLogin, ip: null }),
    ])
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    expect(depois.ultimoLoginEm?.getTime()).toBeGreaterThanOrEqual(antes)
    expect(depois.atualizadoEm).toEqual(usuario.atualizadoEm)
  })

  it('e-mail ou senha errados, ou usuário inativo, recebem o mesmo 401, sem sessão nem auditoria', async () => {
    const ativo = await criarUsuario()
    const inativo = await criarUsuario({ ativo: false })

    for (const corpo of [
      { email: ativo.email, senha: 'senha-errada-123' },
      { email: 'ninguem@hospital.test', senha: SENHA_DE_TESTE },
      { email: inativo.email, senha: SENHA_DE_TESTE },
    ]) {
      const resposta = await login(corpo)

      expect(resposta.status, corpo.email).toBe(401)
      expect(resposta.body.erro).toMatchObject({
        codigo: 'NAO_AUTENTICADO',
        mensagem: 'E-mail ou senha incorretos.',
        detalhes: [],
      })
      expect(cookieDoRefresh(resposta)).toBeUndefined()
    }
    await expect(prisma.refreshToken.count()).resolves.toBe(0)
    await expect(prisma.auditoria.count()).resolves.toBe(0)
  })

  it('valida o corpo antes de conferir a senha', async () => {
    const resposta = await login({ email: 'nao-e-email', senha: '' })

    expect(resposta.status).toBe(400)
    expect(resposta.body.erro).toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: [
        { campo: 'email', mensagem: 'Digite um e-mail válido, como nome@hospital.com.br' },
        { campo: 'senha', mensagem: 'Digite a senha' },
      ],
    })
  })
})

describe('limite de tentativas do login', () => {
  async function errarCincoVezes(email: string, ip = IP) {
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      await login({ email, senha: 'senha-errada-123' }, ip).expect(401)
    }
  }

  it('depois de 5 tentativas erradas para o mesmo IP e e-mail, responde 429, mesmo com a senha certa', async () => {
    const usuario = await criarUsuario()
    await errarCincoVezes(usuario.email)

    const bloqueada = await login({ email: usuario.email, senha: SENHA_DE_TESTE }, IP)

    expect(bloqueada.status).toBe(429)
    expect(bloqueada.body.erro).toMatchObject({
      codigo: 'LIMITE_ATINGIDO',
      mensagem: 'Muitas tentativas. Espere 15 minutos e tente de novo.',
    })
    expect(bloqueada.headers['ratelimit-policy']).toBe('5;w=900')
    expect(Number(bloqueada.headers['retry-after'])).toBeGreaterThan(890)
    expect(Number(bloqueada.headers['retry-after'])).toBeLessThanOrEqual(900)
    expect(cookieDoRefresh(bloqueada)).toBeUndefined()
    // O mesmo e-mail em maiúsculas continua bloqueado.
    await login({ email: usuario.email.toUpperCase(), senha: SENHA_DE_TESTE }, IP).expect(429)
  })

  it('o bloqueio vale só para aquele IP e aquele e-mail', async () => {
    const usuario = await criarUsuario()
    const colega = await criarUsuario()
    await errarCincoVezes(usuario.email)

    await login({ email: usuario.email, senha: SENHA_DE_TESTE }, OUTRO_IP).expect(200)
    await login({ email: colega.email, senha: SENHA_DE_TESTE }, IP).expect(200)
  })

  it('os logins que dão certo não contam', async () => {
    const usuario = await criarUsuario()

    for (let vez = 1; vez <= 6; vez++)
      await login({ email: usuario.email, senha: SENHA_DE_TESTE }, IP).expect(200)
    await errarCincoVezes(usuario.email)
  })

  it('a janela acaba em 15 minutos, e aí o login volta a funcionar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const usuario = await criarUsuario()
    await errarCincoVezes(usuario.email)
    await login({ email: usuario.email, senha: SENHA_DE_TESTE }, IP).expect(429)

    vi.setSystemTime(Date.now() + QUINZE_MINUTOS_MS + 1000)

    await login({ email: usuario.email, senha: SENHA_DE_TESTE }, IP).expect(200)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  it('troca o refresh a cada uso: o antigo é revogado e aponta para o novo', async () => {
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)

    const resposta = await renovar(refresh)

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: { tokenAcesso: expect.any(String) } })
    expect(resposta.headers['cache-control']).toBe('no-store')
    await sessao(resposta.body.data.tokenAcesso).expect(200)

    const novo = cookieDoRefresh(resposta)
    expect(novo?.valor).toMatch(REFRESH)
    expect(novo?.valor).not.toBe(refresh)
    expect(novo?.atributos).toMatchObject(COOKIE_PROTEGIDO)

    const antigo = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashDoToken(refresh) } })
    const substituto = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoToken(novo?.valor ?? '') },
    })
    expect(antigo.revogadoEm).toBeInstanceOf(Date)
    expect(antigo.substituidoPorId).toBe(substituto.id)
    expect(substituto).toMatchObject({ usuarioId: usuario.id, revogadoEm: null, substituidoPorId: null })
  })

  it('recusa o refresh antigo depois da troca, sem apagar o cookie novo, que continua valendo', async () => {
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)
    const novo = cookieDoRefresh(await renovar(refresh).expect(200))?.valor

    const repetido = await renovar(refresh)

    expect(repetido.status).toBe(401)
    expect(repetido.body.erro).toMatchObject({
      codigo: 'NAO_AUTENTICADO',
      mensagem: 'Sua sessão terminou. Entre de novo.',
    })
    expect(cookieDoRefresh(repetido)).toBeUndefined()
    await renovar(novo).expect(200)
  })

  it('recusa sem cookie, com refresh desconhecido, vencido, revogado ou de usuário inativo', async () => {
    const vencido = await criarUsuario()
    const revogado = await criarUsuario()
    const inativo = await criarUsuario()
    const sessoes = {
      vencido: await entrar(app, vencido.email),
      revogado: await entrar(app, revogado.email),
      inativo: await entrar(app, inativo.email),
    }
    await prisma.refreshToken.updateMany({
      where: { usuarioId: vencido.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    })
    await prisma.refreshToken.updateMany({
      where: { usuarioId: revogado.id },
      data: { revogadoEm: new Date() },
    })
    await prisma.usuario.update({ where: { id: inativo.id }, data: { ativo: false } })

    for (const [caso, refresh] of [
      ['sem cookie', undefined],
      ['desconhecido', 'refresh-que-nunca-existiu'],
      ['vencido', sessoes.vencido.refresh],
      ['revogado', sessoes.revogado.refresh],
      ['de usuário inativo', sessoes.inativo.refresh],
    ] as const) {
      const resposta = await renovar(refresh)

      expect(resposta.status, caso).toBe(401)
      expect(resposta.body.erro.codigo, caso).toBe('NAO_AUTENTICADO')
    }
  })

  it('com o mesmo refresh em dois pedidos ao mesmo tempo, só um faz a troca', async () => {
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)

    const respostas = await Promise.all([renovar(refresh), renovar(refresh)])

    expect(respostas.map(({ status }) => status).sort()).toEqual([200, 401])
    const [antigo, substituto, ...outros] = await prisma.refreshToken.findMany({ orderBy: { id: 'asc' } })
    expect(outros).toEqual([])
    expect(antigo).toMatchObject({ substituidoPorId: substituto?.id })
    expect(substituto).toMatchObject({ revogadoEm: null })
  })

  it('a troca é atômica no banco: de duas trocas simultâneas do mesmo refresh, só uma vale', async () => {
    // Os pedidos HTTP acima costumam chegar um depois do outro, e o segundo já para na leitura. Aqui as duas
    // trocas disputam a mesma linha no banco, com a leitura já feita.
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)
    const antigo = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashDoToken(refresh) } })
    const substituto = (numero: number) => ({
      usuarioId: usuario.id,
      tokenHash: hashDoToken(`substituto-${numero}`),
      expiraEm: new Date(Date.now() + QUINZE_MINUTOS_MS),
    })

    const trocas = await Promise.all([
      authRepository.trocarRefresh(antigo.id, substituto(1)),
      authRepository.trocarRefresh(antigo.id, substituto(2)),
    ])

    expect(trocas.sort()).toEqual([false, true])
    await expect(prisma.refreshToken.count()).resolves.toBe(2)
  })
})

describe('POST /api/v1/auth/logout', () => {
  function sair(tokenAcesso?: string, refresh?: string) {
    const pedido = request(app).post('/api/v1/auth/logout')
    if (tokenAcesso) pedido.set('Authorization', bearer(tokenAcesso))
    if (refresh) pedido.set('Cookie', cookie(refresh))
    return pedido
  }

  it('revoga todos os refresh tokens da pessoa, apaga o cookie e responde 204', async () => {
    const usuario = await criarUsuario()
    const colega = await criarUsuario()
    const noCelular = await entrar(app, usuario.email)
    const noComputador = await entrar(app, usuario.email)
    const doColega = await entrar(app, colega.email)

    const resposta = await sair(noComputador.tokenAcesso, noComputador.refresh)

    expect(resposta.status).toBe(204)
    const apagado = cookieDoRefresh(resposta)
    expect(apagado?.valor).toBe('')
    expect(apagado?.atributos).toMatchObject({
      ...COOKIE_PROTEGIDO,
      expires: 'Thu, 01 Jan 1970 00:00:00 GMT',
    })
    await renovar(noCelular.refresh).expect(401)
    await renovar(noComputador.refresh).expect(401)
    await renovar(doColega.refresh).expect(200)
  })

  it('com o token de acesso já vencido, encerra as sessões pelo cookie de refresh', async () => {
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)
    const vencido = await tokenDeAcesso(usuario.id, { emitidoHaSegundos: 16 * 60 })

    await sair(vencido, refresh).expect(204)

    await renovar(refresh).expect(401)
  })

  it('só com o token de acesso, sem o cookie, também encerra as sessões', async () => {
    const usuario = await criarUsuario()
    const { tokenAcesso, refresh } = await entrar(app, usuario.email)

    await sair(tokenAcesso).expect(204)

    await renovar(refresh).expect(401)
  })

  it('sem sessão válida, responde 204 e apaga o cookie do mesmo jeito', async () => {
    const usuario = await criarUsuario()
    const { refresh } = await entrar(app, usuario.email)

    for (const resposta of [await sair(), await sair('token-invalido', 'refresh-desconhecido')]) {
      expect(resposta.status).toBe(204)
      expect(cookieDoRefresh(resposta)?.valor).toBe('')
    }
    await renovar(refresh).expect(200)
  })
})

describe('GET /api/v1/auth/me', () => {
  it.each([
    ['SUPER_ADMIN', true],
    ['OUVIDORIA', true],
    ['GESTOR', false],
    ['VISUALIZADOR', false],
  ] as const)('devolve a sessão do %s no formato que o front usa', async (perfil, todosSetores) => {
    const pediatria = await criarSetor({ nome: 'Pediatria' })
    const maternidade = await criarSetor({ nome: 'Maternidade' })
    await criarSetor({ nome: 'Pronto Atendimento' })
    const usuario = await criarUsuario({
      perfil,
      nome: 'Ana Souza',
      email: 'ana.souza@hospital.test',
      setorIds: [pediatria.id, maternidade.id],
    })
    const { tokenAcesso } = await entrar(app, usuario.email)

    const resposta = await sessao(tokenAcesso)

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      data: {
        usuario: {
          id: usuario.id,
          nome: 'Ana Souza',
          email: 'ana.souza@hospital.test',
          perfil,
          trocarSenha: false,
        },
        permissoes: PERMISSOES_POR_PERFIL[perfil],
        // Quem enxerga todos recebe a lista vazia, mesmo que tenha setores ligados.
        setores: todosSetores
          ? []
          : [
              { id: maternidade.id, nome: 'Maternidade' },
              { id: pediatria.id, nome: 'Pediatria' },
            ],
        todosSetores,
      },
    })
  })

  it('lê perfil e setores do banco a cada chamada: uma mudança vale na hora, com o mesmo token', async () => {
    const ambulatorio = await criarSetor({ nome: 'Ambulatório' })
    const bloco = await criarSetor({ nome: 'Bloco Cirúrgico' })
    const usuario = await criarUsuario({ perfil: 'GESTOR', setorIds: [ambulatorio.id] })
    const { tokenAcesso } = await entrar(app, usuario.email)

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { perfil: 'VISUALIZADOR', setores: { create: { setorId: bloco.id } } },
    })

    expect((await sessao(tokenAcesso)).body.data).toMatchObject({
      usuario: { perfil: 'VISUALIZADOR' },
      permissoes: ['dashboard:ver', 'exportacao:resumo'],
      setores: [
        { id: ambulatorio.id, nome: 'Ambulatório' },
        { id: bloco.id, nome: 'Bloco Cirúrgico' },
      ],
    })
  })

  it('funciona com a senha provisória, para o front saber que precisa pedir a troca', async () => {
    const usuario = await criarUsuario({ trocarSenha: true })
    const { tokenAcesso } = await entrar(app, usuario.email)

    const resposta = await sessao(tokenAcesso)

    expect(resposta.status).toBe(200)
    expect(resposta.body.data.usuario.trocarSenha).toBe(true)
  })

  it('sem token, com token vencido ou de usuário inativo, responde 401', async () => {
    const usuario = await criarUsuario()
    const { tokenAcesso } = await entrar(app, usuario.email)
    const vencido = await tokenDeAcesso(usuario.id, { emitidoHaSegundos: 16 * 60 })

    await request(app).get('/api/v1/auth/me').expect(401)
    await sessao(vencido).expect(401)
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } })
    const inativo = await sessao(tokenAcesso)
    expect(inativo.status).toBe(401)
    expect(inativo.body.erro.codigo).toBe('NAO_AUTENTICADO')
  })
})

describe('PATCH /api/v1/auth/senha', () => {
  const NOVA_SENHA = 'nova-senha-2026'

  function trocar(tokenAcesso: string, corpo: { senhaAtual?: string; novaSenha?: string }, refresh?: string) {
    const pedido = request(app)
      .patch('/api/v1/auth/senha')
      .set('Authorization', bearer(tokenAcesso))
      .send(corpo)
    return refresh ? pedido.set('Cookie', cookie(refresh)) : pedido
  }

  it('troca a senha provisória, encerra as outras sessões e mantém logado quem trocou', async () => {
    const usuario = await criarUsuario({ trocarSenha: true })
    const aqui = await entrar(app, usuario.email)
    const noutroAparelho = await entrar(app, usuario.email)

    const resposta = await trocar(
      aqui.tokenAcesso,
      { senhaAtual: SENHA_DE_TESTE, novaSenha: NOVA_SENHA },
      aqui.refresh,
    )

    expect(resposta.status).toBe(204)
    const novoRefresh = cookieDoRefresh(resposta)
    expect(novoRefresh?.valor).toMatch(REFRESH)
    expect(novoRefresh?.atributos).toMatchObject(COOKIE_PROTEGIDO)

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    expect(depois.trocarSenha).toBe(false)
    await expect(senhaConfere(depois.senhaHash, NOVA_SENHA)).resolves.toBe(true)

    // Todas as sessões antigas acabaram; quem trocou segue com o refresh novo e com o token de acesso atual.
    await renovar(noutroAparelho.refresh).expect(401)
    await renovar(aqui.refresh).expect(401)
    await renovar(novoRefresh?.valor).expect(200)
    expect((await sessao(aqui.tokenAcesso)).body.data.usuario.trocarSenha).toBe(false)

    await login({ email: usuario.email, senha: SENHA_DE_TESTE }).expect(401)
    await login({ email: usuario.email, senha: NOVA_SENHA }).expect(200)
    await expect(prisma.auditoria.findMany({ where: { acao: 'troca_de_senha' } })).resolves.toEqual([
      expect.objectContaining({
        usuarioId: usuario.id,
        entidade: 'usuarios',
        entidadeId: String(usuario.id),
      }),
    ])
  })

  it('com a senha atual errada, responde 400 em senhaAtual e não muda nada', async () => {
    const usuario = await criarUsuario({ trocarSenha: true })
    const { tokenAcesso, refresh } = await entrar(app, usuario.email)

    const resposta = await trocar(tokenAcesso, { senhaAtual: 'senha-errada-123', novaSenha: NOVA_SENHA })

    expect(resposta.status).toBe(400)
    expect(resposta.body.erro).toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: [{ campo: 'senhaAtual', mensagem: 'A senha atual não confere.' }],
    })
    expect(cookieDoRefresh(resposta)).toBeUndefined()
    await expect(prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).resolves.toMatchObject({
      senhaHash: usuario.senhaHash,
      trocarSenha: true,
    })
    await renovar(refresh).expect(200)
  })

  it.each([
    ['com menos de 10 caracteres', 'curta123', 'Use pelo menos 10 caracteres, com letras e números.'],
    ['sem números', 'somente-letras', 'Use pelo menos 10 caracteres, com letras e números.'],
    ['sem letras', '1234567890', 'Use pelo menos 10 caracteres, com letras e números.'],
    ['igual à atual', SENHA_DE_TESTE, 'A nova senha precisa ser diferente da atual.'],
  ])('recusa a senha nova %s, com o erro em novaSenha', async (_caso, novaSenha, mensagem) => {
    const usuario = await criarUsuario()
    const { tokenAcesso } = await entrar(app, usuario.email)

    const resposta = await trocar(tokenAcesso, { senhaAtual: SENHA_DE_TESTE, novaSenha })

    expect(resposta.status).toBe(400)
    expect(resposta.body.erro).toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: [{ campo: 'novaSenha', mensagem }],
    })
    await expect(prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).resolves.toMatchObject({
      senhaHash: usuario.senhaHash,
    })
  })

  it('sem login, responde 401', async () => {
    const resposta = await request(app)
      .patch('/api/v1/auth/senha')
      .send({ senhaAtual: SENHA_DE_TESTE, novaSenha: NOVA_SENHA })

    expect(resposta.status).toBe(401)
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO')
  })
})
