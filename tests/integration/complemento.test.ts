import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { decifrar } from '../../src/shared/security/crypto'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { limparBanco } from '../helpers/banco'
import { criarLoggerDeTeste } from '../helpers/logger-de-teste'

// Cada teste ganha um app novo, com o contador do limite de envios zerado.
let app: ReturnType<typeof createApp>

const PRAZO_TERMINOU = 'O prazo para complementar esta avaliação terminou.'
const IP_DO_PACIENTE = '198.51.100.7'
/** Um telefone inventado, com a máscara do front, e os mesmos dígitos sem ela. */
const TELEFONE = '(51) 99876-5432'
const DIGITOS = '51998765432'

beforeEach(async () => {
  await limparBanco()
  app = createApp()
})

afterAll(async () => {
  await prisma.$disconnect()
})

interface ErroDaApi {
  codigo: string
  mensagem: string
  detalhes: { campo: string; mensagem: string }[]
}

function erroDe(resposta: request.Response): ErroDaApi {
  return (resposta.body as { erro: ErroDaApi }).erro
}

function enviar(slug: string, envio: object) {
  return request(app)
    .post(`/api/v1/publico/setores/${slug}/respostas`)
    .set('X-Forwarded-For', IP_DO_PACIENTE)
    .send(envio)
}

/**
 * Envia uma avaliação baixa de verdade, pela rota da pesquisa, e devolve o ID e o token de complemento dela,
 * com o setor e o corpo do envio, para um reenvio.
 */
async function avaliacao() {
  const [setor, turno] = await Promise.all([criarSetor(), criarTurno()])
  const envio = {
    chaveIdempotencia: randomUUID(),
    canal: 'WEB',
    dataAtendimento: '2026-11-20',
    turnoId: turno.id,
    itens: [],
    nps: 3,
  }
  const resposta = await enviar(setor.slug, envio).expect(201)
  const { id, tokenComplemento } = (resposta.body as { data: { id: number; tokenComplemento: string } }).data
  return { id, token: tokenComplemento, slug: setor.slug, envio }
}

function complementar(id: number | string, token: string | null, corpo: object, emApp = app) {
  const pedido = request(emApp).post(`/api/v1/publico/respostas/${id}/complemento`)
  if (token !== null) pedido.set('X-Complemento-Token', token)
  return pedido.send(corpo)
}

const COMENTARIO = { tipo: 'RECLAMACAO', texto: 'Esperei muito na triagem.' }
const CONTATO = { telefone: TELEFONE, consentimento: true }

/** O que ficou gravado na avaliação: o token, o comentário e o pedido de retorno. */
function gravado(id: number) {
  return prisma.resposta.findUniqueOrThrow({
    where: { id },
    select: {
      tokenComplementoHash: true,
      tokenComplementoExpiraEm: true,
      comentario: true,
      contato: true,
    },
  })
}

function esperarPrazoTerminou(resposta: request.Response) {
  expect(resposta.status).toBe(401)
  expect(erroDe(resposta)).toMatchObject({ codigo: 'NAO_AUTENTICADO', mensagem: PRAZO_TERMINOU })
}

async function esperarNadaGravado() {
  expect(await prisma.comentario.count()).toBe(0)
  expect(await prisma.contatoRetorno.count()).toBe(0)
}

