import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import type { Usuario, UsuarioCriado } from '../../src/modules/usuarios/usuarios.schemas'
import { senhaSegueARegra } from '../../src/shared/rules/senha'
import { senhaConfere } from '../../src/shared/security/password'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarSetor } from '../factories/setores'
import { criarUsuario, SENHA_DE_TESTE, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer, cookie, entrar } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `usuarios:gerenciar`: todos menos o Super Admin. */
const SEM_A_PERMISSAO = ['GESTOR', 'OUVIDORIA', 'VISUALIZADOR'] as const

const MENSAGEM_NAO_ENCONTRADO = 'Usuário não encontrado.'
const MENSAGEM_NOME = 'Informe o nome completo'
const MENSAGEM_EMAIL = 'Digite um e-mail válido, como nome@hospital.com.br'
const MENSAGEM_PERFIL = 'Escolha um perfil'
const MENSAGEM_SETOR = 'Um dos setores escolhidos não existe.'
const MENSAGEM_ID = 'O ID precisa ser um número inteiro positivo.'
const MENSAGEM_SENHA_PROVISORIA = 'Troque a senha provisória para continuar.'

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Cria o usuário e devolve o ID e um token de acesso dele, assinado pela API. */
async function logado(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return { usuarioId: usuario.id, token: await emitirTokenDeAcesso(usuario.id) }
}

function superAdmin() {
  return logado({ perfil: 'SUPER_ADMIN', nome: 'Super Admin de Teste' })
}

function pedir(metodo: 'get' | 'post' | 'put' | 'patch', caminho: string, token?: string) {
  const pedido = request(app)[metodo](`/api/v1${caminho}`)
  return token ? pedido.set('Authorization', bearer(token)) : pedido
}

interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

function dadosDe<T>(resposta: request.Response): T {
  return (resposta.body as { data: T }).data
}

/** A conta como está no banco, sem o hash da senha. */
function noBanco(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    select: {
      nome: true,
      email: true,
      perfil: true,
      ativo: true,
      trocarSenha: true,
      atualizadoEm: true,
      setores: { select: { setorId: true }, orderBy: { setorId: 'asc' } },
    },
  })
}

/** As linhas da auditoria, menos os logins e as trocas de senha que os testes fazem para entrar. */
function auditoria() {
  return prisma.auditoria.findMany({
    where: { acao: { notIn: ['login', 'troca_de_senha'] } },
    orderBy: { id: 'asc' },
    select: { usuarioId: true, acao: true, entidade: true, entidadeId: true, dados: true },
  })
}

/** O token de acesso, ainda dentro dos 15 minutos, de quem foi desativado: o `authenticate` o recusa pelo banco. */
async function sessaoDe(email: string, senha = SENHA_DE_TESTE) {
  return entrar(app, email, senha)
}

