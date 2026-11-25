import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErroDoSeed, semearBase } from '../../prisma/seeds/base'
import { semearDemonstracao, type OpcoesDaDemonstracao } from '../../prisma/seeds/demonstracao/semear'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { CONFIGURACOES_PADRAO } from '../../src/shared/constants/configuracoes'
import { hojeEmBrasilia, somarDias } from '../../src/shared/rules/calendario'
import { classificarNota, type LimitesDeNota } from '../../src/shared/rules/classificar-nota'
import { telefoneValido } from '../../src/shared/rules/telefone'
import { decifrar } from '../../src/shared/security/crypto'
import { senhaConfere } from '../../src/shared/security/password'
import { hashDoToken } from '../../src/shared/security/tokens'
import { criarPergunta } from '../factories/perguntas'
import { criarResposta } from '../factories/respostas'
import { criarSetor } from '../factories/setores'
import { criarTelaTv } from '../factories/telas-tv'
import { criarUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer, cookie, entrar } from '../helpers/sessao'

const app = createApp()

/** Terça, 24/11/2026, meio-dia em Brasília: o instante em que o comando "roda" nos testes. */
const AGORA = new Date('2026-11-24T15:00:00.000Z')
const HOJE = '2026-11-24'
/** 120 dias antes de `HOJE`. */
const PRIMEIRO_DIA = '2026-07-27'

const ADMIN_DO_SEED = { email: 'admin@hospital.test', senha: 'senha-do-admin-2026' }

// O que o ticket pede, escrito aqui de novo para o teste não conferir o código com ele mesmo: os setores do mock
// do front, com o número de perguntas (todas e as ativas), e as contas, uma por perfil.
const SETORES = [
  { nome: 'Pronto Atendimento', slug: 'pronto-atendimento', ativo: true, perguntas: 6, ativas: 6 },
  { nome: 'Internação', slug: 'internacao', ativo: true, perguntas: 10, ativas: 9 },
  { nome: 'Raio-X', slug: 'raio-x', ativo: true, perguntas: 5, ativas: 5 },
  { nome: 'Laboratório', slug: 'laboratorio', ativo: true, perguntas: 4, ativas: 4 },
  { nome: 'Ambulatório', slug: 'ambulatorio', ativo: true, perguntas: 6, ativas: 6 },
  { nome: 'Maternidade', slug: 'maternidade', ativo: false, perguntas: 4, ativas: 4 },
]
const CONTAS = [
  {
    email: 'admin@fhdod.example',
    senha: 'admin-demo-2026',
    perfil: 'SUPER_ADMIN',
    setores: [],
    trocarSenha: false,
  },
  {
    email: 'marta@fhdod.example',
    senha: 'gestor-demo-2026',
    perfil: 'GESTOR',
    setores: ['internacao', 'pronto-atendimento'],
    trocarSenha: false,
  },
  {
    email: 'renata@fhdod.example',
    senha: 'ouvidoria-demo-2026',
    perfil: 'OUVIDORIA',
    setores: [],
    trocarSenha: false,
  },
  {
    email: 'diego@fhdod.example',
    senha: 'leitura-demo-2026',
    perfil: 'VISUALIZADOR',
    setores: ['raio-x'],
    trocarSenha: false,
  },
  {
    email: 'luana@fhdod.example',
    senha: 'provisoria-2026',
    perfil: 'GESTOR',
    setores: ['laboratorio'],
    trocarSenha: true,
  },
] as const
const TOKEN_DA_TV = 'demo-recepcao-fhdod'
const TOKEN_DA_TV_DESATIVADA = 'demo-corredor-desativada'

/** O limite do aviso de pesquisa longa do painel: acima de 8 perguntas ativas. */
const LIMITE_DO_AVISO = 8

afterAll(async () => {
  await prisma.$disconnect()
})

/** Um banco recém-instalado, com o seed base, e os dados de demonstração. */
async function instalar(opcoes: OpcoesDaDemonstracao = {}) {
  await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })
  return semearDemonstracao(prisma, { agora: AGORA, ...opcoes })
}

