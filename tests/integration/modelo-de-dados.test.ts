import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma'
import { limparBanco } from '../helpers/banco'
import { rodarPrisma } from '../helpers/prisma-cli'

// O modelo de dados do MVP no banco de teste, com as migrations que o tests/setup.ts aplicou: as restrições
// que o banco garante sozinho, os tipos das colunas e os índices.

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  await limparBanco()
})

/** Um setor com uma pergunta de nota, um turno e uma categoria, para gravar respostas. */
async function criarCadastros() {
  const setor = await prisma.setor.create({
    data: { nome: 'Pronto Atendimento', slug: 'pronto-atendimento' },
  })
  const turno = await prisma.turno.create({
    data: { nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 },
  })
  const categoria = await prisma.categoria.create({ data: { nome: 'Recepção', ordem: 1 } })
  const pergunta = await prisma.pergunta.create({
    data: {
      setorId: setor.id,
      categoriaId: categoria.id,
      texto: 'Como você avalia o atendimento na recepção?',
      tipo: 'ESCALA_1_5',
      ordem: 1,
    },
  })
  return { setor, turno, categoria, pergunta }
}

type Cadastros = Awaited<ReturnType<typeof criarCadastros>>

function gravarResposta({ setor, turno }: Cadastros, nps: number) {
  return prisma.resposta.create({
    data: {
      setorId: setor.id,
      canal: 'WEB',
      dataAtendimento: new Date('2026-11-10'),
      turnoId: turno.id,
      nps,
      classificacao: 'NORMAL',
      chaveIdempotencia: randomUUID(),
    },
  })
}

async function gravarItem(cadastros: Cadastros, valorNumero: number | null) {
  const { pergunta, categoria } = cadastros
  const resposta = await gravarResposta(cadastros, 9)
  return prisma.respostaItem.create({
    data: {
      respostaId: resposta.id,
      perguntaId: pergunta.id,
      categoriaId: categoria.id,
      perguntaTexto: pergunta.texto,
      tipo: pergunta.tipo,
      valorNumero,
    },
  })
}

describe('restrições do banco', () => {
  describe('NPS da resposta', () => {
    it('aceita de 0 a 10', async () => {
      const cadastros = await criarCadastros()

      await expect(gravarResposta(cadastros, 0)).resolves.toMatchObject({ nps: 0 })
      await expect(gravarResposta(cadastros, 10)).resolves.toMatchObject({ nps: 10 })
    })

    it.each([-1, 11])('recusa %i', async (nps) => {
      const cadastros = await criarCadastros()

      await expect(gravarResposta(cadastros, nps)).rejects.toThrow(/respostas_nps_check/)
    })

    it('recusa a resposta sem NPS', async () => {
      const { setor, turno } = await criarCadastros()

      await expect(prisma.$executeRaw`
        INSERT INTO respostas (setor_id, canal, data_atendimento, turno_id, classificacao, chave_idempotencia)
        VALUES (${setor.id}, 'WEB', '2026-11-10', ${turno.id}, 'NORMAL', ${randomUUID()}::uuid)
      `).rejects.toThrow(/null value in column "nps"/)
    })
  })

  describe('nota de 1 a 5 de cada item', () => {
    it('aceita de 1 a 5 e o item sem nota (sim ou não, múltipla escolha e texto)', async () => {
      const cadastros = await criarCadastros()

      await expect(gravarItem(cadastros, 1)).resolves.toMatchObject({ valorNumero: 1 })
      await expect(gravarItem(cadastros, 5)).resolves.toMatchObject({ valorNumero: 5 })
      await expect(gravarItem(cadastros, null)).resolves.toMatchObject({ valorNumero: null })
    })

    it.each([0, 6])('recusa %i', async (valorNumero) => {
      const cadastros = await criarCadastros()

      await expect(gravarItem(cadastros, valorNumero)).rejects.toThrow(/resposta_itens_valor_numero_check/)
    })

    it('recusa a mesma pergunta duas vezes na mesma resposta', async () => {
      const cadastros = await criarCadastros()
      const { id: respostaId } = await gravarResposta(cadastros, 9)
      const item = {
        respostaId,
        perguntaId: cadastros.pergunta.id,
        categoriaId: cadastros.categoria.id,
        perguntaTexto: cadastros.pergunta.texto,
        tipo: cadastros.pergunta.tipo,
        valorNumero: 4,
      }
      await prisma.respostaItem.create({ data: item })

      await expect(prisma.respostaItem.create({ data: item })).rejects.toMatchObject({ code: 'P2002' })
    })
  })

  describe('nome da categoria', () => {
    it.each(['Recepção', 'recepção', 'RECEPÇÃO'])(
      'recusa "%s" quando já existe "Recepção", com o erro de único que vira 409 na API',
      async (nome) => {
        await prisma.categoria.create({ data: { nome: 'Recepção', ordem: 1 } })

        const criacao = prisma.categoria.create({ data: { nome, ordem: 2 } })

        await expect(criacao).rejects.toThrow(/categorias_nome_lower_key/)
        await expect(criacao).rejects.toMatchObject({ code: 'P2002' })
      },
    )

    it('aceita nomes diferentes', async () => {
      await prisma.categoria.create({ data: { nome: 'Recepção', ordem: 1 } })

      await expect(prisma.categoria.create({ data: { nome: 'Triagem', ordem: 2 } })).resolves.toMatchObject({
        nome: 'Triagem',
      })
    })
  })

  describe('horários do turno', () => {
    it('aceita o turno que passa da meia-noite e devolve os horários em HH:mm', async () => {
      await prisma.turno.create({ data: { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 1 } })

      await expect(
        prisma.turno.findFirstOrThrow({ select: { horaInicio: true, horaFim: true } }),
      ).resolves.toEqual({ horaInicio: '19:00', horaFim: '07:00' })
    })

    it('aceita do 00:00 ao 23:59', async () => {
      await expect(
        prisma.turno.create({ data: { nome: 'Dia todo', horaInicio: '00:00', horaFim: '23:59', ordem: 1 } }),
      ).resolves.toMatchObject({ horaInicio: '00:00', horaFim: '23:59' })
    })

    it.each(['7:00', '24:00', '12:60', '0700', '07:00:00', ''])('recusa o horário "%s"', async (hora) => {
      await expect(
        prisma.turno.create({ data: { nome: 'Manhã', horaInicio: hora, horaFim: '13:00', ordem: 1 } }),
      ).rejects.toThrow(/turnos_hora_inicio_check|too long/)
      await expect(
        prisma.turno.create({ data: { nome: 'Manhã', horaInicio: '07:00', horaFim: hora, ordem: 1 } }),
      ).rejects.toThrow(/turnos_hora_fim_check|too long/)
    })
  })
})

