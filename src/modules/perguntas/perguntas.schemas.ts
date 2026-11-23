import { z } from 'zod'
import {
  TIPO_COM_OPCOES,
  TIPOS_DE_PERGUNTA,
  type TipoPergunta,
} from '../../shared/constants/tipos-de-pergunta'
import { idNoCorpo, idParams, idSchema } from '../../shared/http/parametros'

export const MENSAGEM_PERGUNTA_NAO_ENCONTRADA = 'Pergunta não encontrada.'
export const MENSAGEM_TIPO_TRAVADO =
  'Esta pergunta já tem respostas, então o tipo não pode mudar. Crie outra pergunta e desative esta.'
export const MENSAGEM_ESCOLHA_UMA_CATEGORIA = 'Escolha uma categoria'
export const MENSAGEM_CATEGORIA_INATIVA = 'Esta categoria está desativada. Escolha outra.'
export const MENSAGEM_LISTA_INCOMPLETA = 'A lista precisa ter todas as perguntas do setor'

const TEXTO_MINIMO = 5
/** O mesmo limite do formulário do front: pergunta curta é mais respondida. */
const TEXTO_MAXIMO = 140
const OPCOES_MINIMO = 2
const OPCOES_MAXIMO = 5
const OPCAO_MAXIMO = 80

/** Os problemas das opções, todos no campo `opcoes`, que é onde o formulário do front mostra o erro. */
export const MENSAGENS_DAS_OPCOES = {
  foraDoTipo: 'Só a pergunta de múltipla escolha tem opções',
  quantidade: `Escreva de ${OPCOES_MINIMO} a ${OPCOES_MAXIMO} opções`,
  vazia: 'Escreva o texto de cada opção',
  longa: `Use no máximo ${OPCAO_MAXIMO} caracteres em cada opção`,
  repetida: 'As opções não podem se repetir',
} as const

export const tipoPerguntaSchema = z.enum(TIPOS_DE_PERGUNTA, { error: 'Escolha o tipo da pergunta' }).meta({
  id: 'TipoPergunta',
  description:
    'Escala de 1 a 5 (com os rostinhos), sim ou não, múltipla escolha ou texto livre. Uma pergunta que já ' +
    'tem respostas não muda de tipo.',
})

export const perguntaSchema = z
  .object({
    id: z.number().int(),
    setorId: z.number().int(),
    categoriaId: z.number().int(),
    texto: z.string(),
    tipo: tipoPerguntaSchema,
    opcoes: z.array(z.string()).nullable().meta({
      description: 'As opções da múltipla escolha, na ordem em que aparecem; `null` nos outros tipos.',
    }),
    ordem: z.number().int().meta({
      description: 'Posição na pesquisa do setor: o paciente vê as ativas nesta ordem. A nova entra no fim.',
    }),
    ativa: z.boolean().meta({
      description: 'Só as ativas aparecem na pesquisa. Desativar não apaga nada: as respostas continuam.',
    }),
    temRespostas: z.boolean().meta({
      description: 'Já foi respondida ao menos uma vez: o tipo não pode mais mudar.',
    }),
  })
  .meta({ id: 'Pergunta', description: 'Pergunta da pesquisa de um setor.' })

export type Pergunta = z.output<typeof perguntaSchema>

/** O que muda numa pergunta, no formato do contrato: `opcoes` é `null` fora da múltipla escolha. */
export type ConteudoDaPergunta = Pick<Pergunta, 'texto' | 'categoriaId' | 'tipo' | 'opcoes'>

const textoSchema = z
  .string()
  .trim()
  .min(TEXTO_MINIMO, 'Escreva a pergunta')
  .max(TEXTO_MAXIMO, `Use no máximo ${TEXTO_MAXIMO} caracteres: perguntas curtas são mais respondidas`)
  .meta({
    description: `De ${TEXTO_MINIMO} a ${TEXTO_MAXIMO} caracteres; os espaços das pontas saem.`,
    example: 'Como foi o atendimento na recepção?',
  })