/** As avaliações com tudo o que foi gravado, na ordem do envio. */
function lerAvaliacoes() {
  return prisma.resposta.findMany({
    orderBy: [{ enviadoEm: 'asc' }, { id: 'asc' }],
    include: {
      setor: { select: { slug: true } },
      itens: { orderBy: { id: 'asc' }, include: { pergunta: true } },
      comentario: true,
      contato: true,
    },
  })
}

type Avaliacao = Awaited<ReturnType<typeof lerAvaliacoes>>[number]

/** O que uma avaliação diz, sem os IDs, a chave de envio e o telefone cifrado, que mudam a cada gravação. */
function conteudo({
  setor,
  canal,
  dataAtendimento,
  turnoId,
  nps,
  classificacao,
  enviadoEm,
  itens,
  comentario,
  contato,
}: Avaliacao) {
  return {
    setor: setor.slug,
    canal,
    dataAtendimento: dataAtendimento.toISOString().slice(0, 10),
    turnoId,
    nps,
    classificacao,
    enviadoEm: enviadoEm.toISOString(),
    itens: itens.map(({ perguntaTexto, valorNumero, valorTexto }) => [
      perguntaTexto,
      valorNumero,
      valorTexto,
    ]),
    comentario: comentario && [comentario.tipo, comentario.texto],
    telefone: contato && decifrar(contato.telefoneCifrado),
  }
}

const contar = <T extends string>(valores: readonly T[]) =>
  valores.reduce<Partial<Record<T, number>>>(
    (contagem, valor) => ({ ...contagem, [valor]: (contagem[valor] ?? 0) + 1 }),
    {},
  )

