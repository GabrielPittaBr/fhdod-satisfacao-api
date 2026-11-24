import { z } from 'zod'
import { idParams } from '../../shared/http/parametros'
import { NOTA_BOA_A_PARTIR_DE } from '../../shared/rules/notas-da-escala'
import { MINIMO_DE_NOTAS_DO_PONTO, SETORES_NOS_DESTAQUES } from '../../shared/rules/ranking-de-pontos'
import {
  mediaSchema,
  npsSchema,
  percentual45Schema,
  pontoEvolucaoSchema,
} from '../dashboard/dashboard.schemas'

/** O cabeçalho em que a TV manda o token do link, o que vem depois do `#` em `/tv#<token>`. */
export const CABECALHO_DA_TELA = 'X-Tv-Token'

/** O 401 da TV, sem o token, com um que não existe ou de uma tela desativada: a mesma mensagem nos três. */
export const MENSAGEM_TELA_INATIVA = 'Esta tela não está ativa.'

export const MENSAGEM_TELA_NAO_ENCONTRADA = 'Tela não encontrada.'

/**
 * Minutos entre duas gravações do último acesso de uma tela, no mínimo. A TV consulta a cada 30 s: gravar a cada
 * consulta seria uma escrita no banco a cada 30 s por TV, só para dizer que ela continua ligada.
 */
export const MINUTOS_ENTRE_ACESSOS = 5

/** Semanas da evolução da TV, contando a atual. */
export const SEMANAS_DA_EVOLUCAO = 12

/** Dias dos destaques da TV, contando hoje. */
export const DIAS_DOS_DESTAQUES = 30

const NOME_MINIMO = 2
const NOME_MAXIMO = 100

// ---------- Telas ----------

export const telaTvSchema = z
  .object({
    id: z.number().int(),
    nome: z.string().meta({ description: 'Onde a tela fica. Aparece no topo da TV.' }),
    ativa: z.boolean().meta({
      description: 'A tela desativada não abre mais: o link dela recebe 401 até a tela ser ativada de novo.',
    }),
    ultimoAcessoEm: z.iso
      .datetime()
      .nullable()
      .meta({
        description:
          `A última vez que a TV abriu os indicadores, em UTC, gravada no máximo a cada ${MINUTOS_ENTRE_ACESSOS} ` +
          'minutos; `null` se a tela nunca foi aberta.',
      }),
  })
  .meta({ id: 'TelaTv', description: 'Uma TV do hospital, com o seu link.' })

export type TelaTv = z.output<typeof telaTvSchema>

export const telaTvCriadaSchema = z.object({
  tela: telaTvSchema,
  token: z.string().meta({
    description:
      'Aleatório e mostrado só nesta resposta: o banco guarda o hash. O front monta o link `/tv#<token>`, e a TV ' +
      'o manda no cabeçalho `X-Tv-Token`. Perdido o link, a tela é desativada e outra é criada.',
    example: 'jIWDi92T12y8w3ZdkfQFXBxKOtO28BLzEKAK84UyMNs',
  }),
})

export type TelaTvCriada = z.output<typeof telaTvCriadaSchema>

// ---------- POST /tv-telas ----------

const criarTelaBody = z.object({
  nome: z
    .string()
    .trim()
    .min(NOME_MINIMO, 'Informe onde a tela fica')
    .max(NOME_MAXIMO, `Use no máximo ${NOME_MAXIMO} caracteres`)
    .meta({
      description: `Onde a tela fica, de ${NOME_MINIMO} a ${NOME_MAXIMO} caracteres; os espaços das pontas saem.`,
      example: 'Recepção principal',
    }),
})

export const criarTela = { body: criarTelaBody }

export type DadosDaNovaTela = z.output<typeof criarTelaBody>

// ---------- PATCH /tv-telas/:id/status ----------

const alterarStatusBody = z.object({
  ativa: z.boolean().meta({
    description:
      '`true` ativa a tela, e o mesmo link volta a abrir; `false` a desativa, e o link para na hora.',
  }),
})

export const alterarStatusDaTela = { params: idParams, body: alterarStatusBody }

// ---------- GET /tv/indicadores ----------

const mesSchema = z
  .object({
    nps: npsSchema,
    total: z.number().int().meta({ description: 'Respostas do mês.' }),
    promotores: z.number().int().meta({ description: 'Respostas do mês com NPS 9 ou 10.' }),
    neutros: z.number().int().meta({ description: 'Respostas do mês com NPS 7 ou 8.' }),
    detratores: z.number().int().meta({ description: 'Respostas do mês com NPS de 0 a 6.' }),
    mediaEscala: z
      .number()
      .nullable()
      .meta({
        description:
          'Média das notas de 1 a 5 de todas as perguntas de escala respondidas no mês, com uma casa decimal; ' +
          '`null` sem nenhuma nota.',
        example: 4.3,
      }),
  })
  .meta({
    description: 'O mês corrente, do dia 1 até hoje no horário de Brasília, pela data do atendimento.',
  })

const npsDoSetorSchema = z.object({
  setor: z.string().meta({ description: 'O nome do setor, também se ele estiver desativado.' }),
  nps: npsSchema,
  total: z.number().int().meta({ description: 'Respostas do setor no mês.' }),
})

const destaqueSchema = z.object({
  setor: z.string(),
  categoria: z.string(),
  media: mediaSchema,
  percentual45: percentual45Schema,
})

export const indicadoresTvSchema = z
  .object({
    tela: z.string().meta({ description: 'O nome da tela que pediu os números.' }),
    geradoEm: z.iso
      .datetime()
      .meta({ description: 'O instante em que os números foram calculados, em UTC.' }),
    mes: mesSchema,
    npsPorSetor: z.array(npsDoSetorSchema).meta({
      description:
        'O NPS de cada setor com respostas no mês, do maior para o menor; no empate, o de mais respostas e ' +
        'depois a ordem alfabética.',
    }),
    evolucao: z.array(pontoEvolucaoSchema).meta({
      description:
        `O NPS de cada semana (de segunda a domingo) nas últimas ${SEMANAS_DA_EVOLUCAO}, da mais antiga até a ` +
        'atual, que vai até hoje, pela data do atendimento; as semanas sem resposta vêm com `nps` `null` e `total` 0.',
    }),
    destaques: z.array(destaqueSchema).meta({
      description:
        `O ponto (um setor numa categoria) mais bem avaliado de até ${SETORES_NOS_DESTAQUES} setores ` +
        `diferentes, nos últimos ${DIAS_DOS_DESTAQUES} dias contando hoje, pela data do atendimento, só com os ` +
        `pontos com ${MINIMO_DE_NOTAS_DO_PONTO} notas de 1 a 5 ou mais. A ordem é a da maior média, depois a do ` +
        `maior % de notas ${NOTA_BOA_A_PARTIR_DE} e 5; com poucos pontos, a lista fica curta ou vazia.`,
    }),
  })
  .meta({
    id: 'IndicadoresTv',
    description:
      'Os números gerais da pesquisa para a TV, de todos os setores: só contagens e médias, sem comentário, ' +
      'telefone ou texto escrito pelo paciente.',
  })

export type IndicadoresTv = z.output<typeof indicadoresTvSchema>
