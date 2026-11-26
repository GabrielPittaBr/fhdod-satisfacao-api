# Plano de Desenvolvimento — Sistema de Satisfação Hospitalar (FHDOD)

Oct 29, 2026 · @Gabriel Fernandes Pitta

Revisado em Nov 20, 2026: o banco passou de MySQL para PostgreSQL (o motivo está em “Por que PostgreSQL”), e o “Fluxo Git” passou a usar a branch `develop`. Revisado em Nov 26, 2026: a pesquisa geral (`/avaliar`), em que a pessoa escolhe os setores, substitui o link do Google Forms que o hospital divulgava, e o telefone para retorno passou a ser oferecido a todos no fim da pesquisa pela web.

## Resumo

O sistema será um monólito modular em TypeScript: uma API Node.js + Express 5 sobre PostgreSQL 18 e um front-end React + Vite, em dois repositórios separados. A primeira versão (MVP) fica pronta até Nov 27, 2026, em quatro semanas.

| Tema | Decisão | Motivo principal |
| --- | --- | --- |
| Backend | Node.js + TypeScript + Express 5 | Middlewares explícitos e a mesma linguagem do front |
| Front-end | React + Vite + TypeScript | SPA leve, com ecossistema forte para gráficos e tabelas |
| Banco de dados | PostgreSQL 18 | SQL mais completo para os relatórios: agregação com filtro, séries de datas e fuso horário resolvido no próprio banco |
| Arquitetura do backend | Modular em camadas | Organiza o código por assunto (setores, perguntas, respostas) sem excesso de abstração |
| Interface | Tailwind CSS + shadcn/ui | Componentes acessíveis, com o código dentro do projeto para ajustar |
| Repositório | Dois repositórios: API e front-end | Exigência do professor; o contrato entre os dois é o OpenAPI da API (ver “Dois repositórios: API e front-end”) |
| Hospedagem | Ainda indefinida, por isso tudo em Docker | Roda igual em VPS, no servidor do hospital ou em plataforma gerenciada |
| Time | 2 a 3 pessoas, todos em tudo | Cada pessoa entrega funcionalidades completas: rota, regra, tela e teste |

**Entra no MVP:** pesquisa por setor no celular, no computador e no totem, e a pesquisa geral, em que a pessoa escolhe os setores, com NPS obrigatório e telefone para retorno; cadastro de setores, categorias, turnos e perguntas; login com níveis de acesso por setor; dashboard básico; lista de pedidos de retorno; TV Wall; exportação em Excel e PDF.

**Fica para depois:** gestão da ouvidoria e alertas por e-mail, importação de escalas e vínculo com equipes (fase 2); atualização em tempo real por SSE e integração com WhatsApp (fase 3).

Cada seção traz a decisão e o motivo. O que ainda depende do hospital está em “Riscos e pontos em aberto”.

## Regras de negócio atualizadas

As divergências do levantamento foram resolvidas assim. Cada regra já vem com o que ela muda no código.

| Regra | Decisão | O que muda no sistema |
| --- | --- | --- |
| Pergunta obrigatória | NPS de 0 a 10: “De 0 a 10, qual a probabilidade de você recomendar o hospital a alguém?” | Coluna `nps` obrigatória (NOT NULL) na tabela de respostas; o NPS não é uma pergunta editável pelos gestores |
| Ordem | A pesquisa fecha com o NPS | A resposta é gravada ao confirmar o NPS; comentário e telefone chegam depois, como complemento |
| Demais perguntas | Todas podem ser puladas | A validação exige só o NPS; perguntas puladas não geram registro |
| Notas baixas | Escala 1 a 5: 3 ou menos é baixa, 1 é baixíssima. NPS: 0 a 6 é baixa, 0 a 2 é baixíssima | Uma única função de classificação, dentro da API; limites guardados no banco e ajustáveis |
| Retorno ao paciente | Telefone opcional, oferecido a todos no fim da pesquisa pela web; no totem, só em avaliação negativa | Tela no fim da pesquisa (no totem, condicional); telefone cifrado no banco e visível só para quem tem permissão |
| Setor | Definido pela URL ou escolhido na pesquisa geral; cada setor terá seu totem | Rotas `/s/:setor` e `/totem/:setor` com o identificador do setor na URL (slug), e `/avaliar`, o link geral, em que a pessoa escolhe um ou mais setores e responde só as perguntas deles |
| Vários setores | Na pesquisa geral, uma nota de 0 a 10 no fim, que vale para todos os setores escolhidos | Uma avaliação por setor, gravadas juntas, cada uma classificada pelas notas do próprio setor; o NPS geral conta cada setor avaliado, como quando a mesma pessoa lê dois QR Codes. Comentário e telefone vão para a avaliação do setor que a pessoa indicar |
| Totem | Depois do envio, a pesquisa reinicia sozinha em 10 a 15 s | Modo totem com contagem regressiva configurável e limpeza total do estado |
| Dispositivos | Celular, computador, tablet e totens | Layout mobile-first e responsivo; a mesma tela atende todos |
| Cadastros | Super Admin cria setores; gestores de setor criam e editam perguntas | Permissões `setores:gerenciar` e `perguntas:gerenciar`, esta limitada aos setores de cada gestor |
| Progresso | Barra discreta, sem mostrar quantas perguntas existem | Componente de progresso por proporção, sem “3 de 12” |
| E-mail | Gestor, ouvidoria e Super Admin recebem e-mail quando há nota baixíssima | Fase 2: fila de envio no banco (outbox) + Nodemailer; a classificação já é gravada desde o MVP |
| WhatsApp | Só deixar a API preparada | API REST versionada e documentada, regras nos services e campo `canal` em cada resposta |
| Exportação | Excel e PDF, com Excel como principal | Gerada no backend com exceljs e pdfmake, respeitando filtros e permissões |
| TV Wall | Só avaliações gerais, sem comentários nem reclamações | Endpoint próprio que devolve apenas números agregados |
| Pulseira | Fora do projeto | Nenhuma leitura de código de barras ou dado de prontuário |
| Backend | Próprio, documentado e com middlewares | Express com cadeia de middlewares e documentação Swagger gerada a partir do código |

## Visão geral da arquitetura

O sistema é um monólito modular: um front-end estático e uma API REST no mesmo domínio HTTPS. Só a API acessa o PostgreSQL.

&#91;embedded content: arquitetura · clientes, proxy, front-end, API em camadas e banco\]

Os quatro tipos de acesso entram pelo Caddy. O front é só arquivo estático, e todo dado passa pelas camadas da API até o PostgreSQL.

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| Estilo | Monólito modular: uma única API dividida em módulos | Com 2 a 3 pessoas e um mês, microsserviços trariam vários deploys, rede e dados distribuídos sem ganho. Módulos isolados permitem extrair um serviço no futuro, se for preciso. |
| Comunicação | API REST com JSON, versionada em `/api/v1` | Simples de documentar (OpenAPI) e de integrar, inclusive com WhatsApp. GraphQL não compensa para telas conhecidas e poucas consultas. |
| Front-end | SPA estática (React + Vite) | Não há SEO a otimizar e arquivos estáticos são baratos de servir. O carregamento por rota mantém a pesquisa leve no celular. |
| Domínio | Front e API no mesmo domínio (`/` e `/api`) | Elimina problemas de CORS, permite o cookie de sessão mais restrito (SameSite=Strict) e usa um só certificado. |
| Entrada | Caddy como proxy reverso | Emite e renova o HTTPS sozinho, serve os arquivos do front e encaminha `/api` para a API. |
| Banco | PostgreSQL acessível só pela API, nunca pela internet | Toda regra e permissão passa pelo backend, o que reduz a superfície de ataque. |
| Contrato | `openapi.json` gerado pela API; o front gera seus tipos a partir dele | Com repositórios separados, o contrato vira um arquivo versionado. Se a API mudar e o front não acompanhar, o front deixa de compilar, em vez de quebrar em produção. |
| Tarefas demoradas | No MVP, executadas na própria requisição; na fase 2, um worker lê uma fila no PostgreSQL | O volume é baixo. A fila em tabela (outbox) dá retentativa aos e-mails sem exigir Redis. |
| “Tempo real” | Consulta automática a cada 30 s na TV e 60 s no dashboard | Indicadores de satisfação não mudam a cada segundo. SSE entra na fase 3, se o hospital sentir falta. |

## Dois repositórios: API e front-end

O projeto terá dois repositórios, como pede o professor: `fhdod-satisfacao-api` e `fhdod-satisfacao-web`. O que os une é o contrato da API, o arquivo `openapi.json` gerado pela própria API. Neste tamanho de projeto, isso cobre bem o que um pacote compartilhado faria.

| Repositório | Contém | Entrega |
| --- | --- | --- |
| `fhdod-satisfacao-api` | API Express, Prisma e migrations, testes, `docker-compose.yml` de desenvolvimento e a infraestrutura de produção | Imagem Docker da API e o `openapi.json` |
| `fhdod-satisfacao-web` | App React, telas, componentes e `Caddyfile` | Imagem Docker do front: Caddy com os arquivos estáticos |

### Como o contrato chega ao front

1. Os schemas Zod de cada módulo da API geram a documentação OpenAPI, a mesma do Swagger.
2. O script `pnpm openapi:exportar` grava esse documento em `openapi.json`, na raiz da API, e o arquivo é commitado. Assim, toda mudança de contrato aparece no diff do pull request.
3. No front, `pnpm api:tipos` lê o arquivo (por padrão em `../fhdod-satisfacao-api/openapi.json`) e gera `src/lib/api/schema.d.ts` com o openapi-typescript.
4. O cliente HTTP (openapi-fetch) usa esses tipos. Se a API mudar um campo, o front deixa de compilar até ser ajustado.

### Onde fica o que precisa ser igual nos dois lados

| Item | Onde fica |
| --- | --- |
| Tipos das requisições e respostas | Gerados no front a partir do `openapi.json` |
| Regra de nota baixa e cálculo do NPS | Só na API, que devolve a classificação pronta |
| Mapa de permissões por perfil | Só na API; o front recebe a lista de permissões do usuário em `/auth/me` |
| Validação de formulários | Schemas Zod próprios do front, só para avisar erros na tela; a API valida de novo |

### Como trabalhar com dois repositórios

- Cada pessoa clona os dois lado a lado numa pasta `fhdod/`. Assim o front encontra o `openapi.json` e a API local sem configuração extra.
- Uma funcionalidade que mexe nos dois lados vira dois pull requests ligados: primeiro o da API, com o `openapi.json` atualizado; depois o do front, com os tipos regenerados.
- Mudanças que quebram o contrato são evitadas: campos novos entram como opcionais, e um campo só é removido depois que o front parou de usá-lo.
- No deploy, a API sobe antes do front.
- As tarefas ficam num único quadro do GitHub Projects, que reúne issues dos dois repositórios.

