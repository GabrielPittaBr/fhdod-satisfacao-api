import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { CONFIGURACOES_PADRAO } from '../../src/shared/constants/configuracoes'
import { hojeEmBrasilia } from '../../src/shared/rules/calendario'
import { hashDoToken } from '../../src/shared/security/tokens'
import { criarCategoria } from '../factories/categorias'
import { criarPergunta } from '../factories/perguntas'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { limparBanco } from '../helpers/banco'

// Cada teste ganha um app novo, com o contador do limite de envios zerado.
let app: ReturnType<typeof createApp>

const INDISPONIVEL = 'Esta pesquisa não está disponível.'
const JA_ENVIADA = 'Esta avaliação já foi enviada. Obrigado por responder!'
const IP_DO_PACIENTE = '198.51.100.7'
/** O IP do RATE_LIMIT_ALLOWLIST dos testes (vitest.config.ts), no papel do IP do hospital. */
const IP_DO_HOSPITAL = '203.0.113.10'
const TRINTA_MINUTOS_MS = 30 * 60 * 1000

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

interface Criada {
  id: number
  classificacao: string
  tokenComplemento: string
  expiraEm: string
}

function criadaDe(resposta: request.Response): Criada {
  return (resposta.body as { data: Criada }).data
}

function abrir(slug: string) {
  return request(app).get(`/api/v1/publico/setores/${slug}/pesquisa`)
}

function enviar(slug: string, corpo: object, ip = IP_DO_PACIENTE) {
  return request(app).post(`/api/v1/publico/setores/${slug}/respostas`).set('X-Forwarded-For', ip).send(corpo)
}

/** Um envio válido, só com o NPS, que cada teste muda no que precisa. */
function envio(turnoId: number, mudancas: object = {}) {
  return {
    chaveIdempotencia: randomUUID(),
    canal: 'WEB',
    dataAtendimento: '2026-11-20',
    turnoId,
    itens: [],
    nps: 9,
    ...mudancas,
  }
}

/** Um setor ativo com um turno, para os envios. */
async function cenario() {
  const [setor, turno, categoria] = await Promise.all([criarSetor(), criarTurno(), criarCategoria()])
  return { setor, turno, categoria }
}

async function configurar(chave: string, valor: unknown) {
  await prisma.configuracao.create({ data: { chave, valor: valor as never } })
}

describe('GET /publico/setores/:slug/pesquisa', () => {
  it('sem login: o setor, as perguntas ativas na ordem, os turnos e os textos e tempos das configurações', async () => {
    const setor = await criarSetor({ nome: 'Pronto Atendimento', slug: 'pronto-atendimento' })
    const outro = await criarSetor()
    const categoria = await criarCategoria()
    const segunda = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      ordem: 2,
      tipo: 'SIM_NAO',
    })
    const primeira = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      ordem: 1,
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim', 'Não'],
    })
    await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ordem: 3, ativa: false })
    await criarPergunta({ setorId: outro.id, categoriaId: categoria.id, ordem: 0 })
    const tarde = await criarTurno({ nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00', ordem: 2 })
    const noite = await criarTurno({ nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 1 })
    await configurar('nps_texto', 'De 0 a 10, você indicaria o hospital?')
    await configurar('totem_reinicio_segundos', 10)

    const resposta = await abrir('pronto-atendimento')

    expect(resposta.status).toBe(200)
    // O `toEqual` não aceita campo a mais: os limites de nota baixa, a categoria e a ordem não vão para o front.
    expect(resposta.body).toEqual({
      data: {
        setor: { nome: 'Pronto Atendimento', slug: 'pronto-atendimento' },
        perguntas: [
          { id: primeira.id, texto: primeira.texto, tipo: 'MULTIPLA_ESCOLHA', opcoes: ['Sim', 'Não'] },
          { id: segunda.id, texto: segunda.texto, tipo: 'SIM_NAO', opcoes: null },
        ],
        turnos: [
          { id: noite.id, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' },
          { id: tarde.id, nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00' },
        ],
        // Do banco, quando a configuração existe; do padrão, quando falta.
        npsTexto: 'De 0 a 10, você indicaria o hospital?',
        textoLimiteCaracteres: CONFIGURACOES_PADRAO.texto_limite_caracteres,
        totem: { reinicioSegundos: 10, inatividadeSegundos: CONFIGURACOES_PADRAO.totem_inatividade_segundos },
      },
    })
  })

  it('setor inativo ou inexistente: 404 com a mensagem para o paciente', async () => {
    await criarSetor({ slug: 'em-reforma', ativo: false })

    for (const slug of ['em-reforma', 'nao-existe']) {
      const resposta = await abrir(slug)

      expect(resposta.status).toBe(404)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: INDISPONIVEL })
    }
  })
})

