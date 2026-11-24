import { z } from 'zod'
import { TIPOS_DE_COMENTARIO } from '../../shared/constants/tipos-de-comentario'
import { hojeEmBrasilia } from '../../shared/rules/calendario'
import { CLASSIFICACOES } from '../../shared/rules/classificar-nota'
import { telefoneValido } from '../../shared/rules/telefone'
import { canalSchema } from '../../shared/http/canal'
import { idNoCorpo, idParams } from '../../shared/http/parametros'
import { tipoPerguntaSchema } from '../perguntas/perguntas.schemas'

export const MENSAGEM_PESQUISA_INDISPONIVEL = 'Esta pesquisa não está disponível.'
export const MENSAGEM_JA_ENVIADA = 'Esta avaliação já foi enviada. Obrigado por responder!'
export const MENSAGEM_NPS = 'Obrigatório, de 0 a 10'
export const MENSAGEM_DATA_FUTURA = 'Informe uma data que não seja futura'
export const MENSAGEM_TURNO = 'Escolha o turno do atendimento'
export const MENSAGEM_ISCA = 'Deixe este campo em branco'

/** Os problemas de cada item, no campo do item (`itens.0`) ou do valor (`itens.0.valorNumero`). */
export const MENSAGENS_DOS_ITENS = {
  foraDaPesquisa: 'Esta pergunta não faz parte da pesquisa',
  repetida: 'Esta pergunta foi respondida mais de uma vez',
  escala: 'Escolha uma nota de 1 a 5',
  simNao: 'Responda sim ou não',
  opcao: 'Escolha uma das opções',
  texto: (limite: number) => `Escreva a resposta, com até ${limite} caracteres`,
} as const

/** As respostas aceitas numa pergunta de sim ou não. */
export const RESPOSTAS_SIM_NAO = ['SIM', 'NAO'] as const

/** O token de complemento vale por 30 minutos ("Autenticação e sessão", no plano). */
export const VALIDADE_DO_COMPLEMENTO_MS = 30 * 60 * 1000

/** O filtro de classificação fora dos valores aceitos, na lista de respostas. */
export const MENSAGEM_CLASSIFICACAO = 'Escolha normal, baixa ou baixíssima'

export const classificacaoSchema = z.enum(CLASSIFICACOES, { error: MENSAGEM_CLASSIFICACAO }).meta({
  id: 'Classificacao',
  description:
    'A pior entre a do NPS e a de cada nota de 1 a 5, com os limites das configurações (no padrão, NPS até 6 ' +
    'é baixa e até 2 é baixíssima; nota até 3 é baixa e 1 é baixíssima). O front escolhe a próxima tela por ela.',
})

// ---------- GET /publico/setores/:slug/pesquisa ----------

const slugParams = z.object({
  slug: z.string().meta({ description: 'O endereço do setor, de `/s/<slug>` e `/totem/<slug>`.' }),
})

export const abrirPesquisa = { params: slugParams }

export const perguntaPublicaSchema = z
  .object({
    id: z.number().int(),
    texto: z.string(),
    tipo: tipoPerguntaSchema,
    opcoes: z.array(z.string()).nullable().meta({
      description: 'As opções da múltipla escolha, na ordem em que aparecem; `null` nos outros tipos.',
    }),
  })
  .meta({ id: 'PerguntaPublica', description: 'Pergunta ativa da pesquisa, como o paciente a vê.' })

export type PerguntaPublica = z.output<typeof perguntaPublicaSchema>