| Custo de separar | Como contornar |
| --- | --- |
| Tipos do front desatualizados | O CI da API falha se o `openapi.json` não bater com o código, e o front regenera os tipos a cada mudança de contrato |
| Configuração repetida (ESLint, Prettier, commitlint, CI) | Montada uma vez na semana 1 e copiada para o outro repositório |
| Uma funcionalidade exige dois PRs | PRs pequenos, ligados um ao outro na descrição |

**Gerenciador de pacotes: pnpm nos dois.** Instala mais rápido que npm e yarn, ocupa menos disco e impede usar dependências não declaradas no `package.json`.

## Stack tecnológica

Todo o projeto usa TypeScript em modo strict. Cada ferramenta abaixo resolve uma necessidade concreta do sistema, e a escolha foi pela opção mais simples que a atende bem.

### Backend

| Ferramenta | Função | Por que esta |
| --- | --- | --- |
| Node.js LTS (22 ou mais recente) | Ambiente de execução | Versões LTS têm suporte longo; a versão fica fixa no `.nvmrc` e no Dockerfile |
| Express 5 | Servidor HTTP e rotas | Escolha do time. Middlewares explícitos, e a versão 5 já envia erros de funções async ao tratador de erros |
| Prisma ORM | Acesso ao PostgreSQL e migrations | Schema legível, migrations versionadas no Git, tipos gerados e Prisma Studio para ver os dados. Relatórios pesados usam SQL parametrizado |
| Zod | Validação | Valida a entrada da API e gera a documentação OpenAPI, que é o contrato usado pelo front |
| zod-to-openapi + swagger-ui-express | Documentação da API | A documentação sai dos schemas que validam, então não fica desatualizada |
| jsonwebtoken | Token de acesso (JWT) | Padrão simples e bem documentado (ver “Autenticação”) |
| @node-rs/argon2 | Hash de senhas (argon2id) | Algoritmo recomendado pela OWASP; vem pré-compilado, sem build nativo no Docker |
| pino + pino-http | Logs estruturados | Rápido, em JSON e com ocultação de campos sensíveis (senha, telefone, tokens) |
| helmet, cors, cookie-parser, express-rate-limit | Segurança HTTP | Cabeçalhos seguros, origem controlada, leitura do cookie de refresh e limite de tentativas |
| exceljs | Planilhas .xlsx | Escreve relatórios formatados e, na fase 2, lê as escalas |
| pdfmake | Relatórios em PDF | Gera PDF no servidor sem um navegador embutido, que deixaria o container pesado |
| Nodemailer (fase 2) | Envio de e-mail | Funciona com qualquer servidor SMTP, inclusive o do hospital |
| tsx e tsup | Rodar em desenvolvimento e gerar o build | tsx executa TypeScript direto com recarga; tsup gera o build em um único arquivo JS |

### Front-end

| Ferramenta | Função | Por que esta |
| --- | --- | --- |
| React + Vite | Base da aplicação | Escolha do time; servidor de desenvolvimento instantâneo e bundle pequeno |
| React Router | Rotas | Padrão de mercado, com carregamento separado por área (pesquisa, painel, TV) |
| TanStack Query | Dados vindos da API | Cache, estados de carregamento e erro e recarga automática (o “tempo real” por consulta periódica) |
| openapi-typescript + openapi-fetch | Cliente da API | Gera os tipos a partir do `openapi.json` da API e faz chamadas tipadas; o cliente tem poucos KB |
| Zustand | Sessão do usuário | Guarda o token de acesso e as permissões em memória com poucas linhas; Redux seria excesso |
| Tailwind CSS + shadcn/ui | Interface | Escolha do time. Componentes acessíveis (Radix) cujo código fica no projeto e pode ser ajustado |
| React Hook Form + Zod | Formulários | Mostra os erros antes do envio, com mensagens em português; a API valida de novo |
| TanStack Table | Tabelas do painel | Ordenação, filtros e paginação; é a base do data table do shadcn/ui |
| Recharts | Gráficos | É a biblioteca por trás dos gráficos do shadcn/ui, então o visual fica consistente |
| lucide-react | Ícones | Padrão do shadcn/ui |
| date-fns | Datas | Leve e com formatação em português |
| qrcode.react | QR Codes dos setores | Gerado no navegador para imprimir; não precisa de rota na API |

### Ferramentas e infraestrutura

| Ferramenta | Função | Por que esta |
| --- | --- | --- |
| pnpm | Gerenciador de pacotes, nos dois repositórios | Ver “Dois repositórios: API e front-end” |
| Vitest + Supertest | Testes | Mesmo executor no front e na API, rápido e nativo em TypeScript; Supertest chama as rotas sem subir servidor |
| Playwright (fase 2) | Testes de ponta a ponta | Simula o paciente no navegador, inclusive em tela de celular e de totem |
| ESLint + Prettier | Padrão de código | Os mais difundidos, com regras para TypeScript e React Hooks |
| Husky + lint-staged + commitlint | Verificação antes do commit | Impede commit com erro de lint ou mensagem fora do padrão |
| Docker + Docker Compose | Ambientes | Mesmo ambiente em todas as máquinas e em qualquer hospedagem |
| Caddy | Proxy reverso e HTTPS | Certificado automático e configuração de poucas linhas |
| GitHub Actions | Integração contínua | O código já ficará no GitHub, e o plano gratuito cobre este volume |
| Mailpit (fase 2) | E-mail no desenvolvimento | Captura os e-mails localmente para testar sem enviar de verdade |

## Estrutura de pastas

Cada repositório tem sua própria raiz, configuração e Dockerfile. Na API, cada módulo segue os mesmos arquivos; no front, cada funcionalidade (feature) tem o mesmo nome do módulo correspondente na API.

### Pasta de trabalho de cada pessoa

```text
fhdod/
├── fhdod-satisfacao-api/          # repositório do backend
└── fhdod-satisfacao-web/          # repositório do front-end
```

Com os dois lado a lado, o front encontra o `openapi.json` da API sem configuração. O servidor de produção usa o mesmo arranjo.

### Repositório da API (`fhdod-satisfacao-api`)

```text
fhdod-satisfacao-api/
├── prisma/
│   ├── schema.prisma              # modelo de dados
│   ├── migrations/                # migrations geradas e versionadas
│   └── seed.ts                    # categorias, turnos, configurações, Super Admin e setores de exemplo
├── src/
│   ├── config/
│   │   ├── env.ts                 # lê e valida as variáveis de ambiente com Zod
│   │   ├── logger.ts              # instância do pino
│   │   └── openapi.ts             # monta o documento OpenAPI com os registros dos módulos
│   ├── database/
│   │   └── prisma.ts              # cliente Prisma único
│   ├── middlewares/
│   │   ├── request-id.ts          # gera o ID de cada requisição
│   │   ├── http-logger.ts         # log de entrada e saída (pino-http)
│   │   ├── authenticate.ts        # valida o token de acesso
│   │   ├── authorize.ts           # exige uma permissão
│   │   ├── setor-scope.ts         # limita aos setores do usuário
│   │   ├── validate.ts            # valida body, query e params com Zod
│   │   ├── rate-limit.ts          # limites para login e pesquisa pública
│   │   ├── tv-token.ts            # autentica as telas de TV Wall
│   │   ├── not-found.ts           # 404 no formato padrão
│   │   └── error-handler.ts       # converte qualquer erro na resposta padrão
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.schemas.ts
│   │   │   ├── auth.docs.ts
│   │   │   └── auth.service.test.ts
│   │   ├── usuarios/              # todos os módulos têm os mesmos arquivos
│   │   ├── setores/
│   │   ├── categorias/
│   │   ├── turnos/
│   │   ├── perguntas/
│   │   ├── pesquisa/              # rotas públicas: definição da pesquisa, envio e complemento
│   │   ├── respostas/
│   │   ├── contatos/              # pedidos de retorno
│   │   ├── dashboard/
│   │   ├── tv-wall/
│   │   ├── exportacao/
│   │   ├── configuracoes/
│   │   └── auditoria/
│   ├── shared/
│   │   ├── constants/
│   │   │   ├── perfis.ts          # SUPER_ADMIN, GESTOR, OUVIDORIA, VISUALIZADOR
│   │   │   ├── permissoes.ts      # lista de permissões e o padrão de cada perfil
│   │   │   └── limites.ts         # limites padrão de nota baixa e baixíssima
│   │   ├── rules/
│   │   │   ├── classificar-nota.ts  # normal, baixa ou baixíssima
│   │   │   └── calcular-nps.ts
│   │   ├── errors/
│   │   │   └── app-error.ts       # erro com código e status HTTP
│   │   ├── http/
│   │   │   ├── respond.ts         # envelope de resposta { data, meta }
│   │   │   └── pagination.ts
│   │   ├── security/
│   │   │   ├── password.ts        # hash e verificação (argon2id)
│   │   │   ├── tokens.ts          # JWT e tokens opacos
│   │   │   └── crypto.ts          # cifra e decifra telefones (AES-256-GCM)
│   │   └── types/
│   │       └── express.d.ts       # adiciona usuario e valid ao Request
│   ├── routes.ts                  # registra todos os módulos em /api/v1
│   ├── app.ts                     # cria o Express e encadeia os middlewares
│   └── server.ts                  # sobe o servidor e encerra com segurança
├── scripts/
│   └── exportar-openapi.ts        # grava o openapi.json usado pelo front
├── tests/
│   ├── setup.ts                   # banco de teste limpo antes da suíte
│   ├── factories/                 # cria usuários, setores e respostas de teste
│   └── integration/
│       ├── auth.test.ts
│       ├── pesquisa.test.ts
│       └── permissoes.test.ts
├── infra/
│   ├── docker-compose.prod.yml    # produção e homologação: caddy, api, postgres e backup
│   ├── .env.example               # modelo do infra/.env de cada servidor
│   └── backup/
│       ├── Dockerfile             # PostgreSQL 18 (Alpine) com o rclone
│       ├── agendar.sh             # roda o backup.sh todo dia às 3h
│       ├── backup.sh              # pg_dump diário com retenção e cópia fora do servidor
│       ├── restaurar.sh           # pg_restore num banco vazio
│       ├── saude.sh               # healthcheck do backup
│       └── rclone.conf.example    # modelo do destino da cópia de fora
├── docs/
│   ├── adr/                       # registros curtos das decisões de arquitetura
│   └── requisitos/                # levantamento de requisitos
├── .github/
│   ├── workflows/
│   │   └── ci.yml                 # lint, tipos, testes, contrato e build a cada PR
│   └── pull_request_template.md
├── .husky/
│   ├── pre-commit                 # roda lint-staged
│   └── commit-msg                 # roda commitlint
├── docker-compose.yml             # desenvolvimento: PostgreSQL (Mailpit na fase 2)
├── openapi.json                   # contrato da API, gerado e commitado
├── .env.example
├── Dockerfile
├── package.json                   # scripts: dev, build, lint, test, db:*, openapi:exportar
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── commitlint.config.js
├── .editorconfig
├── .nvmrc                         # versão do Node
├── .gitignore
└── README.md                      # como rodar a API do zero
```

