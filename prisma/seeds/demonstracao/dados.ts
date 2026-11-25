import type { Perfil, TipoComentario, TipoPergunta } from '../../../src/generated/prisma/enums'
import type { CATEGORIAS_INICIAIS } from '../base'

// Os dados de demonstração, os mesmos que o mock do front mostrava (src/mocks/seed/dados.ts do
// fhdod-satisfacao-web, apagado no ticket 10 de lá, com os usuários que saíram dele no ticket 06). Tudo é
// inventado: nenhum nome, e-mail, telefone ou comentário é real, e os e-mails usam o domínio reservado
// `.example`, que não recebe mensagens.
//
// As senhas e o token da TV daqui estão no repositório, então são públicos: valem na máquina de quem desenvolve.
// A homologação, que fica na internet, troca as senhas pelas variáveis DEMO_PASSWORD_* (ver o README).

/** Uma categoria do seed base, pelo nome: a demonstração usa as sete etapas do plano. */
export type NomeDaCategoria = (typeof CATEGORIAS_INICIAIS)[number]

export interface PerguntaDeDemonstracao {
  categoria: NomeDaCategoria
  texto: string
  tipo: TipoPergunta
  /** Só na múltipla escolha. */
  opcoes?: string[]
  /** Padrão: ativa. */
  ativa?: boolean
}

export interface SetorDeDemonstracao {
  nome: string
  slug: string
  descricao: string
  ativo: boolean
  /** Na ordem da jornada do paciente: é a ordem em que a pesquisa as mostra. */
  perguntas: PerguntaDeDemonstracao[]
}

const escala = (categoria: NomeDaCategoria, texto: string): PerguntaDeDemonstracao => ({
  categoria,
  texto,
  tipo: 'ESCALA_1_5',
})
const simOuNao = (categoria: NomeDaCategoria, texto: string): PerguntaDeDemonstracao => ({
  categoria,
  texto,
  tipo: 'SIM_NAO',
})

/**
 * Os seis setores do mock. A Maternidade está desativada ("em reforma"), com as perguntas, para o painel mostrar
 * um setor inativo. A Internação tem nove perguntas ativas, uma a mais que o limite do aviso de pesquisa longa
 * (8), e uma desativada.
 */
