import type { Autor } from '../../database/auditoria'
import type { ArquivoParaBaixar } from '../../shared/http/download'
import type { FiltrosDoDashboard } from '../../shared/http/filtros-do-painel'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import { formatarTelefone } from '../../shared/rules/telefone'
import { temPermissao, type UsuarioAutenticado } from '../../shared/security/acesso'
import { decifrar } from '../../shared/security/crypto'
import { dashboardService } from '../dashboard/dashboard.service'
import { enviarPdf, gerarPdfDoResumo } from './exportacao.pdf'
import { escreverPlanilhaDasRespostas, escreverPlanilhaDoResumo } from './exportacao.planilhas'
import { exportacaoRepository } from './exportacao.repository'
import type { DadosDoResumo, FiltrosDoArquivo } from './exportacao.resumo'
import { nomeDoArquivo, TIPO_PDF, TIPO_XLSX } from './exportacao.schemas'

/** Respostas lidas do banco de cada vez nas abas do arquivo detalhado: a memória não cresce com o período. */
export const RESPOSTAS_POR_LOTE = 500

/** As ações das exportações na auditoria. */
export const ACOES_DA_EXPORTACAO = {
  resumo: 'exportacao_de_resumo',
  resumoEmPdf: 'exportacao_de_resumo_em_pdf',
  respostas: 'exportacao_de_respostas',
} as const

/** Os filtros como vão para a auditoria: só os que vieram no pedido. */
function filtrosDaAuditoria({ inicio, fim, base, setorId, turnoId, canal }: FiltrosDoDashboard) {
  return {
    inicio,
    fim,
    base,
    ...(setorId !== undefined && { setorId }),
    ...(turnoId !== undefined && { turnoId }),
    ...(canal !== undefined && { canal }),
  }
}

/** Os filtros com os nomes do setor e do turno pedidos ou, sem setor, com os setores que a pessoa enxerga. */
async function filtrosDoArquivo(
  filtros: FiltrosDoDashboard,
  setorIds: readonly number[] | null,
): Promise<FiltrosDoArquivo> {
  const [setor, turno, setoresDoEscopo] = await Promise.all([
    filtros.setorId === undefined ? undefined : exportacaoRepository.nomeDoSetor(filtros.setorId),
    filtros.turnoId === undefined ? undefined : exportacaoRepository.nomeDoTurno(filtros.turnoId),
    filtros.setorId !== undefined || setorIds === null ? null : exportacaoRepository.setores(setorIds),
  ])
  return {
    ...filtros,
    ...(setor !== undefined && { setor }),
    ...(turno !== undefined && { turno }),
    setoresDoEscopo: setoresDoEscopo && setoresDoEscopo.sort(porNome).map(({ nome }) => nome),
  }
}

/** A aba Resumo: os números do dashboard com os mesmos filtros e o mesmo escopo, e quem gerou o arquivo. */
async function dadosDoResumo(
  filtros: FiltrosDoDashboard,
  usuario: UsuarioAutenticado,
): Promise<DadosDoResumo> {
  const [indicadores, setores, categorias, filtrosDescritos] = await Promise.all([
    dashboardService.resumo(filtros, usuario.setorIds),
    dashboardService.npsPorSetor(filtros, usuario.setorIds),
    dashboardService.categorias(filtros, usuario.setorIds),
    filtrosDoArquivo(filtros, usuario.setorIds),
  ])
  return {
    filtros: filtrosDescritos,
    indicadores,
    setores,
    categorias,
    geradoEm: new Date(),
    geradoPor: usuario.nome,
  }
}

/** Lê as respostas do arquivo `tamanho` de cada vez, só quando a aba pede o próximo lote. */
async function* emLotes<T>(
  ids: readonly number[],
  tamanho: number,
  buscar: (lote: number[]) => Promise<T[]>,
): AsyncGenerator<T[]> {
  for (let inicio = 0; inicio < ids.length; inicio += tamanho) {
    yield await buscar(ids.slice(inicio, inicio + tamanho))
  }
}

export interface OpcoesDoArquivoDetalhado {
  /** Padrão: `RESPOSTAS_POR_LOTE`. Os testes usam lotes pequenos, para ver vários sem criar centenas de respostas. */
  respostasPorLote?: number
}

/**
 * As exportações do painel. Quem chama já passou pelo `authorize` e pelo `setorScope` da rota; as consultas aplicam
 * o escopo de quem exporta, como no dashboard, então o Gestor e o Visualizador só levam os seus setores.
 *
 * Cada método faz antes do primeiro byte tudo o que pode falhar (as contas, os nomes, os telefones e a linha da
 * auditoria) e devolve o arquivo pronto para ser escrito: um erro até ali vira a resposta de erro padrão. A linha
 * da auditoria entra antes de o arquivo sair, como na revelação do telefone: se a geração cair no meio, a
 * tentativa fica registrada.
 */
