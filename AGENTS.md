# AGENTS.md — como trabalhar na API

Este arquivo vale para qualquer pessoa ou agente que mexa no `fhdod-satisfacao-api`, a API do Sistema de Satisfação Hospitalar da FHDOD. Leia antes de começar qualquer tarefa. Todos os tickets seguem o que está escrito aqui.

- **Regras de negócio:** o [Plano de Desenvolvimento](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md), em `docs/`, é a fonte. Em caso de dúvida, vale o plano; se ele estiver errado ou incompleto, a correção entra num PR e fica explicada no registro da entrega.
- **O que fazer:** os tickets de [`docs/tickets/`](docs/tickets/).
- **Como trabalhar:** este arquivo. O Claude Code o carrega sozinho pelo `CLAUDE.md`.

## Sem coautoria nem assinatura

**Commits e pull requests não levam coautoria nem assinatura de ferramenta.** Nenhum commit tem a linha `Co-Authored-By` de um agente, e nenhuma descrição de PR tem "Generated with Claude Code", link de sessão ou qualquer marca de ferramenta de IA. Vale para pessoas e agentes, mesmo quando a ferramenta sugerir o contrário.

O `.claude/settings.json`, versionado no repositório, já desliga isso no Claude Code para o time todo (`attribution` vazio e `includeCoAuthoredBy: false`). Quem usar outra ferramenta apaga essas linhas à mão antes de commitar ou abrir o PR. A partir do ticket 02, o commitlint recusa mensagens com coautoria do Claude.

## Fluxo de branches

| Branch | Para quê | Quem escreve nela |
| --- | --- | --- |
| `develop` | Base de todo o trabalho; reúne o que já foi revisado | Só merge de branch de tarefa, por PR |
| `main` | Só versões estáveis, prontas para o hospital | Só merge da `develop`, com tag de versão |
| `<tipo>/<NN>-<assunto>` | Uma tarefa (um ticket) | Quem pegou o ticket |

- **Uma branch por tarefa**, curta, criada a partir da `develop` atualizada.
- **Nome:** prefixo do tipo, número do ticket com dois dígitos e um resumo em kebab-case, sem acentos. Exemplo: `feat/05-login-e-sessao`.
- **Prefixos:** `feat/`, `fix/`, `docs/`, `chore/`, `style/`, `refactor/`, `test/` e `ci/`, os mesmos tipos dos commits.
- **Terminou a tarefa:** a branch volta para a `develop` por pull request, com o CI verde e a aprovação de outra pessoa do time. Use merge commit, sem squash, como no histórico atual.
- **Versão estável:** a `main` recebe a `develop` e ganha uma tag de versão (`v0.1.0`, `v0.2.0`...). O que vai para o hospital sai sempre da `main`.
- **Ninguém commita direto na `develop` nem na `main`.**

```bash
git switch develop
git pull
git switch -c feat/05-login-e-sessao
# ... commits ...
git push -u origin feat/05-login-e-sessao
gh pr create --base develop
```

O PR é pequeno e diz o que mudou, como testar e qual é o ticket. Atenção à base: o padrão do GitHub é a `main`, e o PR de uma tarefa vai sempre para a `develop`.

## Padrão de commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/): `tipo(escopo): descrição`.

- **Tipo em inglês:** `feat` (funcionalidade), `fix` (correção), `docs` (documentação), `chore` (configuração e manutenção), `style` (formatação, sem mudar comportamento), `refactor` (reorganização, sem mudar comportamento), `test` (testes) e `ci` (pipeline).
- **Escopo:** o módulo afetado, com o mesmo nome da pasta em `src/modules/` (`auth`, `setores`, `perguntas`, `pesquisa`, `dashboard`...). Mudanças fora dos módulos usam a área (`prisma`, `middlewares`, `config`, `tickets`); mudanças que tocam o projeto inteiro ficam sem escopo.
- **Descrição em português**, curta, começando com letra minúscula e sem ponto final. Se o porquê não for óbvio, explique no corpo do commit.

| Exemplo | Quando |
| --- | --- |
| `feat(pesquisa): reinício automático do totem` | Funcionalidade nova num módulo |
| `fix(auth): renovar o token só uma vez` | Correção |
| `test(dashboard): cálculo do NPS por setor` | Testes |
| `docs(tickets): divide o backend em 20 tickets` | Documentação de uma área |
| `chore: configuração do Claude Code sem coautoria` | Configuração do projeto inteiro |
| `ci: testes com PostgreSQL 18 no GitHub Actions` | Pipeline |

