import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/database/prisma'
import { MENSAGEM_LOGIN_INVALIDO } from '../../src/modules/auth/auth.schemas'
import { MENSAGEM_PESQUISA_INDISPONIVEL } from '../../src/modules/pesquisa/pesquisa.schemas'
import { emitirTokenDeAcesso } from '../../src/shared/security/tokens'
import { criarSetor } from '../factories/setores'
import { criarTurno } from '../factories/turnos'
import { criarUsuario } from '../factories/usuarios'
import { limparBanco } from '../helpers/banco'
import { bearer } from '../helpers/sessao'

// Entradas com SQL e HTML nas rotas públicas e nos filtros do painel. A API usa só o Prisma e o `$queryRaw` em
// template, que mandam os valores separados do SQL; estes testes conferem, por fora, que nenhuma dessas
// entradas muda uma consulta: ou o Zod as recusa, ou elas viram um valor comum, gravado e lido como texto.

// Cada teste ganha um app novo, com os contadores do login e dos envios zerados.
let app: ReturnType<typeof createApp>

/** Um IP de documentação no papel do celular do paciente, fora da lista de exceção do limite de envios. */
const IP_DO_PACIENTE = '198.51.100.7'

/** O clássico que, colado num `WHERE` montado com texto, torna a condição sempre verdadeira. */
const SEMPRE_VERDADEIRO = "' OR '1'='1' --"

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

describe('entrada maliciosa é tratada como dado', () => {
  it('login: a senha com SQL não entra, e o e-mail com SQL nem chega ao banco', async () => {
    const usuario = await criarUsuario()

    const senhaComSql = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: usuario.email, senha: SEMPRE_VERDADEIRO })
    expect(senhaComSql.status).toBe(401)
    expect(erroDe(senhaComSql)).toMatchObject({
      codigo: 'NAO_AUTENTICADO',
      mensagem: MENSAGEM_LOGIN_INVALIDO,
    })

    const emailComSql = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `${usuario.email}${SEMPRE_VERDADEIRO}`, senha: 'qualquer-coisa-1' })
    expect(emailComSql.status).toBe(400)
    expect(erroDe(emailComSql).detalhes.map(({ campo }) => campo)).toContain('email')
  })

  it('pesquisa: um slug com SQL é só um setor que não existe', async () => {
    await criarSetor()

    const resposta = await request(app).get(
      `/api/v1/publico/setores/${encodeURIComponent(`pronto-atendimento${SEMPRE_VERDADEIRO}`)}/pesquisa`,
    )

    expect(resposta.status).toBe(404)
    expect(erroDe(resposta)).toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      mensagem: MENSAGEM_PESQUISA_INDISPONIVEL,
    })
  })

  it('complemento: um comentário com SQL e HTML é gravado e devolvido como texto, sem efeito no banco', async () => {
    const [setor, turno] = await Promise.all([criarSetor(), criarTurno()])
    const envio = await request(app)
      .post(`/api/v1/publico/setores/${setor.slug}/respostas`)
      .set('X-Forwarded-For', IP_DO_PACIENTE)
      .send({
        chaveIdempotencia: randomUUID(),
        canal: 'WEB',
        dataAtendimento: '2026-11-20',
        turnoId: turno.id,
        itens: [],
        nps: 3,
      })
      .expect(201)
    const { id, tokenComplemento } = (envio.body as { data: { id: number; tokenComplemento: string } }).data
    const texto = "'); DROP TABLE respostas; -- <script>alert('oi')</script>"

    await request(app)
      .post(`/api/v1/publico/respostas/${id}/complemento`)
      .set('X-Complemento-Token', tokenComplemento)
      .send({ comentario: { tipo: 'RECLAMACAO', texto } })
      .expect(204)

    const comentario = await prisma.comentario.findUniqueOrThrow({ where: { respostaId: id } })
    expect(comentario.texto).toBe(texto)
    expect(await prisma.resposta.count()).toBe(1)

    const admin = await criarUsuario({ perfil: 'SUPER_ADMIN' })
    const detalhe = await request(app)
      .get(`/api/v1/respostas/${id}`)
      .set('Authorization', bearer(await emitirTokenDeAcesso(admin.id)))
      .expect(200)
    expect((detalhe.body as { data: { comentario: { texto: string } } }).data.comentario.texto).toBe(texto)
  })

  it('painel: filtros com SQL dão 400, antes de qualquer consulta', async () => {
    const admin = await criarUsuario({ perfil: 'SUPER_ADMIN' })
    const token = await emitirTokenDeAcesso(admin.id)

    for (const [campo, valor] of [
      ['setorId', '1 OR 1=1'],
      ['turnoId', '1; DROP TABLE respostas'],
      ['canal', `WEB${SEMPRE_VERDADEIRO}`],
    ] as const) {
      const resposta = await request(app)
        .get('/api/v1/respostas')
        .query({ [campo]: valor })
        .set('Authorization', bearer(token))

      expect(resposta.status, `${campo}=${valor}`).toBe(400)
      expect(erroDe(resposta).codigo).toBe('VALIDACAO')
      expect(erroDe(resposta).detalhes.map((detalhe) => detalhe.campo)).toContain(campo)
    }
  })
})