describe('dados de demonstração: o que é gravado', () => {
  let avaliacoes: Avaliacao[]

  beforeAll(async () => {
    await limparBanco()
    await instalar()
    avaliacoes = await lerAvaliacoes()
  })

  it('os seis setores do mock, com a Maternidade desativada, e as perguntas na ordem da jornada', async () => {
    const setores = await prisma.setor.findMany({
      orderBy: { id: 'asc' },
      include: { perguntas: { orderBy: { ordem: 'asc' }, include: { categoria: true } } },
    })

    expect(
      setores.map(({ nome, slug, ativo, perguntas }) => ({
        nome,
        slug,
        ativo,
        perguntas: perguntas.length,
        ativas: perguntas.filter(({ ativa }) => ativa).length,
      })),
    ).toEqual(SETORES)
    for (const { perguntas } of setores) {
      expect(perguntas.map(({ ordem }) => ordem)).toEqual(perguntas.map((_, indice) => indice + 1))
    }

    const [pronto, internacao] = setores
    expect(pronto!.perguntas.map(({ categoria }) => categoria.nome)).toEqual([
      'Recepção',
      'Triagem',
      'Tempo de Espera',
      'Enfermagem',
      'Médico',
      'Médico',
    ])
    expect(internacao!.perguntas.filter(({ ativa }) => ativa).length).toBeGreaterThan(LIMITE_DO_AVISO)
    expect(internacao!.perguntas.map(({ tipo }) => tipo)).toEqual(
      expect.arrayContaining(['ESCALA_1_5', 'SIM_NAO', 'MULTIPLA_ESCOLHA', 'TEXTO']),
    )
    expect(internacao!.perguntas.find(({ tipo }) => tipo === 'MULTIPLA_ESCOLHA')).toMatchObject({
      texto: 'Como estava o barulho à noite?',
      opcoes: ['Silencioso', 'Um pouco de barulho', 'Muito barulho'],
    })
    expect(internacao!.perguntas.at(-1)).toMatchObject({ texto: 'O que você achou da comida?', ativa: false })
    for (const { tipo, opcoes } of setores.flatMap(({ perguntas }) => perguntas)) {
      if (tipo !== 'MULTIPLA_ESCOLHA') expect(opcoes).toEqual([])
    }
  })

  it('as cinco contas, uma por perfil, com a senha só em hash, e todas entram pelo login da API', async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: '@fhdod.example' } },
      orderBy: { id: 'asc' },
      include: { setores: { include: { setor: true } } },
    })

    expect(
      usuarios.map(({ email, perfil, ativo, trocarSenha, setores }) => ({
        email,
        perfil,
        ativo,
        trocarSenha,
        setores: setores.map(({ setor }) => setor.slug).sort(),
      })),
    ).toEqual(CONTAS.map(({ senha: _senha, ...conta }) => ({ ...conta, ativo: true })))

    for (const [indice, { senhaHash }] of usuarios.entries()) {
      const { senha } = CONTAS[indice]!
      expect(senhaHash).toMatch(/^\$argon2id\$/)
      expect(senhaHash).not.toContain(senha)
      await expect(senhaConfere(senhaHash, senha)).resolves.toBe(true)
    }

    for (const { email, senha, trocarSenha, setores } of CONTAS) {
      const { tokenAcesso } = await entrar(app, email, senha)
      const sessao = await request(app).get('/api/v1/auth/me').set('Authorization', bearer(tokenAcesso))
      expect(sessao.status).toBe(200)
      expect(sessao.body.data).toMatchObject({ usuario: { email, trocarSenha } })
      expect(sessao.body.data.setores).toHaveLength(setores.length)
    }
  })

  it('a tela ativa abre a TV pelo token conhecido, guardado só em hash; a desativada não abre', async () => {
    const telas = await prisma.tvTela.findMany({ orderBy: { id: 'asc' } })
    expect(telas.map(({ nome, ativa, tokenHash }) => ({ nome, ativa, tokenHash }))).toEqual([
      { nome: 'Recepção principal', ativa: true, tokenHash: hashDoToken(TOKEN_DA_TV) },
      { nome: 'Corredor da Internação', ativa: false, tokenHash: hashDoToken(TOKEN_DA_TV_DESATIVADA) },
    ])

    const tv = await request(app).get('/api/v1/tv/indicadores').set('X-Tv-Token', TOKEN_DA_TV)
    expect(tv.status).toBe(200)
    expect(tv.body.data.tela).toBe('Recepção principal')

    const desativada = await request(app)
      .get('/api/v1/tv/indicadores')
      .set('X-Tv-Token', TOKEN_DA_TV_DESATIVADA)
    expect(desativada.status).toBe(401)
  })

  it('cerca de quatro meses de avaliações, até hoje, sem nenhum envio depois de agora', () => {
    const dias = avaliacoes.map(({ dataAtendimento }) => dataAtendimento.toISOString().slice(0, 10)).sort()

    expect(avaliacoes.length).toBeGreaterThan(700)
    expect(avaliacoes.length).toBeLessThan(1_300)
    expect(dias[0]).toBe(PRIMEIRO_DIA)
    expect(dias.at(-1)).toBe(HOJE)
    expect(new Set(dias).size).toBeGreaterThan(110)
    for (const { enviadoEm, dataAtendimento } of avaliacoes) {
      expect(enviadoEm.getTime()).toBeLessThan(AGORA.getTime())
      expect(hojeEmBrasilia(enviadoEm) >= dataAtendimento.toISOString().slice(0, 10)).toBe(true)
    }
  })

  it('pelo celular e pelo totem, em todos os turnos, com a maioria positiva e uma parte baixa', async () => {
    const turnos = await prisma.turno.findMany({ select: { id: true } })
    const classificacoes = contar(avaliacoes.map(({ classificacao }) => classificacao))

    expect(Object.keys(contar(avaliacoes.map(({ canal }) => canal))).sort()).toEqual(['TOTEM', 'WEB'])
    expect(new Set(avaliacoes.map(({ turnoId }) => turnoId))).toEqual(new Set(turnos.map(({ id }) => id)))
    expect(classificacoes.NORMAL!).toBeGreaterThan(avaliacoes.length * 0.7)
    expect(classificacoes.BAIXA).toBeGreaterThan(0)
    expect(classificacoes.BAIXISSIMA).toBeGreaterThan(0)
    expect(avaliacoes.filter(({ setor }) => setor.slug === 'maternidade')).toEqual([])
  })

  it('comentários dos quatro tipos, com mais elogios que qualquer outro', () => {
    const tipos = contar(avaliacoes.flatMap(({ comentario }) => (comentario ? [comentario.tipo] : [])))

    expect(Object.keys(tipos).sort()).toEqual(['ELOGIO', 'OUTRO', 'RECLAMACAO', 'SUGESTAO'])
    expect(tipos.ELOGIO!).toBeGreaterThan(Math.max(tipos.RECLAMACAO!, tipos.SUGESTAO!, tipos.OUTRO!))
  })

  it('pedidos de retorno de notas baixas, com telefones fictícios cifrados como os da pesquisa', async () => {
    const comPedido = avaliacoes.filter(({ contato }) => contato !== null)

    expect(comPedido.length).toBeGreaterThan(5)
    for (const { classificacao, enviadoEm, contato } of comPedido) {
      const telefone = decifrar(contato!.telefoneCifrado)
      expect(classificacao).not.toBe('NORMAL')
      expect(telefone).toMatch(/^5190000\d{4}$/)
      expect(telefoneValido(telefone)).toBe(true)
      expect(contato).toMatchObject({
        telefoneFinal: telefone.slice(-4),
        status: 'NOVO',
        consentimentoEm: enviadoEm,
      })
      expect(contato!.telefoneCifrado).toMatch(/^v1\./)
      expect(contato!.telefoneCifrado).not.toContain(telefone)
    }

    // A Ouvidoria revela o número pela rota de sempre: a cifra é a mesma da pesquisa.
    const { tokenAcesso } = await entrar(app, 'renata@fhdod.example', 'ouvidoria-demo-2026')
    const revelado = await request(app)
      .post(`/api/v1/contatos/${comPedido[0]!.contato!.id}/revelar-telefone`)
      .set('Authorization', bearer(tokenAcesso))
    expect(revelado.status).toBe(200)
    expect(revelado.body.data.telefone).toBe(decifrar(comPedido[0]!.contato!.telefoneCifrado))
  })

  it('os itens copiam o texto, o tipo e a categoria das perguntas ativas do setor', () => {
    const itens = avaliacoes.flatMap(({ setorId, itens: daAvaliacao }) =>
      daAvaliacao.map((item) => ({ setorId, ...item })),
    )

    expect(itens.length).toBeGreaterThan(avaliacoes.length * 3)
    for (const { setorId, perguntaTexto, tipo, categoriaId, valorNumero, valorTexto, pergunta } of itens) {
      expect({ perguntaTexto, tipo, categoriaId, setorId }).toEqual({
        perguntaTexto: pergunta.texto,
        tipo: pergunta.tipo,
        categoriaId: pergunta.categoriaId,
        setorId: pergunta.setorId,
      })
      expect(pergunta.ativa).toBe(true)
      if (tipo === 'ESCALA_1_5') {
        expect(valorNumero).toBeGreaterThanOrEqual(1)
        expect(valorNumero).toBeLessThanOrEqual(5)
        expect(valorTexto).toBeNull()
      } else {
        expect(valorNumero).toBeNull()
        if (tipo === 'SIM_NAO') expect(['SIM', 'NAO']).toContain(valorTexto)
        if (tipo === 'MULTIPLA_ESCOLHA') expect(pergunta.opcoes).toContain(valorTexto)
        if (tipo === 'TEXTO') expect(valorTexto?.length).toBeGreaterThan(0)
      }
    }
  })

  it('a classificação de cada avaliação é a da regra da API', () => {
    for (const { nps, itens, classificacao } of avaliacoes) {
      const notas = itens.flatMap(({ valorNumero }) => (valorNumero === null ? [] : [valorNumero]))
      expect(classificacao).toBe(classificarNota(nps, notas, CONFIGURACOES_PADRAO))
    }
  })

  it('o painel mostra os números com o escopo de cada conta', async () => {
    const periodo = { inicio: PRIMEIRO_DIA, fim: HOJE, base: 'ATENDIMENTO' }
    const admin = await entrar(app, 'admin@fhdod.example', 'admin-demo-2026')
    const gestora = await entrar(app, 'marta@fhdod.example', 'gestor-demo-2026')

    const resumo = await request(app)
      .get('/api/v1/dashboard/resumo')
      .query(periodo)
      .set('Authorization', bearer(admin.tokenAcesso))
    expect(resumo.status).toBe(200)
    expect(resumo.body.data.total).toBe(avaliacoes.length)

    const daGestora = await request(app)
      .get('/api/v1/dashboard/nps-por-setor')
      .query(periodo)
      .set('Authorization', bearer(gestora.tokenAcesso))
    expect(daGestora.status).toBe(200)
    expect((daGestora.body.data as { setor: string }[]).map(({ setor }) => setor).sort()).toEqual([
      'Internação',
      'Pronto Atendimento',
    ])
  })
})