describe('POST /publico/setores/:slug/respostas', () => {
  it('só com o NPS: grava a avaliação e devolve a classificação e um token de 30 minutos, com só o hash no banco', async () => {
    const { setor, turno } = await cenario()
    const corpo = envio(turno.id, { canal: 'TOTEM', nps: 6 })
    const antes = Date.now()

    const resposta = await enviar(setor.slug, corpo)

    expect(resposta.status).toBe(201)
    expect(resposta.headers['cache-control']).toBe('no-store')
    const criada = criadaDe(resposta)
    expect(criada).toEqual({
      id: expect.any(Number) as number,
      classificacao: 'BAIXA',
      tokenComplemento: expect.stringMatching(/^[\w-]{43}$/) as string,
      expiraEm: expect.any(String) as string,
    })
    const expiraEm = new Date(criada.expiraEm).getTime()
    expect(expiraEm).toBeGreaterThanOrEqual(antes + TRINTA_MINUTOS_MS)
    expect(expiraEm).toBeLessThanOrEqual(Date.now() + TRINTA_MINUTOS_MS)

    const gravada = await prisma.resposta.findUniqueOrThrow({
      where: { id: criada.id },
      include: { itens: true },
    })
    expect(gravada).toMatchObject({
      setorId: setor.id,
      canal: 'TOTEM',
      dataAtendimento: new Date('2026-11-20T00:00:00Z'),
      turnoId: turno.id,
      nps: 6,
      classificacao: 'BAIXA',
      chaveIdempotencia: corpo.chaveIdempotencia,
      tokenComplementoHash: hashDoToken(criada.tokenComplemento),
      tokenComplementoExpiraEm: new Date(criada.expiraEm),
      itens: [],
    })
    expect(JSON.stringify(gravada)).not.toContain(criada.tokenComplemento)
  })

  it('grava um item por pergunta respondida, com o texto, a categoria e o tipo da pergunta daquele momento', async () => {
    const { setor, turno, categoria } = await cenario()
    const outraCategoria = await criarCategoria()
    const escala = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Como foi a recepção?',
    })
    const simNao = await criarPergunta({ setorId: setor.id, categoriaId: outraCategoria.id, tipo: 'SIM_NAO' })
    const multipla = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
    })
    const texto = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, tipo: 'TEXTO' })
    const pulada = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })

    const resposta = await enviar(
      setor.slug,
      envio(turno.id, {
        nps: 10,
        itens: [
          { perguntaId: escala.id, valorNumero: 4 },
          { perguntaId: simNao.id, valorTexto: 'NAO' },
          { perguntaId: multipla.id, valorTexto: 'Em parte' },
          { perguntaId: texto.id, valorTexto: '  A médica foi atenciosa.  ' },
        ],
      }),
    )

    expect(resposta.status).toBe(201)
    expect(criadaDe(resposta).classificacao).toBe('NORMAL')

    // Mudar a pergunta depois não muda o que foi respondido.
    await prisma.pergunta.update({
      where: { id: escala.id },
      data: { texto: 'Como foi o atendimento na recepção?' },
    })
    const itens = await prisma.respostaItem.findMany({
      where: { respostaId: criadaDe(resposta).id },
      orderBy: { perguntaId: 'asc' },
      omit: { id: true, respostaId: true },
    })
    expect(itens).toEqual([
      {
        perguntaId: escala.id,
        categoriaId: categoria.id,
        perguntaTexto: 'Como foi a recepção?',
        tipo: 'ESCALA_1_5',
        valorNumero: 4,
        valorTexto: null,
      },
      {
        perguntaId: simNao.id,
        categoriaId: outraCategoria.id,
        perguntaTexto: simNao.texto,
        tipo: 'SIM_NAO',
        valorNumero: null,
        valorTexto: 'NAO',
      },
      {
        perguntaId: multipla.id,
        categoriaId: categoria.id,
        perguntaTexto: multipla.texto,
        tipo: 'MULTIPLA_ESCOLHA',
        valorNumero: null,
        valorTexto: 'Em parte',
      },
      {
        perguntaId: texto.id,
        categoriaId: categoria.id,
        perguntaTexto: texto.texto,
        tipo: 'TEXTO',
        valorNumero: null,
        valorTexto: 'A médica foi atenciosa.',
      },
    ])
    expect(itens.some(({ perguntaId }) => perguntaId === pulada.id)).toBe(false)
  })

  it('classifica pela pior entre o NPS e as notas, com os limites das configurações', async () => {
    const { setor, turno, categoria } = await cenario()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })

    const baixaPelaNota = await enviar(
      setor.slug,
      envio(turno.id, { nps: 10, itens: [{ perguntaId: pergunta.id, valorNumero: 3 }] }),
    )
    const baixissimaPelaNota = await enviar(
      setor.slug,
      envio(turno.id, { nps: 9, itens: [{ perguntaId: pergunta.id, valorNumero: 1 }] }),
    )
    await configurar('nps_limite_baixa', 8)
    const baixaPeloLimiteDoBanco = await enviar(setor.slug, envio(turno.id, { nps: 7 }))

    expect(criadaDe(baixaPelaNota).classificacao).toBe('BAIXA')
    expect(criadaDe(baixissimaPelaNota).classificacao).toBe('BAIXISSIMA')
    expect(criadaDe(baixaPeloLimiteDoBanco).classificacao).toBe('BAIXA')
  })

  it('NPS ausente ou fora de 0 a 10: 400 em `nps`, sem gravar', async () => {
    const { setor, turno } = await cenario()
    const { nps: _semNps, ...semNps } = envio(turno.id)

    for (const corpo of [
      semNps,
      envio(turno.id, { nps: 11 }),
      envio(turno.id, { nps: -1 }),
      envio(turno.id, { nps: 7.5 }),
      envio(turno.id, { nps: '9' }),
    ]) {
      const resposta = await enviar(setor.slug, corpo)

      expect(resposta.status).toBe(400)
      expect(erroDe(resposta).detalhes).toEqual([{ campo: 'nps', mensagem: 'Obrigatório, de 0 a 10' }])
    }
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('um item em `detalhes` por problema no formato: chave, canal, data futura e NPS', async () => {
    const { setor, turno } = await cenario()
    const amanha = new Date(`${hojeEmBrasilia()}T12:00:00Z`)
    amanha.setUTCDate(amanha.getUTCDate() + 1)

    const resposta = await enviar(
      setor.slug,
      envio(turno.id, {
        chaveIdempotencia: 'abc',
        canal: 'WHATSAPP',
        dataAtendimento: amanha.toISOString().slice(0, 10),
        nps: undefined,
      }),
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'chaveIdempotencia', mensagem: 'Chave de envio inválida' },
      { campo: 'canal', mensagem: 'Canal inválido' },
      { campo: 'dataAtendimento', mensagem: 'Informe uma data que não seja futura' },
      { campo: 'nps', mensagem: 'Obrigatório, de 0 a 10' },
    ])
  })

  it('aceita a data de hoje no horário de Brasília', async () => {
    const { setor, turno } = await cenario()

    const resposta = await enviar(setor.slug, envio(turno.id, { dataAtendimento: hojeEmBrasilia() }))

    expect(resposta.status).toBe(201)
  })

  it('turno inexistente e itens errados: um detalhe por problema, no caminho do item, sem gravar', async () => {
    const { setor, turno, categoria } = await cenario()
    const outroSetor = await criarSetor()
    const escala = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const simNao = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, tipo: 'SIM_NAO' })
    const multipla = await criarPergunta({
      setorId: setor.id,
      categoriaId: categoria.id,
      tipo: 'MULTIPLA_ESCOLHA',
    })
    const texto = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, tipo: 'TEXTO' })
    const inativa = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, ativa: false })
    const deOutroSetor = await criarPergunta({ setorId: outroSetor.id, categoriaId: categoria.id })

    const resposta = await enviar(
      setor.slug,
      envio(turno.id + 100, {
        itens: [
          { perguntaId: deOutroSetor.id, valorNumero: 4 },
          { perguntaId: inativa.id, valorNumero: 4 },
          { perguntaId: escala.id, valorNumero: 6 },
          { perguntaId: escala.id, valorNumero: 4 },
          { perguntaId: simNao.id, valorTexto: 'Talvez' },
          { perguntaId: multipla.id, valorTexto: 'Outra' },
          { perguntaId: texto.id, valorTexto: '   ' },
        ],
      }),
    )

    expect(resposta.status).toBe(400)
    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'turnoId', mensagem: 'Escolha o turno do atendimento' },
      { campo: 'itens.0', mensagem: 'Esta pergunta não faz parte da pesquisa' },
      { campo: 'itens.1', mensagem: 'Esta pergunta não faz parte da pesquisa' },
      { campo: 'itens.2.valorNumero', mensagem: 'Escolha uma nota de 1 a 5' },
      { campo: 'itens.3', mensagem: 'Esta pergunta foi respondida mais de uma vez' },
      { campo: 'itens.4.valorTexto', mensagem: 'Responda sim ou não' },
      { campo: 'itens.5.valorTexto', mensagem: 'Escolha uma das opções' },
      { campo: 'itens.6.valorTexto', mensagem: 'Escreva a resposta, com até 500 caracteres' },
    ])
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('texto livre acima do limite das configurações: 400 no item', async () => {
    const { setor, turno, categoria } = await cenario()
    const texto = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id, tipo: 'TEXTO' })
    await configurar('texto_limite_caracteres', 10)

    const resposta = await enviar(
      setor.slug,
      envio(turno.id, { itens: [{ perguntaId: texto.id, valorTexto: 'Onze letras' }] }),
    )

    expect(erroDe(resposta).detalhes).toEqual([
      { campo: 'itens.0.valorTexto', mensagem: 'Escreva a resposta, com até 10 caracteres' },
    ])
  })

  it('setor inativo ou inexistente: 404, sem gravar', async () => {
    const { turno } = await cenario()
    await criarSetor({ slug: 'em-reforma', ativo: false })

    for (const slug of ['em-reforma', 'nao-existe']) {
      const resposta = await enviar(slug, envio(turno.id))

      expect(resposta.status).toBe(404)
      expect(erroDe(resposta).mensagem).toBe(INDISPONIVEL)
    }
    expect(await prisma.resposta.count()).toBe(0)
  })

  it('a mesma chave de novo devolve a avaliação gravada, com um token novo no lugar do anterior', async () => {
    const { setor, turno } = await cenario()
    const corpo = envio(turno.id, { nps: 2 })

    const primeira = criadaDe(await enviar(setor.slug, corpo))
    // O reenvio pode até chegar diferente: vale o que foi gravado.
    const reenvio = await enviar(setor.slug, { ...corpo, nps: 10 })

    expect(reenvio.status).toBe(201)
    const segunda = criadaDe(reenvio)
    expect(segunda).toMatchObject({ id: primeira.id, classificacao: 'BAIXISSIMA' })
    expect(segunda.tokenComplemento).not.toBe(primeira.tokenComplemento)
    expect(await prisma.resposta.count()).toBe(1)
    const gravada = await prisma.resposta.findUniqueOrThrow({ where: { id: primeira.id } })
    expect(gravada).toMatchObject({ nps: 2, tokenComplementoHash: hashDoToken(segunda.tokenComplemento) })
  })

  it('o reenvio devolve a avaliação gravada mesmo que a pergunta respondida tenha sido desativada no meio', async () => {
    const { setor, turno, categoria } = await cenario()
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const corpo = envio(turno.id, { itens: [{ perguntaId: pergunta.id, valorNumero: 5 }] })
    const { id } = criadaDe(await enviar(setor.slug, corpo))

    await prisma.pergunta.update({ where: { id: pergunta.id }, data: { ativa: false } })
    const reenvio = await enviar(setor.slug, corpo)

    expect(reenvio.status).toBe(201)
    expect(criadaDe(reenvio).id).toBe(id)
  })

  it('toque duplo: dois envios ao mesmo tempo com a mesma chave gravam uma avaliação só', async () => {
    const { setor, turno } = await cenario()
    const corpo = envio(turno.id)

    const [a, b] = await Promise.all([enviar(setor.slug, corpo), enviar(setor.slug, corpo)])

    expect([a.status, b.status]).toEqual([201, 201])
    expect(criadaDe(a).id).toBe(criadaDe(b).id)
    expect(await prisma.resposta.count()).toBe(1)
  })

  it('a chave já usada noutro setor ou numa avaliação já complementada: 409, sem gravar outra', async () => {
    const { setor, turno } = await cenario()
    const outro = await criarSetor()
    const corpo = envio(turno.id)
    const { id } = criadaDe(await enviar(setor.slug, corpo))

    const noOutroSetor = await enviar(outro.slug, corpo)
    // O complemento (ticket 11) usa o token e apaga o hash: não há mais o que trocar.
    await prisma.resposta.update({ where: { id }, data: { tokenComplementoHash: null } })
    const depoisDoComplemento = await enviar(setor.slug, corpo)

    for (const resposta of [noOutroSetor, depoisDoComplemento]) {
      expect(resposta.status).toBe(409)
      expect(erroDe(resposta)).toMatchObject({ codigo: 'CONFLITO', mensagem: JA_ENVIADA })
    }
    expect(await prisma.resposta.count()).toBe(1)
  })

  it('o campo isca preenchido recusa o envio, sem gravar; vazio, passa', async () => {
    const { setor, turno } = await cenario()

    const robo = await enviar(setor.slug, envio(turno.id, { site: 'https://exemplo.com' }))
    const pessoa = await enviar(setor.slug, envio(turno.id, { site: '' }))

    expect(robo.status).toBe(400)
    expect(erroDe(robo).detalhes).toEqual([{ campo: 'site', mensagem: 'Deixe este campo em branco' }])
    expect(pessoa.status).toBe(201)
    expect(await prisma.resposta.count()).toBe(1)
  })

  it('o IP do paciente não é gravado', async () => {
    const { setor, turno } = await cenario()

    await enviar(setor.slug, envio(turno.id), IP_DO_PACIENTE).expect(201)

    const gravado = await prisma.resposta.findMany({ include: { itens: true } })
    expect(JSON.stringify(gravado)).not.toContain(IP_DO_PACIENTE)
    expect(await prisma.auditoria.count()).toBe(0)
  })
})

