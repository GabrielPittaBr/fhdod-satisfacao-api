import { z } from 'zod'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { CONFIGURACOES_PADRAO } from '../../src/shared/constants/configuracoes'
import { MENSAGEM_SENHA_FRACA, senhaSegueARegra } from '../../src/shared/rules/senha'
import { gerarHashDaSenha } from '../../src/shared/security/password'

/** As etapas do plano, comparáveis entre setores, na ordem da jornada do paciente. */
export const CATEGORIAS_INICIAIS = [
  'Recepção',
  'Triagem',
  'Enfermagem',
  'Médico',
  'Higiene e Limpeza',
  'Estrutura',
  'Tempo de Espera',
] as const

/**
 * Turnos provisórios: os horários oficiais dependem do hospital ("Riscos e pontos em aberto", no plano). O da
 * noite termina antes de começar, porque passa da meia-noite.
 */
export const TURNOS_PROVISORIOS = [
  { nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00' },
  { nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00' },
  { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' },
] as const

/** Nome da conta criada pelo seed; o Super Admin pode mudá-lo depois, no painel. */
export const NOME_DO_SUPER_ADMIN = 'Super Admin'

/** E-mail e senha do primeiro Super Admin: os valores de SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD. */
export interface DadosDoSuperAdmin {
  email?: string
  senha?: string
}

/** Problema que impede o seed de rodar, com a mensagem para quem rodou o comando. */
export class ErroDoSeed extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoSeed'
  }
}

/** Quantos registros o seed criou em cada tabela: zero onde não havia nada a criar. */
export interface ResultadoDoSeedBase {
  categorias: number
  turnos: number
  configuracoes: number
  superAdmin: number
}

/**
 * Confere o e-mail e a senha do primeiro Super Admin. A mensagem nunca mostra a senha. A conta nasce com
 * `trocarSenha`: a senha vem de um arquivo do servidor e vale como provisória, trocada no primeiro acesso.
 */
async function novoSuperAdmin({ email = '', senha = '' }: DadosDoSuperAdmin) {
  if (!email.trim() || !senha) {
    throw new ErroDoSeed(
      'O seed não rodou: o banco ainda não tem usuários, e o primeiro Super Admin precisa de ' +
        'SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD. Defina as duas (o modelo está no .env.example).',
    )
  }
  const emailValido = z.email().safeParse(email.trim().toLowerCase())
  if (!emailValido.success) throw new ErroDoSeed('O seed não rodou: SEED_ADMIN_EMAIL não é um e-mail válido.')
  if (!senhaSegueARegra(senha)) {
    throw new ErroDoSeed(
      `O seed não rodou: SEED_ADMIN_PASSWORD fora da regra de senha. ${MENSAGEM_SENHA_FRACA}`,
    )
  }
  return {
    nome: NOME_DO_SUPER_ADMIN,
    email: emailValido.data,
    senhaHash: await gerarHashDaSenha(senha),
    perfil: 'SUPER_ADMIN' as const,
    trocarSenha: true,
  }
}

/**
 * Seed base: o mínimo para o sistema funcionar. Pode rodar em produção e quantas vezes for preciso, porque
 * nunca muda nem apaga o que já existe:
 * - categorias e turnos só entram com a tabela vazia, na primeira instalação. Depois, quem cuida deles é o
 *   Super Admin: uma categoria renomeada não volta com o nome antigo, e um turno com o horário oficial não
 *   volta ao provisório;
 * - cada configuração entra só se a chave ainda não existe. Um valor alterado continua valendo, e a
 *   configuração que uma versão nova trouxer entra sozinha;
 * - o primeiro Super Admin entra só com a tabela de usuários vazia, e só então precisa do `superAdmin`.
 *   Depois, as contas são do painel: trocar o SEED_ADMIN_EMAIL não cria outra, e a variável com a senha pode
 *   sair do servidor.
 *
 * Roda numa transação: se algo falhar, nada fica pela metade.
 */
export async function semearBase(
  prisma: PrismaClient,
  { superAdmin = {} }: { superAdmin?: DadosDoSuperAdmin } = {},
): Promise<ResultadoDoSeedBase> {
  return prisma.$transaction(async (tx) => {
    const categorias =
      (await tx.categoria.count()) > 0
        ? 0
        : (
            await tx.categoria.createMany({
              data: CATEGORIAS_INICIAIS.map((nome, indice) => ({ nome, ordem: indice + 1 })),
            })
          ).count

    const turnos =
      (await tx.turno.count()) > 0
        ? 0
        : (
            await tx.turno.createMany({
              data: TURNOS_PROVISORIOS.map((turno, indice) => ({ ...turno, ordem: indice + 1 })),
            })
          ).count

    const { count: configuracoes } = await tx.configuracao.createMany({
      data: Object.entries(CONFIGURACOES_PADRAO).map(([chave, valor]) => ({ chave, valor })),
      skipDuplicates: true,
    })

    const temUsuarios = (await tx.usuario.count()) > 0
    if (!temUsuarios) await tx.usuario.create({ data: await novoSuperAdmin(superAdmin) })

    return { categorias, turnos, configuracoes, superAdmin: temUsuarios ? 0 : 1 }
  })
}
