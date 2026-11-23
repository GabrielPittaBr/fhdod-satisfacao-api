import { z } from 'zod'
import { PERFIS } from '../../shared/constants/perfis'
import { PERMISSOES } from '../../shared/constants/permissoes'
import { MENSAGEM_SENHA_FRACA, SENHA_MINIMO, temLetrasENumeros } from '../../shared/rules/senha'

/**
 * Cookie do refresh token: HttpOnly, Secure e SameSite=Strict, enviado pelo navegador só às rotas de
 * `/api/v1/auth`. Faz parte do contrato: o front nunca o lê, mas depende do nome e do caminho.
 */
export const COOKIE_DO_REFRESH = 'refresh_token'
export const CAMINHO_DO_COOKIE = '/api/v1/auth'

export const MENSAGEM_LOGIN_INVALIDO = 'E-mail ou senha incorretos.'
export const MENSAGEM_SENHA_ATUAL_ERRADA = 'A senha atual não confere.'

export const perfilSchema = z
  .enum(PERFIS, { error: 'Escolha um perfil' })
  .meta({ id: 'Perfil', description: 'Perfil de acesso ao painel.' })

export const permissaoSchema = z.enum(PERMISSOES).meta({
  id: 'Permissao',
  description:
    'O que a pessoa pode fazer no painel. O mapa de cada perfil existe só na API; o front usa a lista do ' +
    '`/auth/me` para esconder menus.',
})

// ---------- POST /auth/login ----------

const loginBody = z.object({
  email: z
    .email('Digite um e-mail válido, como nome@hospital.com.br')
    .meta({ description: 'Vale com qualquer combinação de maiúsculas.', example: 'nome@hospital.com.br' }),
  senha: z.string().min(1, 'Digite a senha'),
})

export const login = { body: loginBody }

export type DadosDeLogin = z.output<typeof loginBody>

export const tokenDeAcessoSchema = z.object({
  tokenAcesso: z.string().meta({
    description:
      'JWT de 15 minutos. O front o guarda só em memória e o envia em `Authorization: Bearer <token>`.',
  }),
})

// ---------- GET /auth/me ----------

export const sessaoSchema = z
  .object({
    usuario: z.object({
      id: z.number().int(),
      nome: z.string(),
      email: z.string(),
      perfil: perfilSchema,
      trocarSenha: z.boolean().meta({
        description:
          'Ainda com a senha provisória: o painel só abre depois da troca, em `PATCH /auth/senha`.',
      }),
    }),
    permissoes: z.array(permissaoSchema),
    setores: z.array(z.object({ id: z.number().int(), nome: z.string() })).meta({
      description: 'Setores que a pessoa enxerga, em ordem alfabética. Vazio quando enxerga todos.',
    }),
    todosSetores: z.boolean().meta({ description: 'Enxerga todos os setores (Super Admin e Ouvidoria).' }),
  })
  .meta({ id: 'Sessao', description: 'Quem está logado, o que o perfil permite e quais setores enxerga.' })

export type Sessao = z.output<typeof sessaoSchema>

// ---------- PATCH /auth/senha ----------

const trocarSenhaBody = z
  .object({
    senhaAtual: z
      .string()
      .min(1, 'Digite a senha atual')
      .meta({ description: 'A senha de agora; no primeiro acesso, a provisória.' }),
    novaSenha: z
      .string()
      .min(SENHA_MINIMO, MENSAGEM_SENHA_FRACA)
      .refine(temLetrasENumeros, MENSAGEM_SENHA_FRACA)
      .meta({
        description: `Pelo menos ${SENHA_MINIMO} caracteres, com letras e números, e diferente da atual.`,
      }),
  })
  .refine(({ senhaAtual, novaSenha }) => novaSenha !== senhaAtual, {
    path: ['novaSenha'],
    message: 'A nova senha precisa ser diferente da atual.',
  })

export const trocarSenha = { body: trocarSenhaBody }

export type DadosDaTrocaDeSenha = z.output<typeof trocarSenhaBody>