describe('limite de envios da pesquisa pública', () => {
  it('depois de 30 envios do mesmo IP em 15 minutos, responde 429; outro IP continua enviando', async () => {
    const { setor, turno } = await cenario()

    // Os envios recusados também contam: um robô não testa à vontade.
    for (let envios = 0; envios < 30; envios += 1) await enviar(setor.slug, {}).expect(400)
    const bloqueado = await enviar(setor.slug, envio(turno.id))

    expect(bloqueado.status).toBe(429)
    expect(erroDe(bloqueado)).toMatchObject({
      codigo: 'LIMITE_ATINGIDO',
      mensagem: 'Muitas avaliações enviadas desta rede. Espere alguns minutos e tente de novo.',
    })
    expect(bloqueado.headers['ratelimit-policy']).toBe('30;w=900')
    await enviar(setor.slug, envio(turno.id), '198.51.100.8').expect(201)
    expect(await prisma.resposta.count()).toBe(1)
  })

  it('os IPs do RATE_LIMIT_ALLOWLIST, como o do hospital, ficam fora do limite', async () => {
    const { setor, turno } = await cenario()

    for (let envios = 0; envios < 30; envios += 1) await enviar(setor.slug, {}, IP_DO_HOSPITAL).expect(400)

    await enviar(setor.slug, envio(turno.id), IP_DO_HOSPITAL).expect(201)
  })

  it('a abertura da pesquisa não entra no limite', async () => {
    const { setor } = await cenario()

    for (let aberturas = 0; aberturas < 31; aberturas += 1) await abrir(setor.slug).expect(200)
  })
})