describe('POST /publico/respostas/:id/complemento', () => {
  it('só o comentário: 204, grava o tipo e o texto sem os espaços das pontas e usa o token', async () => {
    const { id, token } = await avaliacao()

    const resposta = await complementar(id, token, {
      comentario: { tipo: 'ELOGIO', texto: '  A enfermagem foi muito atenciosa.  ' },
    })

    expect(resposta.status).toBe(204)
    expect(resposta.text).toBe('')
    expect(await gravado(id)).toMatchObject({
      tokenComplementoHash: null,
      tokenComplementoExpiraEm: null,
      comentario: { tipo: 'ELOGIO', texto: 'A enfermagem foi muito atenciosa.', categoriaId: null },
      contato: null,
    })
  })

  it('só o telefone: grava o número cifrado, só com os dígitos, os 4 últimos em claro, a hora do consentimento e o status NOVO', async () => {
    const { id, token } = await avaliacao()
    const antes = Date.now()

    await complementar(id, token, { contato: CONTATO }).expect(204)

    const { contato, comentario, tokenComplementoHash } = await gravado(id)
    expect(comentario).toBeNull()
    expect(tokenComplementoHash).toBeNull()
    expect(contato).toMatchObject({
      telefoneFinal: '5432',
      status: 'NOVO',
      responsavelId: null,
      observacoes: null,
      resolvidoEm: null,
    })
    expect(contato!.consentimentoEm.getTime()).toBeGreaterThanOrEqual(antes)
    expect(contato!.consentimentoEm.getTime()).toBeLessThanOrEqual(Date.now())
    expect(contato!.telefoneCifrado).toMatch(/^v1\./)
    expect(contato!.telefoneCifrado).not.toContain(DIGITOS)
    expect(decifrar(contato!.telefoneCifrado)).toBe(DIGITOS)
  })

  it('o comentário e o telefone juntos, numa chamada só', async () => {
    const { id, token } = await avaliacao()

    await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }).expect(204)

    const { comentario, contato } = await gravado(id)
    expect(comentario).toMatchObject(COMENTARIO)
    expect(contato).toMatchObject({ telefoneFinal: '5432', status: 'NOVO' })
    expect(decifrar(contato!.telefoneCifrado)).toBe(DIGITOS)
  })

  it('aceita o telefone fixo e o celular, com ou sem a máscara', async () => {
    for (const telefone of ['51998765432', '(51) 3333-4444', '51 3333 4444']) {
      const { id, token } = await avaliacao()

      await complementar(id, token, { contato: { telefone, consentimento: true } }).expect(204)

      const { contato } = await gravado(id)
      expect(decifrar(contato!.telefoneCifrado)).toBe(telefone.replace(/\D/g, ''))
    }
  })

  it('token vencido: 401, sem gravar nada', async () => {
    const { id, token } = await avaliacao()
    await prisma.resposta.update({
      where: { id },
      data: { tokenComplementoExpiraEm: new Date(Date.now() - 1000) },
    })

    esperarPrazoTerminou(await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }))
    await esperarNadaGravado()
  })

  it('vence 30 minutos depois do envio, e não antes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { id, token } = await avaliacao()
      vi.setSystemTime(Date.now() + 29 * 60 * 1000)
      await complementar(id, token, { comentario: COMENTARIO }).expect(204)

      const outra = await avaliacao()
      vi.setSystemTime(Date.now() + 30 * 60 * 1000 + 1)
      esperarPrazoTerminou(await complementar(outra.id, outra.token, { comentario: COMENTARIO }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('token reutilizado: o segundo uso dá 401, mesmo dentro do prazo, e não muda o que foi gravado', async () => {
    const { id, token } = await avaliacao()
    await complementar(id, token, { comentario: COMENTARIO }).expect(204)

    const segunda = await complementar(id, token, {
      comentario: { tipo: 'ELOGIO', texto: 'Outro texto' },
      contato: CONTATO,
    })

    esperarPrazoTerminou(segunda)
    expect(await gravado(id)).toMatchObject({ comentario: COMENTARIO, contato: null })
    expect(await prisma.comentario.count()).toBe(1)
  })

  it('dois usos ao mesmo tempo do mesmo token: um grava, o outro dá 401', async () => {
    const { id, token } = await avaliacao()

    const respostas = await Promise.all([
      complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }),
      complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }),
    ])

    expect(respostas.map(({ status }) => status).sort()).toEqual([204, 401])
    expect(await prisma.comentario.count()).toBe(1)
    expect(await prisma.contatoRetorno.count()).toBe(1)
  })

  it('se a gravação falha no meio, nada fica gravado e o token continua valendo', async () => {
    const { id, token } = await avaliacao()
    // Um pedido de retorno que já existe faz o do complemento cair no único de resposta_id, depois do
    // comentário: a transação desfaz o comentário e o uso do token.
    const existente = await prisma.contatoRetorno.create({
      data: {
        respostaId: id,
        telefoneCifrado: 'v1.x.x.x',
        telefoneFinal: '0000',
        consentimentoEm: new Date(),
      },
    })

    const falha = await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO })

    expect(falha.status).toBe(500)
    expect(falha.text).not.toContain(DIGITOS)
    expect(await gravado(id)).toMatchObject({
      tokenComplementoHash: expect.any(String) as string,
      comentario: null,
    })
    await prisma.contatoRetorno.delete({ where: { id: existente.id } })
    await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }).expect(204)
  })

  it('sem o token, com um token inventado, com o de outra avaliação ou numa avaliação que não existe: 401', async () => {
    const primeira = await avaliacao()
    const segunda = await avaliacao()
    const corpo = { comentario: COMENTARIO }

    for (const resposta of [
      await complementar(primeira.id, null, corpo),
      await complementar(primeira.id, '', corpo),
      await complementar(primeira.id, 'token-inventado', corpo),
      await complementar(primeira.id, segunda.token, corpo),
      await complementar(segunda.id + 100, segunda.token, corpo),
    ]) {
      esperarPrazoTerminou(resposta)
    }
    await esperarNadaGravado()
    // O token recusado noutra avaliação continua valendo na dele.
    await complementar(segunda.id, segunda.token, corpo).expect(204)
  })

  it('consentimento ausente ou diferente de true: 400 em contato.consentimento, sem gravar nem gastar o token', async () => {
    const { id, token } = await avaliacao()

    for (const contato of [{ telefone: TELEFONE }, { telefone: TELEFONE, consentimento: false }]) {
      const resposta = await complementar(id, token, { comentario: COMENTARIO, contato })
      expect(resposta.status).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        {
          campo: 'contato.consentimento',
          mensagem: 'O consentimento é obrigatório para guardar o telefone',
        },
      ])
    }
    await esperarNadaGravado()

    await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }).expect(204)
  })

  it('telefone sem DDD, com dígitos a mais ou a menos, ou com letras: 400 em contato.telefone', async () => {
    const { id, token } = await avaliacao()

    for (const telefone of [
      '99876-5432',
      '519987654',
      '519987654321',
      '(51) 9987A-5432',
      '01998765432',
      51998765432,
    ]) {
      const resposta = await complementar(id, token, { contato: { telefone, consentimento: true } })
      expect(resposta.status).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([
        { campo: 'contato.telefone', mensagem: 'Informe o telefone com DDD, como (51) 99999-0000' },
      ])
    }
    await esperarNadaGravado()
  })

  it('tipo fora da lista e texto vazio: um detalhe por campo, em comentario.tipo e comentario.texto', async () => {
    const { id, token } = await avaliacao()

    const resposta = await complementar(id, token, { comentario: { tipo: 'ELOGIOS', texto: '   ' } })

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'comentario.tipo', mensagem: 'Escolha o tipo do comentário' },
      { campo: 'comentario.texto', mensagem: 'Escreva o comentário' },
    ])
    for (const tipo of ['ELOGIO', 'RECLAMACAO', 'SUGESTAO', 'OUTRO']) {
      const outra = await avaliacao()
      await complementar(outra.id, outra.token, { comentario: { tipo, texto: 'Texto' } }).expect(204)
    }
  })

  it('texto acima do limite das configurações: 400 em comentario.texto, sem gastar o token; no limite, passa', async () => {
    await prisma.configuracao.create({ data: { chave: 'texto_limite_caracteres', valor: 20 } })
    const { id, token } = await avaliacao()

    const longo = await complementar(id, token, { comentario: { tipo: 'OUTRO', texto: 'x'.repeat(21) } })

    expect(longo.status).toBe(400)
    expect(erroDe(longo).detalhes).toEqual([
      { campo: 'comentario.texto', mensagem: 'O comentário pode ter até 20 caracteres' },
    ])
    await esperarNadaGravado()
    // Os espaços das pontas não contam.
    await complementar(id, token, { comentario: { tipo: 'OUTRO', texto: ` ${'x'.repeat(20)} ` } }).expect(204)
  })

  it('corpo sem o comentário nem o telefone: 400 em body', async () => {
    const { id, token } = await avaliacao()

    const resposta = await complementar(id, token, {})

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'body', mensagem: 'Envie o comentário, o telefone ou os dois' },
    ])
  })

  it('o telefone não aparece no log, nas respostas de erro nem em claro no banco', async () => {
    const { logger, linhas, texto } = criarLoggerDeTeste()
    const comLog = createApp({ logger })
    const { id, token } = await avaliacao()
    const invalido = '(51) 99876-54321'

    const respostas = [
      await complementar(id, token, { contato: { telefone: invalido, consentimento: true } }, comLog),
      await complementar(id, token, { contato: { telefone: TELEFONE } }, comLog),
      await complementar(id, 'token-inventado', { contato: CONTATO }, comLog),
      await complementar(id, token, { contato: CONTATO }, comLog),
      await complementar(id, token, { contato: CONTATO }, comLog),
    ]

    expect(respostas.map(({ status }) => status)).toEqual([400, 400, 401, 204, 401])
    await vi.waitFor(() =>
      expect(linhas.filter(({ msg }) => msg === 'requisição concluída')).toHaveLength(respostas.length),
    )
    const tudo = [texto(), ...respostas.map(({ text }) => text), JSON.stringify(await gravado(id))].join('\n')
    for (const numero of [DIGITOS, TELEFONE, invalido.replace(/\D/g, '')]) {
      expect(tudo).not.toContain(numero)
    }
  })

  it('a avaliação complementada não ganha token novo: o reenvio com a mesma chave dá 409', async () => {
    const { id, token, slug, envio } = await avaliacao()
    await complementar(id, token, { comentario: COMENTARIO }).expect(204)

    const reenvio = await enviar(slug, envio)

    expect(reenvio.status).toBe(409)
    expect((await gravado(id)).tokenComplementoHash).toBeNull()
  })

  it('o reenvio troca o token: o anterior deixa de valer, e o novo vale', async () => {
    const { id, token, slug, envio } = await avaliacao()
    const reenvio = await enviar(slug, envio).expect(201)
    const novo = (reenvio.body as { data: { tokenComplemento: string } }).data.tokenComplemento

    esperarPrazoTerminou(await complementar(id, token, { comentario: COMENTARIO }))
    await complementar(id, novo, { comentario: COMENTARIO }).expect(204)
  })

  it('não grava o IP do paciente nem escreve na auditoria', async () => {
    const { id, token } = await avaliacao()

    await complementar(id, token, { comentario: COMENTARIO, contato: CONTATO }).expect(204)

    expect(JSON.stringify(await gravado(id))).not.toContain(IP_DO_PACIENTE)
    expect(await prisma.auditoria.count()).toBe(0)
  })
})