export const pesquisaPublicaSchema = z
  .object({
    setor: z.object({ nome: z.string(), slug: z.string() }),
    perguntas: z.array(perguntaPublicaSchema).meta({ description: 'Só as ativas, na ordem da pesquisa.' }),
    turnos: z
      .array(
        z.object({
          id: z.number().int(),
          nome: z.string(),
          horaInicio: z.string().meta({ description: 'Início, em HH:mm.', example: '07:00' }),
          horaFim: z.string().meta({
            description: 'Fim, em HH:mm. Menor que o início quando o turno passa da meia-noite.',
            example: '13:00',
          }),
        }),
      )
      .meta({ description: 'Todos os turnos, na ordem definida. O totem usa o do horário atual.' }),
    npsTexto: z.string().meta({ description: 'O texto da pergunta de 0 a 10.' }),
    textoLimiteCaracteres: z
      .number()
      .int()
      .meta({ description: 'Tamanho máximo das respostas em texto e dos comentários.' }),
    totem: z.object({
      reinicioSegundos: z
        .number()
        .int()
        .meta({ description: 'Espera antes de o totem reiniciar a pesquisa.' }),
      inatividadeSegundos: z
        .number()
        .int()
        .meta({ description: 'Segundos sem toque até o totem perguntar se a pessoa ainda está lá.' }),
    }),
  })
  .meta({
    id: 'PesquisaPublica',
    description:
      'O que a tela da pesquisa precisa, lido do cadastro e das configurações. Os limites de nota baixa não ' +
      'vêm: a classificação é da API.',
  })

export type PesquisaPublica = z.output<typeof pesquisaPublicaSchema>

// ---------- POST /publico/setores/:slug/respostas ----------

const itemEnvioSchema = z
  .object({
    perguntaId: idNoCorpo(MENSAGENS_DOS_ITENS.foraDaPesquisa).meta({ example: 12 }),
    valorNumero: z.number().optional().meta({
      description: 'Na escala de 1 a 5: a nota, inteira, de 1 a 5.',
      example: 4,
    }),
    valorTexto: z
      .string()
      .optional()
      .meta({
        description:
          'No sim ou não, `SIM` ou `NAO`; na múltipla escolha, uma das opções, como veio na pesquisa; no texto ' +
          'livre, a resposta, não vazia e dentro do `textoLimiteCaracteres` (os espaços das pontas saem).',
      }),
  })
  .meta({ id: 'ItemEnvio', description: 'A resposta de uma pergunta. A pergunta pulada não vem.' })

const envioRespostaBody = z
  .object({
    chaveIdempotencia: z.uuid('Chave de envio inválida').meta({
      description:
        'UUID criado pelo front a cada avaliação e repetido em cada nova tentativa do mesmo envio. A mesma ' +
        'chave devolve a avaliação já gravada, sem criar outra.',
      example: '4b7e0c1a-9d2f-4c11-8a35-1f0e6b2d7c90',
    }),
    canal: canalSchema,
    dataAtendimento: z.iso
      .date({ error: 'Informe a data do atendimento' })
      .refine((data) => data <= hojeEmBrasilia(), MENSAGEM_DATA_FUTURA)
      .meta({
        description:
          'O dia do atendimento, em AAAA-MM-DD; não pode ser depois de hoje no horário de Brasília.',
        example: '2026-11-10',
      }),
    turnoId: idNoCorpo(MENSAGEM_TURNO).meta({ example: 1 }),
    itens: z.array(itemEnvioSchema).default([]).meta({
      description:
        'Uma resposta por pergunta ativa do setor, no máximo; as puladas não vêm, e a lista pode ser vazia.',
    }),
    nps: z
      .number({ error: MENSAGEM_NPS })
      .int(MENSAGEM_NPS)
      .min(0, MENSAGEM_NPS)
      .max(10, MENSAGEM_NPS)
      .meta({ description: 'A nota de 0 a 10, obrigatória.', example: 6 }),
    site: z
      .string()
      .max(0, MENSAGEM_ISCA)
      .optional()
      .meta({
        description:
          'Campo isca: o formulário o mantém invisível para pessoas (fora da tela, com `tabindex="-1"` e ' +
          '`autocomplete="off"`) e o envia vazio, ou não o envia. Preenchido, o envio é recusado e nada é gravado.',
      }),
  })
  .meta({ id: 'EnvioResposta', description: 'Uma avaliação, gravada ao confirmar a nota de 0 a 10.' })

export const enviarResposta = { params: slugParams, body: envioRespostaBody }

export type EnvioResposta = z.output<typeof envioRespostaBody>