describe('tabelas, colunas e tipos', () => {
  async function lerColunas() {
    const colunas = await prisma.$queryRaw<
      { tabela: string; coluna: string; tipo: string; precisao: number }[]
    >`
      SELECT table_name AS tabela, column_name AS coluna, udt_name AS tipo, datetime_precision::int AS precisao
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    `
    return new Map(colunas.map((coluna) => [`${coluna.tabela}.${coluna.coluna}`, coluna]))
  }

  it('tem as 14 tabelas do MVP', async () => {
    const tabelas = await prisma.$queryRaw<{ nome: string }[]>`
      SELECT tablename AS nome FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `

    expect(tabelas.map(({ nome }) => nome).sort()).toEqual(
      [
        'usuarios',
        'usuario_setores',
        'refresh_tokens',
        'setores',
        'categorias',
        'turnos',
        'perguntas',
        'respostas',
        'resposta_itens',
        'comentarios',
        'contatos_retorno',
        'tv_telas',
        'configuracoes',
        'auditoria',
      ].sort(),
    )
  })

  it('tem os tipos enumerados do plano', async () => {
    const tipos = await prisma.$queryRaw<{ nome: string; valores: string[] }[]>`
      SELECT t.typname AS nome, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS valores
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace
      GROUP BY t.typname
    `

    expect(Object.fromEntries(tipos.map(({ nome, valores }) => [nome, valores]))).toEqual({
      perfil: ['SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR'],
      tipo_pergunta: ['ESCALA_1_5', 'SIM_NAO', 'MULTIPLA_ESCOLHA', 'TEXTO'],
      canal: ['WEB', 'TOTEM', 'WHATSAPP'],
      classificacao: ['NORMAL', 'BAIXA', 'BAIXISSIMA'],
      tipo_comentario: ['ELOGIO', 'RECLAMACAO', 'SUGESTAO', 'OUTRO'],
      status_retorno: ['NOVO', 'PENDENTE', 'EM_ATENDIMENTO', 'RESOLVIDO'],
    })
  })

  it('nomeia tabelas e colunas em snake_case', async () => {
    const nomes = [...(await lerColunas()).keys()]

    expect(nomes.length).toBeGreaterThan(0)
    expect(nomes.filter((nome) => !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(nome))).toEqual([])
  })

  it('guarda todo instante em timestamptz, com milissegundos', async () => {
    const instantes = [...(await lerColunas()).values()].filter(({ tipo }) => tipo.startsWith('timestamp'))

    expect(instantes.map(({ tabela, coluna }) => `${tabela}.${coluna}`)).toEqual(
      expect.arrayContaining([
        'respostas.enviado_em',
        'respostas.token_complemento_expira_em',
        'contatos_retorno.consentimento_em',
        'refresh_tokens.expira_em',
        'auditoria.criado_em',
      ]),
    )
    expect(instantes.filter(({ tipo, precisao }) => tipo !== 'timestamptz' || precisao !== 3)).toEqual([])
  })

  it('usa os tipos que o plano decidiu', async () => {
    const colunas = await lerColunas()
    const tipo = (coluna: string) => colunas.get(coluna)?.tipo

    expect({
      'respostas.data_atendimento': tipo('respostas.data_atendimento'),
      'respostas.nps': tipo('respostas.nps'),
      'resposta_itens.valor_numero': tipo('resposta_itens.valor_numero'),
      'respostas.chave_idempotencia': tipo('respostas.chave_idempotencia'),
      'perguntas.opcoes': tipo('perguntas.opcoes'),
      'configuracoes.valor': tipo('configuracoes.valor'),
      'auditoria.dados': tipo('auditoria.dados'),
    }).toEqual({
      'respostas.data_atendimento': 'date',
      'respostas.nps': 'int2',
      'resposta_itens.valor_numero': 'int2',
      'respostas.chave_idempotencia': 'uuid',
      'perguntas.opcoes': '_text',
      'configuracoes.valor': 'jsonb',
      'auditoria.dados': 'jsonb',
    })
  })
})