export const exportacaoService = {
  /** O resumo: os filtros, os indicadores, o NPS por setor e as médias por categoria. Nunca tem telefone. */
  async resumo(
    filtros: FiltrosDoDashboard,
    usuario: UsuarioAutenticado,
    ip: string | null,
  ): Promise<ArquivoParaBaixar> {
    const resumo = await dadosDoResumo(filtros, usuario)
    const autor: Autor = { usuarioId: usuario.id, ip }
    await exportacaoRepository.registrarExportacao(autor, ACOES_DA_EXPORTACAO.resumo, {
      filtros: filtrosDaAuditoria(filtros),
      respostas: resumo.indicadores.total,
      comTelefones: false,
    })
    return {
      nome: nomeDoArquivo('resumo', filtros, 'xlsx'),
      tipo: TIPO_XLSX,
      escrever: (saida) => escreverPlanilhaDoResumo(saida, resumo),
    }
  },

  /**
   * O resumo em PDF, com o mesmo conteúdo da planilha do resumo, em no máximo duas páginas. O PDF é montado antes
   * da linha da auditoria: se ele não sair, nada fica registrado.
   */
  async resumoEmPdf(
    filtros: FiltrosDoDashboard,
    usuario: UsuarioAutenticado,
    ip: string | null,
  ): Promise<ArquivoParaBaixar> {
    const resumo = await dadosDoResumo(filtros, usuario)
    const documento = await gerarPdfDoResumo(resumo)
    const autor: Autor = { usuarioId: usuario.id, ip }
    await exportacaoRepository.registrarExportacao(autor, ACOES_DA_EXPORTACAO.resumoEmPdf, {
      filtros: filtrosDaAuditoria(filtros),
      respostas: resumo.indicadores.total,
      comTelefones: false,
    })
    return {
      nome: nomeDoArquivo('resumo', filtros, 'pdf'),
      tipo: TIPO_PDF,
      escrever: (saida) => enviarPdf(documento, saida),
    }
  },

  /**
   * O detalhado: o resumo e cada resposta, cada pergunta respondida e cada comentário. O telefone completo só
   * entra para quem tem `contatos:ver`; para os outros, a coluna nem existe, e a consulta nem lê o número cifrado.
   * Os números saem decifrados antes do primeiro byte: um que não se lê vira o erro padrão, e a auditoria conta
   * exatamente os que vão no arquivo.
   */
  async respostas(
    filtros: FiltrosDoDashboard,
    usuario: UsuarioAutenticado,
    ip: string | null,
    { respostasPorLote = RESPOSTAS_POR_LOTE }: OpcoesDoArquivoDetalhado = {},
  ): Promise<ArquivoParaBaixar> {
    const comTelefones = temPermissao(usuario, 'contatos:ver')
    const [resumo, doArquivo] = await Promise.all([
      dadosDoResumo(filtros, usuario),
      exportacaoRepository.respostasDoArquivo(filtros, usuario.setorIds, comTelefones),
    ])

    const telefones = new Map<number, string>()
    for (const { id, telefoneCifrado } of doArquivo) {
      if (telefoneCifrado !== null) telefones.set(id, formatarTelefone(decifrar(telefoneCifrado)))
    }
    const ids = doArquivo.map(({ id }) => id)

    const autor: Autor = { usuarioId: usuario.id, ip }
    await exportacaoRepository.registrarExportacao(autor, ACOES_DA_EXPORTACAO.respostas, {
      filtros: filtrosDaAuditoria(filtros),
      respostas: ids.length,
      comTelefones,
      telefones: telefones.size,
    })

    return {
      nome: nomeDoArquivo('respostas', filtros, 'xlsx'),
      tipo: TIPO_XLSX,
      escrever: (saida) =>
        escreverPlanilhaDasRespostas(saida, {
          resumo,
          comTelefones,
          respostas: emLotes(ids, respostasPorLote, async (lote) =>
            (await exportacaoRepository.respostas(lote)).map((resposta) => ({
              ...resposta,
              telefone: telefones.get(resposta.id) ?? null,
            })),
          ),
          itens: emLotes(ids, respostasPorLote, (lote) => exportacaoRepository.itens(lote)),
          comentarios: emLotes(ids, respostasPorLote, (lote) => exportacaoRepository.comentarios(lote)),
        }),
    }
  },
}