export const respostaCriadaSchema = z
  .object({
    id: z.number().int(),
    classificacao: classificacaoSchema,
    tokenComplemento: z.string().meta({
      description:
        'Para anexar o comentário e o telefone, no cabeçalho `X-Complemento-Token`, uma vez só. Um reenvio com a ' +
        'mesma chave recebe outro, que substitui este.',
    }),
    expiraEm: z.iso.datetime().meta({ description: 'Até quando o token vale: 30 minutos depois do envio.' }),
  })
  .meta({ id: 'RespostaCriada', description: 'A avaliação gravada.' })

export type RespostaCriada = z.output<typeof respostaCriadaSchema>

// ---------- POST /publico/respostas/:id/complemento ----------

/** O cabeçalho que leva o token de complemento devolvido no envio. */
export const CABECALHO_DO_COMPLEMENTO = 'X-Complemento-Token'

/** O 401 do complemento, para o token que falta, é de outra avaliação, venceu ou já foi usado. */
export const MENSAGEM_PRAZO_DO_COMPLEMENTO = 'O prazo para complementar esta avaliação terminou.'

/** Os problemas do complemento, no campo do corpo (`comentario.texto`, `contato.telefone`). */
export const MENSAGENS_DO_COMPLEMENTO = {
  vazio: 'Envie o comentário, o telefone ou os dois',
  tipo: 'Escolha o tipo do comentário',
  texto: 'Escreva o comentário',
  textoLongo: (limite: number) => `O comentário pode ter até ${limite} caracteres`,
  telefone: 'Informe o telefone com DDD, como (51) 99999-0000',
  consentimento: 'O consentimento é obrigatório para guardar o telefone',
} as const

export const tipoComentarioSchema = z
  .enum(TIPOS_DE_COMENTARIO, { error: MENSAGENS_DO_COMPLEMENTO.tipo })
  .meta({ id: 'TipoComentario' })

const comentarioSchema = z.object({
  tipo: tipoComentarioSchema,
  texto: z
    .string({ error: MENSAGENS_DO_COMPLEMENTO.texto })
    .trim()
    .min(1, MENSAGENS_DO_COMPLEMENTO.texto)
    .meta({
      description:
        'O que aconteceu, o elogio ou a sugestão: não vazio e até o `textoLimiteCaracteres` da pesquisa (os ' +
        'espaços das pontas saem).',
      example: 'Esperei muito na triagem.',
    }),
})

const contatoSchema = z.object({
  // A mensagem é sempre a mesma e nunca repete o que veio: o telefone não aparece em erro nem no log.
  telefone: z
    .string({ error: MENSAGENS_DO_COMPLEMENTO.telefone })
    .refine(telefoneValido, MENSAGENS_DO_COMPLEMENTO.telefone)
    .meta({
      description:
        'Com DDD, de 10 ou 11 dígitos, com ou sem a máscara (espaços, parênteses, hífen e ponto). É gravado ' +
        'cifrado, só com os dígitos.',
      example: '(51) 99999-0000',
    }),
  consentimento: z.literal(true, { error: MENSAGENS_DO_COMPLEMENTO.consentimento }).meta({
    description: 'A pessoa autorizou o hospital a guardar o telefone e ligar. Sempre `true`.',
  }),
})

const complementoBody = z
  .object({
    comentario: comentarioSchema.optional().meta({ description: 'O comentário, se a pessoa escreveu.' }),
    contato: contatoSchema.optional().meta({
      description: 'O pedido de retorno, se a pessoa deixou o telefone. A tela o oferece na avaliação baixa.',
    }),
  })
  .refine(
    ({ comentario, contato }) => comentario !== undefined || contato !== undefined,
    MENSAGENS_DO_COMPLEMENTO.vazio,
  )
  .meta({
    id: 'Complemento',
    description: 'O que o paciente anexa à avaliação depois do envio: o comentário, o telefone ou os dois.',
    example: {
      comentario: { tipo: 'RECLAMACAO', texto: 'Esperei muito na triagem.' },
      contato: { telefone: '(51) 99999-0000', consentimento: true },
    },
  })

export const complementarResposta = { params: idParams, body: complementoBody }

export type Complemento = z.output<typeof complementoBody>