A infraestrutura de produção e a pasta `docs/` ficam na API, porque é ela que tem o banco e as regras. Na fase 2 entram os módulos `ouvidoria/`, `notificacoes/` e `escalas/`, além de `src/worker.ts` (processo que envia os e-mails). Na fase 3, `integracoes/whatsapp/`.

### Repositório do front-end (`fhdod-satisfacao-web`)

```text
fhdod-satisfacao-web/
├── public/
│   └── favicon.svg
├── src/
│   ├── app/
│   │   ├── router.tsx             # rotas e carregamento por área (lazy)
│   │   ├── providers.tsx          # TanStack Query, tema e notificações
│   │   └── guards.tsx             # exige login e permissão nas rotas do painel
│   ├── components/
│   │   ├── ui/                    # componentes gerados pelo shadcn/ui
│   │   ├── layout/                # menu lateral, cabeçalho e layout do painel
│   │   └── charts/                # gráficos reutilizáveis (NPS, barras, evolução)
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api.ts             # chamadas à API deste assunto
│   │   │   ├── hooks.ts           # useLogin, useSessao
│   │   │   ├── schemas.ts         # Zod do formulário de login
│   │   │   ├── components/
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   ├── pesquisa/
│   │   │   ├── api.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useFluxoPesquisa.ts    # etapas, respostas e envio
│   │   │   │   └── useModoTotem.ts        # reinício, inatividade e tela cheia
│   │   │   ├── components/
│   │   │   │   ├── EtapaDataTurno.tsx
│   │   │   │   ├── EscalaRostinhos.tsx
│   │   │   │   ├── EscalaNps.tsx
│   │   │   │   ├── PerguntaSimNao.tsx
│   │   │   │   ├── PerguntaMultipla.tsx
│   │   │   │   ├── PerguntaTexto.tsx
│   │   │   │   ├── EtapaComentario.tsx
│   │   │   │   ├── EtapaContato.tsx
│   │   │   │   ├── BarraProgresso.tsx
│   │   │   │   └── TelaAgradecimento.tsx
│   │   │   └── pages/
│   │   │       ├── PesquisaPage.tsx       # /s/:setor
│   │   │       └── TotemPage.tsx          # /totem/:setor
│   │   ├── dashboard/             # todas as features seguem o padrão de auth/
│   │   ├── respostas/
│   │   ├── contatos/
│   │   ├── setores/
│   │   ├── perguntas/
│   │   ├── usuarios/
│   │   ├── cadastros/             # categorias e turnos
│   │   ├── tv-wall/               # tela da TV e gestão das telas
│   │   └── configuracoes/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── schema.d.ts        # tipos gerados do openapi.json da API (não editar à mão)
│   │   │   └── client.ts          # openapi-fetch com token, renovação automática e erros padronizados
│   │   ├── query-client.ts
│   │   ├── format.ts              # datas, números e telefone em pt-BR
│   │   └── utils.ts               # cn() e utilidades do shadcn/ui
│   ├── stores/
│   │   └── sessao.ts              # token de acesso, usuário e permissões (Zustand)
│   ├── styles/
│   │   └── globals.css            # Tailwind e variáveis de tema
│   └── main.tsx
├── .github/
│   ├── workflows/
│   │   └── ci.yml                 # lint, tipos, testes e build a cada PR
│   └── pull_request_template.md
├── .husky/
│   ├── pre-commit
│   └── commit-msg
├── Caddyfile                      # HTTPS, arquivos do front e proxy de /api para a API
├── Dockerfile                     # build do front e imagem final do Caddy
├── components.json                # configuração do shadcn/ui
├── index.html
├── .env.example                   # alvo do proxy de desenvolvimento e caminho do openapi.json
├── package.json                   # scripts: dev, build, lint, test, api:tipos
├── tsconfig.json
├── vite.config.ts                 # proxy de /api para a API local no desenvolvimento
├── eslint.config.js
├── .prettierrc
├── commitlint.config.js
├── .editorconfig
├── .nvmrc
├── .gitignore
└── README.md                      # como rodar o front do zero
```

O `Caddyfile` fica no front porque o Caddy serve justamente os arquivos do front; ele só encaminha `/api` para o container da API.

### Convenções

| Convenção | Regra | Por quê |
| --- | --- | --- |
| Nomes dos repositórios | `fhdod-satisfacao-api` e `fhdod-satisfacao-web` | O prefixo agrupa os dois no GitHub, e o sufixo diz o papel de cada um |
| Idioma | Domínio em português (setores, perguntas, plantões); termos técnicos em inglês (controller, service, middleware) | Os nomes espelham o vocabulário do hospital sem traduções ambíguas; os termos técnicos seguem o ecossistema |
| Arquivos | kebab-case com o sufixo da camada (`perguntas.service.ts`) | Ao abrir a pasta, já se sabe o papel de cada arquivo |
| Componentes React | PascalCase (`EscalaNps.tsx`) | Convenção do React |
| Banco | Tabelas e colunas em snake\_case, sem acentos | O PostgreSQL converte nomes sem aspas para minúsculas, então snake\_case dispensa aspas; acentos quebram ferramentas |
| Contrato | O front só conhece a API pelo `openapi.json` e nunca copia código do backend | Mantém os repositórios independentes e o contrato num lugar só |
| Organização | Por assunto (módulos e features), não por tipo de arquivo | Quem mexe em perguntas encontra rota, regra e tela com o mesmo nome, em vez de procurar em `controllers/` e `models/` gigantes |

## Backend: camadas, middlewares e padrões

Cada requisição passa por uma cadeia fixa de middlewares e depois por quatro camadas, cada uma com uma única responsabilidade.

### Camadas de um módulo

| Camada | Faz | Não faz |
| --- | --- | --- |
| Rotas (`*.routes.ts`) | Liga método e URL aos middlewares e ao controller | Nenhuma lógica |
| Controller | Lê os dados já validados, chama o service e devolve status e JSON | Regra de negócio ou acesso ao banco |
| Service | Regras de negócio, transações e registro de auditoria | Conhecer `req` e `res` |
| Repository | Consultas Prisma e SQL dos relatórios | Decidir regras |
| Schemas e docs | Schemas Zod de entrada e saída e registro no OpenAPI | — |

Separar assim permite testar as regras sem subir o servidor e reaproveitar o mesmo service em outro canal. É isso que deixará a integração com WhatsApp simples.

### Ciclo de uma requisição

1. `request-id`: cria um ID único e o devolve no cabeçalho `X-Request-Id`.
2. `http-logger`: registra método, rota, status e tempo, sem dados sensíveis.
3. `helmet`: aplica cabeçalhos de segurança.
4. `cors`: aceita só a origem configurada (com front e API no mesmo domínio, quase nada passa por ele).
5. `express.json` (limite de 100 kB) e `cookie-parser`.
6. Roteador `/api/v1`, onde cada rota declara os seus próprios middlewares, nesta ordem:
   1. `rate-limit`, nas rotas públicas e no login;
   2. `authenticate`, ou `tv-token` nas rotas da TV;
   3. `authorize('permissao')`;
   4. `setor-scope`, quando a rota envolve um setor;
   5. `validate(schema)`;
   6. o controller.
7. `not-found`: qualquer rota inexistente vira 404 no formato padrão.
8. `error-handler`: último da cadeia; transforma qualquer erro na resposta padrão e o registra no log.

### Exemplo: `app.ts`

```ts
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // a API fica atrás do Caddy

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', routes);
  app.use('/api/docs', docsRouter);

  app.use(notFound);
  app.use(errorHandler); // sempre o último
  return app;
}
```

### Exemplo: rotas de um módulo

```ts
const router = Router();

router.get(
  '/setores/:setorId/perguntas',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate({ params: setorParams }),
  perguntasController.listar,
);

router.post(
  '/setores/:setorId/perguntas',
  authenticate,
  authorize('perguntas:gerenciar'),
  setorScope('setorId'),
  validate({ params: setorParams, body: criarPerguntaSchema }),
  perguntasController.criar,
);

export default router;
```

Lendo a rota, dá para saber quem pode chamá-la e o que é validado. No Express 5, um erro lançado numa função async chega sozinho ao `error-handler`, então os controllers não precisam de try/catch.

### Respostas e erros

Sucesso devolve `{ "data": ... }`. Listas devolvem também `"meta": { "pagina": 1, "porPagina": 20, "total": 134 }`. Erros seguem sempre este formato:

```json
{
  "erro": {
    "codigo": "VALIDACAO",
    "mensagem": "Dados inválidos",
    "detalhes": [{ "campo": "nps", "mensagem": "Obrigatório, de 0 a 10" }],
    "requestId": "01JC9W2K7Q"
  }
}
```

| Status | Quando |
| --- | --- |
| 200 / 201 | Sucesso / recurso criado |
| 204 | Sucesso sem conteúdo (logout, desativação) |
| 400 | Dados inválidos (falha no Zod) |
| 401 | Sem token, token expirado ou usuário inativo |
| 403 | Logado, mas sem a permissão ou fora do setor |
| 404 | Recurso inexistente |
| 409 | Conflito: slug ou e-mail já usado |
| 429 | Limite de requisições atingido |
| 500 | Erro inesperado: mensagem genérica, detalhes só no log |

Um formato único deixa o front tratar erros num só lugar. O `requestId` liga a mensagem que o usuário viu à linha exata do log.

### Validação

- Os schemas Zod de cada módulo (`*.schemas.ts`) validam `body`, `query` e `params` no middleware `validate`.
- Os dados validados vão para `req.valid`: no Express 5, `req.query` é somente leitura e não pode ser sobrescrito.
- Datas, números e paginação são convertidos pelo próprio schema (`z.coerce`).
- O front valida os formulários só para ajudar o usuário; quem decide é sempre a API.

### Documentação

- Swagger UI em `/api/docs` e o JSON OpenAPI em `/api/docs/openapi.json`.
- Cada módulo registra suas rotas no `*.docs.ts`, usando os próprios schemas Zod; uma rota sem registro não passa na revisão.
- O script `pnpm openapi:exportar` grava o mesmo documento em `openapi.json`, na raiz do repositório. É desse arquivo que o front gera seus tipos.
- Ativa no desenvolvimento e na homologação; em produção fica desligada por padrão (`DOCS_ENABLED=false`), porque só os desenvolvedores precisam dela.
- Decisões importantes viram ADRs curtos em `docs/adr/` (por exemplo, `0001-dois-repositorios.md`), para quem chegar depois entender o porquê.
- O README de cada repositório explica como subir o projeto do zero em poucos comandos.