describe('permissões', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403 em todas as rotas, sem mudar nada', async () => {
    const alvo = await criarUsuario({ perfil: 'GESTOR', nome: 'Pessoa Alvo' })
    const antes = await noBanco(alvo.id)
    const rotas = [
      ['get', '/usuarios', undefined],
      ['post', '/usuarios', { nome: 'Pessoa Nova', email: 'nova@hospital.test', perfil: 'GESTOR' }],
      ['patch', `/usuarios/${alvo.id}`, { nome: 'Nome Novo', perfil: 'SUPER_ADMIN' }],
      ['put', `/usuarios/${alvo.id}/setores`, { setorIds: [] }],
      ['patch', `/usuarios/${alvo.id}/status`, { ativo: false }],
      ['post', `/usuarios/${alvo.id}/redefinir-senha`, undefined],
    ] as const

    for (const [metodo, caminho, corpo] of rotas) {
      const semLogin = await pedir(metodo, caminho).send(corpo)
      expect(semLogin.status, `${metodo} ${caminho}`).toBe(401)

      for (const perfil of SEM_A_PERMISSAO) {
        const { token } = await logado({ perfil })

        const resposta = await pedir(metodo, caminho, token).send(corpo)

        expect(resposta.status, `${perfil} ${metodo} ${caminho}`).toBe(403)
        expect(erroDe(resposta), `${perfil} ${metodo} ${caminho}`).toMatchObject({
          codigo: 'SEM_PERMISSAO',
          mensagem: 'Você não tem permissão para isso.',
        })
      }
    }

    expect(await noBanco(alvo.id)).toEqual(antes)
    expect(await prisma.usuario.count({ where: { email: 'nova@hospital.test' } })).toBe(0)
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('GET /usuarios', () => {
  it('devolve as contas, ativas e inativas, em ordem alfabética e no formato do contrato, sem a senha', async () => {
    const { token } = await superAdmin()
    const [raioX, laboratorio] = [await criarSetor(), await criarSetor()]
    const bruno = await criarUsuario({
      nome: 'Bruno Lima',
      email: 'bruno.lima@hospital.test',
      perfil: 'GESTOR',
      setorIds: [laboratorio.id, raioX.id],
    })
    const erica = await criarUsuario({
      nome: 'Érica Melo',
      email: 'erica.melo@hospital.test',
      perfil: 'VISUALIZADOR',
      ativo: false,
    })
    const ana = await criarUsuario({
      nome: 'ana Souza',
      email: 'ana.souza@hospital.test',
      perfil: 'OUVIDORIA',
      trocarSenha: true,
    })
    await sessaoDe(bruno.email)
    const ultimoLogin = (await prisma.usuario.findUniqueOrThrow({ where: { id: bruno.id } })).ultimoLoginEm

    const resposta = await pedir('get', '/usuarios', token)

    expect(resposta.status).toBe(200)
    const usuarios = dadosDe<Usuario[]>(resposta)
    expect(usuarios.map(({ nome }) => nome)).toEqual([
      'ana Souza',
      'Bruno Lima',
      'Érica Melo',
      'Super Admin de Teste',
    ])
    expect(usuarios.slice(0, 3)).toEqual([
      {
        id: ana.id,
        nome: 'ana Souza',
        email: 'ana.souza@hospital.test',
        perfil: 'OUVIDORIA',
        ativo: true,
        trocarSenha: true,
        setorIds: [],
        ultimoLoginEm: null,
      },
      {
        id: bruno.id,
        nome: 'Bruno Lima',
        email: 'bruno.lima@hospital.test',
        perfil: 'GESTOR',
        ativo: true,
        trocarSenha: false,
        setorIds: [raioX.id, laboratorio.id],
        ultimoLoginEm: ultimoLogin?.toISOString(),
      },
      {
        id: erica.id,
        nome: 'Érica Melo',
        email: 'erica.melo@hospital.test',
        perfil: 'VISUALIZADOR',
        ativo: false,
        trocarSenha: false,
        setorIds: [],
        ultimoLoginEm: null,
      },
    ])
    // O `toEqual` recusa campo a mais: nenhuma conta traz a senha nem o hash dela.
    expect(resposta.body).not.toHaveProperty('meta')
  })
})

describe('POST /usuarios', () => {
  const NOVO = { nome: '  Ana Souza ', email: 'Ana.Souza@Hospital.com.br', perfil: 'GESTOR' }

  it('cria a conta com senha provisória: 201, e-mail em minúsculas, troca obrigatória e a senha só nesta resposta', async () => {
    const admin = await superAdmin()

    const resposta = await pedir('post', '/usuarios', admin.token).send({
      ...NOVO,
      setorIds: [1],
      ativo: false,
    })

    expect(resposta.status).toBe(201)
    expect(resposta.headers['cache-control']).toBe('no-store')
    const { usuario, senhaProvisoria } = dadosDe<UsuarioCriado>(resposta)
    expect(usuario).toEqual({
      id: usuario.id,
      nome: 'Ana Souza',
      email: 'ana.souza@hospital.com.br',
      perfil: 'GESTOR',
      ativo: true,
      trocarSenha: true,
      setorIds: [],
      ultimoLoginEm: null,
    })
    expect(senhaSegueARegra(senhaProvisoria)).toBe(true)

    // O banco guarda só o hash, e a senha não volta em nenhuma outra resposta.
    const { senhaHash } = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    expect(senhaHash).not.toContain(senhaProvisoria)
    await expect(senhaConfere(senhaHash, senhaProvisoria)).resolves.toBe(true)
    const lista = await pedir('get', '/usuarios', admin.token)
    expect(JSON.stringify(lista.body)).not.toContain(senhaProvisoria)

    expect(await auditoria()).toEqual([
      {
        usuarioId: admin.usuarioId,
        acao: 'criacao_de_usuario',
        entidade: 'usuarios',
        entidadeId: String(usuario.id),
        dados: { nome: 'Ana Souza', email: 'ana.souza@hospital.com.br', perfil: 'GESTOR' },
      },
    ])
    expect(JSON.stringify(await prisma.auditoria.findMany())).not.toContain(senhaProvisoria)

    // Cada conta ganha a sua senha.
    const outra = await pedir('post', '/usuarios', admin.token).send({
      nome: 'Bruno Lima',
      email: 'bruno.lima@hospital.com.br',
      perfil: 'VISUALIZADOR',
    })
    expect(dadosDe<UsuarioCriado>(outra).senhaProvisoria).not.toBe(senhaProvisoria)
  })

  it('a senha provisória entra no primeiro acesso, que pede a troca antes de abrir o painel', async () => {
    const { token } = await superAdmin()
    const criada = await pedir('post', '/usuarios', token).send(NOVO)
    const { senhaProvisoria } = dadosDe<UsuarioCriado>(criada)

    const primeiroAcesso = await sessaoDe('ana.souza@hospital.com.br', senhaProvisoria)

    const sessao = await pedir('get', '/auth/me', primeiroAcesso.tokenAcesso)
    expect(sessao.status).toBe(200)
    expect(sessao.body.data.usuario).toMatchObject({ email: 'ana.souza@hospital.com.br', trocarSenha: true })
    const painel = await pedir('get', '/setores', primeiroAcesso.tokenAcesso)
    expect(painel.status).toBe(403)
    expect(erroDe(painel).mensagem).toBe(MENSAGEM_SENHA_PROVISORIA)

    const troca = await pedir('patch', '/auth/senha', primeiroAcesso.tokenAcesso).send({
      senhaAtual: senhaProvisoria,
      novaSenha: 'minha-senha-nova-42',
    })
    expect(troca.status).toBe(204)
    expect((await pedir('get', '/setores', primeiroAcesso.tokenAcesso)).status).toBe(200)
  })

  it('e-mail repetido, mesmo com outras maiúsculas ou de uma conta inativa: 409, sem criar nada', async () => {
    const { token } = await superAdmin()
    await criarUsuario({ email: 'ana.souza@hospital.com.br' })
    await criarUsuario({ email: 'bruno.lima@hospital.com.br', ativo: false })

    for (const email of [
      'ana.souza@hospital.com.br',
      'ANA.SOUZA@hospital.com.br',
      'Bruno.Lima@hospital.com.br',
    ]) {
      const resposta = await pedir('post', '/usuarios', token).send({ ...NOVO, email })

      expect(resposta.status, email).toBe(409)
      expect(erroDe(resposta), email).toMatchObject({
        codigo: 'CONFLITO',
        mensagem: 'Já existe um usuário com este e-mail.',
      })
    }
    expect(await prisma.usuario.count()).toBe(3)
    expect(await prisma.auditoria.count()).toBe(0)
  })

  it('nome com pelo menos 3 caracteres, e-mail válido e um dos perfis: 400 no campo, sem criar nada', async () => {
    const { token } = await superAdmin()

    for (const [corpo, campo, mensagem] of [
      [{ ...NOVO, nome: 'Al' }, 'nome', MENSAGEM_NOME],
      [{ ...NOVO, nome: '  Al  ' }, 'nome', MENSAGEM_NOME],
      [{ ...NOVO, nome: 'N'.repeat(101) }, 'nome', 'Use no máximo 100 caracteres'],
      [{ ...NOVO, nome: undefined }, 'nome', 'Obrigatório'],
      [{ ...NOVO, email: 'ana.souza' }, 'email', MENSAGEM_EMAIL],
      [{ ...NOVO, email: 'ana souza@hospital.com.br' }, 'email', MENSAGEM_EMAIL],
      [{ ...NOVO, email: ' ana.souza@hospital.com.br' }, 'email', MENSAGEM_EMAIL],
      [{ ...NOVO, email: undefined }, 'email', MENSAGEM_EMAIL],
      [{ ...NOVO, perfil: 'ADMIN' }, 'perfil', MENSAGEM_PERFIL],
      [{ ...NOVO, perfil: 'gestor' }, 'perfil', MENSAGEM_PERFIL],
      [{ ...NOVO, perfil: undefined }, 'perfil', MENSAGEM_PERFIL],
    ] as const) {
      const resposta = await pedir('post', '/usuarios', token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes, JSON.stringify(corpo)).toEqual([{ campo, mensagem }])
    }
    expect(await prisma.usuario.count()).toBe(1)

    // Nas pontas, 3 caracteres passam.
    const curto = await pedir('post', '/usuarios', token).send({ ...NOVO, nome: 'Ana' })
    expect(curto.status).toBe(201)
  })
})

describe('PATCH /usuarios/:id', () => {
  it('muda o nome e o perfil, mas não o e-mail; o perfil novo vale na hora e vai para a auditoria', async () => {
    const admin = await superAdmin()
    const pessoa = await criarUsuario({
      nome: 'Ana Souza',
      email: 'ana@hospital.test',
      perfil: 'VISUALIZADOR',
    })
    const tokenDaPessoa = await emitirTokenDeAcesso(pessoa.id)

    const resposta = await pedir('patch', `/usuarios/${pessoa.id}`, admin.token).send({
      nome: ' Ana Souza Lima ',
      perfil: 'GESTOR',
      email: 'outro@hospital.test',
      ativo: false,
    })

    expect(resposta.status).toBe(200)
    expect(dadosDe<Usuario>(resposta)).toMatchObject({
      id: pessoa.id,
      nome: 'Ana Souza Lima',
      email: 'ana@hospital.test',
      perfil: 'GESTOR',
      ativo: true,
    })
    expect(await noBanco(pessoa.id)).toMatchObject({
      nome: 'Ana Souza Lima',
      email: 'ana@hospital.test',
      perfil: 'GESTOR',
      ativo: true,
    })
    // O token emitido antes da mudança já traz as permissões do perfil novo.
    const sessao = await pedir('get', '/auth/me', tokenDaPessoa)
    expect(sessao.body.data.usuario.perfil).toBe('GESTOR')
    expect(sessao.body.data.permissoes).toContain('perguntas:gerenciar')

    expect(await auditoria()).toEqual([
      {
        usuarioId: admin.usuarioId,
        acao: 'alteracao_de_perfil',
        entidade: 'usuarios',
        entidadeId: String(pessoa.id),
        dados: { antes: 'VISUALIZADOR', depois: 'GESTOR' },
      },
    ])
  })

  it('só o nome ou só o perfil: o outro fica; só o nome não vai para a auditoria; sem mudança, nada é gravado', async () => {
    const admin = await superAdmin()
    const pessoa = await criarUsuario({ nome: 'Ana Souza', perfil: 'GESTOR' })

    const soNome = await pedir('patch', `/usuarios/${pessoa.id}`, admin.token).send({ nome: 'Ana S. Souza' })
    expect(soNome.status).toBe(200)
    expect(dadosDe<Usuario>(soNome)).toMatchObject({ nome: 'Ana S. Souza', perfil: 'GESTOR' })
    expect(await auditoria()).toEqual([])

    const soPerfil = await pedir('patch', `/usuarios/${pessoa.id}`, admin.token).send({ perfil: 'OUVIDORIA' })
    expect(soPerfil.status).toBe(200)
    expect(dadosDe<Usuario>(soPerfil)).toMatchObject({ nome: 'Ana S. Souza', perfil: 'OUVIDORIA' })
    const depois = await noBanco(pessoa.id)

    const igual = await pedir('patch', `/usuarios/${pessoa.id}`, admin.token).send({
      nome: ' Ana S. Souza',
      perfil: 'OUVIDORIA',
    })
    expect(igual.status).toBe(200)
    expect(dadosDe<Usuario>(igual)).toMatchObject({ nome: 'Ana S. Souza', perfil: 'OUVIDORIA' })
    expect(await noBanco(pessoa.id)).toEqual(depois)
    expect(await auditoria()).toEqual([
      {
        usuarioId: admin.usuarioId,
        acao: 'alteracao_de_perfil',
        entidade: 'usuarios',
        entidadeId: String(pessoa.id),
        dados: { antes: 'GESTOR', depois: 'OUVIDORIA' },
      },
    ])
  })

  it('ninguém muda o próprio perfil: 409, sem mudar nada; o próprio nome muda', async () => {
    const admin = await superAdmin()
    const antes = await noBanco(admin.usuarioId)

    const perfil = await pedir('patch', `/usuarios/${admin.usuarioId}`, admin.token).send({
      nome: 'Outro Nome',
      perfil: 'GESTOR',
    })
    expect(perfil.status).toBe(409)
    expect(erroDe(perfil)).toMatchObject({
      codigo: 'CONFLITO',
      mensagem: 'Você não pode mudar o próprio perfil.',
    })
    expect(await noBanco(admin.usuarioId)).toEqual(antes)

    const nome = await pedir('patch', `/usuarios/${admin.usuarioId}`, admin.token).send({
      nome: 'Admin do Hospital',
      perfil: 'SUPER_ADMIN',
    })
    expect(nome.status).toBe(200)
    expect(dadosDe<Usuario>(nome)).toMatchObject({ nome: 'Admin do Hospital', perfil: 'SUPER_ADMIN' })
  })

  it('nada para mudar, nome ou perfil inválido: 400; conta inexistente: 404; ID inválido: 400', async () => {
    const { token } = await superAdmin()
    const pessoa = await criarUsuario()
    const antes = await noBanco(pessoa.id)

    // O e-mail não é editável: vem ignorado, e o corpo fica sem nada para mudar.
    for (const corpo of [{}, { email: 'novo@hospital.test' }]) {
      const resposta = await pedir('patch', `/usuarios/${pessoa.id}`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        { campo: 'body', mensagem: 'Envie o que vai mudar: o nome, o perfil ou os dois.' },
      ])
    }

    const invalidos = await pedir('patch', `/usuarios/${pessoa.id}`, token).send({
      nome: 'Al',
      perfil: 'CHEFE',
    })
    expect(invalidos.status).toBe(400)
    expect(erroDe(invalidos).detalhes).toEqual([
      { campo: 'nome', mensagem: MENSAGEM_NOME },
      { campo: 'perfil', mensagem: MENSAGEM_PERFIL },
    ])
    expect(await noBanco(pessoa.id)).toEqual(antes)

    const inexistente = await pedir('patch', '/usuarios/999', token).send({ nome: 'Nome Novo' })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: MENSAGEM_NAO_ENCONTRADO })

    const idInvalido = await pedir('patch', '/usuarios/abc', token).send({ nome: 'Nome Novo' })
    expect(idInvalido.status).toBe(400)
    expect(erroDe(idInvalido).detalhes).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
  })
})