## Tickets

- Ficam em `docs/tickets/`, **um por arquivo** (`NN-assunto.md`), e são **espelhados como issues no GitHub** com o mesmo número: o ticket `05` é a issue #5.
- Cada ticket diz o que construir, por quem está bloqueado, o status e os critérios de aceite.
- **Só se pega um ticket cujos bloqueios já estão feitos** (status `done`). A numeração segue a ordem dos bloqueios.
- Tickets `ready-for-human` precisam de alguém do time (acesso a servidor, domínio, conversa com o hospital). Um agente não os pega sozinho; ajuda só se alguém pedir.
- Tickets do front que ligam uma tela à API esperam os tickets da API de que dependem.

| Status | Quando | No arquivo | No GitHub |
| --- | --- | --- | --- |
| `ready-for-agent` | Pronto para pegar | `**Status:** ready-for-agent` | Etiqueta `ready-for-agent` |
| `in-progress` | Alguém começou | `**Status:** in-progress` | Etiqueta `in-progress` no lugar de `ready-for-agent` |
| `done` | A branch entrou na `develop` | `**Status:** done`, com os critérios marcados `[x]` | Issue fechada |

**Ao começar:** crie a branch e troque a etiqueta da issue, para o time saber que o ticket tem dono.

```bash
gh issue edit 5 --remove-label ready-for-agent --add-label in-progress
```

**Ao terminar:** o último commit da branch marca os critérios atendidos e passa o status do arquivo para `done`. Quando o PR entra na `develop`, a issue é fechada **à mão**: o GitHub só fecha sozinho uma issue citada com `Closes #5` quando o PR entra na branch padrão, que hoje é a `main`. Se a `develop` virar a branch padrão, o `Closes #5` na descrição do PR passa a bastar.

```bash
gh issue close 5 --comment "Entrou na develop pelo PR #NN."
```

Se um critério não puder ser cumprido como está escrito, não o pule em silêncio: explique no registro da entrega, em "O que mudou em relação ao plano", e no PR.

## Definição de pronto

Uma tarefa da API só está pronta quando:

- [ ] toda rota nova ou alterada **valida com Zod** o corpo, a query e os parâmetros (middleware `validate`) e está **registrada no Swagger**, no `*.docs.ts` do módulo;
- [ ] a **permissão e o escopo de setor estão testados**: sem login dá 401, sem a permissão dá 403, fora dos setores do usuário dá 403, e uma listagem nunca devolve dados de outro setor;
- [ ] os **testes passam no CI** (lint, tipos, testes, contrato e build), incluindo os testes da regra nova;
- [ ] o **`openapi.json` foi regenerado** com `pnpm openapi:exportar` e commitado sempre que o contrato mudou;
- [ ] a entrega está **registrada em `docs/registros/`**, como no front;
- [ ] os critérios de aceite do ticket estão marcados e o status está `done`;
- [ ] outra pessoa do time revisou e aprovou o PR.

Enquanto o CI, o Swagger e os testes não existem (tickets 02 e 03), vale o que já existir; a partir do ticket 03, vale a lista inteira.

### Registro da entrega

Cada entrega ganha um arquivo em `docs/registros/`, no mesmo formato do front: `AAAA-MM-DD-NN-assunto.md`, em que `NN` é a ordem do registro naquele dia. O registro traz:

1. título, data, autor (pessoa ou agente) e o link do ticket;
2. **O que foi feito**;
3. **Decisões e por quê**, numa tabela, citando a regra do plano ou a necessidade por trás de cada uma;
4. **Ferramentas e skills usadas**;
5. **O que mudou em relação ao plano**;
6. **Pendências e dúvidas**.

## Convenções que mais pesam

### Idioma e nomes

- **Domínio em português** (`setores`, `perguntas`, `respostas`, `contatos`, `classificarNota`); **termos técnicos em inglês** (`controller`, `service`, `repository`, `middleware`, `schema`). Exemplo: `perguntasService.criar`.
- Identificadores sem acentos. Textos para o usuário em português correto, com acentos.
- Arquivos em kebab-case com o sufixo da camada: `perguntas.service.ts`.
- Banco: tabelas e colunas em snake_case, sem acentos. Consultas sempre pelo Prisma ou por SQL parametrizado, nunca com texto concatenado. Migration já aplicada não se edita: muda-se com uma migration nova.

