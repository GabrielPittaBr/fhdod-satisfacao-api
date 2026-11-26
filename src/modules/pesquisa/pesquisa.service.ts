import { ehErroDoPrisma } from '../../database/erros'
import { TIPO_COM_OPCOES } from '../../shared/constants/tipos-de-pergunta'
import { AppError, type DetalheErro } from '../../shared/errors/app-error'
import { classificarNota } from '../../shared/rules/classificar-nota'
import { porNome } from '../../shared/rules/ordem-alfabetica'
import { digitosDoTelefone, finalDoTelefone } from '../../shared/rules/telefone'
import { cifrar } from '../../shared/security/crypto'
import { gerarTokenOpaco, hashDoToken } from '../../shared/security/tokens'
import {
  pesquisaRepository,
  type NovaResposta,
  type NovoComplemento,
  type PerguntaDaPesquisa,
  type RespostaGravada,
  type RespostaGravadaComChave,
} from './pesquisa.repository'
import {
  MENSAGEM_JA_ENVIADA,
  MENSAGEM_PESQUISA_INDISPONIVEL,
  MENSAGEM_PRAZO_DO_COMPLEMENTO,
  MENSAGEM_TURNO,
  MENSAGENS_DO_COMPLEMENTO,
  MENSAGENS_DO_ENVIO_GERAL,
  MENSAGENS_DOS_ITENS,
  RESPOSTAS_SIM_NAO,
  VALIDADE_DO_COMPLEMENTO_MS,
  type Complemento,
  type EnvioGeral,
  type EnvioResposta,
  type PerguntaPublica,
  type PesquisaGeral,
  type PesquisaPublica,
  type RespostaCriada,
  type RespostaCriadaDoSetor,
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

/** A pergunta como o paciente a vê: as opções só na múltipla escolha. */
function perguntaPublica({ id, texto, tipo, opcoes }: PerguntaDaPesquisa): PerguntaPublica {
  return { id, texto, tipo, opcoes: tipo === TIPO_COM_OPCOES ? opcoes : null }
}

type ItemEnviado = EnvioResposta['itens'][number]
type ItemGravado = NovaResposta['itens'][number]

/** As notas de 1 a 5 dos itens, que entram na classificação com o NPS. */
function notasDosItens(itens: ItemGravado[]): number[] {
  return itens.flatMap(({ valorNumero }) => (typeof valorNumero === 'number' ? [valorNumero] : []))
}

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

/** Um setor do envio geral, já conferido: o que veio no pedido e o ID do setor ativo daquele endereço. */
type SetorEnviado = EnvioGeral['setores'][number] & { setorId: number }

/**
 * Os setores do envio geral, na ordem do pedido. O endereço que não existe, ou de um setor desativado depois que
 * a pessoa abriu a pesquisa, dá 400 no setor da posição (`setores.1.slug`), com todos os problemas de uma vez.
 */
async function setoresDoEnvio(enviados: EnvioGeral['setores']): Promise<SetorEnviado[]> {
  const encontrados = await pesquisaRepository.buscarSetores(enviados.map(({ slug }) => slug))
  const porSlug = new Map(encontrados.map((setor) => [setor.slug, setor]))
  const setores: SetorEnviado[] = []
  const detalhes: DetalheErro[] = []
  for (const [indice, enviado] of enviados.entries()) {
    const setor = porSlug.get(enviado.slug)
    if (setor?.ativo) setores.push({ ...enviado, setorId: setor.id })
    else
      detalhes.push({ campo: `setores.${indice}.slug`, mensagem: MENSAGENS_DO_ENVIO_GERAL.setorIndisponivel })
  }
  if (detalhes.length > 0) throw AppError.validacao(detalhes)
  return setores
}

/**
 * As chaves do envio geral chegaram de novo (toque duplo ou reenvio depois de uma queda de rede). Só há o que
 * devolver se todas já foram gravadas, cada uma no setor da mesma posição: aí as avaliações voltam com tokens
 * novos, trocados juntos. Uma parte das chaves gravada, uma chave de outro setor ou uma avaliação já
 * complementada dão 409, sem gravar nada.
 */
async function reenviadasGerais(
  gravadas: RespostaGravadaComChave[],
  setores: SetorEnviado[],
): Promise<RespostaCriadaDoSetor[]> {
  const porChave = new Map(gravadas.map((gravada) => [gravada.chaveIdempotencia, gravada]))
  const trocas = setores.map(({ slug, setorId, chaveIdempotencia }) => {
    const gravada = porChave.get(chaveIdempotencia)
    if (!gravada || gravada.setorId !== setorId) throw AppError.conflito(MENSAGEM_JA_ENVIADA)
    return { slug, gravada, token: novoToken() }
  })
  const trocou = await pesquisaRepository.trocarTokens(
    trocas.map(({ gravada, token }) => ({
      id: gravada.id,
      tokenComplementoHash: token.hash,
      tokenComplementoExpiraEm: token.expiraEm,
    })),
  )
  if (!trocou) throw AppError.conflito(MENSAGEM_JA_ENVIADA)
  return trocas.map(({ slug, gravada, token }) => ({ slug, ...criada(gravada, token) }))
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
      perguntas: perguntas.map(perguntaPublica),
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
   * A pesquisa geral (`/avaliar`): os setores ativos em ordem alfabética, cada um com as perguntas ativas na
   * ordem, e os turnos e o texto do NPS, para a pessoa escolher os setores por onde passou.
   */
  async abrirGeral(): Promise<PesquisaGeral> {
    const [setores, turnos, configuracoes] = await Promise.all([
      pesquisaRepository.setoresAtivosComPerguntas(),
      pesquisaRepository.turnos(),
      pesquisaRepository.lerConfiguracoes(),
    ])
    return {
      setores: setores.sort(porNome).map(({ nome, slug, descricao, perguntas }) => ({
        nome,
        slug,
        descricao,
        perguntas: perguntas.map(perguntaPublica),
      })),
      turnos,
      npsTexto: configuracoes.nps_texto,
      textoLimiteCaracteres: configuracoes.texto_limite_caracteres,
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

    const token = novoToken()
    try {
      const gravada = await pesquisaRepository.criar({
        setorId: setor.id,
        canal: envio.canal,
        dataAtendimento: new Date(`${envio.dataAtendimento}T00:00:00Z`),
        turnoId: envio.turnoId,
        nps: envio.nps,
        classificacao: classificarNota(envio.nps, notasDosItens(gravaveis), configuracoes),
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

  /**
   * Grava a avaliação da pesquisa geral: uma resposta por setor escolhido, todas com a mesma nota, data, turno
   * e canal, e cada uma com os itens do próprio setor, a classificação pelas notas dele e um token de
   * complemento. As chaves são conferidas antes dos itens, como no envio de um setor; e as respostas entram
   * numa transação só. Dois envios simultâneos com as mesmas chaves caem no único do banco, e o segundo
   * devolve as gravadas.
   */
  async enviarGeral(envio: EnvioGeral): Promise<RespostaCriadaDoSetor[]> {
    const setores = await setoresDoEnvio(envio.setores)
    const chaves = setores.map(({ chaveIdempotencia }) => chaveIdempotencia)
    const jaGravadas = await pesquisaRepository.buscarPorChaves(chaves)
    if (jaGravadas.length > 0) return reenviadasGerais(jaGravadas, setores)

    const [perguntasPorSetor, turnoExiste, configuracoes] = await Promise.all([
      pesquisaRepository.perguntasAtivasDosSetores(setores.map(({ setorId }) => setorId)),
      pesquisaRepository.turnoExiste(envio.turnoId),
      pesquisaRepository.lerConfiguracoes(),
    ])
    const detalhes: DetalheErro[] = turnoExiste ? [] : [{ campo: 'turnoId', mensagem: MENSAGEM_TURNO }]
    const avaliacoes = setores.map(({ slug, setorId, chaveIdempotencia, itens }, indice) => {
      const conferidos = conferirItens(
        itens,
        perguntasPorSetor.get(setorId) ?? [],
        configuracoes.texto_limite_caracteres,
      )
      for (const { campo, mensagem } of conferidos.detalhes) {
        detalhes.push({ campo: `setores.${indice}.${campo}`, mensagem })
      }
      return { slug, setorId, chaveIdempotencia, itens: conferidos.gravaveis, token: novoToken() }
    })
    if (detalhes.length > 0) throw AppError.validacao(detalhes)

    const dataAtendimento = new Date(`${envio.dataAtendimento}T00:00:00Z`)
    try {
      const gravadas = await pesquisaRepository.criarVarias(
        avaliacoes.map(({ setorId, chaveIdempotencia, itens, token }) => ({
          setorId,
          canal: envio.canal,
          dataAtendimento,
          turnoId: envio.turnoId,
          nps: envio.nps,
          classificacao: classificarNota(envio.nps, notasDosItens(itens), configuracoes),
          chaveIdempotencia,
          tokenComplementoHash: token.hash,
          tokenComplementoExpiraEm: token.expiraEm,
          itens,
        })),
      )
      return gravadas.map((gravada, indice) => ({
        slug: avaliacoes[indice]!.slug,
        ...criada(gravada, avaliacoes[indice]!.token),
      }))
    } catch (erro) {
      if (!ehErroDoPrisma(erro, 'valorRepetido')) throw erro
      const gravadasAoMesmoTempo = await pesquisaRepository.buscarPorChaves(chaves)
      if (gravadasAoMesmoTempo.length === 0) throw erro
      return reenviadasGerais(gravadasAoMesmoTempo, setores)
    }
  },

  /**
   * Anexa o comentário, o pedido de retorno ou os dois à avaliação, com o token de complemento do envio, uma
   * vez só e dentro do prazo. O tamanho do comentário é conferido antes de usar o token: um texto longo demais
   * dá 400, e a pessoa pode corrigir e mandar de novo. O telefone vai cifrado, só com os dígitos, e com os 4
   * últimos em claro; o pedido de retorno nasce `NOVO`. Sem token, ou com um que não vale mais, 401.
   */
  async complementar(id: number, token: string | undefined, complemento: Complemento): Promise<void> {
    if (!token) throw AppError.naoAutenticado(MENSAGEM_PRAZO_DO_COMPLEMENTO)

    const { comentario, contato } = complemento
    if (comentario) {
      const { texto_limite_caracteres: limite } = await pesquisaRepository.lerConfiguracoes()
      if (comentario.texto.length > limite) {
        throw AppError.validacao([
          { campo: 'comentario.texto', mensagem: MENSAGENS_DO_COMPLEMENTO.textoLongo(limite) },
        ])
      }
    }

    const agora = new Date()
    const gravar: NovoComplemento = { comentario }
    if (contato) {
      const digitos = digitosDoTelefone(contato.telefone)
      gravar.contato = {
        telefoneCifrado: cifrar(digitos),
        telefoneFinal: finalDoTelefone(digitos),
        consentimentoEm: agora,
      }
    }

    if (!(await pesquisaRepository.complementar(id, hashDoToken(token), agora, gravar))) {
      throw AppError.naoAutenticado(MENSAGEM_PRAZO_DO_COMPLEMENTO)
    }
  },
}