### Logs e saúde

- Logs em JSON pelo pino, com `requestId`, usuário, rota, status e duração.
- Campos sempre ocultados: `authorization`, `cookie`, `x-tv-token`, `senha` e `telefone`.
- `GET /api/health` testa a conexão com o banco; serve para o Docker e para o monitoramento.

### Segurança

| Medida | Protege contra |
| --- | --- |
| HTTPS obrigatório (Caddy) | Interceptação de dados |
| Senhas com argon2id | Senhas expostas se o banco vazar |
| Token de acesso curto e refresh rotativo e revogável | Sessões roubadas |
| Login limitado a 5 tentativas a cada 15 min por IP e e-mail | Força bruta |
| Limite de envios na pesquisa pública e campo isca invisível | Robôs e envio em massa |
| Chave de idempotência em cada envio | Respostas duplicadas por clique duplo ou rede instável |
| Telefone cifrado com AES-256-GCM | Exposição de dados pessoais |
| Prisma e SQL sempre parametrizado | SQL injection |
| Permissão e escopo de setor checados no backend | Acesso indevido, mesmo com a tela manipulada |
| Auditoria de ações sensíveis | Falta de rastro sobre quem fez o quê |

Os totens saem pelo mesmo IP do hospital. Esse IP entra numa lista de exceção (`RATE_LIMIT_ALLOWLIST`) para o limite de envios não bloquear pacientes.

### Configuração

- `src/config/env.ts` valida as variáveis com Zod ao iniciar. Se faltar alguma, a API nem sobe, e o erro aparece na hora, não em produção.
- `.env.example` documenta todas as variáveis, sem valores reais; o `.env` nunca vai para o Git.

## Modelo de dados (PostgreSQL)

O MVP tem 14 tabelas e a fase 2 acrescenta 6. Cada resposta guarda o NPS numa coluna obrigatória e copia o texto das perguntas respondidas, para o histórico nunca mudar de sentido.

| Tabela | Guarda | Campos principais | Regras | Fase |
| --- | --- | --- | --- | --- |
| usuarios | Contas do painel | id, nome, email (único), senha\_hash, perfil, ativo, trocar\_senha, ultimo\_login\_em | Perfis: SUPER\_ADMIN, GESTOR, OUVIDORIA, VISUALIZADOR | MVP |
| usuario\_setores | Setores de cada usuário | usuario\_id, setor\_id (chave composta) | Define o escopo de gestores e visualizadores | MVP |
| refresh\_tokens | Sessões ativas | id, usuario\_id, token\_hash (único), expira\_em, revogado\_em, substituido\_por\_id | Guarda só o hash; um novo token a cada uso | MVP |
| setores | Unidades com pesquisa própria | id, nome, slug (único), descricao, ativo | O slug forma as URLs `/s/:slug` e `/totem/:slug` | MVP |
| categorias | Etapas comparáveis entre setores | id, nome (único), ordem, ativa | Seed: Recepção, Triagem, Enfermagem, Médico, Higiene e Limpeza, Estrutura, Tempo de Espera | MVP |
| turnos | Períodos do dia | id, nome, hora\_inicio, hora\_fim, ordem | Seed provisório: Manhã, Tarde e Noite (horários a confirmar) | MVP |
| perguntas | Perguntas de cada setor | id, setor\_id, categoria\_id, texto, tipo, opcoes (text[]), ordem, ativa | Tipos: ESCALA\_1\_5, SIM\_NAO, MULTIPLA\_ESCOLHA, TEXTO; nunca apagada fisicamente | MVP |
| respostas | Um envio de pesquisa | id, setor\_id, canal, data\_atendimento, turno\_id, nps, classificacao, enviado\_em, chave\_idempotencia (única), token\_complemento\_hash, token\_complemento\_expira\_em | `nps` obrigatório, de 0 a 10; canal WEB ou TOTEM (WHATSAPP no futuro) | MVP |
| resposta\_itens | Cada pergunta respondida | id, resposta\_id, pergunta\_id, categoria\_id, pergunta\_texto, tipo, valor\_numero, valor\_texto | Cópia do texto e da categoria no momento da resposta; um item por pergunta em cada resposta | MVP |
| comentarios | Elogio, reclamação ou sugestão | id, resposta\_id (único), tipo, texto (até 500 caracteres), categoria\_id | Tipos: ELOGIO, RECLAMACAO, SUGESTAO, OUTRO | MVP |
| contatos\_retorno | Pedido de retorno | id, resposta\_id (único), telefone\_cifrado, telefone\_final, consentimento\_em, status, responsavel\_id, observacoes, resolvido\_em | No MVP todo pedido fica NOVO; o fluxo de status entra na fase 2 | MVP |
| tv\_telas | Telas de TV Wall | id, nome, token\_hash, ativa, ultimo\_acesso\_em, criado\_por\_id | O link com o token aparece uma única vez, ao criar | MVP |
| configuracoes | Parâmetros do sistema | chave (chave primária), valor (JSONB), atualizado\_por\_id, atualizado\_em | Limites de nota, tempos do totem e texto do NPS | MVP |
| auditoria | Ações sensíveis | id, usuario\_id, acao, entidade, entidade\_id, dados (JSONB), ip, criado\_em | Logins, mudanças em perguntas e permissões, exportações e acesso a telefones | MVP |
| notificacoes | Fila de e-mails (outbox) | id, tipo, destinatario, payload (JSONB), status, tentativas, proxima\_tentativa\_em, enviado\_em, erro | O worker envia e reagenda as falhas | Fase 2 |
| contato\_historico | Histórico de cada retorno | id, contato\_id, status\_anterior, status\_novo, usuario\_id, observacao, criado\_em | Status: NOVO, PENDENTE, EM\_ATENDIMENTO, RESOLVIDO | Fase 2 |
| escalas | Escala mensal importada | id, setor\_id, competencia (AAAA-MM), versao, arquivo\_nome, importado\_por\_id, importado\_em | Reimportar cria nova versão, sem apagar a anterior | Fase 2 |
| profissionais | Pessoas das escalas | id, nome, funcao, registro, ativo | Reaproveitado entre meses | Fase 2 |
| plantoes | Linhas da escala | id, escala\_id, profissional\_id, equipe, funcao, data, turno\_id, inicio, fim | Base do cruzamento setor + data + turno | Fase 2 |
| resposta\_vinculos | Ligação entre resposta e escala | id, resposta\_id, plantao\_id, equipe, profissional\_id, status | VINCULADA\_PROFISSIONAL, VINCULADA\_EQUIPE ou NAO\_VINCULADA | Fase 2 |

### Por que PostgreSQL

Neste volume, qualquer um dos dois bancos dá conta com folga. O que pesou foi o SQL dos relatórios: no PostgreSQL ele fica mais curto e resolve o fuso de Brasília no próprio banco. A troca foi decidida antes de existir código, quando custa quase nada, e o Prisma cobre a diferença no resto.

| Recurso | Onde o sistema usa |
| --- | --- |
| Agregação com `FILTER` | NPS, promotores, neutros e detratores numa única consulta |
| `generate_series` e `date_trunc` | Evolução por dia, semana ou mês, incluindo os períodos sem resposta |
| `timestamptz` e `AT TIME ZONE` | Filtros e agrupamentos pelo dia de Brasília, com o envio gravado em UTC |
| `GROUPING SETS` e `CUBE` | Cruzamentos da fase 2 (profissional, setor e turno), com subtotais numa consulta só |
| Arrays | Opções das perguntas em `text[]`, já tipadas no Prisma, e o escopo de setores do usuário passado como um único parâmetro (`= ANY(...)`) |
| JSONB | Configurações, dados da auditoria e, na fase 2, a fila de e-mails |
| Índice único sobre expressão | Categorias sem nome repetido, mesmo com maiúsculas diferentes |

### Decisões do modelo

- **NPS como coluna, não como pergunta.** Fica obrigatório no próprio banco, nenhum gestor consegue apagá-lo e o cálculo vira uma consulta simples.
- **Respostas em linhas, não em JSONB.** Cada pergunta respondida vira uma linha em `resposta_itens`, com a categoria e a nota em colunas próprias. Setores com perguntas diferentes não pedem coluna nova: pergunta nova é só mais uma linha em `perguntas`. Num JSONB, cada relatório teria de abrir o documento de cada resposta, e as notas ficariam sem a chave estrangeira da pergunta e sem o CHECK de 1 a 5, justo o que as médias por setor e categoria usam. O JSONB fica com o que varia de formato e não entra nos cálculos: `configuracoes.valor`, `auditoria.dados` e, na fase 2, `notificacoes.payload`. Se um tipo de pergunta precisar de ajustes próprios no futuro (rótulos da escala, condição para aparecer), eles cabem numa coluna JSONB da pergunta.
- **Cópia do texto da pergunta.** Se um gestor reescrever uma pergunta, as respostas antigas continuam mostrando o que o paciente leu. Mudar o tipo de uma pergunta já respondida é bloqueado: cria-se outra.
- **Exclusão lógica** (`ativo = false`) em setores, perguntas, categorias e usuários, para o histórico nunca perder referências.
- **IDs inteiros autoincrementais.** São simples e eficientes; as rotas públicas usam slugs e tokens, então nenhum ID fica exposto ao paciente.
- **Datas.** `enviado_em` como `timestamptz` (o instante exato, guardado em UTC) e `data_atendimento` como `date`. Os relatórios convertem para o horário de Brasília na consulta, com `AT TIME ZONE 'America/Sao_Paulo'`. No Prisma, `DateTime` vira `timestamp` sem fuso por padrão; por isso as colunas de instante levam `@db.Timestamptz(3)`.
- **Restrições CHECK** (`nps` entre 0 e 10, `valor_numero` entre 1 e 5) são escritas em SQL na migration, porque o Prisma não as declara no schema.
- **Índices** em `respostas(setor_id, enviado_em)`, `respostas(data_atendimento)`, `resposta_itens(categoria_id)` e `contatos_retorno(status)`, os filtros mais usados no dashboard. No PostgreSQL, ao contrário do MySQL, chave estrangeira não cria índice sozinha: as colunas usadas para buscar os registros filhos (`resposta_itens.resposta_id`, `perguntas.setor_id`, `usuario_setores.setor_id`, `refresh_tokens.usuario_id`) ganham `@@index` no schema.
- **Maiúsculas e minúsculas.** O PostgreSQL diferencia maiúsculas ao comparar texto, e o MySQL não. O e-mail é gravado em minúsculas pelo service, e as categorias têm índice único sobre `lower(nome)`, escrito na migration como os CHECKs.
- **UTF-8** em tudo, que no PostgreSQL já cobre acentos e emojis dos comentários.
- **Telefone** guardado cifrado, mais os 4 últimos dígitos em claro, para exibir mascarado sem decifrar.