const opcoesSchema = z
  .array(z.string().trim())
  .nullable()
  .optional()
  .meta({
    description:
      `Só na múltipla escolha, e nela obrigatórias: de ${OPCOES_MINIMO} a ${OPCOES_MAXIMO} opções, cada uma ` +
      `com até ${OPCAO_MAXIMO} caracteres, sem repetir (nem com maiúsculas diferentes); os espaços das ` +
      'pontas saem. Nos outros tipos, `null`, a lista vazia ou nada.',
    example: ['Sim, e entendi tudo', 'Sim, mas fiquei com dúvidas', 'Não'],
  })

/** O primeiro problema das opções para o tipo escolhido, ou `undefined` se estiverem certas. */
function problemaNasOpcoes(tipo: TipoPergunta, opcoes: string[] | null | undefined): string | undefined {
  if (tipo !== TIPO_COM_OPCOES) return opcoes?.length ? MENSAGENS_DAS_OPCOES.foraDoTipo : undefined
  if (!opcoes || opcoes.length < OPCOES_MINIMO || opcoes.length > OPCOES_MAXIMO) {
    return MENSAGENS_DAS_OPCOES.quantidade
  }
  if (opcoes.some((opcao) => opcao === '')) return MENSAGENS_DAS_OPCOES.vazia
  if (opcoes.some((opcao) => opcao.length > OPCAO_MAXIMO)) return MENSAGENS_DAS_OPCOES.longa
  const semMaiusculas = new Set(opcoes.map((opcao) => opcao.toLocaleLowerCase('pt-BR')))
  if (semMaiusculas.size < opcoes.length) return MENSAGENS_DAS_OPCOES.repetida
  return undefined
}

// ---------- POST /setores/:setorId/perguntas e PATCH /perguntas/:id ----------

/**
 * A pergunta inteira, na criação e na edição: as opções dependem do tipo, então os quatro campos vão sempre
 * juntos. A categoria precisa existir e estar ativa, o que o service confere no banco.
 */
const dadosDaPerguntaBody = z
  .object({
    texto: textoSchema,
    categoriaId: idNoCorpo(MENSAGEM_ESCOLHA_UMA_CATEGORIA).meta({
      description:
        'Uma categoria ativa. Na edição, vale também a categoria que a pergunta já tem, mesmo desativada.',
      example: 1,
    }),
    tipo: tipoPerguntaSchema,
    opcoes: opcoesSchema,
  })
  .superRefine(({ tipo, opcoes }, contexto) => {
    const problema = problemaNasOpcoes(tipo, opcoes)
    if (problema) contexto.addIssue({ code: 'custom', path: ['opcoes'], message: problema })
  })

export type DadosDaPergunta = z.output<typeof dadosDaPerguntaBody>

const setorParams = z.object({ setorId: idSchema })

export const listarPerguntas = { params: setorParams }

export const criarPergunta = { params: setorParams, body: dadosDaPerguntaBody }

export const editarPergunta = { params: idParams, body: dadosDaPerguntaBody }

// ---------- PUT /setores/:setorId/perguntas/ordem ----------

const ordemBody = z.object({
  ids: z.array(idNoCorpo()).meta({
    description:
      'Os IDs de todas as perguntas do setor, ativas e inativas, na nova ordem: a primeira da lista fica na ' +
      'posição 1.',
    example: [13, 12, 14],
  }),
})

export const ordenarPerguntas = { params: setorParams, body: ordemBody }

// ---------- PATCH /perguntas/:id/status ----------

const statusBody = z.object({
  ativa: z
    .boolean()
    .meta({ description: '`true` ativa a pergunta, que volta à pesquisa; `false` a desativa.' }),
})

export const alterarStatusDaPergunta = { params: idParams, body: statusBody }
