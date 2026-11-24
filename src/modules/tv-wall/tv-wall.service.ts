import { AppError } from '../../shared/errors/app-error'
import type { FiltrosDoDashboard } from '../../shared/http/filtros-do-painel'
import {
  dataDoDia,
  diaDoCalendario,
  hojeEmBrasilia,
  primeiroDiaDoMes,
  segundaDaSemana,
  somarDias,
} from '../../shared/rules/calendario'
import { destacarPontos } from '../../shared/rules/ranking-de-pontos'
import type { TelaAutenticada, UsuarioAutenticado } from '../../shared/security/acesso'
import { gerarTokenOpaco, hashDoToken } from '../../shared/security/tokens'
import { dashboardService } from '../dashboard/dashboard.service'
import { tvWallRepository } from './tv-wall.repository'
import {
  DIAS_DOS_DESTAQUES,
  MENSAGEM_TELA_INATIVA,
  MENSAGEM_TELA_NAO_ENCONTRADA,
  MINUTOS_ENTRE_ACESSOS,
  SEMANAS_DA_EVOLUCAO,
  type DadosDaNovaTela,
  type IndicadoresTv,
  type TelaTv,
  type TelaTvCriada,
} from './tv-wall.schemas'

/** A TV junta todos os setores: os indicadores dela não têm o escopo de nenhum usuário. */
const TODOS_OS_SETORES = null

/**
 * Os períodos da TV, todos pela data do atendimento e até hoje no horário de Brasília: o mês corrente, as
 * `SEMANAS_DA_EVOLUCAO` semanas até a atual, cada uma de segunda a domingo e a primeira inteira, e os
 * `DIAS_DOS_DESTAQUES` dias até hoje, contando hoje.
 */
function periodosDaTv(agora: Date): Record<'mes' | 'semanas' | 'destaques', FiltrosDoDashboard> {
  const hoje = hojeEmBrasilia(agora)
  const segundaDestaSemana = dataDoDia(segundaDaSemana(diaDoCalendario(hoje)))
  const ate = (inicio: string): FiltrosDoDashboard => ({ inicio, fim: hoje, base: 'ATENDIMENTO' })
  return {
    mes: ate(primeiroDiaDoMes(hoje)),
    semanas: ate(somarDias(segundaDestaSemana, -7 * (SEMANAS_DA_EVOLUCAO - 1))),
    destaques: ate(somarDias(hoje, -(DIAS_DOS_DESTAQUES - 1))),
  }
}

export const tvWallService = {
  /** Todas as telas, ativas e desativadas, em ordem alfabética, sem o token. */
  listar(): Promise<TelaTv[]> {
    return tvWallRepository.listar()
  },

  /**
   * Cria a tela, já ativa, com um token aleatório que só sai nesta resposta: o banco guarda o hash, e o link
   * não pode ser mostrado de novo. Quem criou fica em `criado_por_id`.
   */
  async criar(autor: UsuarioAutenticado, { nome }: DadosDaNovaTela): Promise<TelaTvCriada> {
    const token = gerarTokenOpaco()
    const tela = await tvWallRepository.criar({ nome, tokenHash: hashDoToken(token), criadoPorId: autor.id })
    return { tela, token }
  },

  /**
   * Ativa ou desativa. A tela desativada para de abrir na consulta seguinte da TV, porque cada consulta confere
   * a tela no banco; ativada de novo, o mesmo link volta a abrir. Tela inexistente dá 404.
   */
  async alterarStatus(id: number, ativa: boolean): Promise<void> {
    if (!(await tvWallRepository.alterarStatus(id, ativa))) {
      throw AppError.naoEncontrado(MENSAGEM_TELA_NAO_ENCONTRADA)
    }
  },

  /**
   * A tela de um token. Sem token, com um que não existe ou de uma tela desativada, 401, sempre com a mesma
   * mensagem. O último acesso é gravado se a tela nunca foi aberta ou se o último foi há `MINUTOS_ENTRE_ACESSOS`
   * minutos ou mais.
   */
  async autenticarTela(token: string | undefined, agora = new Date()): Promise<TelaAutenticada> {
    const tela = token ? await tvWallRepository.buscarPeloToken(hashDoToken(token)) : null
    if (!tela?.ativa) throw AppError.naoAutenticado(MENSAGEM_TELA_INATIVA)

    const ultimoAte = new Date(agora.getTime() - MINUTOS_ENTRE_ACESSOS * 60_000)
    if (tela.ultimoAcessoEm === null || tela.ultimoAcessoEm <= ultimoAte) {
      await tvWallRepository.registrarAcesso(tela.id, agora, ultimoAte)
    }
    return { id: tela.id, nome: tela.nome }
  },

  /**
   * Os números gerais da TV, de todos os setores, com as mesmas contas do dashboard. Cada campo é copiado um a
   * um: nada além das contagens e das médias do contrato chega à TV, que nunca recebe comentário, telefone ou
   * texto escrito pelo paciente.
   */
  async indicadores(tela: TelaAutenticada, agora = new Date()): Promise<IndicadoresTv> {
    const periodos = periodosDaTv(agora)
    const [mes, setores, evolucao, pontos] = await Promise.all([
      dashboardService.resumo(periodos.mes, TODOS_OS_SETORES),
      dashboardService.npsPorSetor(periodos.mes, TODOS_OS_SETORES),
      dashboardService.evolucao({ ...periodos.semanas, granularidade: 'SEMANA' }, TODOS_OS_SETORES),
      dashboardService.pontosAvaliados(periodos.destaques, TODOS_OS_SETORES),
    ])
    return {
      tela: tela.nome,
      geradoEm: agora.toISOString(),
      mes: {
        nps: mes.nps,
        total: mes.total,
        promotores: mes.promotores,
        neutros: mes.neutros,
        detratores: mes.detratores,
        mediaEscala: mes.mediaEscala,
      },
      npsPorSetor: setores.map(({ setor, nps, total }) => ({ setor, nps, total })),
      evolucao: evolucao.map(({ periodo, nps, total }) => ({ periodo, nps, total })),
      destaques: destacarPontos(pontos).map(({ setor, categoria, media, percentual45 }) => ({
        setor,
        categoria,
        media,
        percentual45,
      })),
    }
  },
}