### Exemplo no schema Prisma

```prisma
model Resposta {
  id                       Int           @id @default(autoincrement())
  setorId                  Int           @map("setor_id")
  canal                    Canal
  dataAtendimento          DateTime      @map("data_atendimento") @db.Date
  turnoId                  Int           @map("turno_id")
  nps                      Int           @db.SmallInt
  classificacao            Classificacao
  enviadoEm                DateTime      @default(now()) @map("enviado_em") @db.Timestamptz(3)
  chaveIdempotencia        String        @unique @map("chave_idempotencia") @db.Uuid
  tokenComplementoHash     String?       @map("token_complemento_hash") @db.VarChar(64)
  tokenComplementoExpiraEm DateTime?     @map("token_complemento_expira_em") @db.Timestamptz(3)

  setor      Setor           @relation(fields: [setorId], references: [id])
  turno      Turno           @relation(fields: [turnoId], references: [id])
  itens      RespostaItem[]
  comentario Comentario?
  contato    ContatoRetorno?

  @@index([setorId, enviadoEm])
  @@index([dataAtendimento])
  @@map("respostas")
}

enum Canal {
  WEB
  TOTEM
  WHATSAPP
}

enum Classificacao {
  NORMAL
  BAIXA
  BAIXISSIMA
}
```

### Exemplo: consulta de relatório

A evolução semanal do NPS, com as semanas sem resposta aparecendo vazias, sai numa consulta só:

```sql
-- GET /dashboard/evolucao?granularidade=SEMANA, pela data do atendimento
SELECT p.inicio::date                       AS periodo,
       count(r.id)::int                     AS total,
       round(100.0 * (count(r.id) FILTER (WHERE r.nps >= 9)
                    - count(r.id) FILTER (WHERE r.nps <= 6))
             / nullif(count(r.id), 0))::int AS nps  -- NULL na semana sem resposta
FROM generate_series(date_trunc('week', $1::timestamp), $2::timestamp, interval '1 week') AS p(inicio)
LEFT JOIN respostas r
       ON r.data_atendimento >= p.inicio
      AND r.data_atendimento <  p.inicio + interval '1 week'
      AND r.setor_id = ANY($3::int[])       -- setores que o usuário pode ver
GROUP BY p.inicio
ORDER BY p.inicio;
```

Com `base=ENVIO`, a data comparada passa a ser `(r.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date`, que transforma o instante gravado em UTC no dia de Brasília. No código, os parâmetros entram pelo `$queryRaw` do Prisma, sempre parametrizados, e os `::int` fazem o resultado chegar como `number`, e não como `BigInt` ou `Decimal`.

## Endpoints da API

Todas as rotas ficam sob `/api/v1`, com os recursos em português e no plural. A tabela é o contrato do MVP e já mostra o que as próximas fases acrescentam.

| Método | Rota | Acesso | O que faz | Fase |
| --- | --- | --- | --- | --- |
| GET | `/health` | Público | Verifica a API e o banco | MVP |
| GET | `/docs` | Desenvolvimento e homologação | Swagger UI | MVP |
| POST | `/auth/login` | Público, com limite | Confere e-mail e senha; devolve o token de acesso e grava o cookie de refresh | MVP |
| POST | `/auth/refresh` | Cookie de refresh | Emite novo token de acesso e troca o refresh | MVP |
| POST | `/auth/logout` | Logado | Revoga o refresh e apaga o cookie | MVP |
| GET | `/auth/me` | Logado | Usuário, perfil, permissões e setores | MVP |
| PATCH | `/auth/senha` | Logado | Troca a própria senha | MVP |
| GET | `/publico/setores/:slug/pesquisa` | Público | Setor, perguntas ativas em ordem, turnos, texto do NPS, limites e tempos do totem | MVP |
| POST | `/publico/setores/:slug/respostas` | Público, com limite | Grava as respostas e o NPS; devolve a classificação e o token de complemento | MVP |
| GET | `/publico/pesquisa` | Público | Pesquisa geral: setores ativos com as perguntas, turnos e texto do NPS | MVP |
| POST | `/publico/respostas` | Público, com limite | Grava a avaliação de um ou mais setores, com uma nota para todos; devolve a classificação e o token de complemento de cada um | MVP |
| POST | `/publico/respostas/:id/complemento` | Token de complemento | Anexa comentário e/ou telefone para retorno | MVP |
| GET | `/tv/indicadores` | Token da TV | Indicadores gerais agregados, sem comentários | MVP |
| GET | `/setores` | Logado, com escopo | Setores visíveis ao usuário | MVP |
| POST | `/setores` | setores:gerenciar | Cria o setor e o slug | MVP |
| PATCH | `/setores/:id` | setores:gerenciar | Edita nome, slug ou descrição | MVP |
| PATCH | `/setores/:id/status` | setores:gerenciar | Ativa ou desativa | MVP |
| GET, POST | `/categorias` | Leitura: logado; escrita: categorias:gerenciar | Lista e cria categorias | MVP |
| PATCH | `/categorias/:id` | categorias:gerenciar | Edita ou desativa | MVP |
| GET, POST | `/turnos` | Leitura: logado; escrita: turnos:gerenciar | Lista e cria turnos | MVP |
| PATCH | `/turnos/:id` | turnos:gerenciar | Edita nome e horários | MVP |
| GET | `/setores/:setorId/perguntas` | perguntas:gerenciar + escopo | Perguntas do setor, em ordem | MVP |
| POST | `/setores/:setorId/perguntas` | perguntas:gerenciar + escopo | Cria pergunta | MVP |
| PATCH | `/perguntas/:id` | perguntas:gerenciar + escopo | Edita texto, categoria ou opções | MVP |
| PUT | `/setores/:setorId/perguntas/ordem` | perguntas:gerenciar + escopo | Salva a nova ordem | MVP |
| PATCH | `/perguntas/:id/status` | perguntas:gerenciar + escopo | Ativa ou desativa | MVP |
| GET | `/respostas` | respostas:ver + escopo | Lista com filtros e paginação | MVP |
| GET | `/respostas/:id` | respostas:ver + escopo | Detalhe com itens e comentário; telefone mascarado | MVP |
| GET | `/contatos` | contatos:ver | Pedidos de retorno com filtros | MVP |
| POST | `/contatos/:id/revelar-telefone` | contatos:ver | Mostra o número completo e registra na auditoria | MVP |
| PATCH | `/contatos/:id/status` | contatos:gerenciar | Avança o status do retorno | Fase 2 |
| GET | `/dashboard/resumo` | dashboard:ver + escopo | NPS, total, promotores, neutros, detratores, médias e notas baixas | MVP |
| GET | `/dashboard/nps-por-setor` | dashboard:ver + escopo | NPS e volume de cada setor | MVP |
| GET | `/dashboard/evolucao` | dashboard:ver + escopo | Série por dia, semana ou mês | MVP |
| GET | `/dashboard/categorias` | dashboard:ver + escopo | Média e % de notas 4 e 5 por categoria e setor | MVP |
| GET | `/dashboard/ranking` | dashboard:ver + escopo | Onde está melhor e onde está pior | MVP |
| GET | `/dashboard/comentarios` | comentarios:ver + escopo | Comentários recentes | MVP |
| GET | `/exportacoes/resumo.xlsx` | exportacao:resumo | Indicadores com os filtros atuais | MVP |
| GET | `/exportacoes/respostas.xlsx` | exportacao:detalhada | Respostas, itens e comentários; telefones só com contatos:ver | MVP |
| GET | `/exportacoes/resumo.pdf` | exportacao:resumo | Resumo dos indicadores em PDF | MVP |
| GET | `/usuarios` | usuarios:gerenciar | Lista de usuários | MVP |
| POST | `/usuarios` | usuarios:gerenciar | Cria usuário com senha provisória | MVP |
| PATCH | `/usuarios/:id` | usuarios:gerenciar | Edita nome e perfil | MVP |
| PUT | `/usuarios/:id/setores` | usuarios:gerenciar | Define os setores do usuário | MVP |
| PATCH | `/usuarios/:id/status` | usuarios:gerenciar | Ativa ou desativa e revoga as sessões | MVP |
| POST | `/usuarios/:id/redefinir-senha` | usuarios:gerenciar | Gera nova senha provisória | MVP |
| GET | `/tv-telas` | tvwall:gerenciar | Telas cadastradas | MVP |
| POST | `/tv-telas` | tvwall:gerenciar | Cria a tela e devolve o link com token, uma única vez | MVP |
| PATCH | `/tv-telas/:id/status` | tvwall:gerenciar | Desativa a tela; o link para de funcionar | MVP |
| GET, PATCH | `/configuracoes` | configuracoes:gerenciar | Lê e altera limites e tempos | Fase 2 |
| GET | `/auditoria` | auditoria:ver | Consulta o log de ações | Fase 2 |
| POST | `/escalas/importar` | escalas:gerenciar | Recebe o Excel, valida e devolve uma prévia | Fase 2 |
| POST | `/escalas/:id/confirmar` | escalas:gerenciar | Grava a escala e refaz os vínculos do mês | Fase 2 |
| GET | `/dashboard/equipes` | dashboard:ver + escopo | Notas por plantão, equipe e profissional | Fase 2 |
| GET | `/eventos` | Logado | SSE: avisa o painel quando chega resposta | Fase 3 |
| GET, POST | `/integracoes/whatsapp/webhook` | Assinatura do WhatsApp | Verificação e recebimento de mensagens | Fase 3 |

O dashboard e as exportações aceitam os mesmos filtros: `inicio`, `fim`, `base` (data do atendimento ou do envio), `setorId`, `turnoId` e `canal`.

### Exemplo: envio da pesquisa

```json
POST /api/v1/publico/setores/pronto-atendimento/respostas
{
  "chaveIdempotencia": "4b7e0c1a-9d2f-4c11-8a35-1f0e6b2d7c90",
  "canal": "TOTEM",
  "dataAtendimento": "2026-11-10",
  "turnoId": 1,
  "itens": [
    { "perguntaId": 12, "valorNumero": 4 },
    { "perguntaId": 13, "valorNumero": 2 }
  ],
  "nps": 6
}

201 Created
{
  "data": {
    "id": 845,
    "classificacao": "BAIXA",
    "tokenComplemento": "kZ3pX9...",
    "expiraEm": "2026-11-10T14:52:00Z"
  }
}
```

### Exemplo: complemento (comentário e telefone)