describe('índices', () => {
  it('tem os índices dos filtros mais usados no dashboard', async () => {
    const indices = await prisma.$queryRaw<{ definicao: string }[]>`
      SELECT indexdef AS definicao FROM pg_indexes WHERE schemaname = 'public'
    `
    // "CREATE INDEX x ON public.respostas USING btree (setor_id, enviado_em)" vira "respostas(setor_id, enviado_em)".
    const colunas = indices.map(({ definicao }) => definicao.replace(/^.* ON public\.(\w+) USING \w+ /, '$1'))

    expect(colunas).toEqual(
      expect.arrayContaining([
        'respostas(setor_id, enviado_em)',
        'respostas(data_atendimento)',
        'resposta_itens(categoria_id)',
        'contatos_retorno(status)',
      ]),
    )
  })

  /**
   * No PostgreSQL, chave estrangeira não cria índice sozinha. Estas não têm, de propósito, porque nenhuma
   * busca parte delas para achar os registros filhos. Uma chave nova sem índice faz este teste falhar: ou ela
   * ganha um `@@index` no schema, ou entra aqui com o motivo.
   */
  const CHAVES_SEM_INDICE: Record<string, string> = {
    'auditoria.usuario_id': 'a consulta da auditoria é da fase 2, que cria os índices que ela usar',
    'comentarios.categoria_id': 'nenhuma tela busca comentários pela categoria',
    'configuracoes.atualizado_por_id': 'a tabela tem uma linha por configuração',
    'contatos_retorno.responsavel_id': 'o responsável pelo retorno é do fluxo da fase 2',
    'perguntas.categoria_id': 'as perguntas são buscadas pelo setor',
    'respostas.turno_id': 'o filtro por turno vem sempre com o período, que já tem índice',
    'tv_telas.criado_por_id': 'as telas são poucas e nunca buscadas pelo autor',
  }

  it('tem índice em toda chave estrangeira usada para buscar os registros filhos', async () => {
    // Chaves estrangeiras cuja coluna não é a primeira de nenhum índice (chave primária e únicos contam).
    const semIndice = await prisma.$queryRaw<{ chave: string }[]>`
      SELECT c.conrelid::regclass::text || '.' || a.attname AS chave
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
    `

    expect(semIndice.map(({ chave }) => chave).sort()).toEqual(Object.keys(CHAVES_SEM_INDICE).sort())
  })
})

describe('migrations', () => {
  it('estão em dia com o schema.prisma', { timeout: 30_000 }, () => {
    // Sai com o código 2, e o teste falha, se o schema mudou sem uma migration nova (`pnpm db:migrate`).
    expect(() =>
      rodarPrisma(
        ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
        process.env.DATABASE_URL ?? '',
      ),
    ).not.toThrow()
  })
})