### Organização por módulo

O código é organizado por assunto, não por tipo de arquivo. Cada módulo fica em `src/modules/<modulo>/`, com os mesmos arquivos em todos eles:

| Camada | Arquivo | Faz | Não faz |
| --- | --- | --- | --- |
| Rotas | `<modulo>.routes.ts` | Liga método e URL aos middlewares e ao controller | Nenhuma lógica |
| Controller | `<modulo>.controller.ts` | Lê os dados já validados, chama o service e devolve status e JSON | Regra de negócio ou acesso ao banco |
| Service | `<modulo>.service.ts` | Regras de negócio, transações e registro de auditoria | Conhecer `req` e `res` |
| Repository | `<modulo>.repository.ts` | Consultas Prisma e SQL dos relatórios | Decidir regras |
| Schemas | `<modulo>.schemas.ts` | Schemas Zod de entrada e saída | — |
| Docs | `<modulo>.docs.ts` | Registro das rotas no OpenAPI, com os mesmos schemas | — |
| Testes | `<modulo>.*.test.ts` | Testes do módulo; os de integração ficam em `tests/integration/` | — |

- Lendo uma rota, dá para saber quem pode chamá-la e o que é validado: `rate-limit` → `authenticate` (ou `tv-token`) → `authorize('permissao')` → `setorScope('setorId')` → `validate(schema)` → controller.
- O que é usado por vários módulos fica em `src/shared/`. Regras que existem num lugar só: a classificação de nota (`src/shared/rules/classificar-nota.ts`), o cálculo do NPS (`src/shared/rules/calcular-nps.ts`) e o mapa de permissões por perfil (`src/shared/constants/permissoes.ts`). A API devolve a classificação e as permissões prontas; o front só exibe.
- Permissão e escopo de setor são sempre checados na API, mesmo que o front esconda o botão. Listagens aplicam o escopo dentro da própria consulta.
- A estrutura completa de pastas e a ordem dos middlewares estão no plano, em "Estrutura de pastas" e "Backend: camadas, middlewares e padrões".

### Respostas e erros

- Sucesso: `{ "data": ... }`. Listas paginadas: `{ "data": [...], "meta": { "pagina": 1, "porPagina": 20, "total": 134 } }`.
- Erro, sempre neste formato:

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

| Código | Status | Quando |
| --- | --- | --- |
| `VALIDACAO` | 400 | Dados inválidos; um item em `detalhes` por campo, com `campo` igual ao caminho no corpo (`nome`, `contato.telefone`) |
| `NAO_AUTENTICADO` | 401 | Sem token, token expirado ou usuário inativo |
| `SEM_PERMISSAO` | 403 | Logado, mas sem a permissão ou fora do setor |
| `NAO_ENCONTRADO` | 404 | Recurso ou rota inexistente |
| `CONFLITO` | 409 | Slug ou e-mail já usado |
| `LIMITE_ATINGIDO` | 429 | Limite de requisições atingido |
| `ERRO_INTERNO` | 500 | Erro inesperado: mensagem genérica, detalhe só no log |

- **As mensagens são em português e o front as mostra direto para o usuário.** Escreva para quem está na tela (paciente, gestor, ouvidoria): frase curta e clara, sem jargão, sem nome de tabela, sem stack trace. Exemplo: "Já existe um setor com este endereço", e não "Unique constraint failed on slug".
- Os códigos são os que o front já trata. Código novo só entra combinado com o front.
- O `requestId` liga a mensagem que o usuário viu à linha do log.

### Contrato com o front

- **O front só conhece a API pelo `openapi.json`**, gerado pela API e commitado na raiz do repositório. O front nunca copia código do backend.
- **Uma mudança de contrato nunca quebra o front:**
  - campo novo entra como **opcional**;
  - campo só sai depois que o front parou de usá-lo;
  - nada é renomeado nem muda de tipo: cria-se o campo novo e o antigo sai depois;
  - o **PR da API vai antes do PR do front**, com o `openapi.json` atualizado, e os dois PRs se citam na descrição.
