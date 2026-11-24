import type { Canal } from '../http/canal'
import type { BaseData } from '../http/filtros-do-painel'
import type { Classificacao } from '../rules/classificar-nota'
import type { TipoComentario } from './tipos-de-comentario'
import type { TipoPergunta } from './tipos-de-pergunta'

// Os nomes que a pessoa lê no lugar dos códigos do contrato, nos arquivos que a API gera (as exportações). Nas
// telas, quem dá os nomes é o front (`src/lib/rotulos.ts`); os textos são os mesmos, para o arquivo falar como o
// painel.

export const ROTULO_CANAL: Record<Canal, string> = {
  WEB: 'Celular ou computador',
  TOTEM: 'Totem',
}

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  NORMAL: 'Normal',
  BAIXA: 'Baixa',
  BAIXISSIMA: 'Baixíssima',
}

export const ROTULO_COMENTARIO: Record<TipoComentario, string> = {
  ELOGIO: 'Elogio',
  RECLAMACAO: 'Reclamação',
  SUGESTAO: 'Sugestão',
  OUTRO: 'Outro',
}

export const ROTULO_TIPO_PERGUNTA: Record<TipoPergunta, string> = {
  ESCALA_1_5: 'Rostinhos (1 a 5)',
  SIM_NAO: 'Sim ou não',
  MULTIPLA_ESCOLHA: 'Múltipla escolha',
  TEXTO: 'Texto livre',
}

/** O que o paciente respondeu numa pergunta de sim ou não, que o banco grava como `SIM` ou `NAO`. */
export const ROTULO_SIM_NAO: Record<string, string> = {
  SIM: 'Sim',
  NAO: 'Não',
}

export const ROTULO_BASE: Record<BaseData, string> = {
  ATENDIMENTO: 'Data do atendimento',
  ENVIO: 'Data do envio, no horário de Brasília',
}
