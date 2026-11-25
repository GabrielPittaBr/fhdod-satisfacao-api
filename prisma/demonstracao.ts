import { existsSync } from 'node:fs'
import type { SenhasDasVariaveis } from './seeds/demonstracao/semear'

// Dados de demonstração, rodados pelo `pnpm db:demo`: os setores, as perguntas, as contas, as telas de TV e os
// quatro meses de avaliações do mock do front, para a apresentação e a homologação. O código fica em
// prisma/seeds/demonstracao/.
//
// O comando apaga e grava de novo os dados de demonstração, então só roda com a confirmação: DEMO_CONFIRM com o
// nome do banco que vai mudar, na linha do comando. A confirmação é lida antes do .env, e uma linha DEMO_CONFIRM
// esquecida lá não vale: quem roda precisa escrever, a cada vez, o nome do banco que quer mudar.

const VARIAVEIS_DAS_SENHAS = [
  'DEMO_PASSWORD_SUPER_ADMIN',
  'DEMO_PASSWORD_GESTOR',
  'DEMO_PASSWORD_OUVIDORIA',
  'DEMO_PASSWORD_VISUALIZADOR',
  'DEMO_PASSWORD_PRIMEIRO_ACESSO',
] as const satisfies (keyof SenhasDasVariaveis)[]

/** Endereço que o front usa quando o CORS_ORIGIN não diz outro: o do `pnpm dev` de lá. */
const FRONT_PADRAO = 'http://localhost:5173'

function parar(mensagem: string): never {
  console.error(mensagem)
  process.exit(1)
}

/** O nome do banco e onde ele fica, tirados da URL de conexão, sem o usuário e a senha. */
function bancoDaUrl(url: string): { nome: string; servidor: string } | null {
  try {
    const { pathname, host } = new URL(url)
    const nome = decodeURIComponent(pathname.slice(1))
    return nome ? { nome, servidor: host } : null
  } catch {
    return null
  }
}

const confirmacao = process.env.DEMO_CONFIRM?.trim() ?? ''
if (existsSync('.env')) process.loadEnvFile('.env') // não troca o que já veio do ambiente

const banco = bancoDaUrl(process.env.DATABASE_URL ?? '')
if (!banco) {
  parar(
    'Os dados de demonstração não foram gravados: DATABASE_URL não foi definida ou não é uma URL do ' +
      'PostgreSQL. Confira o .env (o modelo está no .env.example).',
  )
}
if (confirmacao !== banco.nome) {
  parar(
    [
      `Os dados de demonstração não foram gravados. O comando apaga e grava de novo os setores, as perguntas, ` +
        `as contas, as telas de TV e as avaliações de demonstração no banco "${banco.nome}", em ${banco.servidor}.`,
      confirmacao
        ? `A confirmação DEMO_CONFIRM=${confirmacao} é de outro banco. Para mudar o "${banco.nome}", rode:`
        : 'Para confirmar, rode o comando com o nome do banco em DEMO_CONFIRM, na mesma linha (no .env não vale):',
      `  DEMO_CONFIRM=${banco.nome} pnpm db:demo`,
      'Nunca rode em produção: os dados do hospital nos setores de demonstração seriam apagados.',
    ].join('\n'),
  )
}

// Só agora o resto: a API valida as variáveis ao carregar (a cifra dos telefones precisa do ENCRYPTION_KEY).
const { prisma } = await import('../src/database/prisma')
const { ErroDoSeed } = await import('./seeds/base')
const { semearDemonstracao } = await import('./seeds/demonstracao/semear')

const senhas: SenhasDasVariaveis = Object.fromEntries(
  VARIAVEIS_DAS_SENHAS.flatMap((variavel) =>
    process.env[variavel] ? [[variavel, process.env[variavel]]] : [],
  ),
)
const numero = new Intl.NumberFormat('pt-BR')
const data = (dia: string) => dia.split('-').reverse().join('/')

try {
  const resultado = await semearDemonstracao(prisma, {
    senhas,
    exigirSenhasDasVariaveis: process.env.NODE_ENV === 'production',
  })
  const front = (process.env.CORS_ORIGIN ?? '').split(',')[0]?.trim() || FRONT_PADRAO
  console.log(
    [
      `Dados de demonstração gravados no banco "${banco.nome}": ${resultado.setores} setores, ` +
        `${resultado.perguntas} perguntas, ${resultado.contas.length} contas, ${resultado.telas} telas de TV e ` +
        `${numero.format(resultado.avaliacoes)} avaliações, de ${data(resultado.periodo.inicio)} a ` +
        `${data(resultado.periodo.fim)}, com ${numero.format(resultado.comentarios)} comentários e ` +
        `${numero.format(resultado.pedidosDeRetorno)} pedidos de retorno.`,
      '',
      'Contas de demonstração:',
      ...resultado.contas.map(
        ({ email, papel, senhaDoRepositorio, variavelDaSenha }) =>
          `  ${email.padEnd(22)} ${papel}. Senha: ` +
          (senhaDoRepositorio ? `${senhaDoRepositorio} (a do repositório)` : `a de ${variavelDaSenha}`),
      ),
      '',
      `TV: ${front}/tv#${resultado.tokenDaTv}`,
    ].join('\n'),
  )
} catch (erro) {
  if (!(erro instanceof ErroDoSeed)) throw erro
  console.error(erro.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