describe('dados de demonstração: rodar de novo', () => {
  beforeEach(async () => {
    await limparBanco()
  })

  it('volta tudo ao que era, sem duplicar, com os mesmos IDs e as mesmas avaliações', async () => {
    await instalar()
    const antes = {
      setores: await prisma.setor.findMany({ orderBy: { id: 'asc' } }),
      usuarios: await prisma.usuario.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true } }),
      telas: await prisma.tvTela.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, nome: true, ativa: true },
      }),
      perguntas: await prisma.pergunta.count(),
      avaliacoes: (await lerAvaliacoes()).map(conteudo),
    }

    // O que muda numa apresentação: uma avaliação ao vivo, cadastros mexidos e a senha do primeiro acesso trocada.
    const pronto = antes.setores.find(({ slug }) => slug === 'pronto-atendimento')!
    const categoria = await prisma.categoria.findFirstOrThrow()
    const nova = await criarPergunta({ setorId: pronto.id, categoriaId: categoria.id })
    const turno = await prisma.turno.findFirstOrThrow()
    await criarResposta({
      setorId: pronto.id,
      turnoId: turno.id,
      perguntaIds: [nova.id],
      dataAtendimento: HOJE,
    })
    await prisma.setor.update({ where: { id: pronto.id }, data: { nome: 'PA', ativo: false } })
    await prisma.usuario.update({
      where: { email: 'luana@fhdod.example' },
      data: { trocarSenha: false, senhaHash: 'trocada', ativo: false, setores: { deleteMany: {} } },
    })
    await prisma.usuario.update({ where: { email: 'marta@fhdod.example' }, data: { perfil: 'VISUALIZADOR' } })
    await prisma.tvTela.updateMany({ data: { ativa: false, ultimoAcessoEm: AGORA } })

    await semearDemonstracao(prisma, { agora: AGORA })

    expect(await prisma.setor.findMany({ orderBy: { id: 'asc' } })).toEqual(
      antes.setores.map((setor) => ({ ...setor, atualizadoEm: expect.any(Date) })),
    )
    expect(
      await prisma.usuario.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true } }),
    ).toEqual(antes.usuarios)
    expect(
      await prisma.tvTela.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, nome: true, ativa: true, ultimoAcessoEm: true },
      }),
    ).toEqual(antes.telas.map((tela) => ({ ...tela, ultimoAcessoEm: null })))
    await expect(prisma.pergunta.count()).resolves.toBe(antes.perguntas)
    expect((await lerAvaliacoes()).map(conteudo)).toEqual(antes.avaliacoes)

    const luana = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'luana@fhdod.example' },
      include: { setores: true },
    })
    expect(luana).toMatchObject({ trocarSenha: true, ativo: true, setores: [expect.anything()] })
    await expect(senhaConfere(luana.senhaHash, 'provisoria-2026')).resolves.toBe(true)
    await expect(
      prisma.usuario.findUnique({ where: { email: 'marta@fhdod.example' } }),
    ).resolves.toMatchObject({
      perfil: 'GESTOR',
    })
  })

  it('gera tudo outra vez até o novo dia de hoje, sem duplicar', async () => {
    await instalar()
    const antes = await prisma.resposta.count()
    const tresDiasDepois = new Date(AGORA.getTime() + 3 * 86_400_000)

    await semearDemonstracao(prisma, { agora: tresDiasDepois })

    const dias = (await lerAvaliacoes()).map(({ dataAtendimento }) =>
      dataAtendimento.toISOString().slice(0, 10),
    )
    dias.sort()
    expect(dias[0]).toBe(somarDias(PRIMEIRO_DIA, 3))
    expect(dias.at(-1)).toBe(somarDias(HOJE, 3))
    expect(dias.length).toBeGreaterThan(antes * 0.8)
    expect(dias.length).toBeLessThan(antes * 1.2)
  })

  it('encerra as sessões abertas das contas de demonstração', async () => {
    await instalar()
    const { refresh } = await entrar(app, 'marta@fhdod.example', 'gestor-demo-2026')

    await semearDemonstracao(prisma, { agora: new Date() })

    const renovacao = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie(refresh))
    expect(renovacao.status).toBe(401)
  })

  it('não mexe no que não é da demonstração', async () => {
    await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })
    const setor = await criarSetor({ nome: 'Hemodiálise', slug: 'hemodialise' })
    const categoria = await prisma.categoria.findFirstOrThrow({ where: { nome: 'Enfermagem' } })
    const pergunta = await criarPergunta({ setorId: setor.id, categoriaId: categoria.id })
    const resposta = await criarResposta({ setorId: setor.id, perguntaIds: [pergunta.id] })
    const usuario = await criarUsuario({ perfil: 'GESTOR', setorIds: [setor.id] })
    const { tela } = await criarTelaTv({ criadoPorId: usuario.id, ativa: false })
    const antes = {
      categorias: await prisma.categoria.findMany(),
      turnos: await prisma.turno.findMany(),
      configuracoes: await prisma.configuracao.findMany(),
    }

    await semearDemonstracao(prisma, { agora: AGORA })

    await expect(prisma.setor.findUnique({ where: { id: setor.id } })).resolves.toEqual(setor)
    await expect(prisma.pergunta.findUnique({ where: { id: pergunta.id } })).resolves.toEqual(pergunta)
    await expect(prisma.resposta.findUnique({ where: { id: resposta.id } })).resolves.toEqual(resposta)
    await expect(prisma.usuario.findUnique({ where: { id: usuario.id } })).resolves.toEqual(usuario)
    await expect(prisma.tvTela.findUnique({ where: { id: tela.id } })).resolves.toEqual(tela)
    await expect(prisma.usuario.findUnique({ where: { email: ADMIN_DO_SEED.email } })).resolves.toMatchObject(
      {
        perfil: 'SUPER_ADMIN',
      },
    )
    expect({
      categorias: await prisma.categoria.findMany(),
      turnos: await prisma.turno.findMany(),
      configuracoes: await prisma.configuracao.findMany(),
    }).toEqual(antes)
  })

  it('uma avaliação respondida agora pela pesquisa pública entra nos números', async () => {
    await instalar({ agora: new Date() })
    const hoje = hojeEmBrasilia()
    const periodo = { inicio: hoje, fim: hoje, base: 'ATENDIMENTO' }
    const { tokenAcesso } = await entrar(app, 'admin@fhdod.example', 'admin-demo-2026')
    const totalDeHoje = async () =>
      (
        await request(app)
          .get('/api/v1/dashboard/resumo')
          .query(periodo)
          .set('Authorization', bearer(tokenAcesso))
      ).body.data.total as number
    const antes = await totalDeHoje()

    const pesquisa = await request(app).get('/api/v1/publico/setores/pronto-atendimento/pesquisa')
    expect(pesquisa.status).toBe(200)
    const { perguntas, turnos } = pesquisa.body.data as {
      perguntas: { id: number; tipo: string }[]
      turnos: { id: number }[]
    }
    expect(perguntas).toHaveLength(6)
    const envio = await request(app)
      .post('/api/v1/publico/setores/pronto-atendimento/respostas')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({
        chaveIdempotencia: randomUUID(),
        canal: 'TOTEM',
        dataAtendimento: hoje,
        turnoId: turnos[0]!.id,
        nps: 10,
        itens: perguntas.flatMap(({ id, tipo }) =>
          tipo === 'ESCALA_1_5' ? [{ perguntaId: id, valorNumero: 5 }] : [],
        ),
      })
    expect(envio.status).toBe(201)

    await expect(totalDeHoje()).resolves.toBe(antes + 1)
  })
})

