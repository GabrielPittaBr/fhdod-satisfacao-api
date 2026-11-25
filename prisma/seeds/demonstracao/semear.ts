import { randomUUID } from 'node:crypto'
import { lerConfiguracoes } from '../../../src/database/configuracoes'
import type { Prisma, PrismaClient } from '../../../src/generated/prisma/client'
import { hojeEmBrasilia, somarDias } from '../../../src/shared/rules/calendario'
import { MENSAGEM_SENHA_FRACA, senhaSegueARegra } from '../../../src/shared/rules/senha'
import { finalDoTelefone } from '../../../src/shared/rules/telefone'
import { cifrar } from '../../../src/shared/security/crypto'
import { gerarHashDaSenha } from '../../../src/shared/security/password'
import { hashDoToken } from '../../../src/shared/security/tokens'
import { CATEGORIAS_INICIAIS, ErroDoSeed } from '../base'
import {
  SETORES_DE_DEMONSTRACAO,
  TELAS_DE_DEMONSTRACAO,
  USUARIOS_DE_DEMONSTRACAO,
  type NomeDaCategoria,
  type UsuarioDeDemonstracao,
  type VariavelDaSenha,
} from './dados'
import { DIAS_DO_HISTORICO, gerarHistorico, type SetorDoHistorico } from './historico'

/** As senhas das variáveis DEMO_PASSWORD_*, as que estiverem definidas. */
export type SenhasDasVariaveis = Partial<Record<VariavelDaSenha, string>>

export interface OpcoesDaDemonstracao {
  senhas?: SenhasDasVariaveis
  /**
   * Recusa as senhas do repositório: cada conta precisa da sua variável. É o que vale com `NODE_ENV=production`,
   * na homologação, que fica na internet.
   */
  exigirSenhasDasVariaveis?: boolean
  /** O instante em que o comando roda. Padrão: agora. */
  agora?: Date
}

/** Uma conta de demonstração, para o resumo do comando. Nunca traz a senha de uma variável. */
export interface ContaCriada {
  email: string
  papel: string
  /** A senha do repositório, que está no código; `null` quando a senha veio da variável. */
  senhaDoRepositorio: string | null
  variavelDaSenha: VariavelDaSenha
}

export interface ResultadoDaDemonstracao {
  setores: number
  perguntas: number
  contas: ContaCriada[]
  telas: number
  /** O token do link da tela ativa, que o comando mostra como `/tv#<token>`. */
  tokenDaTv: string
  avaliacoes: number
  comentarios: number
  pedidosDeRetorno: number
  /** O primeiro e o último dia do histórico, em `AAAA-MM-DD`. */
  periodo: { inicio: string; fim: string }
}

/** Quantas linhas cada `INSERT` leva, bem abaixo do limite de parâmetros do PostgreSQL (65.535). */
const LINHAS_POR_INSERT = 1_000

/** Tempo da transação: gravar quatro meses de avaliações leva poucos segundos, mas o padrão do Prisma é 5 s. */
const TEMPO_DA_TRANSACAO_MS = 120_000

function emLotes<T>(linhas: readonly T[]): T[][] {
  const lotes: T[][] = []
  for (let inicio = 0; inicio < linhas.length; inicio += LINHAS_POR_INSERT) {
    lotes.push(linhas.slice(inicio, inicio + LINHAS_POR_INSERT))
  }
  return lotes
}

/**
 * A senha de cada conta: a da variável, se estiver definida, ou a do repositório. Com `exigirSenhasDasVariaveis`,
 * a falta de qualquer variável para tudo, antes de gravar. A mensagem diz qual variável, e nunca mostra a senha.
 */
function senhasDasContas(
  senhas: SenhasDasVariaveis,
  exigir: boolean,
): Map<UsuarioDeDemonstracao, { senha: string; daVariavel: boolean }> {
  const faltando = USUARIOS_DE_DEMONSTRACAO.filter(({ variavelDaSenha }) => !senhas[variavelDaSenha]).map(
    ({ variavelDaSenha }) => variavelDaSenha,
  )
  if (exigir && faltando.length > 0) {
    const lista = new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(faltando)
    throw new ErroDoSeed(
      'Os dados de demonstração não foram gravados: com NODE_ENV=production, as senhas do repositório não ' +
        `valem, e cada conta precisa da sua variável. Defina ${lista}.`,
    )
  }
  const fracas = USUARIOS_DE_DEMONSTRACAO.filter(({ variavelDaSenha }) => {
    const senha = senhas[variavelDaSenha]
    return senha !== undefined && senha !== '' && !senhaSegueARegra(senha)
  }).map(({ variavelDaSenha }) => variavelDaSenha)
  if (fracas.length > 0) {
    const lista = new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(fracas)
    throw new ErroDoSeed(
      `Os dados de demonstração não foram gravados: ${lista} fora da regra de senha. ${MENSAGEM_SENHA_FRACA}`,
    )
  }
  return new Map(
    USUARIOS_DE_DEMONSTRACAO.map((usuario) => {
      const daVariavel = senhas[usuario.variavelDaSenha]
      return [
        usuario,
        daVariavel
          ? { senha: daVariavel, daVariavel: true }
          : { senha: usuario.senhaPadrao, daVariavel: false },
      ]
    }),
  )
}

