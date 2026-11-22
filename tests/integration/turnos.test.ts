import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { PERFIS, type Perfil } from '../../src/shared/constants/perfis'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarTurno } from '../factories/turnos'
import { criarUsuario, type DadosDoUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

const app = createApp()

/** Os perfis sem `turnos:gerenciar`: só leem a lista. */
const SO_LEEM: Perfil[] = ['GESTOR', 'OUVIDORIA', 'VISUALIZADOR']

const MENSAGEM_HORA = 'Informe a hora, como 07:00'
const MENSAGEM_FIM_IGUAL = 'O fim precisa ser diferente do início'

const NOITE = { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' }

beforeEach(async () => {
  await limparBanco()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function tokenDe(dados: DadosDoUsuario = {}) {
  const usuario = await criarUsuario(dados)
  return emitirTokenDeAcesso(usuario.id)
}

function pedir(metodo: 'get' | 'post' | 'patch' | 'delete', caminho: string, token?: string) {
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

/** O turno como está no banco, no formato do contrato. */
function noBanco(id: number) {
  return prisma.turno.findUnique({
    where: { id },
    select: { id: true, nome: true, horaInicio: true, horaFim: true, ordem: true },
  })
}

describe('GET /turnos', () => {
  it('sem login: 401', async () => {
    const resposta = await pedir('get', '/turnos')

    expect(resposta.status).toBe(401)
    expect(erroDe(resposta).codigo).toBe('NAO_AUTENTICADO')
  })

  it('todos os perfis recebem a lista inteira, na ordem definida (não na do horário) e sem paginação', async () => {
    const noite = await criarTurno({ ...NOITE, ordem: 3 })
    const manha = await criarTurno({ nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 })
    // A madrugada começa antes de todos, mas foi posta no fim da lista.
    const madrugada = await criarTurno({ nome: 'Madrugada', horaInicio: '00:00', horaFim: '06:00', ordem: 4 })
    const tarde = await criarTurno({ nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00', ordem: 2 })
    // Na mesma posição, vale o mais antigo.
    const vespertino = await criarTurno({
      nome: 'Vespertino',
      horaInicio: '12:00',
      horaFim: '18:00',
      ordem: 2,
    })

    for (const perfil of PERFIS) {
      const resposta = await pedir('get', '/turnos', await tokenDe({ perfil }))

      expect(resposta.status, perfil).toBe(200)
      expect(resposta.body, perfil).toEqual({
        data: [
          { id: manha.id, nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 },
          { id: tarde.id, nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00', ordem: 2 },
          { id: vespertino.id, nome: 'Vespertino', horaInicio: '12:00', horaFim: '18:00', ordem: 2 },
          { id: noite.id, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 3 },
          { id: madrugada.id, nome: 'Madrugada', horaInicio: '00:00', horaFim: '06:00', ordem: 4 },
        ],
      })
    }
  })
})

describe('POST /turnos', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem criar nada', async () => {
    const semLogin = await pedir('post', '/turnos').send(NOITE)
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LEEM) {
      const resposta = await pedir('post', '/turnos', await tokenDe({ perfil })).send(NOITE)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta), perfil).toMatchObject({
        codigo: 'SEM_PERMISSAO',
        mensagem: 'Você não tem permissão para isso.',
      })
    }
    expect(await prisma.turno.count()).toBe(0)
  })

  it('o Super Admin cria o turno no fim da ordem, inclusive o que passa da meia-noite: 201 com o Turno', async () => {
    await criarTurno({ nome: 'Manhã', ordem: 4 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/turnos', token).send({ ...NOITE, nome: '  Noite ' })

    expect(resposta.status).toBe(201)
    const { id } = (resposta.body as { data: { id: number } }).data
    const esperado = { id, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 5 }
    expect(resposta.body).toEqual({ data: esperado })
    expect(await noBanco(id)).toEqual(esperado)
  })

  it('aceita as pontas do dia, de 00:00 a 23:59', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/turnos', token).send({
      nome: 'Dia inteiro menos um minuto',
      horaInicio: '00:00',
      horaFim: '23:59',
    })

    expect(resposta.status).toBe(201)
    expect(resposta.body.data).toMatchObject({ horaInicio: '00:00', horaFim: '23:59', ordem: 1 })
  })

  it('hora fora do formato HH:mm: 400 em horaInicio e em horaFim', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const hora of ['7:00', '24:00', '07:60', '0700', '07:00:00', '07h00', ' 07:00', '']) {
      const resposta = await pedir('post', '/turnos', token).send({
        nome: 'Manhã',
        horaInicio: hora,
        horaFim: hora,
      })

      expect(resposta.status, hora).toBe(400)
      expect(erroDe(resposta).detalhes, hora).toEqual([
        { campo: 'horaInicio', mensagem: MENSAGEM_HORA },
        { campo: 'horaFim', mensagem: MENSAGEM_HORA },
      ])
    }
    expect(await prisma.turno.count()).toBe(0)
  })

  it('fim igual ao início: 400 em horaFim', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('post', '/turnos', token).send({
      nome: 'Plantão',
      horaInicio: '07:00',
      horaFim: '07:00',
    })

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([{ campo: 'horaFim', mensagem: MENSAGEM_FIM_IGUAL }])
    expect(await prisma.turno.count()).toBe(0)
  })

  it('nome curto e campos ausentes: 400 em cada campo', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const curto = await pedir('post', '/turnos', token).send({ ...NOITE, nome: 'N' })
    expect(erroDe(curto).detalhes).toEqual([{ campo: 'nome', mensagem: 'Informe o nome do turno' }])

    const vazio = await pedir('post', '/turnos', token).send({})
    expect(erroDe(vazio).detalhes).toEqual([
      { campo: 'nome', mensagem: 'Obrigatório' },
      { campo: 'horaInicio', mensagem: 'Obrigatório' },
      { campo: 'horaFim', mensagem: 'Obrigatório' },
    ])
  })
})

