import { z } from 'zod'
import { idNoCorpo, idParams } from '../../shared/http/parametros'
import { perfilSchema } from '../auth/auth.schemas'

export const MENSAGEM_USUARIO_NAO_ENCONTRADO = 'Usuário não encontrado.'
export const MENSAGEM_EMAIL_REPETIDO = 'Já existe um usuário com este e-mail.'
export const MENSAGEM_DESATIVAR_A_PROPRIA_CONTA = 'Você não pode desativar a própria conta.'
export const MENSAGEM_MUDAR_O_PROPRIO_PERFIL = 'Você não pode mudar o próprio perfil.'
export const MENSAGEM_SETOR_INEXISTENTE = 'Um dos setores escolhidos não existe.'

const NOME_MINIMO = 3
const NOME_MAXIMO = 100
/** O maior endereço de e-mail que a norma permite. */
const EMAIL_MAXIMO = 254

const nomeSchema = z
  .string()
  .trim()
  .min(NOME_MINIMO, 'Informe o nome completo')
  .max(NOME_MAXIMO, `Use no máximo ${NOME_MAXIMO} caracteres`)
  .meta({
    description: `De ${NOME_MINIMO} a ${NOME_MAXIMO} caracteres; os espaços das pontas saem.`,
    example: 'Ana Souza',
  })

export const usuarioSchema = z
  .object({
    id: z.number().int(),
    nome: z.string(),
    email: z.string().meta({ description: 'Em minúsculas. É o login da pessoa e não muda.' }),
    perfil: perfilSchema,
    ativo: z.boolean().meta({ description: 'A conta inativa não entra no painel, e as sessões dela caem.' }),
    trocarSenha: z.boolean().meta({
      description: 'Ainda com a senha provisória: a troca é obrigatória no próximo acesso.',
    }),
    setorIds: z.array(z.number().int()).meta({
      description:
        'Setores ligados à pessoa, em ordem de ID. Limitam o que o Gestor e o Visualizador enxergam; o Super ' +
        'Admin e a Ouvidoria enxergam todos.',
    }),
    ultimoLoginEm: z.iso
      .datetime()
      .nullable()
      .meta({ description: 'O último login, em UTC; `null` se a pessoa nunca entrou.' }),
  })
  .meta({ id: 'Usuario', description: 'Conta do painel.' })

export type Usuario = z.output<typeof usuarioSchema>

const senhaProvisoriaSchema = z.string().meta({
  description:
    'Gerada pela API e mostrada só nesta resposta: o banco guarda o hash. Segue a regra de senha, e a troca é ' +
    'obrigatória no primeiro acesso.',
  example: 'Kp7m-Qx3r-Tz9w',
})

// ---------- POST /usuarios ----------

const criarUsuarioBody = z.object({
  nome: nomeSchema,
  email: z
    .email('Digite um e-mail válido, como nome@hospital.com.br')
    .max(EMAIL_MAXIMO, `Use no máximo ${EMAIL_MAXIMO} caracteres`)
    .toLowerCase()
    .meta({
      description: 'Gravado em minúsculas. Não se repete entre os usuários e não muda depois.',
      example: 'ana.souza@hospital.com.br',
    }),
  perfil: perfilSchema,
})

export const criarUsuario = { body: criarUsuarioBody }

export type DadosDoNovoUsuario = z.output<typeof criarUsuarioBody>

export const usuarioCriadoSchema = z.object({
  usuario: usuarioSchema,
  senhaProvisoria: senhaProvisoriaSchema,
})

export type UsuarioCriado = z.output<typeof usuarioCriadoSchema>

// ---------- PATCH /usuarios/:id ----------

const editarUsuarioBody = z
  .object({ nome: nomeSchema.optional(), perfil: perfilSchema.optional() })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Envie o que vai mudar: o nome, o perfil ou os dois.',
  })
  .meta({ description: 'Muda o nome, o perfil ou os dois; o e-mail não muda.' })

export const editarUsuario = { params: idParams, body: editarUsuarioBody }

export type DadosDaEdicaoDoUsuario = z.output<typeof editarUsuarioBody>

// ---------- PUT /usuarios/:id/setores ----------

const setoresBody = z.object({
  setorIds: z.array(idNoCorpo()).meta({
    description:
      'Todos os setores da pessoa, que substituem os de antes; a lista vazia tira todos. Repetidos contam uma ' +
      'vez, e setores inativos valem.',
    example: [1, 4],
  }),
})

export const definirSetoresDoUsuario = { params: idParams, body: setoresBody }

// ---------- PATCH /usuarios/:id/status ----------

const statusBody = z.object({
  ativo: z.boolean().meta({ description: '`true` ativa a conta; `false` a desativa e derruba as sessões.' }),
})

export const alterarStatusDoUsuario = { params: idParams, body: statusBody }

// ---------- POST /usuarios/:id/redefinir-senha ----------

export const redefinirSenhaDoUsuario = { params: idParams }

export const senhaRedefinidaSchema = z.object({ senhaProvisoria: senhaProvisoriaSchema })
