import { ehErroDoPrisma } from '../../database/erros'
import { TIPO_COM_OPCOES } from '../../shared/constants/tipos-de-pergunta'
import { AppError, type DetalheErro } from '../../shared/errors/app-error'
import { classificarNota } from '../../shared/rules/classificar-nota'
import { gerarTokenOpaco, hashDoToken } from '../../shared/security/tokens'
import {
  pesquisaRepository,
  type NovaResposta,
  type PerguntaDaPesquisa,
  type RespostaGravada,
} from './pesquisa.repository'
import {
  MENSAGEM_JA_ENVIADA,
  MENSAGEM_PESQUISA_INDISPONIVEL,
  MENSAGEM_TURNO,
  MENSAGENS_DOS_ITENS,
  RESPOSTAS_SIM_NAO,
  VALIDADE_DO_COMPLEMENTO_MS,
  type EnvioResposta,
  type PesquisaPublica,
  type RespostaCriada,
} from './pesquisa.schemas'

/** O setor do endereço, se existir e estiver ativo; senão, 404 com a mensagem que o paciente vê. */
async function setorAtivo(slug: string) {
  const setor = await pesquisaRepository.buscarSetor(slug)
  if (!setor?.ativo) throw AppError.naoEncontrado(MENSAGEM_PESQUISA_INDISPONIVEL)
  return setor
}

/** Um token de complemento novo: só o hash vai para o banco; o token sai uma vez, na resposta. */
function novoToken() {
  const token = gerarTokenOpaco()
  return { token, hash: hashDoToken(token), expiraEm: new Date(Date.now() + VALIDADE_DO_COMPLEMENTO_MS) }
}

function criada(
  { id, classificacao }: RespostaGravada,
  { token, expiraEm }: ReturnType<typeof novoToken>,
): RespostaCriada {
  return { id, classificacao, tokenComplemento: token, expiraEm: expiraEm.toISOString() }
}

type ItemEnviado = EnvioResposta['itens'][number]
type ItemGravado = NovaResposta['itens'][number]

/** O valor do item para o tipo da pergunta, ou o problema dele: o campo e a mensagem. */
function valorDoItem(
  pergunta: PerguntaDaPesquisa,
  { valorNumero, valorTexto }: ItemEnviado,
  limiteDeTexto: number,
):
  | Pick<ItemGravado, 'valorNumero' | 'valorTexto'>
  | { campo: 'valorNumero' | 'valorTexto'; mensagem: string } {
  switch (pergunta.tipo) {
    case 'ESCALA_1_5':
      return Number.isInteger(valorNumero) && valorNumero! >= 1 && valorNumero! <= 5
        ? { valorNumero, valorTexto: null }
        : { campo: 'valorNumero', mensagem: MENSAGENS_DOS_ITENS.escala }
    case 'SIM_NAO':
      return RESPOSTAS_SIM_NAO.some((resposta) => resposta === valorTexto)
        ? { valorNumero: null, valorTexto }
        : { campo: 'valorTexto', mensagem: MENSAGENS_DOS_ITENS.simNao }
    case TIPO_COM_OPCOES:
      return valorTexto !== undefined && pergunta.opcoes.includes(valorTexto)
        ? { valorNumero: null, valorTexto }
        : { campo: 'valorTexto', mensagem: MENSAGENS_DOS_ITENS.opcao }
    case 'TEXTO': {
      const texto = valorTexto?.trim() ?? ''
      return texto !== '' && texto.length <= limiteDeTexto
        ? { valorNumero: null, valorTexto: texto }
        : { campo: 'valorTexto', mensagem: MENSAGENS_DOS_ITENS.texto(limiteDeTexto) }
    }
  }
}

/**
 * Os itens a gravar, cada um com o texto, a categoria e o tipo da pergunta de agora, ou todos os problemas,
 * um por item, no caminho do corpo (`itens.0`, `itens.1.valorNumero`).
 */
function conferirItens(itens: ItemEnviado[], perguntas: PerguntaDaPesquisa[], limiteDeTexto: number) {
  const ativas = new Map(perguntas.map((pergunta) => [pergunta.id, pergunta]))
  const vistas = new Set<number>()
  const gravaveis: ItemGravado[] = []
  const detalhes: DetalheErro[] = []

  for (const [indice, item] of itens.entries()) {
    const pergunta = ativas.get(item.perguntaId)
    const repetida = pergunta !== undefined && vistas.has(pergunta.id)
    if (!pergunta || repetida) {
      const mensagem = repetida ? MENSAGENS_DOS_ITENS.repetida : MENSAGENS_DOS_ITENS.foraDaPesquisa
      detalhes.push({ campo: `itens.${indice}`, mensagem })
      continue
    }
    vistas.add(pergunta.id)

    const valor = valorDoItem(pergunta, item, limiteDeTexto)
    if ('campo' in valor) {
      detalhes.push({ campo: `itens.${indice}.${valor.campo}`, mensagem: valor.mensagem })
      continue
    }
    gravaveis.push({
      perguntaId: pergunta.id,
      categoriaId: pergunta.categoriaId,
      perguntaTexto: pergunta.texto,
      tipo: pergunta.tipo,
      ...valor,
    })
  }
  return { gravaveis, detalhes }
}

