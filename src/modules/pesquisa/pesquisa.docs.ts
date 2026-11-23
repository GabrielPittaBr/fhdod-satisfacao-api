import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { CONFIGURACOES_PADRAO } from '../../shared/constants/configuracoes'
import { documentarRota, respostaJson, type ErroDaRota } from '../../shared/http/documentacao'
import { envelope } from '../../shared/http/respond'
import {
  abrirPesquisa,
  enviarResposta,
  MENSAGEM_JA_ENVIADA,
  MENSAGEM_NPS,
  MENSAGEM_PESQUISA_INDISPONIVEL,
  pesquisaPublicaSchema,
  respostaCriadaSchema,
  type PesquisaPublica,
  type RespostaCriada,
} from './pesquisa.schemas'

const TAGS = ['Pesquisa pública']

const PESQUISA_DE_EXEMPLO: PesquisaPublica = {
  setor: { nome: 'Pronto Atendimento', slug: 'pronto-atendimento' },
  perguntas: [
    { id: 12, texto: 'Como foi o atendimento na recepção?', tipo: 'ESCALA_1_5', opcoes: null },
    {
      id: 13,
      texto: 'Você recebeu as orientações sobre o exame?',
      tipo: 'MULTIPLA_ESCOLHA',
      opcoes: ['Sim, e entendi tudo', 'Sim, mas fiquei com dúvidas', 'Não'],
    },
    { id: 14, texto: 'O tempo de espera foi informado?', tipo: 'SIM_NAO', opcoes: null },
  ],
  turnos: [
    { id: 1, nome: 'Manhã', horaInicio: '07:00', horaFim: '13:00' },
    { id: 2, nome: 'Tarde', horaInicio: '13:00', horaFim: '19:00' },
    { id: 3, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00' },
  ],
  npsTexto: CONFIGURACOES_PADRAO.nps_texto,
  textoLimiteCaracteres: CONFIGURACOES_PADRAO.texto_limite_caracteres,
  totem: {
    reinicioSegundos: CONFIGURACOES_PADRAO.totem_reinicio_segundos,
    inatividadeSegundos: CONFIGURACOES_PADRAO.totem_inatividade_segundos,
  },
}

const RESPOSTA_CRIADA: RespostaCriada = {
  id: 845,
  classificacao: 'BAIXA',
  tokenComplemento: 'kZ3pX9qT2vLm8RwYc4Nf6Hb1Jd7Ks0Ga5Ue3Oi9Py2',
  expiraEm: '2026-11-10T14:52:00.000Z',
}

const PESQUISA_INDISPONIVEL: ErroDaRota = {
  codigo: 'NAO_ENCONTRADO',
  quando: 'não existe setor com este endereço, ou ele está desativado.',
  mensagem: MENSAGEM_PESQUISA_INDISPONIVEL,
}

export function documentarPesquisa(registry: OpenAPIRegistry) {
  documentarRota(registry, {
    method: 'get',
    path: '/api/v1/publico/setores/{slug}/pesquisa',
    tags: TAGS,
    summary: 'Abre a pesquisa do setor',
    description:
      'Sem login. O nome do setor, as perguntas ativas na ordem, os turnos e os textos e tempos que a tela ' +
      'usa, lidos das configurações.',
    requisicao: abrirPesquisa,
    respostas: {
      200: respostaJson('A pesquisa do setor.', envelope(pesquisaPublicaSchema), {
        data: PESQUISA_DE_EXEMPLO,
      }),
    },
    erros: [PESQUISA_INDISPONIVEL],
  })

  documentarRota(registry, {
    method: 'post',
    path: '/api/v1/publico/setores/{slug}/respostas',
    tags: TAGS,
    summary: 'Envia a avaliação',
    description:
      'Sem login, com limite de envios por IP (os IPs do `RATE_LIMIT_ALLOWLIST`, como o do hospital, ficam ' +
      'fora dele). Grava a avaliação ao confirmar a nota de 0 a 10, mesmo sem nenhuma outra pergunta ' +
      'respondida, e devolve a classificação e o token de complemento, numa resposta sem cache. A mesma ' +
      '`chaveIdempotencia` enviada de novo devolve a avaliação já gravada (o mesmo `id` e a mesma ' +
      '`classificacao`), com um token novo, que substitui o anterior. O IP de quem envia não é gravado.',
    requisicao: enviarResposta,
    respostas: {
      201: respostaJson('Avaliação gravada (ou já gravada, num reenvio).', envelope(respostaCriadaSchema), {
        data: RESPOSTA_CRIADA,
      }),
    },
    erros: [
      {
        codigo: 'VALIDACAO',
        quando:
          'um item em `detalhes` por problema: NPS fora de 0 a 10 (em `nps`), data futura (em ' +
          '`dataAtendimento`), turno inexistente (em `turnoId`), chave que não é UUID (em `chaveIdempotencia`), ' +
          'pergunta que não é uma ativa do setor ou repetida (em `itens.N`), valor errado para o tipo da ' +
          'pergunta (em `itens.N.valorNumero` ou `itens.N.valorTexto`) e o campo isca preenchido (em `site`).',
        detalhes: [{ campo: 'nps', mensagem: MENSAGEM_NPS }],
      },
      PESQUISA_INDISPONIVEL,
      {
        codigo: 'CONFLITO',
        quando: 'a chave já foi usada num envio de outro setor, ou no de uma avaliação já complementada.',
        mensagem: MENSAGEM_JA_ENVIADA,
      },
      {
        codigo: 'LIMITE_ATINGIDO',
        quando: 'mais de 30 envios do mesmo IP em 15 minutos.',
        mensagem: 'Muitas avaliações enviadas desta rede. Espere alguns minutos e tente de novo.',
      },
    ],
  })
}