export const SETORES_DE_DEMONSTRACAO: readonly SetorDeDemonstracao[] = [
  {
    nome: 'Pronto Atendimento',
    slug: 'pronto-atendimento',
    descricao: 'Urgência e emergência, 24 horas',
    ativo: true,
    perguntas: [
      escala('Recepção', 'Como foi o atendimento na recepção?'),
      escala('Triagem', 'Como foi a primeira avaliação, quando perguntaram o que você sentia?'),
      escala('Tempo de Espera', 'O que você achou do tempo de espera?'),
      escala('Enfermagem', 'Como a equipe de enfermagem cuidou de você?'),
      escala('Médico', 'Como foi a consulta com o médico?'),
      simOuNao('Médico', 'O médico explicou o seu caso de um jeito fácil de entender?'),
    ],
  },
  {
    nome: 'Internação',
    slug: 'internacao',
    descricao: 'Quartos e enfermarias',
    ativo: true,
    perguntas: [
      escala('Recepção', 'Como foi a sua chegada e o registro da internação?'),
      escala('Enfermagem', 'Como a equipe de enfermagem cuidou de você?'),
      simOuNao('Enfermagem', 'Quando você chamou, alguém veio atender logo?'),
      escala('Médico', 'Como foram as visitas do médico?'),
      simOuNao('Médico', 'Explicaram o seu tratamento de um jeito fácil de entender?'),
      escala('Higiene e Limpeza', 'Como estava a limpeza do quarto e do banheiro?'),
      escala('Estrutura', 'Como era o conforto do quarto?'),
      {
        categoria: 'Estrutura',
        texto: 'Como estava o barulho à noite?',
        tipo: 'MULTIPLA_ESCOLHA',
        opcoes: ['Silencioso', 'Um pouco de barulho', 'Muito barulho'],
      },
      {
        categoria: 'Enfermagem',
        texto: 'Algum profissional merece um elogio? Conte para nós.',
        tipo: 'TEXTO',
      },
      { ...escala('Estrutura', 'O que você achou da comida?'), ativa: false },
    ],
  },
  {
    nome: 'Raio-X',
    slug: 'raio-x',
    descricao: 'Exames de imagem',
    ativo: true,
    perguntas: [
      escala('Recepção', 'Como foi o atendimento na recepção?'),
      {
        categoria: 'Tempo de Espera',
        texto: 'Quanto tempo você esperou para fazer o exame?',
        tipo: 'MULTIPLA_ESCOLHA',
        opcoes: ['Menos de 15 minutos', 'De 15 a 30 minutos', 'De 30 minutos a 1 hora', 'Mais de 1 hora'],
      },
      escala('Enfermagem', 'Como o profissional que fez o exame tratou você?'),
      simOuNao('Enfermagem', 'Explicaram como seria o exame antes de começar?'),
      escala('Estrutura', 'Como estava a sala de espera?'),
    ],
  },
  {
    nome: 'Laboratório',
    slug: 'laboratorio',
    descricao: 'Coleta e exames',
    ativo: true,
    perguntas: [
      escala('Recepção', 'Como foi o atendimento na recepção?'),
      escala('Tempo de Espera', 'O que você achou do tempo de espera?'),
      escala('Enfermagem', 'Como foi a coleta do exame?'),
      escala('Higiene e Limpeza', 'Como estava a limpeza do local?'),
    ],
  },
  {
    nome: 'Ambulatório',
    slug: 'ambulatorio',
    descricao: 'Consultas agendadas',
    ativo: true,
    perguntas: [
      escala('Recepção', 'Como foi o atendimento na recepção?'),
      simOuNao('Recepção', 'Foi fácil marcar a consulta?'),
      escala('Tempo de Espera', 'O que você achou do tempo de espera?'),
      escala('Médico', 'Como foi a consulta com o médico?'),
      simOuNao('Médico', 'Você saiu sabendo o que fazer depois da consulta?'),
      escala('Estrutura', 'Como estava a sala de espera?'),
    ],
  },
  {
    nome: 'Maternidade',
    slug: 'maternidade',
    descricao: 'Em reforma: pesquisa pausada',
    ativo: false,
    perguntas: [
      escala('Recepção', 'Como foi o atendimento na recepção?'),
      escala('Enfermagem', 'Como a equipe de enfermagem cuidou de você e do bebê?'),
      escala('Médico', 'Como foi o atendimento do médico?'),
      escala('Estrutura', 'Como era o conforto do quarto?'),
    ],
  },
]

/** A variável de ambiente que troca a senha de cada conta de demonstração. */
export type VariavelDaSenha =
  | 'DEMO_PASSWORD_SUPER_ADMIN'
  | 'DEMO_PASSWORD_GESTOR'
  | 'DEMO_PASSWORD_OUVIDORIA'
  | 'DEMO_PASSWORD_VISUALIZADOR'
  | 'DEMO_PASSWORD_PRIMEIRO_ACESSO'

export interface UsuarioDeDemonstracao {
  nome: string
  email: string
  perfil: Perfil
  /** Os slugs dos setores que a conta enxerga; vazio no Super Admin e na Ouvidoria, que enxergam todos. */
  setores: string[]
  /** A conta no primeiro acesso, com a troca da senha pedida no login. */
  trocarSenha: boolean
  /** A senha do repositório, que vale quando a variável não está definida. Segue a regra de senha. */
  senhaPadrao: string
  variavelDaSenha: VariavelDaSenha
  /** O que a conta mostra na apresentação, para o resumo do comando. */
  papel: string
}

