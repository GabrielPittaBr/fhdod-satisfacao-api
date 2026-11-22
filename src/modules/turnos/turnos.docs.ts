import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { documentarRota, EXIGE_LOGIN, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  criarTurno,
  editarTurno,
  MENSAGEM_TURNO_NAO_ENCONTRADO,
  turnoSchema,
  type Turno,
} from './turnos.schemas'

const TAGS = ['Turnos']

const NOITE: Turno = { id: 3, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', ordem: 3 }

const TURNOS_DE_EXEMPLO: Turno[] = [
  { id: 1, nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00', ordem: 1 },
  { id: 2, nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00', ordem: 2 },
  NOITE,
]

const SEM_PERMISSAO_PARA_GERENCIAR = {
  codigo: 'SEM_PERMISSAO',
  quando: 'sem a permissão `turnos:gerenciar` (só o Super Admin a tem) ou com a senha provisória.',
} as const

const HORARIOS_INVALIDOS: ErroDaRota = {
  codigo: 'VALIDACAO',
  quando:
    'nome com menos de 2 caracteres (em `nome`), hora fora do formato HH:mm (em `horaInicio` ou `horaFim`) ' +
    'ou fim igual ao início (em `horaFim`).',
  detalhes: [{ campo: 'horaFim', mensagem: 'O fim precisa ser diferente do início' }],
}

export function documentarTurnos(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/turnos',
    tags: TAGS,
    summary: 'Turnos, na ordem',
    description:
      'Todos os turnos, na ordem definida e sem paginação. Qualquer perfil logado recebe a lista inteira.',
    security: EXIGE_LOGIN,
    respostas: {
      200: respostaJson('Os turnos, na ordem.', envelope(z.array(turnoSchema)), { data: TURNOS_DE_EXEMPLO }),
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
    path: '/api/v1/turnos',
    tags: TAGS,
    summary: 'Cria um turno',
    description:
      'O turno entra no fim da ordem. O fim pode ser menor que o início, no turno que passa da meia-noite.',
    security: EXIGE_LOGIN,
    requisicao: criarTurno,
    respostas: { 201: respostaJson('Turno criado.', envelope(turnoSchema), { data: NOITE }) },
    erros: [HORARIOS_INVALIDOS, 'NAO_AUTENTICADO', SEM_PERMISSAO_PARA_GERENCIAR],
  })

  documentarRota(registry, {
    method: 'patch',
    path: '/api/v1/turnos/{id}',
    tags: TAGS,
    summary: 'Edita o nome e os horários de um turno',
    description:
      'Recebe o turno inteiro: o nome e os dois horários. A ordem não muda. Turnos não são desativados nem ' +
      'apagados.',
    security: EXIGE_LOGIN,
    requisicao: editarTurno,
    respostas: { 200: respostaJson('Turno editado.', envelope(turnoSchema), { data: NOITE }) },
    erros: [
      HORARIOS_INVALIDOS,
      'NAO_AUTENTICADO',
      SEM_PERMISSAO_PARA_GERENCIAR,
      {
        codigo: 'NAO_ENCONTRADO',
        quando: 'não existe turno com este ID.',
        mensagem: MENSAGEM_TURNO_NAO_ENCONTRADO,
      },
    ],
  })
}