- Os schemas registrados no OpenAPI usam os mesmos nomes dos tipos do front (`Setor`, `Pergunta`, `Sessao`...).
- O front já tem as telas prontas sobre um mock que segue o contrato do plano. Antes de criar ou mudar uma rota, confira o que ele espera em `../fhdod-satisfacao-web/src/lib/api/tipos.ts` e `../fhdod-satisfacao-web/src/mocks/`. Diferenças entre o mock e o plano ficam no registro e no PR.

## Segurança e LGPD

- **Nenhum segredo no Git.** O `.env` nunca é commitado; o `.env.example` traz só os nomes das variáveis e exemplos falsos. Chaves, senhas, tokens e endereços de banco reais não aparecem no código, nos testes, nas issues, nos PRs nem nos registros.
- **Nenhum dado real de paciente**, em lugar nenhum: seed, testes, dados de demonstração, prints, issues, PRs e registros usam só dados inventados.
- **Telefone, senha e tokens nunca vão para o log**, nem para mensagens de erro. O logger oculta `authorization`, `cookie`, `x-tv-token`, `x-complemento-token`, `senha` e `telefone`, entre outras (a lista fica em `src/config/logger.ts`); não registre o corpo inteiro de uma requisição.
- O telefone é cifrado no banco (AES-256-GCM), mascarado nas telas e só revelado com a permissão `contatos:ver`, sempre com registro na auditoria.
- O IP do paciente não é gravado no banco.
- Ao usar uma ferramenta de IA, não cole nela o `.env`, dumps do banco nem logs de produção.

## Comandos do projeto

Node.js 24 (a versão fica no `.nvmrc`), pnpm 12 e Docker. O passo a passo para rodar do zero está no [README](README.md).

| Comando | O que faz |
| --- | --- |
| `pnpm install` | Instala as dependências, gera o cliente do Prisma e liga os hooks do Git |
| `docker compose up -d` | Sobe o PostgreSQL 18 de desenvolvimento (porta 5432) e o de teste (porta 5433) |
| `pnpm dev` | Roda a API em `http://localhost:3333`, recarregando a cada alteração |
| `pnpm build` | Gera o build em `dist/server.js` |
| `pnpm start` | Roda o build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Checagem de tipos do TypeScript |
| `pnpm test` | Testes unitários e de integração; os de integração usam o banco de teste |
| `pnpm test --project unit` | Só os testes que não precisam de banco |
| `pnpm test:watch` | Testes em modo de observação |
| `pnpm format` | Formata o código com o Prettier |
| `pnpm db:generate` | Gera de novo o cliente do Prisma depois de mudar o `prisma/schema.prisma` |
| `pnpm db:migrate` | Cria e aplica uma migration no banco de desenvolvimento |
| `pnpm db:deploy` | Aplica as migrations pendentes (homologação e produção) |
| `pnpm db:reset` | Apaga o banco de desenvolvimento e aplica todas as migrations de novo |
| `pnpm db:studio` | Abre o Prisma Studio para ver os dados |

- **Antes de cada commit**, o Husky roda o ESLint e o Prettier nos arquivos alterados (lint-staged), e o commitlint confere a mensagem: Conventional Commits, com os tipos deste arquivo e sem coautoria nem assinatura do Claude.
- **Variáveis de ambiente:** todas estão no `.env.example`, com o que cada uma faz. Uma variável nova entra no `src/config/env.ts` e no `.env.example`, no mesmo commit.
- **Banco de teste:** o `postgres-teste` do compose guarda os dados só na memória e começa vazio a cada subida. Os testes nunca leem o `.env`; para usar outro banco de teste, defina `TEST_DATABASE_URL`.

## Onde estão as coisas

| O quê | Onde |
| --- | --- |
| Regras de negócio, arquitetura e decisões | [`docs/Plano de Desenvolvimento - FHDOD.md`](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md) |
| Tickets | [`docs/tickets/`](docs/tickets/) e as issues do GitHub |
| Registros das entregas | [`docs/registros/`](docs/registros/) |
| Configuração do Claude Code para o time | [`.claude/settings.json`](.claude/settings.json) |
| Front-end | `../fhdod-satisfacao-web`, com o `docs/plano-frontend.md` e, depois do ticket 01 do front, o próprio `AGENTS.md` |