/** As sete categorias do seed base, pelo nome. Sem alguma, o seed base não rodou (ou a categoria mudou de nome). */
async function categoriasDoSeedBase(tx: Prisma.TransactionClient): Promise<Map<NomeDaCategoria, number>> {
  const categorias = await tx.categoria.findMany({
    where: { nome: { in: [...CATEGORIAS_INICIAIS] } },
    select: { id: true, nome: true },
  })
  const porNome = new Map(categorias.map(({ id, nome }) => [nome as NomeDaCategoria, id]))
  const faltando = CATEGORIAS_INICIAIS.filter((nome) => !porNome.has(nome))
  if (faltando.length > 0) {
    const lista = new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(
      faltando.map((nome) => `"${nome}"`),
    )
    throw new ErroDoSeed(
      `Os dados de demonstração não foram gravados: faltam as categorias ${lista}. Rode antes o seed base ` +
        '(pnpm db:seed), que as cria.',
    )
  }
  return porNome
}

/**
 * Grava os dados de demonstração: os seis setores do mock do front, com as perguntas, as cinco contas, as duas
 * telas de TV e cerca de quatro meses de avaliações até hoje. Precisa do seed base (as categorias, os turnos e
 * as configurações).
 *
 * Rodar de novo substitui tudo o que é da demonstração, sem duplicar: os setores são achados pelo slug, as contas
 * pelo e-mail e as telas pelo token, e voltam ao que está em `dados.ts`, com os mesmos IDs; as perguntas e as
 * avaliações dos seis setores, também as respondidas depois, são apagadas e geradas de novo até a data de hoje.
 * As contas voltam com a senha de demonstração, e as sessões delas são encerradas. O que não é da demonstração
 * (outros setores, contas e telas, as categorias, os turnos e as configurações) fica como está.
 *
 * Roda numa transação: se algo falhar, nada fica pela metade.
 */
