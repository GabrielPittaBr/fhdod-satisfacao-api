import type { OpenAPIRegistry, ResponseConfig } from '@asteasolutions/zod-to-openapi'
import { documentarRota, EXIGE_LOGIN, respostaJson } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  CAMINHO_DO_COOKIE,
  COOKIE_DO_REFRESH,
  login,
  MENSAGEM_LOGIN_INVALIDO,
  MENSAGEM_SENHA_ATUAL_ERRADA,
  sessaoSchema,
  tokenDeAcessoSchema,
  trocarSenha,
  type Sessao,
} from './auth.schemas'

const ESQUEMA_DO_COOKIE = 'cookieDeRefresh'
const TAGS = ['Autenticação']

const TOKEN_DE_EXEMPLO = { tokenAcesso: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.assinatura' }

const SESSAO_DE_EXEMPLO: Sessao = {
  usuario: {
    id: 2,
    nome: 'Ana Souza',
    email: 'ana.souza@hospital.com.br',
    perfil: 'GESTOR',
    trocarSenha: false,
  },
  permissoes: [
    'perguntas:gerenciar',
    'dashboard:ver',
    'respostas:ver',
    'comentarios:ver',
    'exportacao:resumo',
    'exportacao:detalhada',
    'escalas:gerenciar',
  ],
  setores: [{ id: 3, nome: 'Pronto Atendimento' }],
  todosSetores: false,
}

const COOKIE_GRAVADO: NonNullable<ResponseConfig['headers']> = {
  'Set-Cookie': {
    description: `O refresh token novo, no cookie \`${COOKIE_DO_REFRESH}\`. O banco guarda só o hash dele.`,
    schema: {
      type: 'string',
      example: `${COOKIE_DO_REFRESH}=<token>; Max-Age=604800; Path=${CAMINHO_DO_COOKIE}; HttpOnly; Secure; SameSite=Strict`,
    },
  },
}

/** Resposta com o token de acesso no corpo e o refresh novo no cookie. */
function respostaComToken(descricao: string): ResponseConfig {
  return {
    ...respostaJson(descricao, envelope(tokenDeAcessoSchema), { data: TOKEN_DE_EXEMPLO }),
    headers: COOKIE_GRAVADO,
  }
}

const SESSAO_DO_REFRESH = {
  codigo: 'NAO_AUTENTICADO',
  quando: 'sem o cookie, ou com o refresh vencido, revogado (já usado) ou de usuário inativo.',
} as const

export function documentarAuth(registry: OpenAPIRegistry) {
  registry.registerComponent('securitySchemes', ESQUEMA_DO_COOKIE, {
    type: 'apiKey',
    in: 'cookie',
    name: COOKIE_DO_REFRESH,
    description:
      `Refresh token de 7 dias, gravado pelo login num cookie HttpOnly, Secure e SameSite=Strict, que o ` +
      `navegador envia só às rotas de \`${CAMINHO_DO_COOKIE}\`. Cada uso troca o token por um novo.`,
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/auth/login',
    tags: TAGS,
    summary: 'Entra com e-mail e senha',
    description:
      'Devolve o token de acesso no corpo e grava o refresh no cookie. Cada login com sucesso vai para a ' +
      'auditoria. Depois de 5 tentativas erradas em 15 minutos para o mesmo IP e e-mail, a próxima recebe ' +
      '429, mesmo com a senha certa, até a janela acabar; o `Retry-After` diz quantos segundos faltam.',
    requisicao: login,
    respostas: { 200: respostaComToken('Login feito.') },
    erros: [
      {
        codigo: 'VALIDACAO',
        detalhes: [{ campo: 'email', mensagem: 'Digite um e-mail válido, como nome@hospital.com.br' }],
      },
      {
        codigo: 'NAO_AUTENTICADO',
        quando: 'e-mail ou senha errados, ou usuário inativo, sempre com a mesma mensagem.',
        mensagem: MENSAGEM_LOGIN_INVALIDO,
      },
      { codigo: 'LIMITE_ATINGIDO', mensagem: 'Muitas tentativas. Espere 15 minutos e tente de novo.' },
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: TAGS,
    summary: 'Renova a sessão',
    description:
      'Troca o refresh do cookie por um novo (o antigo é revogado) e devolve outro token de acesso. O front ' +
      'chama esta rota ao recarregar a página e ao receber um 401, uma única vez.',
    security: [{ [ESQUEMA_DO_COOKIE]: [] }],
    respostas: { 200: respostaComToken('Sessão renovada.') },
    erros: [SESSAO_DO_REFRESH],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/auth/logout',
    tags: TAGS,
    summary: 'Sai e encerra todas as sessões',
    description:
      'Revoga todos os refresh tokens da pessoa e apaga o cookie. A pessoa é a do token de acesso ou, se ' +
      'ele já venceu, a do cookie de refresh. Responde 204 mesmo sem sessão válida.',
    security: [...EXIGE_LOGIN, { [ESQUEMA_DO_COOKIE]: [] }, {}],
    respostas: { 204: { description: 'Sessões encerradas e cookie apagado.' } },
  })

  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/auth/me',
    tags: TAGS,
    summary: 'Quem está logado',
    description:
      'Usuário, permissões do perfil e setores que a pessoa enxerga, lidos do banco a cada chamada. Funciona ' +
      'também com a senha provisória, para o front saber que precisa pedir a troca (`trocarSenha`).',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('A sessão de quem está logado.', envelope(sessaoSchema), { data: SESSAO_DE_EXEMPLO }),
    },
    erros: ['NAO_AUTENTICADO'],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/auth/senha',
    tags: TAGS,
    summary: 'Troca a própria senha',
    description:
      'Obrigatória no primeiro acesso, com a senha provisória. Encerra as outras sessões e grava um refresh ' +
      'novo no cookie, para quem trocou continuar logado. Senha atual errada volta em `senhaAtual`, e senha ' +
      'nova fora da regra, em `novaSenha`.',
    security: EXIGE_LOGIN,
    requisicao: trocarSenha,
    respostas: { 204: { description: 'Senha trocada.', headers: COOKIE_GRAVADO } },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'senha atual errada (em `senhaAtual`) ou senha nova fora da regra ou igual à atual (em `novaSenha`).',
        detalhes: [{ campo: 'senhaAtual', mensagem: MENSAGEM_SENHA_ATUAL_ERRADA }],
      },
      'NAO_AUTENTICADO',
    ],
  })
}