/** Uma conta de cada perfil, um Gestor de dois setores e um Gestor no primeiro acesso. */
export const USUARIOS_DE_DEMONSTRACAO: readonly UsuarioDeDemonstracao[] = [
  {
    nome: 'Paulo Klein',
    email: 'admin@fhdod.example',
    perfil: 'SUPER_ADMIN',
    setores: [],
    trocarSenha: false,
    senhaPadrao: 'admin-demo-2026',
    variavelDaSenha: 'DEMO_PASSWORD_SUPER_ADMIN',
    papel: 'Super Admin: vê e gerencia tudo',
  },
  {
    nome: 'Marta Schneider',
    email: 'marta@fhdod.example',
    perfil: 'GESTOR',
    setores: ['pronto-atendimento', 'internacao'],
    trocarSenha: false,
    senhaPadrao: 'gestor-demo-2026',
    variavelDaSenha: 'DEMO_PASSWORD_GESTOR',
    papel: 'Gestor do Pronto Atendimento e da Internação',
  },
  {
    nome: 'Renata Oliveira',
    email: 'renata@fhdod.example',
    perfil: 'OUVIDORIA',
    setores: [],
    trocarSenha: false,
    senhaPadrao: 'ouvidoria-demo-2026',
    variavelDaSenha: 'DEMO_PASSWORD_OUVIDORIA',
    papel: 'Ouvidoria: todos os setores e os pedidos de retorno',
  },
  {
    nome: 'Diego Fontana',
    email: 'diego@fhdod.example',
    perfil: 'VISUALIZADOR',
    setores: ['raio-x'],
    trocarSenha: false,
    senhaPadrao: 'leitura-demo-2026',
    variavelDaSenha: 'DEMO_PASSWORD_VISUALIZADOR',
    papel: 'Visualizador: só os indicadores do Raio-X',
  },
  {
    nome: 'Luana Becker',
    email: 'luana@fhdod.example',
    perfil: 'GESTOR',
    setores: ['laboratorio'],
    trocarSenha: true,
    senhaPadrao: 'provisoria-2026',
    variavelDaSenha: 'DEMO_PASSWORD_PRIMEIRO_ACESSO',
    papel: 'Gestor do Laboratório no primeiro acesso: troca a senha ao entrar',
  },
]

export interface TelaDeDemonstracao {
  nome: string
  /** O token do link (`/tv#<token>`). O banco guarda só o hash, como na criação pelo painel. */
  token: string
  ativa: boolean
}

/** Uma tela ativa, com o link que a apresentação abre, e uma desativada, que não abre. */
export const TELAS_DE_DEMONSTRACAO: readonly TelaDeDemonstracao[] = [
  { nome: 'Recepção principal', token: 'demo-recepcao-fhdod', ativa: true },
  { nome: 'Corredor da Internação', token: 'demo-corredor-desativada', ativa: false },
]

/** Os comentários que o gerador sorteia, de cada tipo. */
export const COMENTARIOS_DE_DEMONSTRACAO: Readonly<Record<TipoComentario, readonly string[]>> = {
  ELOGIO: [
    'A enfermeira da noite foi muito atenciosa com a minha mãe.',
    'Fui atendido rápido e o médico explicou tudo com calma.',
    'Equipe da recepção educada e prestativa. Parabéns.',
    'O técnico do raio-x teve muita paciência comigo.',
    'Lugar limpo e organizado. Me senti bem cuidada.',
    'A moça da coleta tem a mão leve, nem senti a agulha.',
    'Atendimento muito bom do início ao fim.',
    'Quero agradecer à equipe de enfermagem pelo carinho.',
    'O doutor ouviu tudo o que eu tinha para falar.',
    'Mesmo com o hospital cheio, todos foram gentis.',
    'Meu pai foi muito bem tratado. Obrigada a todos.',
    'A recepcionista me ajudou com os papéis sem pressa.',
  ],
  RECLAMACAO: [
    'Esperei mais de duas horas para ser atendido.',
    'Ninguém avisava quanto tempo ainda ia demorar.',
    'O banheiro da sala de espera estava sujo.',
    'Faltou cadeira para sentar enquanto esperava.',
    'A recepção demorou para me chamar e ninguém explicou o motivo.',
    'O ar-condicionado do quarto não funcionava.',
    'Fiquei muito tempo com dor antes de alguém me olhar.',
    'Me senti mal atendido na recepção.',
    'Muito barulho no corredor durante a noite.',
    'O médico atendeu com pressa e não explicou direito.',
  ],
  SUGESTAO: [
    'Poderia ter um painel mostrando a ordem de chamada.',
    'Seria bom ter água na sala de espera.',
    'Mais cadeiras na recepção ajudariam.',
    'Avisar o tempo de espera logo na chegada.',
    'Podiam colocar uma televisão na espera.',
    'Sinalizar melhor o caminho até o raio-x.',
    'Deixar agendar a coleta pelo telefone.',
  ],
  OUTRO: [
    'Esqueci um guarda-chuva na sala de espera.',
    'Gostaria de saber como retirar o resultado do exame.',
    'Onde vejo os horários de visita?',
  ],
}

/** As respostas da pergunta de texto livre da Internação ("Algum profissional merece um elogio?"). */
export const ELOGIOS_A_PROFISSIONAIS: readonly string[] = [
  'A técnica do turno da noite, sempre sorrindo.',
  'O rapaz da limpeza, muito educado.',
  'Todos do turno da manhã.',
  'A enfermeira de cabelo curto que me acalmou.',
  'O médico que me atendeu no segundo dia.',
]