/**
 * A mesma chave chegou de novo (toque duplo ou reenvio depois de uma queda de rede): devolve a avaliação
 * gravada, com um token novo no lugar do anterior. Com a chave usada em outro setor, ou com o complemento já
 * feito, não há o que devolver: 409.
 */
async function reenviada(gravada: RespostaGravada, setorId: number): Promise<RespostaCriada> {
  const token = novoToken()
  if (
    gravada.setorId !== setorId ||
    !(await pesquisaRepository.trocarToken(gravada.id, token.hash, token.expiraEm))
  ) {
    throw AppError.conflito(MENSAGEM_JA_ENVIADA)
  }
  return criada(gravada, token)
}

export const pesquisaService = {
  /** A pesquisa do setor: perguntas ativas na ordem, turnos, texto do NPS e tempos do totem. */
  async abrir(slug: string): Promise<PesquisaPublica> {
    const setor = await setorAtivo(slug)
    const [perguntas, turnos, configuracoes] = await Promise.all([
      pesquisaRepository.perguntasAtivas(setor.id),
      pesquisaRepository.turnos(),
      pesquisaRepository.lerConfiguracoes(),
    ])
    return {
      setor: { nome: setor.nome, slug: setor.slug },
      perguntas: perguntas.map(({ id, texto, tipo, opcoes }) => ({
        id,
        texto,
        tipo,
        opcoes: tipo === TIPO_COM_OPCOES ? opcoes : null,
      })),
      turnos,
      npsTexto: configuracoes.nps_texto,
      textoLimiteCaracteres: configuracoes.texto_limite_caracteres,
      totem: {
        reinicioSegundos: configuracoes.totem_reinicio_segundos,
        inatividadeSegundos: configuracoes.totem_inatividade_segundos,
      },
    }
  },

  /**
   * Grava a avaliação, classificada, com os itens e o hash de um token de complemento de 30 minutos. A chave
   * de idempotência é conferida antes de tudo: o reenvio devolve a gravada, mesmo que uma pergunta tenha sido
   * desativada no meio do caminho. Dois envios simultâneos com a mesma chave caem no único do banco, e o
   * segundo também devolve a gravada.
   */
  async enviar(slug: string, envio: EnvioResposta): Promise<RespostaCriada> {
    const setor = await setorAtivo(slug)
    const jaGravada = await pesquisaRepository.buscarPorChave(envio.chaveIdempotencia)
    if (jaGravada) return reenviada(jaGravada, setor.id)

    const [perguntas, turnoExiste, configuracoes] = await Promise.all([
      pesquisaRepository.perguntasAtivas(setor.id),
      pesquisaRepository.turnoExiste(envio.turnoId),
      pesquisaRepository.lerConfiguracoes(),
    ])
    const { gravaveis, detalhes } = conferirItens(
      envio.itens,
      perguntas,
      configuracoes.texto_limite_caracteres,
    )
    if (!turnoExiste) detalhes.unshift({ campo: 'turnoId', mensagem: MENSAGEM_TURNO })
    if (detalhes.length > 0) throw AppError.validacao(detalhes)

    const notas = gravaveis.flatMap(({ valorNumero }) =>
      typeof valorNumero === 'number' ? [valorNumero] : [],
    )
    const token = novoToken()
    try {
      const gravada = await pesquisaRepository.criar({
        setorId: setor.id,
        canal: envio.canal,
        dataAtendimento: new Date(`${envio.dataAtendimento}T00:00:00Z`),
        turnoId: envio.turnoId,
        nps: envio.nps,
        classificacao: classificarNota(envio.nps, notas, configuracoes),
        chaveIdempotencia: envio.chaveIdempotencia,
        tokenComplementoHash: token.hash,
        tokenComplementoExpiraEm: token.expiraEm,
        itens: gravaveis,
      })
      return criada(gravada, token)
    } catch (erro) {
      if (!ehErroDoPrisma(erro, 'valorRepetido')) throw erro
      const gravadaAoMesmoTempo = await pesquisaRepository.buscarPorChave(envio.chaveIdempotencia)
      if (!gravadaAoMesmoTempo) throw erro
      return reenviada(gravadaAoMesmoTempo, setor.id)
    }
  },
}
