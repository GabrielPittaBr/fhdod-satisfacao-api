import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  alterarStatusDoUsuario,
  criarUsuario,
  definirSetoresDoUsuario,
  editarUsuario,
  MENSAGEM_DESATIVAR_A_PROPRIA_CONTA,
  MENSAGEM_EMAIL_REPETIDO,
  MENSAGEM_MUDAR_O_PROPRIO_PERFIL,
  MENSAGEM_SETOR_INEXISTENTE,
  MENSAGEM_USUARIO_NAO_ENCONTRADO,
  redefinirSenhaDoUsuario,
  senhaRedefinidaSchema,
  usuarioCriadoSchema,
  usuarioSchema,
  type Usuario,
} from './usuarios.schemas'

const TAGS = ['Usuários']

const ANA: Usuario = {
  id: 7,
  nome: 'Ana Souza',
  email: 'ana.souza@hospital.com.br',
  perfil: 'GESTOR',
  ativo: true,
  trocarSenha: false,
  setorIds: [1, 4],
  ultimoLoginEm: '2026-11-20T11:42:05.120Z',
}

const USUARIOS_DE_EXEMPLO: Usuario[] = [
  ANA,
  {
    id: 9,
    nome: 'Bruno Lima',
    email: 'bruno.lima@hospital.com.br',
    perfil: 'OUVIDORIA',
    ativo: true,
    trocarSenha: true,
    setorIds: [],
    ultimoLoginEm: null,
  },
  {
    id: 3,
    nome: 'Carla Mendes',
    email: 'carla.mendes@hospital.com.br',
    perfil: 'VISUALIZADOR',
    ativo: false,
    trocarSenha: false,
    setorIds: [2],
    ultimoLoginEm: '2026-10-02T19:03:44.981Z',
  },
]

/** Só o Super Admin gerencia usuários; e, como em toda rota do painel, quem está com a senha provisória não entra. */
const SEM_PERMISSAO: ErroDaRota = {
  codigo: 'SEM_PERMISSAO',
  quando: 'sem a permissão `usuarios:gerenciar` (só o Super Admin a tem) ou com a senha provisória.',
}

const USUARIO_INEXISTENTE: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe usuário com este ID.',
  mensagem: MENSAGEM_USUARIO_NAO_ENCONTRADO,
}

export function documentarUsuarios(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/usuarios',
    tags: TAGS,
    summary: 'Contas do painel',
    description: 'Ativas e inativas, em ordem alfabética e sem paginação.',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('As contas, em ordem alfabética.', envelope(z.array(usuarioSchema)), {
        data: USUARIOS_DE_EXEMPLO,
      }),
    },
    erros: ['NAO_AUTENTICADO', SEM_PERMISSAO],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/usuarios',
    tags: TAGS,
    summary: 'Cria uma conta com senha provisória',
    description:
      'A conta nasce ativa, sem setores e com a troca de senha obrigatória no primeiro acesso. A senha ' +
      'provisória só aparece nesta resposta, que não fica em cache (`Cache-Control: no-store`). Os setores ' +
      'são definidos em `PUT /usuarios/{id}/setores`. A criação vai para a auditoria, sem a senha.',
    security: EXIGE_LOGIN,
    requisicao: criarUsuario,
    respostas: {
      201: respostaJson('Conta criada.', envelope(usuarioCriadoSchema), {
        data: {
          usuario: { ...ANA, trocarSenha: true, setorIds: [], ultimoLoginEm: null },
          senhaProvisoria: 'Kp7m-Qx3r-Tz9w',
        },
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'nome com menos de 3 caracteres (em `nome`), e-mail inválido (em `email`) ou perfil desconhecido ' +
          '(em `perfil`).',
        detalhes: [{ campo: 'email', mensagem: 'Digite um e-mail válido, como nome@hospital.com.br' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      { codigo: 'CONFLITO', quando: 'o e-mail já é de outra conta.', mensagem: MENSAGEM_EMAIL_REPETIDO },
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/usuarios/{id}',
    tags: TAGS,
    summary: 'Edita o nome e o perfil',
    description:
      'Só os campos enviados mudam; o e-mail não muda. O perfil novo vale na hora, sem esperar o token ' +
      'vencer. A mudança de perfil vai para a auditoria, com o antes e o depois.',
    security: EXIGE_LOGIN,
    requisicao: editarUsuario,
    respostas: { 200: respostaJson('Conta editada.', envelope(usuarioSchema), { data: ANA }) },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'nome com menos de 3 caracteres (em `nome`), perfil desconhecido (em `perfil`) ou nada para mudar.',
        detalhes: [{ campo: 'nome', mensagem: 'Informe o nome completo' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      USUARIO_INEXISTENTE,
      {
        codigo: 'CONFLITO',
        quando: 'a pessoa tenta mudar o próprio perfil.',
        mensagem: MENSAGEM_MUDAR_O_PROPRIO_PERFIL,
      },
    ],
  })

  documentarRota(registry, {
    method: 'put',
    path: '/api/v1/usuarios/{id}/setores',
    tags: TAGS,
    summary: 'Define os setores da pessoa',
    description:
      'A lista substitui os setores de antes. O escopo novo vale na hora. A mudança vai para a auditoria, com ' +
      'o antes e o depois.',
    security: EXIGE_LOGIN,
    requisicao: definirSetoresDoUsuario,
    respostas: { 204: { description: 'Setores definidos.' } },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando: 'algum setor não existe (em `setorIds`).',
        detalhes: [{ campo: 'setorIds', mensagem: MENSAGEM_SETOR_INEXISTENTE }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      USUARIO_INEXISTENTE,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/usuarios/{id}/status',
    tags: TAGS,
    summary: 'Ativa ou desativa uma conta',
    description:
      'Nada é apagado. Desativar derruba na hora todas as sessões da pessoa, que não entra mais até ser ' +
      'ativada de novo. A mudança vai para a auditoria.',
    security: EXIGE_LOGIN,
    requisicao: alterarStatusDoUsuario,
    respostas: { 204: { description: 'Situação da conta atualizada.' } },
    erros: [
      { codigo: 'VALIDACAO', detalhes: [{ campo: 'ativo', mensagem: 'Obrigatório' }] },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO,
      USUARIO_INEXISTENTE,
      {
        codigo: 'CONFLITO',
        quando: 'a pessoa tenta desativar a própria conta.',
        mensagem: MENSAGEM_DESATIVAR_A_PROPRIA_CONTA,
      },
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/usuarios/{id}/redefinir-senha',
    tags: TAGS,
    summary: 'Gera outra senha provisória',
    description:
      'Para quem esqueceu a senha: a senha de antes deixa de valer, a troca passa a ser obrigatória no próximo ' +
      'acesso e as sessões da pessoa caem. A senha nova só aparece nesta resposta, que não fica em cache. A ' +
      'redefinição vai para a auditoria, sem a senha.',
    security: EXIGE_LOGIN,
    requisicao: redefinirSenhaDoUsuario,
    respostas: {
      200: respostaJson('Senha redefinida.', envelope(senhaRedefinidaSchema), {
        data: { senhaProvisoria: 'Wr4t-hN8c-Zm2p' },
      }),
    },
    erros: ['NAO_AUTENTICADO', SEM_PERMISSAO, USUARIO_INEXISTENTE],
  })
}
