import { z } from 'zod'
import { idParams } from '../../shared/http/parametros'

export const MENSAGEM_TURNO_NAO_ENCONTRADO = 'Turno não encontrado.'

const NOME_MINIMO = 2
const NOME_MAXIMO = 100

/** HH:mm de 00:00 a 23:59, a mesma regra dos CHECKs da tabela `turnos`. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const horaSchema = z.string().regex(HORA, 'Informe a hora, como 07:00')

const nomeSchema = z
  .string()
  .trim()
  .min(NOME_MINIMO, 'Informe o nome do turno')
  .max(NOME_MAXIMO, `Use no máximo ${NOME_MAXIMO} caracteres`)
  .meta({
    description: `De ${NOME_MINIMO} a ${NOME_MAXIMO} caracteres; os espaços das pontas saem.`,
    example: 'Manhã',
  })

export const turnoSchema = z
  .object({
    id: z.number().int(),
    nome: z.string(),
    horaInicio: z.string().meta({ description: 'Início, em HH:mm.', example: '19:00' }),
    horaFim: z.string().meta({
      description: 'Fim, em HH:mm. Menor que o início quando o turno passa da meia-noite.',
      example: '07:00',
    }),
    ordem: z.number().int().meta({ description: 'Posição na lista. O turno novo entra no fim.' }),
  })
  .meta({
    id: 'Turno',
    description:
      'Período do dia. O paciente escolhe o turno na pesquisa, e o totem usa o do horário atual. Turnos não ' +
      'são desativados nem apagados.',
  })

export type Turno = z.output<typeof turnoSchema>

// ---------- POST /turnos e PATCH /turnos/:id ----------

/** O turno inteiro: o nome e os dois horários vão sempre juntos, na criação e na edição. */
const dadosDoTurnoBody = z
  .object({
    nome: nomeSchema,
    horaInicio: horaSchema.meta({ description: 'Início, em HH:mm, de 00:00 a 23:59.', example: '19:00' }),
    horaFim: horaSchema.meta({
      description:
        'Fim, em HH:mm, de 00:00 a 23:59, diferente do início. Menor que o início no turno que passa da ' +
        'meia-noite, como o das 19:00 às 07:00.',
      example: '07:00',
    }),
  })
  .refine(({ horaInicio, horaFim }) => horaInicio !== horaFim, {
    path: ['horaFim'],
    message: 'O fim precisa ser diferente do início',
  })

export const criarTurno = { body: dadosDoTurnoBody }

export const editarTurno = { params: idParams, body: dadosDoTurnoBody }

export type DadosDoTurno = z.output<typeof dadosDoTurnoBody>