describe('PUT /usuarios/:id/setores', () => {
  it('troca os setores, sem repetidos e com os inativos: 204; o escopo novo vale na hora e vai para a auditoria', async () => {
    const admin = await superAdmin()
    const raioX = await criarSetor({ nome: 'Raio-X' })
    const laboratorio = await criarSetor({ nome: 'Laboratório', ativo: false })
    const internacao = await criarSetor({ nome: 'Internação' })
    const gestor = await criarUsuario({ perfil: 'GESTOR', setorIds: [raioX.id] })
    const tokenDoGestor = await emitirTokenDeAcesso(gestor.id)

    const resposta = await pedir('put', `/usuarios/${gestor.id}/setores`, admin.token).send({
      setorIds: [internacao.id, laboratorio.id, internacao.id],
    })

    expect(resposta.status).toBe(204)
    expect(resposta.body).toEqual({})
    const naLista = dadosDe<Usuario[]>(await pedir('get', '/usuarios', admin.token)).find(
      ({ id }) => id === gestor.id,
    )
    expect(naLista?.setorIds).toEqual([laboratorio.id, internacao.id])
    // O gestor já enxerga os setores novos, com o mesmo token.
    const setores = await pedir('get', '/setores', tokenDoGestor)
    expect(setores.body.data.map(({ nome }: { nome: string }) => nome)).toEqual(['Internação', 'Laboratório'])

    expect(await auditoria()).toEqual([
      {
        usuarioId: admin.usuarioId,
        acao: 'alteracao_de_setores_do_usuario',
        entidade: 'usuarios',
        entidadeId: String(gestor.id),
        dados: { antes: [raioX.id], depois: [laboratorio.id, internacao.id] },
      },
    ])
  })

  it('setor inexistente: 400 em setorIds, sem mudar nada; a mesma lista: 204, sem auditoria; a lista vazia tira todos', async () => {
    const { token } = await superAdmin()
    const [raioX, laboratorio] = [await criarSetor(), await criarSetor()]
    const gestor = await criarUsuario({ perfil: 'GESTOR', setorIds: [raioX.id, laboratorio.id] })
    const caminho = `/usuarios/${gestor.id}/setores`

    const inexistente = await pedir('put', caminho, token).send({ setorIds: [raioX.id, 999] })
    expect(inexistente.status).toBe(400)
    expect(erroDe(inexistente).detalhes).toEqual([{ campo: 'setorIds', mensagem: MENSAGEM_SETOR }])
    expect((await noBanco(gestor.id))?.setores).toEqual([{ setorId: raioX.id }, { setorId: laboratorio.id }])

    const mesma = await pedir('put', caminho, token).send({ setorIds: [laboratorio.id, raioX.id] })
    expect(mesma.status).toBe(204)
    expect(await auditoria()).toEqual([])

    const vazia = await pedir('put', caminho, token).send({ setorIds: [] })
    expect(vazia.status).toBe(204)
    expect((await noBanco(gestor.id))?.setores).toEqual([])
    expect(await auditoria()).toEqual([
      expect.objectContaining({ dados: { antes: [raioX.id, laboratorio.id], depois: [] } }),
    ])
  })

  it('sem a lista ou com o que não é ID: 400; conta inexistente: 404', async () => {
    const { token } = await superAdmin()
    const setor = await criarSetor()
    const gestor = await criarUsuario({ perfil: 'GESTOR' })

    for (const [corpo, campo] of [
      [{}, 'setorIds'],
      [{ setorIds: String(setor.id) }, 'setorIds'],
      [{ setorIds: [String(setor.id)] }, 'setorIds.0'],
      [{ setorIds: [0] }, 'setorIds.0'],
    ] as const) {
      const resposta = await pedir('put', `/usuarios/${gestor.id}/setores`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map((detalhe) => detalhe.campo),
        JSON.stringify(corpo),
      ).toEqual([campo])
    }

    const inexistente = await pedir('put', '/usuarios/999/setores', token).send({ setorIds: [setor.id] })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente).mensagem).toBe(MENSAGEM_NAO_ENCONTRADO)
  })
})

