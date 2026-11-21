# Fundação da API: `/api/health`, middlewares e erros padrão

21/11/2026 · Agente (Claude Code)

> Ticket [02](../tickets/02-fundacao-da-api.md), issue [#2](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/2). Primeiro código da API: o caminho por onde todas as rotas dos próximos tickets vão passar.

## O que foi feito

- **Projeto:** pnpm 12, TypeScript 6.0 em modo strict, ESLint e Prettier com a configuração do front, `.editorconfig`, `.gitattributes` (fim de linha LF) e Node 24 fixado no `.nvmrc` e no `engines`. Scripts de desenvolvimento com recarga (`tsx watch`), build (`tsup`), lint, tipos, testes e os comandos do banco (`db:*`).
- **Commits:** Husky com lint-staged (ESLint e Prettier nos arquivos alterados) e commitlint (Conventional Commits com os tipos do `AGENTS.md`). Uma regra própria, `sem-coautoria-do-claude`, recusa `Co-Authored-By` do Claude ou da Anthropic, "Generated with Claude Code" e o trailer `Claude-Session`.
- **Banco:** `docker-compose.yml` com dois PostgreSQL 18 em UTC e UTF-8: `postgres` (desenvolvimento, porta 5432, dados num volume) e `postgres-teste` (testes, porta 5433, dados só na memória). Prisma 7.10 com cliente único em `src/database/prisma.ts`, pelo adaptador `@prisma/adapter-pg`.
- **Ambiente:** `src/config/env.ts` valida as variáveis com Zod ao iniciar. Se faltar alguma, a API não sobe e lista cada uma com o que escrever nela, sem mostrar valores. O `.env.example` documenta todas.
- **Cadeia de middlewares** (`src/app.ts`), na ordem do plano: `request-id` (ULID no `X-Request-Id`), `http-logger` (entrada e saída), `helmet`, `cors` só para as origens do `CORS_ORIGIN`, `express.json` até 100 kB, `cookie-parser`, `/api/health`, o roteador `/api/v1`, `not-found` e `error-handler`.
- **Respostas e erros:** `responder`, `responderLista` e `responderSemConteudo` (`src/shared/http/respond.ts`), paginação com `pagina` e `porPagina` (`pagination.ts`), `AppError` com os sete códigos do front e o `error-handler`, que devolve `{ erro: { codigo, mensagem, detalhes, requestId } }`.
- **Validação:** middleware `validate({ params, query, body })` com schemas Zod. Erro vira 400 `VALIDACAO`, com um item por campo e o caminho do campo (`contato.telefone`); os dados convertidos ficam em `req.valid`, e o controller os lê, tipados, com `validados(req, esquemas)`. Mensagens padrão do Zod em português.
- **Logs:** pino em JSON, com hora ISO em UTC, `requestId`, método, rota (sem a query string), status e `duracaoMs`. Cabeçalhos e corpo não entram no log, e as chaves sensíveis são ocultadas em qualquer objeto, até quatro níveis abaixo.
- **Health:** módulo `health` (rotas, controller, service e repository). `GET /api/health` responde 200 com o banco no ar e 503 sem ele, com `{ data: { status, banco } }`.
- **Encerramento** (`src/shared/http/encerramento.ts`): no SIGTERM ou no SIGINT, a API para de aceitar conexões, espera as requisições em curso (até 8 s) e só então fecha a conexão com o banco. Um segundo sinal força a saída.
- **Testes:** Vitest e Supertest, sem subir servidor. São 52 testes em dois projetos. O `unit` não precisa de banco: variáveis de ambiente, códigos de erro, paginação, encerramento e commitlint. O `integration` roda contra o banco de teste e cobre health, 404, os formatos de sucesso e de erro, validação, ID da requisição, helmet, CORS, cookies e o que vai ou não vai para o log. O `tests/setup.ts` avisa como subir o banco quando ele não responde.
- README com o passo a passo do zero e a seção "Comandos do projeto" no `AGENTS.md`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Node 24 (LTS) no `.nvmrc` e em `engines: ^24.11.0`, trocado depois pelo Node 26 ([registro 03](2026-11-21-03-node-26.md)) | O plano pede LTS 22 ou mais recente. O 24 tem suporte até abril de 2028 e é o que está instalado na máquina de desenvolvimento. Com o `engines`, o pnpm avisa quando a versão do Node é outra (ele avisa, mas não impede a instalação) |
| TypeScript 6.0, como no front | O 7.0 já saiu, mas o typescript-eslint ainda não o aceita (`<6.1.0`) |
| Prisma 7.10.1 fixo, com `prisma-client`, saída em `src/generated/prisma` e `@prisma/adapter-pg` | É a forma do Prisma 7: cliente em TypeScript, sem motor binário, empacotado pelo tsup junto com a API. A versão fica fixa porque o `latest` do `prisma` no npm aponta para um RC do Prisma 8 |
| Cliente gerado fora do Git, criado no `pnpm install` (`postinstall`) | É código gerado, refeito a cada mudança do schema |
| `prisma7.config.ts`, com o `.env` lido pelo `process.loadEnvFile` do Node | O Prisma 7 não lê o `.env` sozinho, e o 7.10 procura esse nome antes do antigo `prisma.config.ts` (é o que o `prisma init` gera). Assim, não precisa da dependência `dotenv` |
| `allowBuilds` no `pnpm-workspace.yaml` só para o Prisma e o esbuild | O pnpm 12 não roda scripts de instalação de dependências sem autorização; esses três precisam deles |
| `/api/health` fora do `/api/v1` | É o endereço do ticket e das seções "Logs e saúde", "Como publicar" e "Backup e monitoramento" do plano. O Docker e o monitor chamam sempre o mesmo endereço, que não muda com a versão da API |
| Health responde `{ data: { status, banco } }` também no 503 | Quem chama o health é o Docker ou o monitor: eles leem o status HTTP, e o corpo diz o que caiu. Não precisa de código de erro novo, e o front não usa essa rota |
| Health que deu certo não vai para o log; a falha vai | O Docker e o monitor chamam a rota o tempo todo; seriam milhares de linhas iguais por dia |
| ID da requisição em ULID, sempre gerado pela API | É ordenável pelo tempo, como o exemplo `01JC9W2K7Q` do plano. Um `X-Request-Id` mandado pelo cliente é ignorado, para ninguém repetir ou forjar IDs no log |
| Log com o caminho, sem a query string | Filtros e links com token podem ir na URL; método, rota, status e duração bastam |
| O logger oculta também `set-cookie`, `senhaAtual` e `novaSenha` | `set-cookie` leva o cookie de refresh na resposta; `senhaAtual` e `novaSenha` são os campos da troca de senha no front |
| Mensagens do Zod em português (pt-BR) e "Obrigatório" para campo ausente | O front mostra a mensagem de cada campo direto para o usuário. Cada schema pode trocar pela sua |
| Erros 4xx do próprio Express (JSON malformado, corpo acima de 100 kB, codificação) viram 400 `VALIDACAO` | São sempre problema nos dados enviados, e 413 e 415 não têm código próprio entre os que o front trata |
| Um `ZodError` fora do `validate` vira 500 | Só a entrada conferida pelo `validate` é erro de quem chamou; um schema que falha em outro lugar é bug da API |
| `createApp({ rotas, logger })` | Os testes de integração montam rotas próprias e leem o log na memória, passando pela cadeia de middlewares real |
| Dois serviços no compose, o de teste em memória (tmpfs), com as portas só em `127.0.0.1` | Banco de teste separado de verdade, sempre limpo e rápido, e nenhum banco exposto na rede |
| Imagem `postgres:18`, a Debian, e volume em `/var/lib/postgresql` | A variante Alpine não tem suporte completo a locales, o que muda a ordenação de textos com acento. A partir do 18, a imagem guarda os dados em `/var/lib/postgresql/18/docker` |
| Só as variáveis que a API usa hoje (`NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `LOG_LEVEL`) | As outras da tabela do plano entram com os tickets que as usam, para a API não exigir variável que ninguém lê. `NODE_ENV` é obrigatória porque nenhum padrão é seguro nos dois sentidos |
| `.gitattributes` com LF e Prettier fora dos `.md` | Com `core.autocrlf=true`, a cópia de trabalho no Windows ficava em CRLF, e o Prettier acusaria todos os arquivos. O LF também protege os scripts que rodarão dentro do Docker. Nos `.md`, o Prettier realinharia as tabelas a cada edição |
| Projetos `unit` e `integration` no Vitest | `pnpm test --project unit` roda sem banco; os de integração rodam um arquivo por vez, porque dividem o banco de teste |

## Ferramentas e skills usadas

- Claude Code, lendo o plano, os tickets 02 e 03 e o `AGENTS.md` e, no front, `src/lib/api/tipos.ts`, `src/lib/api/erro.ts`, `src/mocks/rede.ts`, `eslint.config.js` e `.prettierrc`.
- As versões foram conferidas no npm em 21/11/2026. O código do pino-http e o carregador de configuração do Prisma foram lidos no `node_modules`, para configurar o log e o `prisma7.config.ts`.
- **Sem Docker na máquina.** A API e os testes de integração rodaram contra o PostgreSQL local do próprio Prisma CLI (`prisma dev`, feito sobre o PGlite), com `TEST_DATABASE_URL` apontando para ele. Nessa base foram conferidos à mão o health (200, e 503 com o banco desligado), o 404, o JSON malformado, o corpo grande, o CORS, a porta ocupada e o build rodando. O `docker-compose.yml` só passou pela checagem de sintaxe do Prettier.
- Nenhuma skill.

## O que mudou em relação ao plano

- **Health em `/api/health`**, e não em `/api/v1/health`. A tabela de endpoints diz que tudo fica sob `/api/v1` e lista `/health` e `/docs` sem prefixo, mas o resto do plano usa `/api/health` e `/api/docs`.
- **Arquivos que não estão na "Estrutura de pastas":** `prisma7.config.ts` (o Prisma 7 exige um arquivo de configuração), `src/generated/prisma` (o cliente gerado, fora do Git), `src/config/zod.ts` (mensagens em português), `src/shared/http/encerramento.ts` (o encerramento, separado do `server.ts` para poder ser testado), `tests/helpers/` (o logger de teste), `.gitattributes`, `.prettierignore` e `pnpm-workspace.yaml`.
- **Testes de integração com nomes por assunto:** `health`, `respostas-e-erros` e `middlewares`. Os do plano (`auth`, `pesquisa`, `permissoes`) entram com os seus tickets, assim como `tests/factories/`.

## Pendências e dúvidas

- **Rodar com Docker antes de aprovar.** A máquina onde o ticket foi feito não tem Docker. Quem revisar o PR roda `docker compose up -d` e `pnpm test` e confere `SHOW timezone` e `SHOW server_encoding` nos dois bancos.
- **Migrations nos testes.** O `tests/setup.ts` hoje só confere a conexão. No ticket 04, ele passa a aplicar as migrations no banco de teste antes da suíte.
- **CI (ticket 03).** O job de testes precisa de um serviço PostgreSQL 18 e de `TEST_DATABASE_URL` apontando para ele.
- **Node 26.** Feito no mesmo dia: veja o [registro 03](2026-11-21-03-node-26.md).
- **Front.** O ticket 02 do front pede `.editorconfig` e versão do Node iguais às da API: o `.editorconfig` daqui e Node 26. O `.gitattributes` evitaria lá o mesmo problema de CRLF.
- **Prisma 8.** Está em RC; a API fica no 7.10.1 até a versão estável sair e alguém avaliar a migração.
