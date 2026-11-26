import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { CONFIGURACOES_PADRAO } from '../../src/shared/constants/configuracoes'
import { decifrar } from '../../src/shared/security/crypto'
import { hashDoToken } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { limparBanco } from '../helpers/banco'

// Cada teste ganha um app novo, com o contador do limite de envios zerado.
let app: ReturnType<typeof createApp>

const JA_ENVIADA = 'Esta avaliação já foi enviada. Obrigado por responder!'
const SETOR_INDISPONIVEL = 'Este setor não está recebendo avaliações agora'
const LIMITE = 'Muitas avaliações enviadas desta rede. Espere alguns minutos e tente de novo.'
const IP_DO_PACIENTE = '198.51.100.7'
/** Um telefone inventado, com a máscara do front. */
const TELEFONE = '(51) 99876-5432'

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

interface CriadaDoSetor {
  slug: string
  id: number
  classificacao: string
  tokenComplemento: string
  expiraEm: string
}

function criadasDe(resposta: request.Response): CriadaDoSetor[] {
  return (resposta.body as { data: CriadaDoSetor[] }).data
}

function abrirGeral() {
  return request(app).get('/api/v1/publico/pesquisa')
}

function enviarGeral(corpo: object, ip = IP_DO_PACIENTE) {
  return request(app).post('/api/v1/publico/respostas').set('X-Forwarded-For', ip).send(corpo)
}

function enviarAoSetor(slug: string, corpo: object, ip = IP_DO_PACIENTE) {
  return request(app).post(`/api/v1/publico/setores/${slug}/respostas`).set('X-Forwarded-For', ip).send(corpo)
}

interface SetorDoEnvio {
  slug: string
  chaveIdempotencia?: string
  itens?: object[]
}

/** Um envio geral válido, só com a nota e uma chave nova por setor, que cada teste muda no que precisa. */
function envioGeral(turnoId: number, setores: SetorDoEnvio[], mudancas: object = {}) {
  return {
    canal: 'WEB',
    dataAtendimento: '2026-11-20',
    turnoId,
    nps: 9,
    setores: setores.map(({ slug, chaveIdempotencia = randomUUID(), itens = [] }) => ({
      slug,
      chaveIdempotencia,
      itens,
    })),
    ...mudancas,
  }
}

/** Dois setores ativos, um turno e uma categoria, para os envios. */
async function cenario() {
  const [pronto, raioX, turno, categoria] = await Promise.all([
    criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' }),
    criarSetor({ nome: 'Raio-X', slug: 'raio-x' }),
    criarTurno(),
    criarCategoria(),
  ])
  return { pronto, raioX, turno, categoria }
}