export async function semearDemonstracao(
  prisma: PrismaClient,
  { senhas = {}, exigirSenhasDasVariaveis = false, agora = new Date() }: OpcoesDaDemonstracao = {},
): Promise<ResultadoDaDemonstracao> {
  const contas = senhasDasContas(senhas, exigirSenhasDasVariaveis)
  const hashes = new Map(
    await Promise.all(
      [...contas].map(async ([usuario, { senha }]) => [usuario, await gerarHashDaSenha(senha)] as const),
    ),
  )

  return prisma.$transaction(
    async (tx) => {
      const categorias = await categoriasDoSeedBase(tx)
      const turnos = await tx.turno.findMany({
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        select: { id: true, horaInicio: true, horaFim: true },
      })
      if (turnos.length === 0) {
        throw new ErroDoSeed(
          'Os dados de demonstração não foram gravados: não há turnos. Rode antes o seed base (pnpm db:seed).',
        )
      }
      const limites = await lerConfiguracoes(tx)

      // Setores: achados pelo slug, com o mesmo ID de antes.
      const setores = new Map<string, number>()
      for (const { nome, slug, descricao, ativo } of SETORES_DE_DEMONSTRACAO) {
        const { id } = await tx.setor.upsert({
          where: { slug },
          create: { nome, slug, descricao, ativo },
          update: { nome, descricao, ativo },
          select: { id: true },
        })
        setores.set(slug, id)
      }
      const setorIds = [...setores.values()]

      // As avaliações e as perguntas dos setores saem e voltam do zero (os itens, os comentários e os pedidos de
      // retorno saem junto com a avaliação).
      await tx.resposta.deleteMany({ where: { setorId: { in: setorIds } } })
      await tx.pergunta.deleteMany({ where: { setorId: { in: setorIds } } })
      const perguntas = await tx.pergunta.createManyAndReturn({
        data: SETORES_DE_DEMONSTRACAO.flatMap(({ slug, perguntas: doSetor }) =>
          doSetor.map(({ categoria, texto, tipo, opcoes = [], ativa = true }, indice) => ({
            setorId: setores.get(slug)!,
            categoriaId: categorias.get(categoria)!,
            texto,
            tipo,
            opcoes,
            ordem: indice + 1,
            ativa,
          })),
        ),
        select: {
          id: true,
          setorId: true,
          categoriaId: true,
          texto: true,
          tipo: true,
          opcoes: true,
          ordem: true,
          ativa: true,
        },
      })

      // Contas: achadas pelo e-mail, de volta ao que está em dados.ts, com a senha de demonstração.
      const usuarioIds = new Map<UsuarioDeDemonstracao, number>()
      for (const usuario of USUARIOS_DE_DEMONSTRACAO) {
        const dados = {
          nome: usuario.nome,
          perfil: usuario.perfil,
          senhaHash: hashes.get(usuario)!,
          ativo: true,
          trocarSenha: usuario.trocarSenha,
          ultimoLoginEm: null,
        }
        const doUsuario = usuario.setores.map((slug) => ({ setorId: setores.get(slug)! }))
        const { id } = await tx.usuario.upsert({
          where: { email: usuario.email },
          create: { ...dados, email: usuario.email, setores: { create: doUsuario } },
          update: { ...dados, setores: { deleteMany: {}, create: doUsuario } },
          select: { id: true },
        })
        usuarioIds.set(usuario, id)
      }
      // A senha voltou à de demonstração: as sessões abertas com outra senha são encerradas.
      await tx.refreshToken.updateMany({
        where: { usuarioId: { in: [...usuarioIds.values()] }, revogadoEm: null },
        data: { revogadoEm: agora },
      })

      // Telas: achadas pelo hash do token, que é o que o banco guarda.
      const superAdminId = usuarioIds.get(
        USUARIOS_DE_DEMONSTRACAO.find(({ perfil }) => perfil === 'SUPER_ADMIN')!,
      )!
      for (const { nome, token, ativa } of TELAS_DE_DEMONSTRACAO) {
        const tokenHash = hashDoToken(token)
        await tx.tvTela.upsert({
          where: { tokenHash },
          create: { nome, tokenHash, ativa, criadoPorId: superAdminId },
          update: { nome, ativa, ultimoAcessoEm: null, criadoPorId: superAdminId },
        })
      }

      // Avaliações: as das perguntas ativas, com a semente de cada dia.
      const categoriaPorId = new Map([...categorias].map(([nome, id]) => [id, nome]))
      const setoresDoHistorico: SetorDoHistorico[] = [...setores].map(([slug, id]) => ({
        id,
        slug,
        perguntas: perguntas
          .filter((pergunta) => pergunta.setorId === id && pergunta.ativa)
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ id: perguntaId, categoriaId, texto, tipo, opcoes }) => ({
            id: perguntaId,
            categoriaId,
            categoria: categoriaPorId.get(categoriaId)!,
            texto,
            tipo,
            opcoes,
          })),
      }))
      const avaliacoes = gerarHistorico({ agora, setores: setoresDoHistorico, turnos, limites }).map(
        (avaliacao) => ({ ...avaliacao, chaveIdempotencia: randomUUID() }),
      )

      const ids = new Map<string, number>()
      for (const lote of emLotes(avaliacoes)) {
        const gravadas = await tx.resposta.createManyAndReturn({
          data: lote.map(
            ({
              setorId,
              canal,
              dataAtendimento,
              turnoId,
              nps,
              classificacao,
              enviadoEm,
              chaveIdempotencia,
            }) => ({
              setorId,
              canal,
              dataAtendimento: new Date(`${dataAtendimento}T00:00:00Z`),
              turnoId,
              nps,
              classificacao,
              enviadoEm,
              chaveIdempotencia,
            }),
          ),
          select: { id: true, chaveIdempotencia: true },
        })
        for (const { id, chaveIdempotencia } of gravadas) ids.set(chaveIdempotencia, id)
      }
      const comId = avaliacoes.map((avaliacao) => ({
        ...avaliacao,
        id: ids.get(avaliacao.chaveIdempotencia)!,
      }))

      const itens = comId.flatMap(({ id, itens: daAvaliacao }) =>
        daAvaliacao.map((item) => ({ respostaId: id, ...item })),
      )
      for (const lote of emLotes(itens)) await tx.respostaItem.createMany({ data: lote })

      const comentarios = comId.flatMap(({ id, comentario }) =>
        comentario ? [{ respostaId: id, ...comentario }] : [],
      )
      for (const lote of emLotes(comentarios)) await tx.comentario.createMany({ data: lote })

      // O pedido de retorno é gravado como o complemento da pesquisa grava: os dígitos cifrados e os 4 últimos
      // em claro, com o consentimento na hora do envio, e nasce NOVO.
      const pedidos = comId.flatMap(({ id, telefone, enviadoEm }) =>
        telefone
          ? [
              {
                respostaId: id,
                telefoneCifrado: cifrar(telefone),
                telefoneFinal: finalDoTelefone(telefone),
                consentimentoEm: enviadoEm,
              },
            ]
          : [],
      )
      for (const lote of emLotes(pedidos)) await tx.contatoRetorno.createMany({ data: lote })

      const hoje = hojeEmBrasilia(agora)
      return {
        setores: setores.size,
        perguntas: perguntas.length,
        contas: USUARIOS_DE_DEMONSTRACAO.map((usuario) => ({
          email: usuario.email,
          papel: usuario.papel,
          senhaDoRepositorio: contas.get(usuario)!.daVariavel ? null : usuario.senhaPadrao,
          variavelDaSenha: usuario.variavelDaSenha,
        })),
        telas: TELAS_DE_DEMONSTRACAO.length,
        tokenDaTv: TELAS_DE_DEMONSTRACAO.find(({ ativa }) => ativa)!.token,
        avaliacoes: avaliacoes.length,
        comentarios: comentarios.length,
        pedidosDeRetorno: pedidos.length,
        periodo: { inicio: somarDias(hoje, -DIAS_DO_HISTORICO), fim: hoje },
      }
    },
    { timeout: TEMPO_DA_TRANSACAO_MS, maxWait: 10_000 },
  )
}