describe('PATCH /turnos/:id', () => {
  it('sem login: 401; Gestor, Ouvidoria e Visualizador: 403, sem mudar nada', async () => {
    const turno = await criarTurno({ nome: 'Manhã' })
    const antes = await noBanco(turno.id)

    const semLogin = await pedir('patch', `/turnos/${turno.id}`).send(NOITE)
    expect(semLogin.status).toBe(401)

    for (const perfil of SO_LEEM) {
      const resposta = await pedir('patch', `/turnos/${turno.id}`, await tokenDe({ perfil })).send(NOITE)

      expect(resposta.status, perfil).toBe(403)
      expect(erroDe(resposta).codigo, perfil).toBe('SEM_PERMISSAO')
    }
    expect(await noBanco(turno.id)).toEqual(antes)
  })

  it('o Super Admin troca o nome e os horários: 200 com o Turno, e a ordem não muda', async () => {
    const turno = await criarTurno({ nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 2 })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const resposta = await pedir('patch', `/turnos/${turno.id}`, token).send({
      nome: ' Madrugada ',
      horaInicio: '23:00',
      horaFim: '05:30',
    })

    const esperado = { id: turno.id, nome: 'Madrugada', horaInicio: '23:00', horaFim: '05:30', ordem: 2 }
    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ data: esperado })
    expect(await noBanco(turno.id)).toEqual(esperado)
  })

  it('recebe o turno inteiro: sem o nome ou um dos horários, ou com o fim igual ao início, dá 400', async () => {
    const turno = await criarTurno({ nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00' })
    const antes = await noBanco(turno.id)
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const soNome = await pedir('patch', `/turnos/${turno.id}`, token).send({ nome: 'Matutino' })
    expect(soNome.status).toBe(400)
    expect(erroDe(soNome).detalhes).toEqual([
      { campo: 'horaInicio', mensagem: 'Obrigatório' },
      { campo: 'horaFim', mensagem: 'Obrigatório' },
    ])

    const fimIgual = await pedir('patch', `/turnos/${turno.id}`, token).send({
      nome: 'Manhã',
      horaInicio: '13:00',
      horaFim: '13:00',
    })
    expect(fimIgual.status).toBe(400)
    expect(erroDe(fimIgual).detalhes).toEqual([{ campo: 'horaFim', mensagem: MENSAGEM_FIM_IGUAL }])

    const horaErrada = await pedir('patch', `/turnos/${turno.id}`, token).send({
      ...NOITE,
      horaInicio: '19h',
    })
    expect(erroDe(horaErrada).detalhes).toEqual([{ campo: 'horaInicio', mensagem: MENSAGEM_HORA }])
    expect(await noBanco(turno.id)).toEqual(antes)
  })

  it('turno inexistente: 404; ID inválido: 400 em id', async () => {
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    const inexistente = await pedir('patch', '/turnos/1', token).send(NOITE)
    expect(inexistente.status).toBe(404)
    expect(erroDe(inexistente)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Turno não encontrado.' })

    const invalido = await pedir('patch', '/turnos/0', token).send(NOITE)
    expect(invalido.status).toBe(400)
    expect(erroDe(invalido).detalhes).toEqual([
      { campo: 'id', mensagem: 'O ID precisa ser um número inteiro positivo.' },
    ])
  })
})

describe('turnos não são desativados nem apagados', () => {
  it('não há rota para apagar nem para desativar, e um `ativo` na edição é ignorado', async () => {
    const turno = await criarTurno({ nome: 'Manhã' })
    const token = await tokenDe({ perfil: 'SUPER_ADMIN' })

    for (const [metodo, caminho] of [
      ['delete', `/turnos/${turno.id}`],
      ['patch', `/turnos/${turno.id}/status`],
    ] as const) {
      const resposta = await pedir(metodo, caminho, token).send({ ativo: false })

      expect(resposta.status, `${metodo} ${caminho}`).toBe(404)
      expect(erroDe(resposta).codigo).toBe('NAO_ENCONTRADO')
    }

    const edicao = await pedir('patch', `/turnos/${turno.id}`, token).send({ ...NOITE, ativo: false })
    expect(edicao.status).toBe(200)
    expect(edicao.body.data).not.toHaveProperty('ativo')
    expect(await prisma.turno.count()).toBe(1)
  })
})