```json
POST /api/v1/publico/respostas/845/complemento
X-Complemento-Token: kZ3pX9...
{
  "comentario": { "tipo": "RECLAMACAO", "texto": "Esperei muito na triagem." },
  "contato": { "telefone": "51999990000", "consentimento": true }
}
```

Se a mesma `chaveIdempotencia` chegar duas vezes, a API devolve a resposta já gravada em vez de criar outra. Isso protege contra clique duplo e reenvio após queda de rede.

## Front-end

Um único app React atende quatro áreas: pesquisa, totem, painel e TV Wall. Cada área só é baixada quando alguém a acessa.

### Rotas

| Rota | Área | Quem acessa | Fase |
| --- | --- | --- | --- |
| `/s/:setor` | Pesquisa no celular ou computador | Público | MVP |
| `/avaliar` | Pesquisa geral: a pessoa escolhe os setores que quer avaliar | Público | MVP |
| `/totem/:setor` | Pesquisa em modo totem | Público, no aparelho fixo do setor | MVP |
| `/tv#<token>` | TV Wall | Quem tem o link da tela | MVP |
| `/login` | Entrada do painel | Público | MVP |
| `/painel` | Dashboard | Todos os perfis | MVP |
| `/painel/respostas` | Respostas e comentários | Super Admin, Gestor e Ouvidoria | MVP |
| `/painel/contatos` | Pedidos de retorno | Super Admin e Ouvidoria | MVP |
| `/painel/setores` | Setores, links e QR Codes | Super Admin | MVP |
| `/painel/setores/:id/perguntas` | Perguntas do setor | Super Admin e Gestor do setor | MVP |
| `/painel/cadastros` | Categorias e turnos | Super Admin | MVP |
| `/painel/usuarios` | Usuários e seus setores | Super Admin | MVP |
| `/painel/tv` | Telas de TV Wall | Super Admin | MVP |
| `/painel/configuracoes` | Limites e tempos | Super Admin | Fase 2 |
| `/painel/escalas` | Importação de escalas | Super Admin e Gestor | Fase 2 |

Um app só significa um build, um deploy e os mesmos componentes em todas as áreas. Separar a pesquisa do painel só valeria se a pesquisa ficasse pesada, e o carregamento por rota já evita isso.

O token da TV vai depois do `#` porque essa parte da URL nunca é enviada ao servidor. Assim ele não aparece em logs.

### Fluxo da pesquisa

&#91;embedded content: fluxo da pesquisa · 7 etapas e 1 decisão\]

No celular, a pesquisa termina no agradecimento; no totem, ela volta sozinha ao início para o próximo paciente.

1. **Abertura:** o front busca `GET /publico/setores/:slug/pesquisa`, com perguntas, turnos, limites e tempos. Na pesquisa geral (`/avaliar`), busca `GET /publico/pesquisa`, e a abertura é a escolha dos setores, um ou mais.
2. **Data e turno:** no celular, botões “Hoje”, “Ontem” e “Outra data” e os turnos em botões. No totem não há essa tela: vale a data de hoje e o turno do horário atual.
3. **Perguntas do setor:** uma por tela, na ordem da jornada. Um toque responde e avança, e o botão “Pular” fica sempre visível. Na pesquisa geral, vêm as perguntas de cada setor escolhido, um setor depois do outro, na ordem em que a pessoa os escolheu, com o nome do setor acima de cada pergunta.
4. **NPS de 0 a 10:** obrigatório, em botões grandes (duas linhas no celular). Ao tocar, a resposta é enviada. Na pesquisa geral, a nota é dada uma vez e o `POST /publico/respostas` grava uma avaliação por setor escolhido.
5. **Comentário e telefone:** se a avaliação for baixa, “Quer contar o que aconteceu?”; se não for, “Quer deixar um elogio ou uma sugestão?”. Depois, “Quer que o hospital entre em contato?”, com telefone e consentimento: na web, para todos; no totem, só na avaliação baixa. Na pesquisa geral com mais de um setor, o comentário pergunta “Sobre qual setor?”, e o comentário e o telefone vão para a avaliação desse setor.
6. **Agradecimento:** mensagem curta; no totem, contagem regressiva e reinício.

Gravar no NPS garante o dado principal mesmo se a pessoa desistir no comentário. O complemento usa um token de uso único que expira em 30 minutos.

### Modo totem

- Depois do envio, reinicia em 15 s por padrão (configurável de 10 a 15 s) e apaga tudo da memória.
- Com 60 s sem toque no meio da pesquisa, pergunta “Ainda está aí?” e volta ao início 10 s depois.
- Tela cheia ao primeiro toque, tela sempre acesa (Screen Wake Lock) e sem zoom ou rolagem acidental.
- Nada é salvo no navegador, então nenhuma resposta anterior pode aparecer para o próximo paciente.
- O aparelho abre direto em `/totem/<setor>`, em modo quiosque: Chrome em modo kiosk no Windows ou Linux, app de quiosque ou fixação de tela no Android, Acesso Guiado no iPad.

### Painel

- Menu lateral que mostra só o que o perfil pode acessar.
- Dashboard: cartões de NPS, total de respostas, promotores, neutros, detratores e notas baixas; NPS por setor; evolução mensal; médias por categoria; ranking de melhores e piores pontos; comentários recentes.
- Filtros no topo (período, base da data, setor, turno, canal) ficam na URL. Assim a mesma visão pode ser compartilhada, e a exportação sai exatamente com o que está na tela.
- Perguntas: lista arrastável para ordenar, prévia no formato do celular e aviso quando passar de 8 perguntas ativas, sem bloquear.
- Setores: links da pesquisa e do totem e QR Code prontos para imprimir; e, para o Super Admin, o link geral (`/avaliar`), também com QR Code.

### TV Wall

- Tela cheia, tema escuro e números grandes, legíveis a distância.
- Alterna a cada 15 s entre visão geral (NPS e total do mês), NPS por setor, evolução e destaques positivos.
- Atualiza os dados a cada 30 s. Se a rede cair, mantém os últimos números e mostra a hora da última atualização.
- Nunca mostra comentários, reclamações ou dados pessoais: o endpoint da TV nem devolve esses campos.

### Estado, dados e formulários

| Necessidade | Solução | Por quê |
| --- | --- | --- |
| Dados da API | TanStack Query | Cache por filtro, recarga automática e estados de carregamento prontos |
| Sessão | Zustand, com o token só em memória | Sem token no localStorage, um script malicioso (XSS) tem menos a roubar |
| Chamadas HTTP | openapi-fetch em `lib/api/client.ts` | Tipado pelo contrato da API; injeta o token, renova uma vez em caso de 401 e padroniza os erros |
| Tipos da API | `lib/api/schema.d.ts`, gerado por `pnpm api:tipos` | Nada é digitado à mão, então front e API não divergem em silêncio |
| Formulários | React Hook Form + Zod, com schemas do próprio front | Erros aparecem antes do envio, com mensagens em português; a API valida de novo |
| Estado da pesquisa | `useReducer` dentro do `useFluxoPesquisa` | As etapas formam uma sequência simples, e tudo some ao reiniciar |

### Interface e acessibilidade

- Mobile-first: a pesquisa é desenhada para o celular e se adapta a tablet, computador e totem.
- Rostinhos acompanhados de texto (de “Muito ruim” a “Muito bom”), para a nota não depender só de cor ou desenho.
- Botões com no mínimo 48 px, texto da pesquisa com pelo menos 18 px e contraste no nível AA da WCAG.
- Navegação por teclado e rótulos para leitores de tela, que os componentes do shadcn/ui (Radix) já trazem.
- Contador nos campos de texto (limite de 500 caracteres) e máscara brasileira no telefone.

### Desempenho

- Cada área é carregada com `lazy()`: quem abre a pesquisa pelo QR Code não baixa gráficos nem o painel.
- Fontes do sistema e ícones em SVG na pesquisa, para abrir rápido mesmo em 4G.

## Autenticação, perfis e permissões

O login usa um token de acesso curto e um refresh token rotativo em cookie. Cada rota exige uma permissão, e gestores e visualizadores só enxergam os seus setores.

### Como funciona o login

1. O usuário envia e-mail e senha para `POST /auth/login`.
2. A API confere o hash argon2id e devolve o token de acesso (JWT de 15 min) no corpo da resposta.
3. O refresh token (aleatório, 7 dias) vai num cookie `HttpOnly`, `Secure` e `SameSite=Strict`, válido só em `/api/v1/auth`.
4. O front guarda o token de acesso apenas em memória e o envia no cabeçalho `Authorization`.
5. Ao receber 401, o `api-client` chama `/auth/refresh` uma única vez: o refresh antigo é revogado e um novo é emitido.
6. Ao recarregar a página, o front chama `/auth/refresh` para recuperar a sessão sem pedir a senha de novo.
7. Logout, desativação do usuário ou troca de senha revogam todos os refresh tokens daquela pessoa.

| Credencial | Onde fica | Validade | Por quê |
| --- | --- | --- | --- |
| Token de acesso (JWT) | Memória do navegador | 15 min | Se vazar, expira logo; a API valida sem consultar sessões no banco |
| Refresh token | Cookie HttpOnly, com o hash no banco | 7 dias, trocado a cada uso | O JavaScript não lê o cookie, e o banco permite revogar na hora |
| Token da TV | Link da tela, depois do `#`, com o hash no banco | Até ser desativado | A TV não tem quem digite senha e só lê números agregados |
| Token de complemento | Resposta do envio da pesquisa | 30 min, uso único | Só quem acabou de responder consegue anexar comentário e telefone |

Sessão guardada no servidor também funcionaria. O JWT foi escolhido porque o mesmo padrão atende integrações futuras, como o WhatsApp, sem depender de cookie. Provedores externos (Auth0, Keycloak) trariam custo e dependência sem ganho para um grupo pequeno de usuários internos.

As permissões não ficam dentro do token. A cada requisição, a API lê o perfil e os setores do usuário no banco; assim, uma mudança feita pelo Super Admin vale na hora, sem esperar o token expirar.

### Perfis e permissões

| Permissão | Super Admin | Gestor de setor | Ouvidoria | Visualizador |
| --- | --- | --- | --- | --- |
| setores:gerenciar, usuarios:gerenciar | ✓ | — | — | — |
| categorias:gerenciar, turnos:gerenciar | ✓ | — | — | — |
| tvwall:gerenciar, configuracoes:gerenciar, auditoria:ver | ✓ | — | — | — |
| perguntas:gerenciar | ✓ | ✓ nos seus setores | — | — |
| dashboard:ver | ✓ | ✓ nos seus setores | ✓ | ✓ nos seus setores |
| respostas:ver, comentarios:ver | ✓ | ✓ nos seus setores | ✓ | — |
| contatos:ver (telefones) | ✓ | — | ✓ | — |
| contatos:gerenciar (fase 2) | ✓ | — | ✓ | — |
| exportacao:resumo | ✓ | ✓ nos seus setores | ✓ | ✓ nos seus setores |
| exportacao:detalhada | ✓ | ✓ nos seus setores | ✓ | — |
| escalas:gerenciar (fase 2) | ✓ | ✓ nos seus setores | — | — |