describe('GET /publico/pesquisa', () => {
  it('sem login: os setores ativos em ordem alfabética, cada um com as perguntas ativas na ordem, e os textos', async () => {
    const categoria = await criarCategoria()
    // A ordem é a do português: "Ética" fica entre "Enfermaria" e "Farmácia".
    const farmacia = await criarSetor({ nome: 'Farmácia', slug: 'farmacia' })
    const etica = await criarSetor({ nome: 'Ética', slug: 'etica', descricao: 'Comissão de ética' })
    const enfermaria = await criarSetor({ nome: 'Enfermaria', slug: 'enfermaria', descricao: 'Quartos' })
    const desativado = await criarSetor({ nome: 'Almoxarifado', slug: 'almoxarifado', ativo: false })
    const segunda = await criarPergunta({ setorId: enfermaria.id, categoriaId: categoria.id, ordem: 2 })
    const primeira = await criarPergunta({
      setorId: enfermaria.id,
      categoriaId: categoria.id,
      ordem: 1,
      tipo: 'SIM_NAO',
    })
    await criarPergunta({ setorId: enfermaria.id, categoriaId: categoria.id, ordem: 0, ativa: false })
    const multipla = await criarPergunta({
      setorId: etica.id,
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
    })
    await criarPergunta({ setorId: desativado.id, categoriaId: categoria.id })
    const turno = await criarTurno({ nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' })
    await prisma.configuracao.create({ data: { chave: 'nps_texto', valor: 'De 0 a 10, você indicaria?' } })

    const resposta = await abrirGeral()

    expect(resposta.status).toBe(200)
    // O `toEqual` não aceita campo a mais: nem o ID do setor, nem a categoria ou a ordem das perguntas.
    expect(resposta.body).toEqual({
      data: {
        setores: [
          {
            nome: 'Enfermaria',
            slug: 'enfermaria',
            descricao: 'Quartos',
            perguntas: [
              { id: primeira.id, texto: primeira.texto, tipo: 'SIM_NAO', opcoes: null },
              { id: segunda.id, texto: segunda.texto, tipo: 'ESCALA_1_5', opcoes: null },
            ],
          },
          {
            nome: 'Ética',
            slug: 'etica',
            descricao: 'Comissão de ética',
            perguntas: [
              { id: multipla.id, texto: multipla.texto, tipo: 'MULTIPLA_ESCOLHA', opcoes: ['Sim', 'Não'] },
            ],
          },
          { nome: 'Farmácia', slug: farmacia.slug, descricao: null, perguntas: [] },
        ],
        turnos: [{ id: turno.id, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' }],
        npsTexto: 'De 0 a 10, você indicaria?',
        textoLimiteCaracteres: CONFIGURACOES_PADRAO.texto_limite_caracteres,
      },
    })
  })

  it('sem nenhum setor ativo, a lista vem vazia', async () => {
    await criarSetor({ ativo: false })

    const resposta = await abrirGeral()

    expect(resposta.status).toBe(200)
    expect((resposta.body as { data: { setores: unknown[] } }).data.setores).toEqual([])
  })

  it('a abertura não entra no limite de envios', async () => {
    for (let aberturas = 0; aberturas < 31; aberturas += 1) await abrirGeral().expect(200)
  })
})

describe('POST /publico/respostas', () => {
  it('grava uma avaliação por setor, com a mesma nota, data, turno e canal, e as devolve na ordem do pedido', async () => {
    const { pronto, raioX, turno, categoria } = await cenario()
    const recepcao = await criarPergunta({
      setorId: pronto.id,
      categoriaId: categoria.id,
      texto: 'Como foi a recepção?',
    })
    const exame = await criarPergunta({
      setorId: raioX.id,
      categoriaId: categoria.id,
      texto: 'Como foi o exame?',
    })
    const orientou = await criarPergunta({ setorId: raioX.id, categoriaId: categoria.id, tipo: 'SIM_NAO' })
    const corpo = envioGeral(turno.id, [
      {
        slug: 'raio-x',
        itens: [
          { perguntaId: exame.id, valorNumero: 2 },
          { perguntaId: orientou.id, valorTexto: 'SIM' },
        ],
      },
      { slug: 'pronto-atendimento', itens: [{ perguntaId: recepcao.id, valorNumero: 5 }] },
    ])

    const resposta = await enviarGeral(corpo)

    expect(resposta.status).toBe(201)
    expect(resposta.headers['cache-control']).toBe('no-store')
    const criadas = criadasDe(resposta)
    // Cada setor é classificado pelas próprias notas: o 2 do exame não pesa na avaliação do Pronto Atendimento.
    expect(criadas).toEqual([
      {
        slug: 'raio-x',
        id: expect.any(Number) as number,
        classificacao: 'BAIXA',
        tokenComplemento: expect.stringMatching(/^[\w-]{43}$/) as string,
        expiraEm: expect.any(String) as string,
      },
      {
        slug: 'pronto-atendimento',
        id: expect.any(Number) as number,
        classificacao: 'NORMAL',
        tokenComplemento: expect.stringMatching(/^[\w-]{43}$/) as string,
        expiraEm: expect.any(String) as string,
      },
    ])
    const [doRaioX, doPronto] = criadas as [CriadaDoSetor, CriadaDoSetor]
    expect(doRaioX.tokenComplemento).not.toBe(doPronto.tokenComplemento)

    const gravadas = await prisma.resposta.findMany({
      orderBy: { id: 'asc' },
      include: { itens: { orderBy: { id: 'asc' }, omit: { id: true, respostaId: true } } },
    })
    expect(gravadas).toMatchObject([
      {
        id: doRaioX.id,
        setorId: raioX.id,
        canal: 'WEB',
        dataAtendimento: new Date('2026-11-20T00:00:00Z'),
        turnoId: turno.id,
        nps: 9,
        classificacao: 'BAIXA',
        chaveIdempotencia: corpo.setores[0]!.chaveIdempotencia,
        tokenComplementoHash: hashDoToken(doRaioX.tokenComplemento),
        tokenComplementoExpiraEm: new Date(doRaioX.expiraEm),
        itens: [
          {
            perguntaId: exame.id,
            categoriaId: categoria.id,
            perguntaTexto: 'Como foi o exame?',
            tipo: 'ESCALA_1_5',
            valorNumero: 2,
            valorTexto: null,
          },
          {
            perguntaId: orientou.id,
            categoriaId: categoria.id,
            perguntaTexto: orientou.texto,
            tipo: 'SIM_NAO',
            valorNumero: null,
            valorTexto: 'SIM',
          },
        ],
      },
      {
        id: doPronto.id,
        setorId: pronto.id,
        nps: 9,
        classificacao: 'NORMAL',
        chaveIdempotencia: corpo.setores[1]!.chaveIdempotencia,
        tokenComplementoHash: hashDoToken(doPronto.tokenComplemento),
        itens: [{ perguntaId: recepcao.id, perguntaTexto: 'Como foi a recepção?', valorNumero: 5 }],
      },
    ])
    expect(JSON.stringify(gravadas)).not.toContain(doRaioX.tokenComplemento)
  })

  it('aceita setores sem nenhuma pergunta respondida: só a nota, que classifica todos', async () => {
    const { turno } = await cenario()

    const resposta = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'pronto-atendimento' }, { slug: 'raio-x' }], { nps: 2 }),
    )

    expect(resposta.status).toBe(201)
    expect(criadasDe(resposta).map(({ classificacao }) => classificacao)).toEqual([
      'BAIXISSIMA',
      'BAIXISSIMA',
    ])
    expect(await prisma.resposta.count()).toBe(2)
  })

  it('turno e itens errados: um detalhe por problema, no caminho do setor e do item, sem gravar nada', async () => {
    const { pronto, raioX, turno, categoria } = await cenario()
    const doPronto = await criarPergunta({ setorId: pronto.id, categoriaId: categoria.id })
    const doRaioX = await criarPergunta({ setorId: raioX.id, categoriaId: categoria.id })

    const resposta = await enviarGeral(
      envioGeral(turno.id + 100, [
        // A pergunta do Raio-X não faz parte da pesquisa do Pronto Atendimento, e vice-versa.
        { slug: 'pronto-atendimento', itens: [{ perguntaId: doRaioX.id, valorNumero: 4 }] },
        {
          slug: 'raio-x',
          itens: [
            { perguntaId: doRaioX.id, valorNumero: 7 },
            { perguntaId: doPronto.id, valorNumero: 4 },
          ],
        },
      ]),
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'turnoId', mensagem: 'Escolha o turno do atendimento' },
      { campo: 'setores.0.itens.0', mensagem: 'Esta pergunta não faz parte da pesquisa' },
      { campo: 'setores.1.itens.0.valorNumero', mensagem: 'Escolha uma nota de 1 a 5' },
      { campo: 'setores.1.itens.1', mensagem: 'Esta pergunta não faz parte da pesquisa' },
    ])
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('setor inexistente ou desativado: 400 no setor da posição, sem gravar os outros', async () => {
    const { turno } = await cenario()
    await criarSetor({ slug: 'em-reforma', ativo: false })

    const resposta = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'pronto-atendimento' }, { slug: 'em-reforma' }, { slug: 'nao-existe' }]),
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'setores.1.slug', mensagem: SETOR_INDISPONIVEL },
      { campo: 'setores.2.slug', mensagem: SETOR_INDISPONIVEL },
    ])
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('setor ou chave repetidos e lista vazia, ausente ou grande demais: 400, sem gravar', async () => {
    const { turno } = await cenario()
    const chave = randomUUID()
    const vinteEUm = Array.from({ length: 21 }, (_, indice) => ({ slug: `setor-${indice}` }))
    const { setores: _semSetores, ...semSetores } = envioGeral(turno.id, [])

    const casos: [object, { campo: string; mensagem: string }[]][] = [
      [
        envioGeral(turno.id, [{ slug: 'raio-x' }, { slug: 'pronto-atendimento' }, { slug: 'raio-x' }]),
        [{ campo: 'setores.2.slug', mensagem: 'Este setor foi escolhido mais de uma vez' }],
      ],
      [
        envioGeral(turno.id, [
          { slug: 'raio-x', chaveIdempotencia: chave },
          { slug: 'pronto-atendimento', chaveIdempotencia: chave },
        ]),
        [
          {
            campo: 'setores.1.chaveIdempotencia',
            mensagem: 'Use uma chave de envio diferente em cada setor',
          },
        ],
      ],
      [envioGeral(turno.id, []), [{ campo: 'setores', mensagem: 'Escolha pelo menos um setor' }]],
      [semSetores, [{ campo: 'setores', mensagem: 'Escolha pelo menos um setor' }]],
      [envioGeral(turno.id, vinteEUm), [{ campo: 'setores', mensagem: 'Escolha no máximo 20 setores' }]],
    ]
    for (const [corpo, detalhes] of casos) {
      const resposta = await enviarGeral(corpo)

      expect(resposta.status).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual(detalhes)
    }
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('nota, canal, chave e campo isca seguem as regras do envio de um setor', async () => {
    const { turno } = await cenario()

    const resposta = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'raio-x', chaveIdempotencia: 'abc' }], {
        canal: 'WHATSAPP',
        nps: undefined,
        site: 'https://exemplo.com',
      }),
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'canal', mensagem: 'Canal inválido' },
      { campo: 'nps', mensagem: 'Obrigatório, de 0 a 10' },
      { campo: 'site', mensagem: 'Deixe este campo em branco' },
      { campo: 'setores.0.chaveIdempotencia', mensagem: 'Chave de envio inválida' },
    ])
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('as mesmas chaves de novo devolvem as avaliações gravadas, com tokens novos no lugar dos anteriores', async () => {
    const { turno } = await cenario()
    const corpo = envioGeral(turno.id, [{ slug: 'raio-x' }, { slug: 'pronto-atendimento' }], { nps: 2 })

    const primeiras = criadasDe(await enviarGeral(corpo))
    // O reenvio pode até chegar diferente: vale o que foi gravado.
    const reenvio = await enviarGeral({ ...corpo, nps: 10 })

    expect(reenvio.status).toBe(201)
    const segundas = criadasDe(reenvio)
    expect(segundas.map(({ slug, id, classificacao }) => ({ slug, id, classificacao }))).toEqual(
      primeiras.map(({ slug, id, classificacao }) => ({ slug, id, classificacao })),
    )
    expect(await prisma.resposta.count()).toBe(2)
    for (const [indice, segunda] of segundas.entries()) {
      expect(segunda.tokenComplemento).not.toBe(primeiras[indice]!.tokenComplemento)
      const gravada = await prisma.resposta.findUniqueOrThrow({ where: { id: segunda.id } })
      expect(gravada).toMatchObject({ nps: 2, tokenComplementoHash: hashDoToken(segunda.tokenComplemento) })
    }
  })

  it('parte das chaves já gravada, chave de outro setor ou avaliação já complementada: 409, sem gravar', async () => {
    const { turno } = await cenario()
    const chave = randomUUID()
    const { id } = criadasDe(
      await enviarGeral(envioGeral(turno.id, [{ slug: 'pronto-atendimento', chaveIdempotencia: chave }])),
    )[0]!

    const parte = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'pronto-atendimento', chaveIdempotencia: chave }, { slug: 'raio-x' }]),
    )
    const noOutroSetor = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'raio-x', chaveIdempotencia: chave }]),
    )
    // O complemento usa o token e apaga o hash: não há mais o que trocar.
    await prisma.resposta.update({ where: { id }, data: { tokenComplementoHash: null } })
    const depoisDoComplemento = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'pronto-atendimento', chaveIdempotencia: chave }]),
    )

    for (const resposta of [parte, noOutroSetor, depoisDoComplemento]) {
      expect(resposta.status).toBe(409)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'CONFLITO', mensagem: JA_ENVIADA })
    }
    expect(await prisma.resposta.count()).toBe(1)
  })

  it('toque duplo: dois envios iguais ao mesmo tempo gravam as avaliações uma vez só', async () => {
    const { turno } = await cenario()
    const corpo = envioGeral(turno.id, [{ slug: 'raio-x' }, { slug: 'pronto-atendimento' }])

    const [a, b] = await Promise.all([enviarGeral(corpo), enviarGeral(corpo)])

    expect([a.status, b.status]).toEqual([201, 201])
    expect(criadasDe(a).map(({ id }) => id)).toEqual(criadasDe(b).map(({ id }) => id))
    expect(await prisma.resposta.count()).toBe(2)
  })

  it('o comentário e o telefone vão para a avaliação escolhida, com o token dela', async () => {
    const { turno } = await cenario()
    const [doRaioX, doPronto] = criadasDe(
      await enviarGeral(
        envioGeral(turno.id, [{ slug: 'raio-x' }, { slug: 'pronto-atendimento' }], { nps: 4 }),
      ),
    ) as [CriadaDoSetor, CriadaDoSetor]
    const complementar = (id: number, token: string) =>
      request(app)
        .post(`/api/v1/publico/respostas/${id}/complemento`)
        .set('X-Complemento-Token', token)
        .send({
          comentario: { tipo: 'RECLAMACAO', texto: 'Esperei muito pelo exame.' },
          contato: { telefone: TELEFONE, consentimento: true },
        })

    // O token de uma avaliação não serve para a outra.
    await complementar(doRaioX.id, doPronto.tokenComplemento).expect(401)
    await complementar(doRaioX.id, doRaioX.tokenComplemento).expect(204)

    const comentarios = await prisma.comentario.findMany()
    const contatos = await prisma.contatoRetorno.findMany()
    expect(comentarios).toMatchObject([{ respostaId: doRaioX.id, texto: 'Esperei muito pelo exame.' }])
    expect(contatos).toMatchObject([{ respostaId: doRaioX.id, telefoneFinal: '5432', status: 'NOVO' }])
    expect(decifrar(contatos[0]!.telefoneCifrado)).toBe('51998765432')
  })

  it('o IP do paciente não é gravado', async () => {
    const { turno } = await cenario()

    await enviarGeral(envioGeral(turno.id, [{ slug: 'raio-x' }]), IP_DO_PACIENTE).expect(201)

    const gravadas = await prisma.resposta.findMany({ include: { itens: true } })
    expect(JSON.stringify(gravadas)).not.toContain(IP_DO_PACIENTE)
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('limite de envios dividido com o envio de um setor', () => {
  it('30 envios do mesmo IP, somando as duas rotas, e o seguinte recebe 429; outro IP continua enviando', async () => {
    const { turno } = await cenario()

    // Os envios recusados também contam, e um envio geral conta uma vez só, com quantos setores tiver.
    for (let envios = 0; envios < 15; envios += 1) {
      await enviarAoSetor('raio-x', {}).expect(400)
      await enviarGeral({}).expect(400)
    }
    const geral = await enviarGeral(
      envioGeral(turno.id, [{ slug: 'raio-x' }, { slug: 'pronto-atendimento' }]),
    )
    const doSetor = await enviarAoSetor('raio-x', {})

    for (const bloqueado of [geral, doSetor]) {
      expect(bloqueado.status).toBe(429)
      expect(erroDe(bloqueado)).toMatchObject({ codigo: 'LIMITE_ATINGIDO', mensagem: LIMITE })
    }
    await enviarGeral(envioGeral(turno.id, [{ slug: 'raio-x' }]), '198.51.100.8').expect(201)
    expect(await prisma.resposta.count()).toBe(1)
  })
})
