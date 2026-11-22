import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  categoriaSchema,
  criarCategoria,
  editarCategoria,
  MENSAGEM_CATEGORIA_NAO_ENCONTRADA,
  MENSAGEM_NOME_REPETIDO,
  type Categoria,
} from './categorias.schemas'

const TAGS = ['Categorias']

const RECEPCAO: Categoria = { id: 1, nome: 'Recepção', ordem: 1, ativa: true }

const CATEGORIAS_DE_EXEMPLO: Categoria[] = [
  RECEPCAO,
  { id: 2, nome: 'Triagem', ordem: 2, ativa: true },
  { id: 7, nome: 'Tempo de Espera', ordem: 3, ativa: false },
]

const SEM_PERMISSAO_PARA_GERENCIAR = {
  codigo: 'SEM_PERMISSAO',
  quando: 'sem a permissão `categorias:gerenciar` (só o Super Admin a tem) ou com a senha provisória.',
} as const

const NOME_REPETIDO = {
  codigo: 'CONFLITO',
  quando: 'o nome já é de outra categoria, mesmo com maiúsculas diferentes.',
  mensagem: MENSAGEM_NOME_REPETIDO,
} as const

export function documentarCategorias(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/categorias',
    tags: TAGS,
    summary: 'Categorias, na ordem',
    description:
      'Ativas e inativas, na ordem definida e sem paginação. As categorias valem para todos os setores: ' +
      'qualquer perfil logado recebe a lista inteira.',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('As categorias, na ordem.', envelope(z.array(categoriaSchema)), {
        data: CATEGORIAS_DE_EXEMPLO,
      }),
    },
    erros: [
      'NAO_AUTENTICADO',
      {
        codigo: 'SEM_PERMISSAO',
        quando: 'com a senha provisória, até a troca.',
        mensagem: 'Troque a senha provisória para continuar.',
      },
    ],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/categorias',
    tags: TAGS,
    summary: 'Cria uma categoria',
    description: 'A categoria nasce ativa e entra no fim da ordem.',
    security: EXIGE_LOGIN,
    requisicao: criarCategoria,
    respostas: {
      201: respostaJson('Categoria criada.', envelope(categoriaSchema), {
        data: { id: 8, nome: 'Farmácia', ordem: 8, ativa: true },
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando: 'nome com menos de 2 caracteres (em `nome`).',
        detalhes: [{ campo: 'nome', mensagem: 'Informe o nome da categoria' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      NOME_REPETIDO,
    ],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/categorias/{id}',
    tags: TAGS,
    summary: 'Edita, ativa ou desativa uma categoria',
    description:
      'Muda o nome, a situação ou os dois; a ordem não muda. Nada é apagado: as perguntas e as respostas da ' +
      'categoria inativa continuam.',
    security: EXIGE_LOGIN,
    requisicao: editarCategoria,
    respostas: {
      200: respostaJson('Categoria editada.', envelope(categoriaSchema), { data: RECEPCAO }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando: 'nome com menos de 2 caracteres (em `nome`), `ativa` que não é booleano ou nada para mudar.',
        detalhes: [{ campo: 'nome', mensagem: 'Informe o nome da categoria' }],
      },
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      {
        codigo: 'NAO_ENCONTRADO',
        quando: 'não existe categoria com este ID.',
        mensagem: MENSAGEM_CATEGORIA_NAO_ENCONTRADA,
      },
      NOME_REPETIDO,
    ],
  })
}