O mapa de permissões por perfil fica só na API (`src/shared/constants/permissoes.ts`). O front recebe a lista de permissões do usuário em `/auth/me` e a usa para esconder menus. Quem pode ver telefones ainda depende do hospital; o padrão proposto restringe à Ouvidoria e ao Super Admin. Na fase 2 entram permissões extras por usuário, para exceções que o perfil não cobre.

### Middlewares de acesso

- `authenticate`: valida o JWT e carrega usuário, perfil e setores em `req.usuario`; usuário inativo recebe 401.
- `authorize('perguntas:gerenciar')`: confere a permissão no mapa do perfil; se faltar, 403.
- `setorScope('setorId')`: Super Admin e Ouvidoria passam; os demais só se o setor estiver entre os seus.
- Listagens aplicam o escopo dentro da própria consulta: um gestor nunca recebe dados de outro setor, mesmo pedindo “todos”.
- No front, `guards.tsx` esconde rotas e menus sem permissão, mas quem decide é sempre a API.

### Senhas e contas

- O Super Admin cria a conta com senha provisória, e a troca é obrigatória no primeiro acesso.
- Senha com no mínimo 10 caracteres, misturando letras e números.
- Recuperação de senha por e-mail entra na fase 2, junto com o SMTP; no MVP, o Super Admin redefine.
- O primeiro Super Admin é criado pelo seed, com e-mail e senha vindos de variáveis de ambiente.

## Recursos transversais

Exportação e TV Wall entram no MVP. E-mail, tempo real por SSE e WhatsApp já têm o caminho preparado para as próximas fases.

### Exportação (MVP)

- Gerada no backend, com os mesmos filtros e o mesmo escopo do dashboard: só se exporta o que o usuário pode ver.
- **Excel** (`exceljs`), um arquivo com abas: Resumo (indicadores e filtros aplicados), Respostas (uma linha por envio), Itens (uma linha por pergunta respondida) e Comentários. Telefones só aparecem para quem tem `contatos:ver`.
- **PDF** (`pdfmake`): uma ou duas páginas com indicadores, NPS por setor, médias por categoria, filtros usados, data e autor. Gráficos no PDF ficam para a fase 3.
- O arquivo é gerado na hora e enviado em streaming, e cada exportação vai para a auditoria.
- No backend porque o navegador não precisa baixar milhares de linhas, e a regra de permissão não pode depender do front.

### Atualização “em tempo real”

- No MVP, o TanStack Query consulta a API de novo a cada 60 s no dashboard e a cada 30 s na TV.
- Na fase 3, se fizer falta, uma rota SSE (`/eventos`) avisa quando chega resposta, e o front recarrega só os dados afetados.
- SSE em vez de WebSocket porque a comunicação é só do servidor para a tela, e o SSE faz isso sobre HTTP comum.

### Alertas por e-mail (fase 2)

1. Ao gravar uma resposta baixíssima (NPS até 2 ou alguma nota 1), o service cria um registro em `notificacoes` na mesma transação.
2. Um worker, com o mesmo código da API em outro processo, lê essa fila a cada poucos segundos e envia pelo Nodemailer.
3. Se o envio falhar, tenta de novo com espera crescente; depois de 5 falhas, marca como FALHOU e mostra no painel.
4. Destinatários: gestores do setor, Ouvidoria e Super Admin, com a lista ajustável por setor.
5. O e-mail traz setor, data, notas e o link da resposta no painel, nunca o telefone do paciente.

A fila no banco (padrão outbox) garante que nenhum alerta se perca se o servidor de e-mail cair, e não exige Redis.

### Preparação para o WhatsApp

- As regras ficam nos services, não nos controllers. Um futuro módulo `integracoes/whatsapp` vai chamar o mesmo service de pesquisa usado pela rota web.
- Cada resposta já tem o campo `canal` (WEB, TOTEM e, no futuro, WHATSAPP), então os relatórios separam os canais sem migração de dados.
- Há dois caminhos possíveis: mandar só o link do setor, o que não muda nada na API, ou conduzir a pesquisa na própria conversa, recebendo as mensagens por webhook.
- Integrações terão chave de API própria, separada do login das pessoas.

### LGPD e dados pessoais

- Coleta mínima: a pesquisa é anônima, e o único dado pessoal é o telefone, opcional e com consentimento explícito.
- O telefone é cifrado no banco, mascarado nas telas e só revelado com permissão, sempre com registro na auditoria.
- Nenhum dado pessoal vai para logs, para a TV Wall ou para exportações de quem não tem permissão.
- O IP do paciente não é gravado no banco.
- O prazo de retenção depende do hospital; na fase 2, uma rotina apaga os telefones vencidos.
- De preferência, hospedagem em data center no Brasil.

### Configurações do sistema

| Chave | Padrão | Uso |
| --- | --- | --- |
| nps\_limite\_baixa | 6 | NPS até este valor é avaliação baixa |
| nps\_limite\_baixissima | 2 | NPS até este valor é avaliação baixíssima |
| escala\_limite\_baixa | 3 | Nota de 1 a 5 até este valor é baixa |
| escala\_limite\_baixissima | 1 | Nota de 1 a 5 até este valor é baixíssima |
| totem\_reinicio\_segundos | 15 | Espera antes de reiniciar o totem (de 10 a 15) |
| totem\_inatividade\_segundos | 60 | Tempo sem toque até perguntar se a pessoa ainda está lá |
| texto\_limite\_caracteres | 500 | Tamanho máximo dos comentários |
| nps\_texto | “De 0 a 10, qual a probabilidade de você recomendar o hospital a alguém?” | Texto exibido na pergunta do NPS |

A classificação de uma resposta é a pior entre o NPS e as notas de 1 a 5. A função fica só na API (`src/shared/rules/classificar-nota.ts`) e recebe esses limites. A API devolve a classificação pronta, inclusive de cada nota, e o front só a exibe; assim a regra existe num lugar só.

## Qualidade, Git e integração contínua

Todo código entra por pull request revisado e só é aceito com lint, tipos, testes e build aprovados no GitHub Actions.

### Testes

| Tipo | Ferramenta | O que cobre | Fase |
| --- | --- | --- | --- |
| Unitário | Vitest | Classificação de notas, cálculo do NPS, mapa de permissões e regras dos services | MVP |
| Integração | Vitest + Supertest + PostgreSQL de teste | Login e refresh; envio da pesquisa (NPS obrigatório, idempotência, complemento); bloqueio por setor; exportação | MVP |
| Componentes | Vitest + Testing Library | Escala de rostinhos, NPS e etapas da pesquisa | Fase 2 |
| Ponta a ponta | Playwright | Paciente responde no celular e no totem; gestor cria pergunta e a vê no dashboard | Fase 2 |

No prazo do MVP, os testes vão onde um erro custa mais caro: regras de nota, permissões e envio da pesquisa.

### Padrão de código

- TypeScript em modo `strict`, ESLint (typescript-eslint e react-hooks) e Prettier, com a mesma configuração nos dois repositórios.
- Husky roda o lint-staged antes de cada commit e o commitlint na mensagem.
- `.editorconfig` e `.nvmrc` deixam editor e versão do Node iguais para todos.

### Commits

O padrão é Conventional Commits: `tipo(escopo): descrição`, com o tipo em inglês e a descrição em português. Exemplos: `feat(pesquisa): reinício automático do totem`, `fix(auth): renovar o token só uma vez`, `test(dashboard): cálculo do NPS por setor`. O histórico fica legível, e um changelog pode ser gerado automaticamente depois. Commits e pull requests não levam coautoria nem assinatura de ferramentas de IA.

### Fluxo Git

- Nos dois repositórios, cada tarefa ganha uma branch curta, criada a partir da `develop`, com o prefixo do tipo e o número do ticket: `feat/`, `fix/`, `docs/`, `chore/`, `style/`, `refactor/`, `test/` ou `ci/` (por exemplo, `feat/05-login-e-sessao`).
- Terminada a tarefa, a branch volta para a `develop`. Ninguém commita direto na `develop` nem na `main`.
- A `main` só recebe a `develop` quando há uma versão estável, e cada uma ganha uma tag de versão (`v0.1.0`, `v0.2.0`...). O que vai para o hospital sai sempre da `main`.
- Pull requests pequenos, com descrição e print das telas; pelo menos uma aprovação de outra pessoa do time.
- Uma funcionalidade que mexe nos dois lados vira dois PRs ligados na descrição. O da API entra primeiro, com o `openapi.json` atualizado; depois entra o do front, com os tipos regenerados.
- As tarefas são os tickets de `docs/tickets/` de cada repositório, espelhados como issues no GitHub; um quadro do GitHub Projects pode reunir os dois repositórios: A fazer, Em andamento, Em revisão, Feito.
- A `develop` separa o que ainda está em desenvolvimento do que já foi testado, e a `main` guarda só versões estáveis, prontas para o hospital.

### Pipeline de CI (um `ci.yml` em cada repositório)

1. Checkout e instalação com pnpm, usando cache das dependências.
2. `pnpm lint` e `pnpm typecheck`.
3. `pnpm test`; na API, com um serviço PostgreSQL 18 rodando no próprio GitHub Actions.
4. Só na API: `pnpm openapi:exportar`, falhando se o `openapi.json` mudou sem ter sido commitado.
5. `pnpm build`.

O deploy automático entra na fase 2: cada repositório passa a publicar a sua imagem Docker no GitHub Container Registry.

### Definição de pronto

Uma tarefa só está pronta quando:

- a rota está validada com Zod e registrada no Swagger;
- a permissão e o escopo de setor estão testados;
- a tela funciona no celular e no computador;
- os testes da regra nova passam no CI;
- outra pessoa do time revisou e aprovou.

## Infraestrutura e deploy

Tudo roda em containers Docker. A mesma configuração sobe numa VPS, no servidor do hospital ou numa plataforma gerenciada, então a hospedagem pode ser decidida depois sem retrabalho.

### Ambientes

| Ambiente | Onde | Banco | Uso |
| --- | --- | --- | --- |
| Desenvolvimento | Máquina de cada pessoa, com os dois repositórios lado a lado | PostgreSQL do `docker-compose.yml` do repositório da API | Programar, com API e front recarregando sozinhos |
| Homologação | Servidor com domínio de teste | PostgreSQL próprio, com dados fictícios | O hospital testa cada entrega antes de ir ao ar |
| Produção | Servidor definitivo | PostgreSQL com backup diário | Uso real |

