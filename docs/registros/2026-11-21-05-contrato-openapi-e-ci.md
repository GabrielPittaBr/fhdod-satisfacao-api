# Contrato: Swagger, `openapi.json` e CI

21/11/2026 · Agente (Claude Code)

> Ticket [03](../tickets/03-contrato-openapi-e-ci.md), issue [#3](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/3). A documentação da API passa a sair dos mesmos schemas Zod que validam as rotas, o front ganha o `openapi.json` de que vai gerar os tipos, e todo PR passa pelo CI.

## O que foi feito

- **Documento OpenAPI 3.1**, montado em `src/config/openapi.ts` pelo `@asteasolutions/zod-to-openapi` 9.1 a partir dos schemas Zod. Cada módulo tem um `<modulo>.docs.ts` com a função que registra as suas rotas, e a lista `MODULOS` define a ordem: o `/api/health` é a primeira rota, e por enquanto a única.
- **`documentarRota`** (`src/shared/http/documentacao.ts`): registra uma rota com o mesmo objeto de esquemas que vai para o `validate` (params, query e corpo). Toda rota ganha o 500 `ERRO_INTERNO`, e as que validam alguma coisa, o 400 `VALIDACAO`; os outros erros vêm na lista `erros`. Toda resposta de erro aponta para o componente `Erro` e traz um exemplo com o código e a mensagem que a API manda de fato.
- **Componentes com nome:** `Erro` (o corpo `{ erro: { codigo, mensagem, detalhes, requestId } }`), `DetalheErro`, `CodigoDeErro` (os sete códigos, tirados do `STATUS_DO_CODIGO`), `Meta` e `Saude`. `DetalheErro` e `Meta` têm os nomes dos tipos do front. Em `respond.ts`, `envelope(schema)` e `lista(schema)` descrevem o `{ data }` e o `{ data, meta }`.
- **Health:** `health.schemas.ts`, com o `Saude` em Zod (o service passou a usar o tipo dele), e `health.docs.ts`, com o 200 e o 503.
- **Swagger UI** em `/api/docs` e o documento em `/api/docs/openapi.json` (`swagger-ui-express` 5.0.1), no módulo `src/modules/docs/`. A página carrega o documento dessa rota, e `/api/docs` leva para `/api/docs/`.
- **`DOCS_ENABLED`** em `src/config/env.ts` e no `.env.example`. Sem ela, o Swagger fica ligado em development e test e desligado em production; com `true` ou `false`, vale o que ela diz. Desligado, `/api/docs` responde 404 no padrão da API.
- **`pnpm openapi:exportar`** (`scripts/exportar-openapi.ts`) grava o documento em `openapi.json`, na raiz, commitado neste PR.
- **Testes:** são 72 (eram 52).
  - `tests/contrato.test.ts`: o `openapi.json` commitado é o que o código gera; toda rota do Express está no documento, e o documento não tem rota que não exista; o documento começa pelo `/api/health`; toda rota tem o 500, e toda resposta com o status de um código de erro usa o `Erro`; os componentes com nome estão lá.
  - `src/shared/http/documentacao.test.ts`: o `documentarRota` com params, query e corpo, os erros que entram sozinhos e os formatos `{ data }` e `{ data, meta }`.
  - `tests/integration/docs.test.ts`: o documento e a página no ar, o redirecionamento, o 404 de arquivo inexistente e o Swagger desligado.
  - `env.test.ts` e `app-error.test.ts`: o padrão do `DOCS_ENABLED` em cada ambiente e o `AppError.interno()`.
- **CI** em `.github/workflows/ci.yml`, a cada pull request e a cada push na `develop` e na `main`: pnpm na versão do `packageManager`, com cache, Node do `.nvmrc`, `pnpm install --frozen-lockfile`, lint, tipos, testes com um serviço PostgreSQL 18, contrato e build. O passo do contrato roda o `pnpm openapi:exportar` e, se o `openapi.json` mudou, falha e mostra o diff.
- **Modelo de PR** em `.github/pull_request_template.md`, com as seções do modelo do front e o lembrete do Swagger e do `openapi.json`.
- `AGENTS.md` com "Como documentar uma rota", o comando novo, o CI e o modelo de PR. README com o Swagger, o `openapi.json` e o CI.
- Ticket 03 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| `@asteasolutions/zod-to-openapi` 9.1 e `swagger-ui-express` 5.0 | São as bibliotecas do plano ("zod-to-openapi + swagger-ui-express"). A 9.1 é a última versão e aceita o Zod 4 |
| OpenAPI 3.1 | Segue o JSON Schema (`null` como tipo, em vez do `nullable` do 3.0) e é lido pelo Swagger UI 5 e pelo openapi-typescript que o front vai usar |
| Nomes dados com o `.meta({ id })` do próprio Zod, sem o `extendZodWithOpenApi` | O zod-to-openapi lê o nome do registro do Zod 4. Não é preciso estender o protótipo do Zod nem cuidar da ordem dos imports |
| O mesmo objeto de esquemas no `validate` e no `documentarRota` | É o que garante que o Swagger descreve exatamente o que é validado: "a documentação sai dos mesmos schemas Zod que validam as rotas" |
| `EsquemasDaRota` com params e query sempre objetos | Cada campo vira um parâmetro no documento; um schema que não fosse objeto não teria como virar parâmetros |
| 400 e 500 automáticos no `documentarRota` | Toda rota pode dar 500, e toda rota com `validate` pode dar 400. Assim nenhum `*.docs.ts` os esquece, e o erro padrão aparece em todas as rotas, como o ticket pede |
| Exemplos de erro montados com o próprio `AppError` | O Swagger mostra a mensagem que a API manda de verdade. Para isso, o 500 ganhou o `AppError.interno()`, que o error-handler passou a usar |
| `Erro`, `DetalheErro`, `CodigoDeErro` e `Meta` entram no documento mesmo sem rota que os use | O `Meta` já é um tipo do front, que pode trocá-lo pelo gerado desde já. Passados soltos ao gerador, os schemas do Zod 4 eram ignorados: eles têm uma propriedade `type`, e o gerador os tomava por outro tipo de definição. Por isso vão como `{ type: 'schema', schema }` |
| Caminhos completos no documento (`/api/health`, `/api/v1/...`) | O health fica fora do `/api/v1`. Com o caminho completo, o Swagger e o front chamam o endereço exato, sem `servers` diferente por rota |
| Componentes em ordem alfabética; rotas na ordem dos módulos | O `openapi.json` muda pouco de um PR para outro, e o diff mostra só o que mudou de fato |
| `DOCS_ENABLED` opcional, com padrão pelo `NODE_ENV` | O plano: "ativa no desenvolvimento e na homologação; em produção fica desligada por padrão". A homologação roda em production e liga com `DOCS_ENABLED=true`; os testes rodam com ela ligada |
| A página do Swagger carrega o documento de `/api/docs/openapi.json`, com `validatorUrl: null` | Um documento só, servido pela rota que o ticket pede. Sem o validador externo, o documento não vai para o `validator.swagger.io`. O endereço é fixo: um `?url=` na barra do navegador não troca o documento |
| Documento gerado uma vez por processo | Ele não muda enquanto a API roda, e os testes, que criam vários apps, não o refazem a cada um |
| Teste que compara as rotas do Express com as do documento | O plano diz que "uma rota sem registro não passa na revisão"; com o teste, ela não passa nem no `pnpm test`. Ele usa o `router.listRoutes()`, API pública do roteador do Express 5 (`router` 2.3) |
| Teste que compara o `openapi.json` com o documento gerado, além do passo do CI | O teste avisa na máquina, já no `pnpm test`. O passo do CI, que o ticket pede, é a garantia final e confere o arquivo byte a byte |
| `openapi.json` no `.prettierignore` | O lint-staged passaria o Prettier no arquivo a cada commit, e ele ficaria diferente do que o `pnpm openapi:exportar` grava: o CI acusaria diferença em todo PR |
| `*.schemas.ts` e `*.docs.ts` não leem o `env` | O `pnpm openapi:exportar` roda sem `.env` e sem banco, inclusive no CI |
| `'@scarf/scarf': false` no `allowBuilds` do `pnpm-workspace.yaml` | O `swagger-ui-dist` traz o Scarf, um script de instalação que manda estatísticas para fora. Sem a entrada, o pnpm 12 interrompe a instalação com `ERR_PNPM_IGNORED_BUILDS`, e o CI falharia; com `false`, o script simplesmente não roda. Os arquivos do Swagger UI que a API serve não têm o Scarf |
| Serviço `postgres:18` no CI, na porta 5432, com o `TEST_DATABASE_URL` apontando para ele | Mesma imagem, usuário, banco, codificação e fuso (`TZ` e `PGTZ` em UTC) do `postgres-teste` do compose |
| `actions/checkout@v7`, `pnpm/action-setup@v6` e `actions/setup-node@v7`, como no CI do front | Mesma estrutura e mesmas versões nos dois repositórios: o plano manda montar a configuração uma vez e copiá-la para o outro. São as últimas versões em 21/11/2026 (v7.0.1, v6.1.1 e v7.1.0) |
| Módulo `docs` só com o `docs.routes.ts` | O Swagger é uma rota de infraestrutura, como o health, mas não tem regra nem banco: não precisa de controller, service nem repository |
| Branch `feat/03-contrato-openapi-e-ci` | O ticket entrega sobretudo funcionalidade (o Swagger e a exportação do contrato); o CI vem junto |

## Ferramentas e skills usadas

- Claude Code, lendo o plano, os tickets 02 e 03, o `AGENTS.md`, os registros 01 a 04 e, no front, `src/lib/api/tipos.ts`, `src/lib/api/erro.ts`, o ticket 04, o `ci.yml`, o modelo de PR e o registro 02.
- As versões das bibliotecas foram conferidas no npm, e as das actions, pela API do GitHub (`gh api`), em 21/11/2026. O código do zod-to-openapi, do swagger-ui-express e do roteador do Express foi lido no `node_modules`.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o Docker Desktop:

- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, os 72 testes (contra o `postgres-teste` do compose) e `pnpm build`.
- Os testes de contrato falham quando devem: uma rota `GET /setores/:setorId/perguntas` sem documentação aparece no diff como `GET /api/v1/setores/{setorId}/perguntas`, e um `summary` alterado sem exportar acusa o `openapi.json` desatualizado.
- O build no ar (`pnpm start`, com o `.env` de desenvolvimento): o Swagger abriu no navegador sem erros no console, com o CSP do helmet, e o "Try it out" do `/api/health` respondeu 200. Com `?url=` apontando para outro documento, a página continuou carregando só o `/api/docs/openapi.json`.
- O build com `NODE_ENV=production`: `/api/docs/` e `/api/docs/openapi.json` responderam 404; com `DOCS_ENABLED=true`, 200.
- A instalação com o lockfile congelado, como no CI, falhava no script do Scarf antes da entrada no `allowBuilds` e passou depois dela.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Arquivos que não estão na "Estrutura de pastas":** `src/shared/http/documentacao.ts` (o `documentarRota`), `src/shared/errors/erro.schemas.ts` (o erro padrão em Zod), `src/modules/docs/docs.routes.ts` (o Swagger) e `tests/contrato.test.ts`.
- **Componentes `Erro` e `CodigoDeErro`.** O front não tem um tipo para o corpo do erro (ele usa a classe `ErroApi`), então os nomes vêm do "erro padrão" do plano e do `CodigoDeErro` que a API já usa.
- **`Setor`, `Pergunta`, `Sessao`, `PesquisaPublica`, `RespostaCriada`, `Resumo` e `IndicadoresTv`** entram com os tickets dos seus módulos, que ainda não existem. Este ticket deixa o caminho e a regra prontos (`.meta({ id })` com o nome do tipo do front, em "Como documentar uma rota", no `AGENTS.md`) e já registra com os nomes do front os que existem hoje: `DetalheErro` e `Meta`.

## Pendências e dúvidas

- **CI no GitHub.** O `ci.yml` roda pela primeira vez no PR deste ticket.
- **Proteção da `develop` e da `main`.** Agora que o CI existe, uma regra de proteção pode exigir o check "Lint, tipos, testes, contrato e build" verde e um PR aprovado antes do merge. É configuração do GitHub e decisão do time.
- **Login (ticket 05).** O documento ganha o esquema de segurança (token Bearer), e o `documentarRota` pode passar a acrescentar o 401 às rotas autenticadas, como já faz com o 400 e o 500.
- **Front (ticket 04 de lá).** O `pnpm api:tipos` do front lê o `openapi.json` daqui. Como os caminhos no documento são completos, o cliente do front chama `/api/v1/...` sem prefixo próprio.