describe('PATCH /usuarios/:id/status', () => {
  it('desativar derruba as sessões na hora, e a conta inativa só volta a entrar depois de ativada', async () => {
    const admin = await superAdmin()
    const gestor = await criarUsuario({ perfil: 'GESTOR', email: 'gestor@hospital.test' })
    const noCelular = await sessaoDe(gestor.email)
    const noComputador = await sessaoDe(gestor.email)

    const desativar = await pedir('patch', `/usuarios/${gestor.id}/status`, admin.token).send({
      ativo: false,
    })

    expect(desativar.status).toBe(204)
    expect((await noBanco(gestor.id))?.ativo).toBe(false)
    // As duas sessões caem: o refresh é recusado, e o token de acesso, ainda no prazo, também.
    for (const sessao of [noCelular, noComputador]) {
      const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie(sessao.refresh))
      expect(refresh.status).toBe(401)
      expect((await pedir('get', '/setores', sessao.tokenAcesso)).status).toBe(401)
    }
    const sessoes = await prisma.refreshToken.findMany({ where: { usuarioId: gestor.id } })
    expect(sessoes.every(({ revogadoEm }) => revogadoEm !== null)).toBe(true)
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: gestor.email, senha: SENHA_DE_TESTE })
    expect(login.status).toBe(401)
    expect(erroDe(login).mensagem).toBe('E-mail ou senha incorretos.')

    const ativar = await pedir('patch', `/usuarios/${gestor.id}/status`, admin.token).send({ ativo: true })
    expect(ativar.status).toBe(204)
    await expect(sessaoDe(gestor.email)).resolves.toMatchObject({ tokenAcesso: expect.any(String) })

    const linha = {
      usuarioId: admin.usuarioId,
      acao: 'alteracao_de_status_de_usuario',
      entidade: 'usuarios',
      entidadeId: String(gestor.id),
    }
    expect(await auditoria()).toEqual([
      { ...linha, dados: { ativo: false } },
      { ...linha, dados: { ativo: true } },
    ])
  })

  it('ninguém desativa a própria conta: 409; a mesma situação: 204, sem gravar nem ir para a auditoria', async () => {
    const admin = await superAdmin()
    const inativo = await criarUsuario({ ativo: false })

    const propria = await pedir('patch', `/usuarios/${admin.usuarioId}/status`, admin.token).send({
      ativo: false,
    })
    expect(propria.status).toBe(409)
    expect(erroDe(propria)).toMatchObject({
      codigo: 'CONFLITO',
      mensagem: 'Você não pode desativar a própria conta.',
    })
    expect((await noBanco(admin.usuarioId))?.ativo).toBe(true)
    expect((await pedir('get', '/usuarios', admin.token)).status).toBe(200)

    for (const [id, ativo] of [
      [admin.usuarioId, true],
      [inativo.id, false],
    ] as const) {
      const antes = await noBanco(id)

      const resposta = await pedir('patch', `/usuarios/${id}/status`, admin.token).send({ ativo })

      expect(resposta.status).toBe(204)
      expect(await noBanco(id)).toEqual(antes)
    }
    expect(await auditoria()).toEqual([])
  })

  it('ativo que não é booleano: 400; conta inexistente: 404', async () => {
    const { token } = await superAdmin()
    const pessoa = await criarUsuario()

    for (const corpo of [{}, { ativo: 'false' }, { ativa: false }]) {
      const resposta = await pedir('patch', `/usuarios/${pessoa.id}/status`, token).send(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(400)
      expect(
        erroDe(resposta).detalhes.map(({ campo }) => campo),
        JSON.stringify(corpo),
      ).toEqual(['ativo'])
    }
    expect((await noBanco(pessoa.id))?.ativo).toBe(true)

    const inexistente = await pedir('patch', '/usuarios/999/status', token).send({ ativo: false })
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente).mensagem).toBe(MENSAGEM_NAO_ENCONTRADO)
  })
})