### Containers de produção (`infra/docker-compose.prod.yml`, no repositório da API)

| Serviço | Origem | Função |
| --- | --- | --- |
| caddy | `Dockerfile` do repositório web: front compilado dentro da imagem do Caddy | HTTPS, arquivos do front e proxy de `/api` |
| api | `Dockerfile` do repositório da API | API Node.js; aplica as migrations e o seed base ao iniciar |
| postgres | Imagem oficial do PostgreSQL 18 | Banco com volume persistente, sem porta exposta para fora |
| backup | `infra/backup/`: PostgreSQL 18 (Alpine) com o rclone e os scripts | `pg_dump` diário, com retenção e uma cópia fora do servidor |
| worker (fase 2) | Mesma imagem da API, outro comando | Envio dos e-mails da fila |

O front vira arquivos estáticos, e colocá-los na imagem do Caddy dispensa um Nginx a mais. Rodar `prisma migrate deploy` ao subir a API garante que o banco está sempre na versão do código.

### Docker

- Dockerfiles em múltiplos estágios: instalam e compilam numa imagem completa e copiam só o resultado para uma imagem enxuta (Node Alpine na API, Caddy no front).
- Cada repositório constrói a sua imagem sozinho, sem depender do outro.
- O compose de produção fica na API e constrói o front a partir de `../fhdod-satisfacao-web`; por isso os dois repositórios ficam lado a lado também no servidor.
- A API roda com um usuário sem privilégios dentro do container.
- O PostgreSQL roda em UTC e UTF-8, definidos no próprio compose, sem arquivo de configuração à parte.

### Variáveis de ambiente

| Variável | Exemplo | Para quê |
| --- | --- | --- |
| NODE\_ENV | production | Ativa o comportamento de produção |
| PORT | 3333 | Porta interna da API |
| DATABASE\_URL | postgresql://app:\*\*\*@postgres:5432/satisfacao | Conexão do Prisma |
| JWT\_ACCESS\_SECRET | 64 caracteres aleatórios | Assina o token de acesso |
| ACCESS\_TOKEN\_TTL | 15m | Validade do token de acesso |
| REFRESH\_TOKEN\_TTL\_DAYS | 7 | Validade do refresh token |
| ENCRYPTION\_KEY | 32 bytes em base64 | Cifra dos telefones |
| APP\_URL | https://pesquisa.exemplo.com.br | Monta links de QR Code e de e-mails |
| CORS\_ORIGIN | https://pesquisa.exemplo.com.br | Origem aceita pela API |
| RATE\_LIMIT\_ALLOWLIST | IP público do hospital | Evita bloquear os totens |
| DOCS\_ENABLED | false | Liga o Swagger fora do desenvolvimento |
| LOG\_LEVEL | info | Nível de detalhe dos logs |
| SEED\_ADMIN\_EMAIL, SEED\_ADMIN\_PASSWORD | definidos no servidor | Cria o primeiro Super Admin |
| SMTP\_HOST, SMTP\_PORT, SMTP\_USER, SMTP\_PASS, SMTP\_FROM | dados do provedor | E-mail (fase 2) |

### Como publicar uma versão no MVP

1. Levar a `develop` para a `main` nos dois repositórios, com o CI aprovado e uma tag de versão. Se o contrato mudou, a API vai primeiro.
2. No servidor, `git pull` em `fhdod-satisfacao-api` e em `fhdod-satisfacao-web`.
3. Na pasta da API, `docker compose -f infra/docker-compose.prod.yml up -d --build --wait`, com as variáveis do `infra/.env` do servidor. O `--wait` só termina com todos os serviços saudáveis.
4. A API aplica as migrations e o seed base ao iniciar, e o Caddy renova o HTTPS sozinho.
5. Conferir `/api/health` e responder uma pesquisa de teste.

Na fase 2, o CI passa a publicar as imagens prontas, e o servidor só baixa a nova versão, sem compilar nada.

### Backup e monitoramento

- `pg_dump` diário às 3h, no formato próprio do PostgreSQL (restaurado com `pg_restore`), mantendo 7 cópias diárias e 4 semanais, com uma cópia fora do servidor.
- Teste de restauração uma vez por mês na homologação: backup que nunca foi restaurado não é garantia.
- Um monitor externo gratuito (por exemplo, UptimeRobot) chama `/api/health` a cada 5 min e avisa o time.
- Logs em JSON no Docker, com rotação de arquivo para não encher o disco.

### Onde hospedar

| Opção | Prós | Contras |
| --- | --- | --- |
| VPS em nuvem, na região de São Paulo | Barata, controle total, dados no Brasil | O time cuida das atualizações e da segurança do servidor |
| Servidor do hospital | Dados ficam dentro do hospital | O TI precisa liberar domínio, HTTPS e acesso pela internet, já que pacientes respondem de casa |
| Plataforma gerenciada | Menos manutenção, e quase toda plataforma oferece PostgreSQL gerenciado | Custo por serviço, e nem toda opção tem data center no Brasil |

Para homologação e MVP, uma VPS de entrada (por volta de 2 vCPU e 4 GB de RAM) atende com folga. A decisão final pode ficar para depois, porque a configuração Docker é a mesma em qualquer opção.

## Roadmap

O MVP fica pronto em Nov 27, 2026, depois de quatro semanas; a última é de homologação com o hospital. Ouvidoria, e-mails e escalas vêm na fase 2.

&#91;embedded content: linha do tempo do MVP · 7 frentes e a entrega\]

As frentes se sobrepõem porque o time trabalha em paralelo. A última semana fica reservada para testes e para a homologação com o hospital.

### Checklist do MVP

**Semana 1 — 29/10 a 06/11 (feriado em 02/11)**

- [ ] Os dois repositórios, PostgreSQL no Docker, ESLint, Prettier, Husky e CI em cada um
- [ ] Schema Prisma, primeiras migrations e seed
- [ ] Middlewares base, padrão de erro, Swagger e exportação do `openapi.json`
- [ ] Geração dos tipos no front e cliente HTTP com openapi-fetch
- [ ] Login, refresh, logout, `/auth/me` e guards do front
- [ ] Layout do painel com shadcn/ui

**Semana 2 — 09/11 a 13/11**

- [ ] Cadastros de setores, categorias, turnos e usuários
- [ ] Perguntas: criar, editar, ordenar e ativar
- [ ] Rotas públicas da pesquisa: definição, envio e complemento
- [ ] Telas da pesquisa no celular e modo totem

**Semana 3 — 16/11 a 20/11 (feriado em 20/11)**

- [ ] Endpoints e tela do dashboard
- [ ] Respostas e pedidos de retorno com telefone protegido
- [ ] TV Wall: telas, token e atualização automática
- [ ] Exportação em Excel

**Semana 4 — 23/11 a 27/11**

- [ ] Exportação em PDF
- [ ] Testes de integração das rotas críticas
- [ ] Deploy em homologação e teste com o hospital, em totem real e em celulares
- [ ] Correções finais e entrega do MVP

### Fase 2

- Gestão da ouvidoria: status Novo, Pendente, Em atendimento e Resolvido, com responsável e histórico.
- Alertas por e-mail em nota baixíssima (outbox + worker) e recuperação de senha por e-mail.
- Importação de escalas em Excel com modelo padrão, vínculo com plantão, equipe e profissional, e filtros no dashboard.
- Tela de configurações, consulta da auditoria e permissões extras por usuário.
- Mapa de calor setor × categoria e comparação entre períodos.
- Testes de componentes e de ponta a ponta, e deploy automático.

### Fase 3

- Atualização em tempo real por SSE.
- Integração com WhatsApp.
- Taxa de adesão, importando o número de atendimentos de cada mês.
- PDF com gráficos e fechamento mensal.
- Fila offline no totem, para quedas de rede.

### Como o time se divide

- Semana 1 em conjunto: a fundação dos dois repositórios define os padrões que todos vão repetir.
- Depois, cada pessoa pega uma fatia completa (rota, regra, tela e teste) nos dois repositórios, em vez de “só front” ou “só back”.
- Toda segunda, 15 minutos para dividir as tarefas da semana; toda sexta, demonstração do que ficou pronto.
- Mudanças no contrato da API (`openapi.json`) ou no schema Prisma são avisadas ao grupo antes do merge, porque afetam todo mundo.

## Riscos e pontos em aberto

O maior risco é o prazo. Se faltar tempo, o plano corta escopo, nunca segurança nem os testes das regras críticas.

| Risco | Impacto | Como reduzir |
| --- | --- | --- |
| Prazo de quatro semanas | Funcionalidades incompletas na entrega | Prioridade fixa: pesquisa, painel, TV Wall, exportação. Se apertar, o PDF vira a primeira entrega da fase 2 |
| Time com menos prática em PostgreSQL | Consulta de relatório errada ou lenta | O Prisma cobre o CRUD; o SQL dos relatórios fica concentrado nos repositories e é testado contra um PostgreSQL de verdade no CI |
| Front e API fora de sincronia | Tela quebra depois de um deploy | `openapi.json` versionado e conferido no CI, tipos gerados no front e deploy da API antes do front |
| Paciente desiste antes do NPS | Resposta perdida | Pesquisa curta, aviso ao gestor acima de 8 perguntas e botão “Pular” sempre à vista |
| Rede instável no totem | Falha no envio | Mensagem clara e nova tentativa com a mesma chave de idempotência; fila offline na fase 3 |
| Totens saindo pelo mesmo IP | Limite de envios bloqueia pacientes | IP do hospital na lista de exceção do rate limit |
| Hospedagem indefinida | Atraso na homologação | Decidir até a semana 3; o Docker evita retrabalho |
| Gestores editando perguntas já respondidas | Histórico confuso | Cópia do texto em cada resposta e bloqueio de mudança de tipo |
| Telefones de pacientes | Exposição de dados e risco com a LGPD | Cifra, acesso restrito, auditoria e prazo de retenção |
| Escalas em formatos variados (fase 2) | Importação falha | Modelo padrão de planilha validado com o hospital antes da fase 2 |

### Confirmar com o hospital

- [ ] Turnos oficiais e seus horários (o seed usa Manhã, Tarde e Noite como provisório)
- [ ] Texto final da pergunta do NPS
- [ ] Quem pode ver os telefones de retorno
- [ ] Prazo de retenção das respostas e dos telefones
- [ ] Lista inicial de setores, suas perguntas e os gestores de cada um
- [ ] Domínio e local de hospedagem
- [ ] Modelo dos totens (sistema e navegador) e onde ficarão as TVs
- [ ] Destinatários dos e-mails de nota baixíssima (fase 2)
- [ ] Formato das planilhas de escala (fase 2)