describe('dados de demonstração: senhas e o que falta', () => {
  beforeEach(async () => {
    await limparBanco()
  })

  it('a senha de cada conta pode vir da variável, no lugar da do repositório', async () => {
    const resultado = await instalar({ senhas: { DEMO_PASSWORD_GESTOR: 'senha-da-homologacao-1' } })

    await expect(entrar(app, 'marta@fhdod.example', 'senha-da-homologacao-1')).resolves.toBeDefined()
    const comADoRepositorio = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'marta@fhdod.example', senha: 'gestor-demo-2026' })
    expect(comADoRepositorio.status).toBe(401)
    await expect(entrar(app, 'diego@fhdod.example', 'leitura-demo-2026')).resolves.toBeDefined()

    expect(resultado.contas.find(({ email }) => email === 'marta@fhdod.example')).toEqual({
      email: 'marta@fhdod.example',
      papel: expect.any(String),
      senhaDoRepositorio: null,
      variavelDaSenha: 'DEMO_PASSWORD_GESTOR',
    })
    expect(JSON.stringify(resultado)).not.toContain('senha-da-homologacao-1')
  })

  it('exigindo as variáveis, recusa as senhas do repositório e não grava nada', async () => {
    await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })

    const erro = await semearDemonstracao(prisma, {
      exigirSenhasDasVariaveis: true,
      senhas: { DEMO_PASSWORD_GESTOR: 'senha-da-homologacao-1' },
    }).catch((motivo: unknown) => motivo)

    expect(erro).toBeInstanceOf(ErroDoSeed)
    expect((erro as Error).message).toContain(
      'Defina DEMO_PASSWORD_SUPER_ADMIN, DEMO_PASSWORD_OUVIDORIA, DEMO_PASSWORD_VISUALIZADOR e DEMO_PASSWORD_PRIMEIRO_ACESSO.',
    )
    await expect(prisma.setor.count()).resolves.toBe(0)
    await expect(prisma.usuario.count()).resolves.toBe(1)
  })

  it('recusa a senha da variável fora da regra, sem mostrá-la', async () => {
    await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })

    const erro = await semearDemonstracao(prisma, { senhas: { DEMO_PASSWORD_OUVIDORIA: 'curta1' } }).catch(
      (motivo: unknown) => motivo,
    )

    expect(erro).toBeInstanceOf(ErroDoSeed)
    expect((erro as Error).message).toContain('DEMO_PASSWORD_OUVIDORIA fora da regra de senha')
    expect((erro as Error).message).not.toContain('curta1')
    await expect(prisma.setor.count()).resolves.toBe(0)
  })

  it('sem o seed base, para, diz o que falta e não deixa nada pela metade', async () => {
    const erro = await semearDemonstracao(prisma, { agora: AGORA }).catch((motivo: unknown) => motivo)

    expect(erro).toBeInstanceOf(ErroDoSeed)
    expect((erro as Error).message).toContain('Rode antes o seed base (pnpm db:seed)')
    await expect(prisma.setor.count()).resolves.toBe(0)
    await expect(prisma.usuario.count()).resolves.toBe(0)
  })

  it('a classificação usa os limites das configurações do banco', async () => {
    await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })
    const limites: LimitesDeNota = { ...CONFIGURACOES_PADRAO, nps_limite_baixa: 8, escala_limite_baixa: 2 }
    await prisma.configuracao.update({ where: { chave: 'nps_limite_baixa' }, data: { valor: 8 } })
    await prisma.configuracao.update({ where: { chave: 'escala_limite_baixa' }, data: { valor: 2 } })

    await semearDemonstracao(prisma, { agora: AGORA })

    const avaliacoes = await lerAvaliacoes()
    const comOPadrao = avaliacoes.filter(({ nps, itens }) => {
      const notas = itens.flatMap(({ valorNumero }) => (valorNumero === null ? [] : [valorNumero]))
      return classificarNota(nps, notas, limites) !== classificarNota(nps, notas, CONFIGURACOES_PADRAO)
    })
    expect(comOPadrao.length).toBeGreaterThan(0)
    for (const { nps, itens, classificacao } of avaliacoes) {
      const notas = itens.flatMap(({ valorNumero }) => (valorNumero === null ? [] : [valorNumero]))
      expect(classificacao).toBe(classificarNota(nps, notas, limites))
    }
  })
})