describe('POST /usuarios/:id/redefinir-senha', () => {
  it('gera outra senha provisória: a antiga deixa de valer, a troca volta a ser obrigatória e as sessões caem', async () => {
    const admin = await superAdmin()
    const gestor = await criarUsuario({ perfil: 'GESTOR', email: 'gestor@hospital.test' })
    const sessaoAntiga = await sessaoDe(gestor.email)

    const resposta = await pedir('post', `/usuarios/${gestor.id}/redefinir-senha`, admin.token)

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    const { senhaProvisoria } = dadosDe<{ senhaProvisoria: string }>(resposta)
    expect(Object.keys(resposta.body.data)).toEqual(['senhaProvisoria'])
    expect(senhaSegueARegra(senhaProvisoria)).toBe(true)
    expect((await noBanco(gestor.id))?.trocarSenha).toBe(true)

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(sessaoAntiga.refresh))
    expect(refresh.status).toBe(401)
    const comASenhaAntiga = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: gestor.email, senha: SENHA_DE_TESTE })
    expect(comASenhaAntiga.status).toBe(401)

    const comANova = await sessaoDe(gestor.email, senhaProvisoria)
    const painel = await pedir('get', '/setores', comANova.tokenAcesso)
    expect(painel.status).toBe(403)
    expect(erroDe(painel).mensagem).toBe(MENSAGEM_SENHA_PROVISORIA)

    expect(await auditoria()).toEqual([
      {
        usuarioId: admin.usuarioId,
        acao: 'redefinicao_de_senha',
        entidade: 'usuarios',
        entidadeId: String(gestor.id),
        dados: null,
      },
    ])
    expect(JSON.stringify(await prisma.auditoria.findMany())).not.toContain(senhaProvisoria)
  })

  it('conta inexistente: 404; ID inválido: 400', async () => {
    const { token } = await superAdmin()

    const inexistente = await pedir('post', '/usuarios/999/redefinir-senha', token)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: MENSAGEM_NAO_ENCONTRADO })

    const invalido = await pedir('post', '/usuarios/0/redefinir-senha', token)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([{ campo: 'id', mensagem: MENSAGEM_ID }])
    expect(await auditoria()).toEqual([])
  })
})