describe('pnpm db:demo', () => {
  const CLI_DO_TSX = createRequire(import.meta.url).resolve('tsx/cli')
  const COMANDO = path.resolve('prisma/demonstracao.ts')
  const BANCO = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)
  let pasta: string

  beforeEach(async () => {
    await limparBanco()
    await semearBase(prisma, { superAdmin: ADMIN_DO_SEED })
    // Numa pasta vazia, sem o .env de quem roda os testes: valem só as variáveis passadas aqui.
    pasta = mkdtempSync(path.join(tmpdir(), 'fhdod-demo-'))
  })

  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  /**
   * Roda o comando e devolve a saída; se ele sair com erro, lança com o que ele escreveu. A `DEMO_CONFIRM` de
   * quem roda os testes não passa: sem ela nas `variaveis`, a variável nem existe no processo, e uma linha do
   * `.env` poderia preenchê-la (o `.env` não troca o que já veio do ambiente, nem uma variável vazia).
   */
  function rodar(variaveis: Record<string, string> = {}): string {
    const { DEMO_CONFIRM: _deQuemRoda, ...ambiente } = process.env
    try {
      return execFileSync(process.execPath, [CLI_DO_TSX, COMANDO], {
        cwd: pasta,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...ambiente, ...variaveis },
      })
    } catch (erro) {
      const { stdout = '', stderr = '' } = erro as { stdout?: string; stderr?: string }
      throw new Error(`${stderr}${stdout}`, { cause: erro })
    }
  }

  it('sem a confirmação, ou com a de outro banco, não grava nada', { timeout: 60_000 }, async () => {
    expect(() => rodar()).toThrow(`DEMO_CONFIRM=${BANCO} pnpm db:demo`)
    expect(() => rodar({ DEMO_CONFIRM: 'satisfacao' })).toThrow(
      `A confirmação DEMO_CONFIRM=satisfacao é de outro banco. Para mudar o "${BANCO}", rode:`,
    )
    // Esquecida no .env, a confirmação não vale.
    writeFileSync(path.join(pasta, '.env'), `DEMO_CONFIRM=${BANCO}\n`)
    expect(() => rodar()).toThrow('no .env não vale')

    await expect(prisma.setor.count()).resolves.toBe(0)
  })

  it('com a confirmação, grava e mostra as contas e o link da TV', { timeout: 60_000 }, async () => {
    const saida = rodar({ DEMO_CONFIRM: BANCO, CORS_ORIGIN: 'https://satisfacao.hospital.test' })

    expect(saida).toMatch(
      new RegExp(
        `^Dados de demonstração gravados no banco "${BANCO}": 6 setores, 35 perguntas, 5 contas, 2 telas`,
      ),
    )
    for (const { email, senha } of CONTAS)
      expect(saida).toMatch(new RegExp(`${email} .*Senha: ${senha} \\(a do repositório\\)`))
    expect(saida).toContain(`TV: https://satisfacao.hospital.test/tv#${TOKEN_DA_TV}`)
    await expect(prisma.setor.count()).resolves.toBe(6)
  })

  it(
    'com NODE_ENV=production, só grava com as senhas das variáveis, e não as mostra',
    { timeout: 60_000 },
    async () => {
      const senhas = {
        DEMO_PASSWORD_SUPER_ADMIN: 'senha-de-homologacao-1',
        DEMO_PASSWORD_GESTOR: 'senha-de-homologacao-2',
        DEMO_PASSWORD_OUVIDORIA: 'senha-de-homologacao-3',
        DEMO_PASSWORD_VISUALIZADOR: 'senha-de-homologacao-4',
        DEMO_PASSWORD_PRIMEIRO_ACESSO: 'senha-de-homologacao-5',
      }

      expect(() => rodar({ DEMO_CONFIRM: BANCO, NODE_ENV: 'production' })).toThrow(
        'com NODE_ENV=production, as senhas do repositório não valem',
      )
      await expect(prisma.setor.count()).resolves.toBe(0)

      const saida = rodar({ DEMO_CONFIRM: BANCO, NODE_ENV: 'production', ...senhas })
      expect(saida).toContain('admin@fhdod.example')
      expect(saida).toContain('Senha: a de DEMO_PASSWORD_PRIMEIRO_ACESSO')
      for (const senha of Object.values(senhas)) expect(saida).not.toContain(senha)
      await expect(
        entrar(app, 'luana@fhdod.example', senhas.DEMO_PASSWORD_PRIMEIRO_ACESSO),
      ).resolves.toBeDefined()
    },
  )
})
