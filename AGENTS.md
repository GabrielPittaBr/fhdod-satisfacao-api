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

O PR é pequeno e diz o que mudou, como testar e qual é o ticket; o modelo de PR (`.github/pull_request_template.md`) já traz essas seções. Atenção à base: o padrão do GitHub é a `main`, e o PR de uma tarefa vai sempre para a `develop`.

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

O CI roda lint, tipos, testes, contrato e build em todo pull request e em cada push na `develop` e na `main`. Rode na máquina `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` antes de abrir o PR, para o CI não ser o primeiro a acusar.

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

### Modelo de dados

As 14 tabelas do MVP estão no `prisma/schema.prisma`, e as migrations, em `prisma/migrations/`. Toda mudança no banco é uma migration nova, criada pelo `pnpm db:migrate`.

- **Instantes** em `@db.Timestamptz(3)`, gravados em UTC; sem ele, o Prisma criaria `timestamp` sem fuso. Data sem hora, como a do atendimento, em `@db.Date`. Os relatórios convertem para o horário de Brasília com `AT TIME ZONE`, e o código, com o `Intl`, sempre com o `FUSO_DE_BRASILIA` de `src/shared/constants/fuso-horario.ts`. O dia de hoje em Brasília e as contas com os dias (`AAAA-MM-DD`, sem hora) ficam em `src/shared/rules/calendario.ts`: `hojeEmBrasilia`, `somarDias`, `segundaDaSemana` e `primeiroDiaDoMes`. Um arquivo que mostra data e hora, como a planilha da exportação, recebe o instante com o `horarioDeBrasilia`, que põe em UTC os números do relógio de Brasília.
- **O que o Prisma não declara** (CHECK e índice sobre expressão) vai em SQL no fim da migration: crie-a com `pnpm db:migrate --create-only`, acrescente o SQL e aplique com `pnpm db:migrate`. O Prisma não lê nem compara essas restrições, então nenhuma migration gerada depois as apaga. Hoje são os CHECKs de `nps` (0 a 10), de `valor_numero` (1 a 5) e dos horários dos turnos (`HH:mm`), e o índice único sobre `lower(nome)` das categorias.
- **Chave estrangeira não cria índice** no PostgreSQL. A coluna usada para buscar registros filhos ganha `@@index` no schema; as que não precisam ficam, com o motivo, na lista `CHAVES_SEM_INDICE` de `tests/integration/modelo-de-dados.test.ts`, que falha quando aparece uma chave nova sem índice.
- **Nada se apaga de verdade:** setores, perguntas, categorias e usuários são desativados. Por isso as referências são `RESTRICT`; só as partes de uma resposta (itens, comentário e pedido de retorno), as sessões e os setores de um usuário saem junto com o dono.
- **Nome repetido:** o Prisma devolve o erro de único com o código `P2002`, também no índice de `lower(nome)` das categorias. O service o traduz em 409 `CONFLITO`, com a mensagem para o usuário. Um `update` de registro que não existe dá `P2025`, que vira 404 `NAO_ENCONTRADO`. No `catch` da gravação, o `traduzirErroDoPrisma(erro, { valorRepetido, naoEncontrado })`, de `src/database/erros.ts`, troca cada um pelo `AppError` com a mensagem e deixa passar qualquer outro erro; o `categorias.service.ts` mostra o uso. O `lower()` do índice segue o `LC_CTYPE` do banco: com UTF-8, como no `postgres:18` do compose, "RECEPÇÃO" e "recepção" são o mesmo nome; com `C`, só as letras sem acento mudam de caixa.
- **Turnos:** os horários são texto `HH:mm` e saem assim do banco. O fim pode ser menor que o início, como no turno da noite.
- **Perguntas:** os quatro tipos ficam em `src/shared/constants/tipos-de-pergunta.ts`. Só a múltipla escolha tem opções: nos outros tipos, o banco guarda a lista vazia e a API devolve `opcoes: null`. Uma pergunta com respostas (com itens em `resposta_itens`) não muda de tipo; o texto, a categoria e as opções mudam, porque cada item copia o texto, o tipo e a categoria do momento da resposta.
- **Configurações:** as chaves e os valores padrão ficam em `src/shared/constants/configuracoes.ts`, e o valor de cada uma, em JSONB, na tabela `configuracoes`. Quem precisa delas lê com o `lerConfiguracoes()` de `src/database/configuracoes.ts` (ou `lerConfiguracoes(tx)`, dentro de uma transação): uma chave que falta, ou com valor de outro tipo, vale o padrão de `CONFIGURACOES_PADRAO`.
- **Status do retorno:** os quatro ficam em `src/shared/constants/status-de-retorno.ts`. No MVP, todo pedido nasce e fica `NOVO`; os outros são do fluxo da fase 2.
- **Seed base** (`pnpm db:seed`, com o código em `prisma/seeds/base.ts`): categorias, turnos provisórios, configurações e o primeiro Super Admin. Só cria o que falta e nunca muda o que existe, então roda em produção e quantas vezes for preciso. O Super Admin só entra com a tabela de usuários vazia, com o e-mail e a senha de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`, e nasce com a troca de senha obrigatória; sem as duas variáveis num banco sem usuários, o seed para e diz o que falta. Os dados de demonstração ficam num comando à parte, o `pnpm db:demo`.
- **Dados de demonstração** (`pnpm db:demo`, ticket 12, com a entrada em `prisma/demonstracao.ts` e o código em `prisma/seeds/demonstracao/`): os dados do mock do front, para a apresentação e a homologação. O `dados.ts` tem os 6 setores com as perguntas, as 5 contas, as 2 telas de TV e os comentários; o `historico.ts`, o gerador das avaliações, o mesmo do mock, com a semente fixa por dia (no mesmo dia, as mesmas avaliações do mock); o `semear.ts`, o `semearDemonstracao(prisma, opcoes)`, que grava tudo numa transação. Precisa do seed base. Só roda com `DEMO_CONFIRM=<nome do banco>` na linha do comando: a confirmação é lida antes do `.env`, e a do `.env` não vale. Rodar de novo substitui o que é da demonstração, achado pelo slug, pelo e-mail e pelo hash do token, com os mesmos IDs, e gera as perguntas e as avaliações dos seis setores de novo, até hoje; o resto do banco fica. Tudo é gravado como a API grava: as senhas com o `gerarHashDaSenha`, o token com o `hashDoToken`, o telefone com o `cifrar`, os itens com o texto, o tipo e a categoria da pergunta, e a classificação com o `classificarNota` e os limites do banco. As senhas do repositório valem sem as variáveis `DEMO_PASSWORD_*`; com `NODE_ENV=production`, as cinco variáveis são obrigatórias. Os testes ficam em `tests/integration/demonstracao.test.ts`, também os do comando, rodado numa pasta sem `.env`.
- **Cliente do Prisma:** depois de mudar o schema, rode `pnpm db:generate`. No Prisma 7, o `migrate dev` não gera mais o cliente.

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
- O que é usado por vários módulos fica em `src/shared/`. Regras que existem num lugar só: a classificação de nota (`src/shared/rules/classificar-nota.ts`, com o `classificarNotaDaEscala` para uma nota de 1 a 5 sozinha), a máscara do telefone e o número completo escrito para leitura (`mascararTelefone` e `formatarTelefone`, em `src/shared/rules/telefone.ts`), o cálculo do NPS (`src/shared/rules/calcular-nps.ts`), a média com uma casa decimal (`src/shared/rules/media.ts`), a média e o % de notas 4 e 5 (`src/shared/rules/notas-da-escala.ts`), o ranking dos pontos e os destaques da TV (`ranquearPontos` e `destacarPontos`, em `src/shared/rules/ranking-de-pontos.ts`), o dia de hoje em Brasília (`hojeEmBrasilia`, em `src/shared/rules/calendario.ts`), os filtros do painel (`src/shared/http/filtros-do-painel.ts`, com o SQL em `src/database/filtros-do-painel.ts`), o mapa de permissões por perfil (`src/shared/constants/permissoes.ts`), os nomes que os arquivos gerados mostram no lugar dos códigos (`src/shared/constants/rotulos.ts`, com os mesmos textos do front), o envio de um arquivo gerado na hora (`enviarArquivo` e `Saida`, em `src/shared/http/download.ts`) e a ordem alfabética das listas (`porNome`, em `src/shared/rules/ordem-alfabetica.ts`, a do português, que não depende do locale do banco). A API devolve a classificação, as permissões e as listas prontas; o front só exibe.
- Rotas `/<recurso>/:id` validam o parâmetro com o `idParams` de `src/shared/http/parametros.ts`: inteiro positivo, até o maior `integer` do PostgreSQL, ou 400 em `id`. Um ID no corpo, como o `categoriaId` da pergunta, usa o `idNoCorpo(mensagem)`, do mesmo arquivo: número de verdade, sem aceitar `"3"` em texto. Um sim ou não na query, como o `?comComentario=true` das respostas, usa o `simOuNaoNaQuery`, também de lá: só `true` e `false` (o `z.coerce.boolean()` transformaria `"false"` em `true`), documentado como `boolean`.
- Permissão e escopo de setor são sempre checados na API, mesmo que o front esconda o botão. Listagens aplicam o escopo dentro da própria consulta.
- A estrutura completa de pastas e a ordem dos middlewares estão no plano, em "Estrutura de pastas" e "Backend: camadas, middlewares e padrões".

### Login, permissões e escopo de setor

O login (ticket 05) usa um token de acesso JWT de 15 minutos, enviado em `Authorization: Bearer`, e um refresh token rotativo no cookie `refresh_token` (HttpOnly, Secure, SameSite=Strict, só em `/api/v1/auth`). O token só leva o ID do usuário: o resto é lido do banco a cada requisição, e uma mudança feita pelo Super Admin vale na hora.

- **Rota do painel:** `authenticate` → `authorize('permissao')` → `setorScope('setorId')` → `validate(schema)` → controller. Na documentação, `security: EXIGE_LOGIN` e os erros `NAO_AUTENTICADO` e `SEM_PERMISSAO`.
- **`authenticate`** (`src/middlewares/authenticate.ts`): 401 sem token, com token vencido ou adulterado e com o usuário inativo; 403 para quem ainda está com a senha provisória. Só `/auth/me` e `/auth/senha` usam o `authenticateComSenhaProvisoria`, que deixa essa pessoa passar. O controller lê quem está logado com `usuarioLogado(req)`.
- **`authorize`:** confere a permissão no mapa do perfil, que existe só em `src/shared/constants/permissoes.ts` (os perfis ficam em `perfis.ts`). Permissão nova entra no mapa, no teste dele e no `Permissao` do front.
- **Escopo:** `usuarioLogado(req).setorIds` traz os setores que a pessoa enxerga, ou `null` quando enxerga todos (Super Admin e Ouvidoria). Listagens filtram com essa lista na própria consulta. `setorScope('setorId')` barra o parâmetro da rota; `setorScope('setorId', 'query')` barra o filtro opcional (sem ele, a rota passa e a consulta aplica o escopo). Registro buscado pelo próprio ID, como `PATCH /perguntas/:id`, tem o setor conferido no service, com `podeAcessarSetor(usuario, setorId)`, e o 403 leva a mesma mensagem do `setorScope` (`MENSAGEM_FORA_DO_SETOR`, de `src/shared/security/acesso.ts`); o `perguntas.service.ts` mostra o uso.
- **Sessões:** `authService.encerrarSessoes(usuarioId)` revoga todos os refresh tokens da pessoa, no logout e na troca de senha. Na desativação e na senha redefinida pelo Super Admin, a revogação entra na mesma transação da mudança, no `usuarios.repository.ts`. A conta inativa já é recusada pelo `authenticate` e pelo refresh, então a revogação é a segunda tranca.
- **Regra de senha:** pelo menos 10 caracteres, com letras e números, em `src/shared/rules/senha.ts`. Senhas só em hash argon2id (`src/shared/security/password.ts`); tokens só em hash SHA-256 (`hashDoToken`). A senha provisória sai do `gerarSenhaProvisoria()` (`src/shared/security/senha-provisoria.ts`): 12 caracteres em 3 grupos, sem os que se confundem na leitura. Ela aparece uma vez só, numa resposta com `Cache-Control: no-store`, e o logger a oculta (`senhaProvisoria`).
- **Contas:** só o Super Admin (`usuarios:gerenciar`) cria e muda contas. Ninguém muda o próprio perfil nem desativa a própria conta (409), para o hospital não ficar sem quem gerencie os usuários.
- **Auditoria:** `acao` diz o que aconteceu, em snake_case (`login`, `troca_de_senha`); `entidade` é a tabela (`usuarios`) e `entidadeId`, o ID em texto; `ip` vem de `ipDaRequisicao(req)`, que devolve `null` para o que não for IP. Nenhuma senha ou token vai em `dados`. A linha entra na mesma transação da mudança, com o `linhaDeAuditoria(autor, { acao, entidade, entidadeId, dados })` de `src/database/auditoria.ts`. Nas perguntas, `dados` leva o `setorId` e o que mudou (na edição, o `antes` e o `depois`). Nos usuários, vão a criação, a mudança de perfil e a de setores (com o `antes` e o `depois`), a de situação e a senha redefinida, esta sem `dados`. Um pedido que não muda nada não grava linha. A revelação de um telefone (`revelacao_de_telefone`, na entidade `contatos_retorno`) grava uma linha a cada vez, com o `respostaId` e o `setorId` em `dados` e nunca o número. Cada exportação (`exportacao_de_resumo`, `exportacao_de_resumo_em_pdf` e `exportacao_de_respostas`, na entidade `respostas`, sem `entidadeId`) grava uma linha antes de o arquivo sair, com os `filtros` usados, o número de `respostas` e o `comTelefones`; no detalhado, também quantos `telefones` foram.
- **Testes:** `tests/factories/` cria usuários (`criarUsuario`, com a senha `SENHA_DE_TESTE`) setores (`criarSetor`, com nome, slug, descrição e status opcionais), categorias (`criarCategoria`), turnos (`criarTurno`, das 07:00 às 13:00 se o teste não pedir outro horário), perguntas (`criarPergunta`, uma escala de 1 a 5 ativa, ou três opções na múltipla escolha) e respostas (`criarResposta`, um envio pela web com um item por pergunta, que copia o texto, o tipo e a categoria dela; o canal, o dia do atendimento, o instante do envio, a classificação, a nota da escala, o comentário e o pedido de retorno são opcionais; o pedido grava o telefone como o complemento, cifrado e com os 4 últimos dígitos em claro) e telas de TV (`criarTelaTv`, ativa e nunca aberta se o teste não pedir outra coisa, que devolve a tela e o token do link, com só o hash no banco); `tests/helpers/sessao.ts` tem `entrar`, `bearer`, `cookie`, `cookieDoRefresh` e `tokenDeAcesso` (inclusive vencido ou forjado). Cada `createApp()` tem o seu próprio contador de tentativas do login, e os testes não dividem tentativas entre si.

### Pesquisa pública

A pesquisa do paciente (ticket 10) fica em `src/modules/pesquisa/`, nas rotas `/publico`, sem login.

- **Rota pública:** `rate-limit` → `validate(schema)` → controller. O envio (`POST /publico/setores/:slug/respostas`) aceita 30 requisições a cada 15 minutos por IP, aceitas ou não (`criarLimiteDeEnvios`, em `src/middlewares/rate-limit.ts`); os IPs do `RATE_LIMIT_ALLOWLIST`, como o do hospital, por onde saem os totens, ficam fora. A abertura da pesquisa não tem limite.
- **Configurações:** o `pesquisaRepository.lerConfiguracoes()` lê a tabela `configuracoes` com o `lerConfiguracoes()` de `src/database/configuracoes.ts`; uma chave que falta, ou com valor de outro tipo, vale o padrão de `CONFIGURACOES_PADRAO`.
- **Classificação:** `classificarNota(nps, notas, configuracoes)`, em `src/shared/rules/classificar-nota.ts`: a pior entre a do NPS e a de cada nota de 1 a 5. É a única regra de nota baixa da API.
- **Idempotência:** a `chaveIdempotencia` (UUID, única no banco) é conferida antes de qualquer validação do banco. A chave repetida, também em dois envios simultâneos, devolve a avaliação gravada (o mesmo `id` e a mesma `classificacao`) com um token de complemento novo, que substitui o anterior. A chave usada noutro setor, ou numa avaliação já complementada, dá 409.
- **Token de complemento:** `gerarTokenOpaco()`, válido por 30 minutos; o banco guarda só o `hashDoToken` e a validade, e a resposta sai com `Cache-Control: no-store`. **Token usado = `tokenComplementoHash` nulo:** o complemento apaga o hash e a validade ao usar o token, e o reenvio não cria outro para uma avaliação nessa situação.
- **Complemento** (`POST /publico/respostas/:id/complemento`, ticket 11): o token vai no cabeçalho `X-Complemento-Token`, e o corpo traz o `comentario`, o `contato` ou os dois, numa chamada só; responde 204. Sem token, com o de outra avaliação, vencido ou já usado, 401 com "O prazo para complementar esta avaliação terminou.". Não tem limite por IP: só passa quem tem o token de um envio. O `pesquisaRepository.complementar` usa o token e grava tudo numa transação, com um `updateMany` que confere o hash e o prazo no mesmo `UPDATE` que os apaga; assim, dois usos ao mesmo tempo gravam uma vez só. A validação (o Zod e o tamanho do comentário, que vem das configurações) roda antes e não gasta o token.
- **Telefone:** `telefoneValido` e `digitosDoTelefone`, em `src/shared/rules/telefone.ts`: DDD sem zero e 10 ou 11 dígitos, com ou sem a máscara (espaços, parênteses, hífen e ponto). O banco recebe só os dígitos, cifrados com o `cifrar` de `src/shared/security/crypto.ts`, e os 4 últimos em claro (`telefoneFinal`), com a hora do consentimento; o pedido de retorno nasce `NOVO`. A mensagem de erro do telefone é sempre a mesma e nunca repete o que veio.
- **Itens:** cada um copia o texto, a categoria e o tipo da pergunta ativa do setor. O sim ou não grava `SIM` ou `NAO` em `valor_texto`; a múltipla escolha, a opção como veio; o texto livre, sem os espaços das pontas e até o `texto_limite_caracteres`. Os erros vão em `itens.N` (pergunta de fora ou repetida) e em `itens.N.valorNumero` ou `itens.N.valorTexto` (valor errado para o tipo).
- **Campo isca:** `site`, que o front mantém invisível e vazio. Preenchido, dá 400 em `site`, e nada é gravado.
- **IP do paciente:** nunca gravado. As rotas públicas não escrevem na auditoria.
- **Testes:** o `vitest.config.ts` põe o `203.0.113.10` (um IP de documentação) no `RATE_LIMIT_ALLOWLIST`, no papel do IP do hospital, e uma chave de teste no `ENCRYPTION_KEY`. Os testes mandam o IP pelo `X-Forwarded-For`, como o Caddy, e criam um `createApp()` por teste, para o contador de envios começar do zero. Os do complemento (`tests/integration/complemento.test.ts`) pegam o token num envio de verdade, pela rota da pesquisa.

### Dashboard

Os números do painel ficam em `src/modules/dashboard/`: `GET /dashboard/resumo`, `/dashboard/nps-por-setor` e `/dashboard/evolucao` (ticket 13) e `/dashboard/categorias`, `/dashboard/ranking` e `/dashboard/comentarios` (ticket 14).

- **Rota:** `authenticate` → `authorize('dashboard:ver')` → `setorScope('setorId', 'query')` → `validate(schema)` → controller. Os quatro perfis têm `dashboard:ver`; o 403 é o setor de fora ou a senha provisória. Os comentários, com o texto dos pacientes, têm também o `authorize('comentarios:ver')`, que o Visualizador não tem.
- **Filtros:** um só, para o dashboard, as respostas e as exportações, em `src/shared/http/filtros-do-painel.ts`: `inicio` e `fim` (`AAAA-MM-DD`, incluídos), `base` (`ATENDIMENTO` ou `ENVIO`), `setorId`, `turnoId` e `canal`. O `filtrosDoDashboardSchema`, do dashboard e das exportações, exige o período e a base; o `filtrosDoPainelSchema`, das listas, deixa tudo opcional, e a base, sem valor, é a do atendimento. Uma rota que recebe mais alguma coisa, como a `granularidade` da evolução, estende o `CAMPOS_DOS_FILTROS_DO_DASHBOARD` e repete o `periodoEmOrdem`. No Zod 4, a data fora do formato não interrompe o objeto: a regra que compara datas confere antes se elas são válidas (`periodoValido`).
- **Contas pelos setores:** os métodos do `dashboardService` recebem os filtros e os `setorIds`, e não quem está logado: o controller passa os de quem está logado (`usuarioLogado(req).setorIds`), e a TV, `null`, que conta todos os setores. As exportações usam as mesmas contas.
- **Consultas:** `$queryRaw`, com o `condicoesDoPainel(filtros, setorIds)` de `src/database/filtros-do-painel.ts` no `WHERE` (a tabela `respostas` com o apelido `r`). Ele aplica o escopo (`r.setor_id = ANY(...)`) junto com os filtros, então o Gestor e o Visualizador só contam os seus setores, mesmo sem pedir um. Com `base=ENVIO`, o período vira o intervalo de instantes da meia-noite do início à meia-noite depois do fim, em Brasília, que usa o índice de `(setor_id, enviado_em)`; para agrupar, o `diaDaResposta(base)` converte o envio para o dia de Brasília.
- **Contas no código:** as consultas só contam (total, promotores, detratores, soma e quantidade das notas). O NPS sai do `calcularNps`, e a média, do `mediaComUmaCasa`, em `src/shared/rules/`; as duas contas são em inteiros, com o meio arredondado para longe do zero. Promotor e detrator usam as constantes `PROMOTOR_A_PARTIR_DE` e `DETRATOR_ATE`, também dentro do SQL.
- **NPS por setor:** só os setores com respostas no período, também os desativados; do maior NPS para o menor, e no empate o de mais respostas e depois a ordem alfabética (`porNome`).
- **Evolução:** um ponto por período, do que contém o `inicio` ao que contém o `fim`, com o `generate_series` e o `date_trunc` (a semana começa na segunda), inclusive os vazios (`nps` `null` e `total` 0). No máximo `MAXIMO_DE_PONTOS` (366) pontos; acima disso, 400 em `granularidade`.
- **Notas da escala:** as consultas das categorias e dos pontos leem os itens de escala com o trecho `notasDaEscala` do `dashboard.repository.ts` e contam a quantidade, a soma e as notas boas (`CONTAGEM_DAS_NOTAS`). A categoria é a do item, a do momento da resposta. O `indicadoresDasNotas`, de `src/shared/rules/notas-da-escala.ts`, transforma isso na média com uma casa e no `percentual45` (o `percentualInteiro`, com o meio para cima); a nota boa é o `NOTA_BOA_A_PARTIR_DE` (4).
- **Categorias:** só as que têm notas no período, também as desativadas, na ordem das categorias (`ordem` e depois o ID, no `ORDER BY`).
- **Pontos e ranking:** um ponto é um setor numa categoria. O `dashboardService.pontosAvaliados(filtros, setorIds)` devolve todos os pontos com notas, com a média e o `percentual45`, sem ordem e sem o mínimo: é a base do ranking e dos destaques da TV. O `ranquearPontos`, de `src/shared/rules/ranking-de-pontos.ts`, só aceita pontos com `MINIMO_DE_NOTAS_DO_PONTO` (5) notas ou mais e devolve até `TAMANHO_DO_RANKING` (3) em cada lista: os melhores pela maior média, depois o maior `percentual45` e o maior total; os piores pela menor média, depois o menor `percentual45` e o maior total, só entre os que não estão nos melhores. No empate de tudo, o setor e a categoria em ordem alfabética.
- **Comentários:** a primeira lista paginada da API: `pagina` e `porPagina` do `paginacaoSchema`, com o padrão de `COMENTARIOS_POR_PAGINA` (8), e a resposta pelo `responderLista`, com `meta.total` de todas as páginas (a página e o total saem numa transação só). Do envio mais recente para o mais antigo (o comentário não guarda a hora), com o `tipo` opcional.
- **Testes:** `tests/integration/dashboard.test.ts` cria as respostas com o `criarResposta` e confere as rotas do NPS com os mesmos filtros (`totaisDasTresRotas`): o escopo de cada perfil, cada filtro, a base do envio na virada do dia em Brasília e os períodos vazios. Os testes de acesso e de validação passam por todas as rotas (`ROTAS` e `TODAS`). As notas por ponto saem do `cenarioDasNotas`, com uma pergunta de escala para cada setor e categoria. Como os quatro perfis têm `dashboard:ver`, o 403 sem a permissão é testado com um `vi.spyOn(authService, 'autenticar')` que tira a permissão da sessão.

### Respostas e pedidos de retorno

As avaliações uma a uma ficam em `src/modules/respostas/` (`GET /respostas` e `GET /respostas/:id`), e os pedidos de retorno, em `src/modules/contatos/` (`GET /contatos` e `POST /contatos/:id/revelar-telefone`), do ticket 15.

- **Rotas:** `authenticate` → `authorize('respostas:ver')` (Super Admin, Gestor e Ouvidoria) ou `authorize('contatos:ver')` (Super Admin e Ouvidoria) → `setorScope('setorId', 'query')` nas listas → `validate`. Nas rotas pelo ID, o service confere o setor do registro com o `podeAcessarSetor`: 404 se não existir, depois 403 se for de fora. O escopo vale também nos contatos, mesmo que hoje só perfis sem escopo tenham a permissão.
- **Filtros:** as listas estendem o `CAMPOS_DOS_FILTROS_DO_PAINEL` (tudo opcional; sem `base`, a do atendimento) e repetem o `periodoEmOrdem`, com o `condicoesDoPainel` no SQL. As respostas aceitam também `classificacao`, `comComentario` e `comRetorno`; os contatos, só o período, a base e o setor. Paginação pelo `paginacaoSchema` (20 por página) e resposta pelo `responderLista`, com a página e o total numa transação.
- **Ordem:** as respostas ordenam por `dataAtendimento`, `enviadoEm` ou `nps` (padrão `enviadoEm` `desc`), com a coluna e o sentido tirados de um mapa fixo, nunca do texto do pedido; no empate, o ID no mesmo sentido. Os contatos vêm do consentimento mais recente para o mais antigo.
- **Detalhe:** o resumo sai com as mesmas colunas da lista (`COLUNAS_DO_RESUMO`), e os itens, na ordem em que foram gravados (a do front na tela), com o texto, o tipo e a categoria copiados no momento da resposta. A `classificacao` de cada nota de 1 a 5 sai do `classificarNotaDaEscala` com os limites de agora (`lerConfiguracoes()`); nos outros tipos, `null`.
- **Telefone:** nas listas e no detalhe, só o `mascararTelefone(telefoneFinal)` (`•••• 0042`); as consultas nem leem o `telefone_cifrado`. O número completo só sai do `POST /contatos/:id/revelar-telefone`, que decifra, grava a linha `revelacao_de_telefone` na auditoria e só então responde, com `Cache-Control: no-store`, e da exportação detalhada de quem tem `contatos:ver` (ver "Exportações"). Se a linha não for gravada, o número não sai.
- **Testes:** `tests/integration/respostas.test.ts` e `tests/integration/contatos.test.ts`. O escopo dos contatos é testado com um `vi.spyOn(authService, 'autenticar')` que dá `contatos:ver` a um Gestor. A máscara "sem decifrar" é testada com o `telefone_cifrado` estragado no banco: a lista e o detalhe continuam respondendo.

### TV Wall

As telas e os indicadores da TV ficam em `src/modules/tv-wall/` (ticket 16): `GET /tv-telas`, `POST /tv-telas` e `PATCH /tv-telas/:id/status`, do Super Admin, e `GET /tv/indicadores`, da TV.

- **Rotas das telas:** `authenticate` → `authorize('tvwall:gerenciar')` → `validate`, sem `setorScope`: só o Super Admin tem a permissão, e as telas não são de um setor. A lista vem em ordem alfabética (`porNome`), sem paginação, e nunca traz o token nem o hash.
- **Token da tela:** `gerarTokenOpaco()` (32 bytes em base64url), que só sai no 201 do `POST /tv-telas`, com `Cache-Control: no-store`; o banco guarda o `hashDoToken`. O front monta o link `/tv#<token>`, e o que vem depois do `#` o navegador não manda ao servidor. Perdido o link, a tela é desativada e outra é criada. A tela desativada para de abrir na consulta seguinte da TV, porque cada consulta confere a tela no banco; ativada de novo, o mesmo link volta a abrir.
- **Rota da TV:** `tvToken` → controller, sem `authenticate`. O `tvToken` (`src/middlewares/tv-token.ts`) lê o `X-Tv-Token`, busca a tela pelo hash e a guarda em `req.tela`, que o controller lê com `telaAutenticada(req)`. Sem o token, com um que não existe ou de uma tela desativada, 401 com "Esta tela não está ativa.", sempre a mesma mensagem. Sem limite por IP, como o complemento: só passa quem tem o token de uma tela ativa. O logger oculta o `x-tv-token` e o `token`.
- **Último acesso:** gravado na primeira consulta e depois no máximo a cada `MINUTOS_ENTRE_ACESSOS` (5) minutos, com a condição no próprio `UPDATE`, para duas TVs com o mesmo link gravarem uma vez só. Entra por SQL, como o último login, para não mexer no `atualizado_em`.
- **Indicadores:** as contas do dashboard, pelo `dashboardService` com os `setorIds` `null` (todos os setores, também os desativados, sem o escopo de ninguém), pela data do atendimento e até hoje em Brasília (`hojeEmBrasilia`). O `mes` é o resumo do mês corrente, sem as notas baixas; o `npsPorSetor`, o do mês, sem o `setorId`; a `evolucao`, uma por semana nas `SEMANAS_DA_EVOLUCAO` (12) até a atual, com a primeira inteira, de segunda a domingo; os `destaques`, o `destacarPontos` dos `DIAS_DOS_DESTAQUES` (30) dias até hoje: o melhor ponto de cada setor, até `SETORES_NOS_DESTAQUES` (3) setores, só com os pontos de 5 notas ou mais, na ordem dos melhores do ranking. O service copia campo a campo: nada além das contagens e das médias do contrato chega à TV, nem comentário, telefone, classificação de uma resposta ou texto do paciente.
- **Relógio:** os períodos e o último acesso saem do `new Date()` do código e vão ao SQL como parâmetro, nunca com o `now()` do banco. Assim os testes param o relógio com o `vi.useFakeTimers({ toFake: ['Date'] })`.
- **Testes:** `tests/integration/tv-wall.test.ts`, com o relógio parado numa terça (`AGORA`) nos testes dos períodos. A resposta sem dado pessoal é conferida pelas chaves, em qualquer nível, e pelo texto: nada do comentário, do telefone ou da resposta livre de respostas que entraram nos números.

### Exportações

Os arquivos do painel ficam em `src/modules/exportacao/`: `GET /exportacoes/resumo.xlsx` e `GET /exportacoes/respostas.xlsx` (ticket 17) e `GET /exportacoes/resumo.pdf` (ticket 18). Além dos arquivos de todo módulo, ele tem o `exportacao.resumo.ts`, com o que o resumo em Excel e em PDF dividem (os textos, os filtros descritos e os números com o tipo de cada um), o `exportacao.planilhas.ts`, que monta as abas com o `exceljs`, e o `exportacao.pdf.ts`, que monta o PDF com o `pdfmake`.

- **Rotas:** `authenticate` → `authorize('exportacao:resumo')` (os quatro perfis, nos dois formatos do resumo) ou `authorize('exportacao:detalhada')` (o Visualizador não tem) → `setorScope('setorId', 'query')` → `validate` → controller. Os filtros são os do dashboard, com o `filtrosDoDashboardSchema`: o período e a base obrigatórios, porque o arquivo sai com o que está na tela e o período dá o nome do arquivo (`nomeDoArquivo`: `fhdod-resumo-<inicio>-a-<fim>.xlsx`, `fhdod-resumo-<inicio>-a-<fim>.pdf` e `fhdod-respostas-<inicio>-a-<fim>.xlsx`). O escopo é o de quem exporta, dentro das consultas, como no dashboard.
- **Antes do primeiro byte:** o `exceljs` começa a mandar bytes assim que o livro é criado. Por isso o service faz antes tudo o que pode falhar (as contas do `dashboardService`, os nomes dos filtros, a lista das respostas, os telefones decifrados e a linha da auditoria) e devolve um `ArquivoParaBaixar`, que o controller passa ao `enviarArquivo` (`src/shared/http/download.ts`). Um erro até ali vira a resposta de erro padrão, sem o `Content-Disposition`.
- **Depois do primeiro byte:** a resposta sai em streaming, com o `Content-Disposition` (exposto no CORS, para o front de outra origem ler o nome), o tipo do `.xlsx` e `Cache-Control: no-store`. Um erro no meio derruba a conexão (o navegador vê o download falhar, em vez de salvar um arquivo pela metade) e vai para o log como erro, com o `res.err`. A pessoa que fecha a conexão faz a geração parar, sem erro no log.
- **Vazão:** o `exceljs` não espera a rede. A cada linha, a planilha olha a `Saida`: se a resposta pediu uma pausa (`writableNeedDrain`), espera o `drain`; se a conexão fechou, lança `DownloadInterrompido`. Fechada a conexão, o Node volta o `writableNeedDrain` a `false`, então a `Saida` olha também o `close`.
- **Lotes:** a lista das respostas do arquivo (os IDs, na ordem do arquivo) sai de uma consulta só. As abas leem as respostas, os itens e os comentários dessa lista `RESPOSTAS_POR_LOTE` (500) de cada vez, pelos IDs, e só pedem o próximo lote depois de escrever o anterior: a memória não cresce com o período. Todas as abas seguem a ordem do envio, do mais recente para o mais antigo, com o ID maior primeiro no mesmo instante.
- **Abas:** o resumo tem uma, Resumo: quem gerou e quando, os filtros com os nomes, os indicadores de `/dashboard/resumo`, o NPS por setor e as médias por categoria. O detalhado tem a mesma aba Resumo e as abas Respostas (uma linha por envio), Itens (uma linha por pergunta respondida, com o texto, o tipo e a categoria do momento da resposta) e Comentários; o código da resposta liga as abas. As tabelas têm o cabeçalho fixo e o filtro do Excel. Uma aba que passaria de `LINHAS_POR_ABA` (o limite do Excel) continua noutra, como "Itens (2)".
- **Formatos:** datas e números vão como data e número, com o formato de exibição (`dd/mm/yyyy`, `dd/mm/yyyy hh:mm`, `0.0`, `#,##0` e `0%`, em `FORMATOS`): o Excel em português mostra 4,3 e 1.234, e a coluna continua servindo para somar e filtrar. O envio vai no horário de Brasília (`horarioDeBrasilia`), e os códigos, com os nomes do `rotulos.ts`. Os textos vão como texto, também o comentário que começa com "=". Os textos repetidos entram uma vez só no arquivo (`useSharedStrings`), como o Excel grava.
- **Telefone:** só quem tem `contatos:ver` recebe na aba Respostas a coluna "Telefone para retorno", com o número decifrado e escrito com o `formatarTelefone`; para os outros, a coluna não existe, e a consulta nem lê o `telefone_cifrado`. Os números são decifrados antes do primeiro byte: um que não se lê vira o 500 padrão, sem arquivo e sem auditoria.
- **Auditoria:** a linha entra antes de o arquivo sair, como na revelação do telefone: se a geração cair no meio, a tentativa fica registrada; se a linha não for gravada, o arquivo não sai. O `dados` leva os `filtros` que vieram, o número de `respostas`, o `comTelefones` e, no detalhado, quantos `telefones` foram.
- **PDF do resumo:** o mesmo `dadosDoResumo` do Excel, escrito pelo `pdfmake` no servidor, sem navegador, em A4 e no máximo `PAGINAS_DO_PDF` (2) páginas, com os números já escritos como no Brasil (`numeroBrasileiro`: 42, 1.234, 4,3 e 67%). O PDF é montado antes da linha da auditoria, e o envio usa o `pipe`, que respeita a vazão. Para caber, o PDF é montado com a letra das tabelas em 9, 8 e 7 (`TAMANHOS_DAS_TABELAS`) e conferido pelo número de páginas; se nem com 7 couber, as tabelas ficam com as primeiras e as últimas linhas (`recortar`: no NPS por setor, os melhores e os piores) e uma linha que diz quantas ficaram de fora e que a lista inteira está no Excel. A fonte é a Roboto que vem com o `pdfmake`, embutida no arquivo; o `pdfmake` só pode ler a pasta dela e nada da internet (`setLocalAccessPolicy` e `setUrlAccessPolicy`).
- **Testes:** `tests/integration/exportacao.test.ts` abre as planilhas com o leitor do `exceljs` e confere os números da aba Resumo contra as rotas do dashboard, as abas célula a célula, a coluna do telefone por perfil (e que o número não aparece no arquivo de quem não pode vê-lo), a auditoria e o streaming: o erro no meio (que derruba a conexão) e a conexão fechada por quem pede (que para a geração), com um servidor de verdade e o cliente HTTP do Node. Os lotes são testados pelo service, com o `respostasPorLote` pequeno. O `exportacao.planilhas.test.ts` e o `download.test.ts` testam a continuação das abas e a `Saida` sem banco. O PDF é lido com o `pdf.js` (`lerPdf`, em `tests/helpers/pdf.ts`, que devolve as páginas e as linhas de texto): `tests/integration/exportacao-pdf.test.ts` confere o acesso, o escopo, a auditoria e que os números do PDF batem com os do `resumo.xlsx` para os mesmos filtros; o `exportacao.pdf.test.ts`, sem banco, as duas páginas com muitos setores e o recorte.

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

### Como documentar uma rota

A documentação sai dos mesmos schemas Zod que validam as rotas. O Swagger (`/api/docs`, com a API rodando) e o `openapi.json` mostram o mesmo documento, montado em `src/config/openapi.ts`.

1. No `<modulo>.schemas.ts`, os schemas de entrada de cada rota ficam num objeto só, que vai para o `validate` da rota e para a documentação: `export const editarSetor = { params: setorParams, body: editarSetorBody }`.
2. Os schemas de saída que viram tipos no front levam, com `.meta({ id })`, o mesmo nome do tipo do front em `tipos.ts`: `z.object({ ... }).meta({ id: 'Setor' })`. Assim o front troca o tipo escrito à mão pelo gerado sem renomear nada.
3. No `<modulo>.docs.ts`, a função `documentar<Modulo>(registry)` registra cada rota com o `documentarRota`, de `src/shared/http/documentacao.ts`:

   ```ts
   documentarRota(registry, {
     method: 'patch',
     path: '/api/v1/setores/{id}',
     tags: ['Setores'],
     summary: 'Edita nome, slug ou descrição',
     security: EXIGE_LOGIN, // a rota tem authenticate
     requisicao: editarSetor, // o mesmo objeto do validate(editarSetor)
     respostas: { 200: respostaJson('Setor editado.', envelope(setorSchema)) },
     erros: [
       'NAO_AUTENTICADO',
       'SEM_PERMISSAO',
       'NAO_ENCONTRADO',
       { codigo: 'CONFLITO', mensagem: 'Já existe um setor com este endereço.' },
     ],
   })
   ```

   O `path` é o caminho completo, com os parâmetros no formato do OpenAPI (`{id}`). Listas paginadas usam `lista(schema)` no lugar do `envelope`. O 400 `VALIDACAO` (quando a rota valida alguma coisa) e o 500 `ERRO_INTERNO` entram sozinhos, e toda resposta de erro usa o componente `Erro`. Um erro pode ser só o código, com o exemplo padrão, ou um objeto com o que muda na rota: `quando` (a descrição), `mensagem` e `detalhes` do exemplo.
4. A função entra na lista `MODULOS` de `src/config/openapi.ts`, na ordem em que o módulo aparece no documento.
5. `pnpm openapi:exportar` grava o `openapi.json`, que vai no mesmo commit da mudança.

O `tests/contrato.test.ts` falha se uma rota do Express não estiver documentada (ou se o documento tiver uma rota que não existe), se uma resposta de erro não usar o `Erro` e se o `openapi.json` não for o que o código gera. Os `*.schemas.ts` e os `*.docs.ts` não importam o `env` nem o Prisma: o `pnpm openapi:exportar` roda sem `.env`, inclusive no CI.

## Segurança e LGPD

- **Nenhum segredo no Git.** O `.env` nunca é commitado; o `.env.example` traz só os nomes das variáveis e exemplos falsos. Chaves, senhas, tokens e endereços de banco reais não aparecem no código, nos testes, nas issues, nos PRs nem nos registros.
- **Nenhum dado real de paciente**, em lugar nenhum: seed, testes, dados de demonstração, prints, issues, PRs e registros usam só dados inventados.
- **Telefone, senha e tokens nunca vão para o log**, nem para mensagens de erro. O logger oculta `authorization`, `cookie`, `x-tv-token`, `x-complemento-token`, `senha` e `telefone`, entre outras (a lista fica em `src/config/logger.ts`); não registre o corpo inteiro de uma requisição.
- O telefone é cifrado no banco (AES-256-GCM), mascarado nas telas e só revelado com a permissão `contatos:ver`, sempre com registro na auditoria (`POST /contatos/:id/revelar-telefone` e a exportação detalhada são as únicas rotas que decifram; as listas e o detalhe só mascaram). A cifra fica em `src/shared/security/crypto.ts` (`cifrar` e `decifrar`), com a chave do `ENCRYPTION_KEY` (32 bytes em base64). O texto gravado é `v1.<iv>.<etiqueta>.<cifrado>`, em base64url, com um IV sorteado a cada cifra; a versão na frente deixa trocar a chave ou o formato sem perder o que já está gravado. Sem a chave, os telefones gravados não se leem mais: ela é guardada fora do servidor também.
- O IP do paciente não é gravado no banco.
- A TV Wall só recebe números agregados: o `GET /tv/indicadores` não tem campo de comentário, telefone ou texto escrito pelo paciente, e o teste dele confere as chaves da resposta.
- As exportações saem sem cache (`Cache-Control: no-store`), só com os setores de quem exporta, e o telefone completo só vai no arquivo de quem tem `contatos:ver`. Cada uma fica na auditoria, com os filtros e se levou telefones. O arquivo nunca passa pelo disco do servidor: é escrito direto na resposta.
- Ao usar uma ferramenta de IA, não cole nela o `.env`, dumps do banco nem logs de produção.

## Comandos do projeto

Node.js 26 (a versão fica no `.nvmrc`), pnpm 12 e Docker. O passo a passo para rodar do zero está no [README](README.md).

| Comando | O que faz |
| --- | --- |
| `pnpm install` | Instala as dependências, gera o cliente do Prisma e liga os hooks do Git |
| `docker compose up -d` | Sobe o PostgreSQL 18 de desenvolvimento (porta 5432) e o de teste (porta 5433) |
| `pnpm dev` | Roda a API em `http://localhost:3333`, recarregando a cada alteração; o Swagger fica em `/api/docs` |
| `pnpm build` | Gera o build em `dist/server.js` |
| `pnpm start` | Roda o build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Checagem de tipos do TypeScript |
| `pnpm test` | Testes unitários e de integração; os de integração usam o banco de teste |
| `pnpm test --project unit` | Só os testes que não precisam de banco |
| `pnpm test:watch` | Testes em modo de observação |
| `pnpm format` | Formata o código com o Prettier |
| `pnpm openapi:exportar` | Grava o contrato da API em `openapi.json`, que é commitado junto com a mudança |
| `pnpm db:generate` | Gera de novo o cliente do Prisma depois de mudar o `prisma/schema.prisma` |
| `pnpm db:migrate` | Cria e aplica uma migration no banco de desenvolvimento; `--create-only` só cria, para acrescentar SQL. Não gera o cliente: rode `pnpm db:generate` depois |
| `pnpm db:deploy` | Aplica as migrations pendentes, sem criar nenhuma: banco recém-criado, homologação e produção |
| `pnpm db:seed` | Seed base: categorias, turnos provisórios, configurações padrão e, num banco sem usuários, o primeiro Super Admin (`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`). Só cria o que falta, então pode rodar de novo e em produção |
| `DEMO_CONFIRM=<banco> pnpm db:demo` | Dados de demonstração, depois do seed base: setores, perguntas, contas, telas de TV e quatro meses de avaliações. Apaga e grava de novo os dados de demonstração; nunca em produção |
| `pnpm db:reset` | Apaga o banco de desenvolvimento, aplica todas as migrations de novo e roda o seed base |
| `pnpm db:studio` | Abre o Prisma Studio em `http://localhost:5555` para ver e editar os dados |

- **Antes de cada commit**, o Husky roda o ESLint e o Prettier nos arquivos alterados (lint-staged), e o commitlint confere a mensagem: Conventional Commits, com os tipos deste arquivo e sem coautoria nem assinatura do Claude.
- **CI:** o `.github/workflows/ci.yml` instala com o pnpm (com cache) e roda lint, tipos, testes (com um serviço PostgreSQL 18), contrato e build em todo pull request e em cada push na `develop` e na `main`. O passo do contrato roda o `pnpm openapi:exportar` e falha se o `openapi.json` mudou sem ser commitado. O modelo de PR fica em `.github/pull_request_template.md`.
- **Swagger:** ligado em development e test e desligado em production, a não ser que `DOCS_ENABLED=true` (a homologação o liga assim).
- **Variáveis de ambiente:** todas estão no `.env.example`, com o que cada uma faz. Uma variável nova entra no `src/config/env.ts` e no `.env.example`, no mesmo commit.
- **Banco de teste:** o `postgres-teste` do compose guarda os dados só na memória e começa vazio a cada subida. Os testes nunca leem o `.env`; para usar outro banco de teste, defina `TEST_DATABASE_URL`. Antes dos testes de integração, o `tests/setup.ts` apaga o schema do banco de teste e aplica as migrations, e só faz isso num banco com "test" no nome. Os testes que gravam no banco começam com o `limparBanco()`, de `tests/helpers/banco.ts`.
- **Reset com agente de IA:** o Prisma 7 recusa o `prisma migrate reset` (e o `pnpm db:reset`) quando quem roda é um agente de IA, e pede o consentimento de quem está usando. O setup dos testes não usa o reset, então o `pnpm test` roda igual para pessoas, agentes e o CI.

## Onde estão as coisas

| O quê | Onde |
| --- | --- |
| Regras de negócio, arquitetura e decisões | [`docs/Plano de Desenvolvimento - FHDOD.md`](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md) |
| Modelo de dados, migrations, seed base e dados de demonstração | [`prisma/schema.prisma`](prisma/schema.prisma), [`prisma/migrations/`](prisma/migrations/), [`prisma/seed.ts`](prisma/seed.ts) e [`prisma/demonstracao.ts`](prisma/demonstracao.ts), com o código em [`prisma/seeds/`](prisma/seeds/) |
| Login e sessão; middlewares de acesso | [`src/modules/auth/`](src/modules/auth/); [`src/middlewares/`](src/middlewares/) (`authenticate`, `authorize`, `setor-scope`, `rate-limit` e `tv-token`) |
| Cadastros de setores, categorias e turnos (os módulos mais simples, bons modelos para os próximos) | [`src/modules/setores/`](src/modules/setores/), [`categorias/`](src/modules/categorias/) e [`turnos/`](src/modules/turnos/) |
| Perguntas do setor: o modelo para escopo pela rota e pelo ID do registro e para a auditoria | [`src/modules/perguntas/`](src/modules/perguntas/) |
| Usuários e seus setores: senha provisória, sessões derrubadas e auditoria sem senha | [`src/modules/usuarios/`](src/modules/usuarios/) |
| Pesquisa pública: rotas sem login, limite de envios, idempotência, token de complemento e o complemento (comentário e pedido de retorno) | [`src/modules/pesquisa/`](src/modules/pesquisa/) e as regras [`classificar-nota.ts`](src/shared/rules/classificar-nota.ts) e [`telefone.ts`](src/shared/rules/telefone.ts) |
| Dashboard: resumo, NPS por setor, evolução, categorias, ranking e comentários, com os filtros do painel e o escopo dentro do SQL | [`src/modules/dashboard/`](src/modules/dashboard/), os filtros em [`filtros-do-painel.ts`](src/shared/http/filtros-do-painel.ts) e o SQL deles em [`src/database/filtros-do-painel.ts`](src/database/filtros-do-painel.ts), e as regras [`calcular-nps.ts`](src/shared/rules/calcular-nps.ts), [`media.ts`](src/shared/rules/media.ts), [`notas-da-escala.ts`](src/shared/rules/notas-da-escala.ts) e [`ranking-de-pontos.ts`](src/shared/rules/ranking-de-pontos.ts) |
| Respostas uma a uma e pedidos de retorno: listas com filtros e ordenação, detalhe com os itens, telefone mascarado e revelação auditada | [`src/modules/respostas/`](src/modules/respostas/) e [`src/modules/contatos/`](src/modules/contatos/) |
| Exportações: o resumo em Excel e em PDF e o detalhado em Excel, com os filtros e o escopo do dashboard, em streaming e com auditoria | [`src/modules/exportacao/`](src/modules/exportacao/), o envio em [`download.ts`](src/shared/http/download.ts) e os nomes dos códigos em [`rotulos.ts`](src/shared/constants/rotulos.ts) |
| TV Wall: telas com o token mostrado uma vez só e os indicadores da TV, pelo token do link | [`src/modules/tv-wall/`](src/modules/tv-wall/), o middleware [`tv-token.ts`](src/middlewares/tv-token.ts) e as regras [`ranking-de-pontos.ts`](src/shared/rules/ranking-de-pontos.ts) (os destaques) e [`calendario.ts`](src/shared/rules/calendario.ts) |
| Cifra dos telefones (AES-256-GCM) | [`src/shared/security/crypto.ts`](src/shared/security/crypto.ts) |
| Perfis e mapa de permissões | [`src/shared/constants/perfis.ts`](src/shared/constants/perfis.ts) e [`permissoes.ts`](src/shared/constants/permissoes.ts) |
| Factories e helpers dos testes | [`tests/factories/`](tests/factories/) e [`tests/helpers/`](tests/helpers/) |
| Tickets | [`docs/tickets/`](docs/tickets/) e as issues do GitHub |
| Registros das entregas | [`docs/registros/`](docs/registros/) |
| Contrato da API (OpenAPI) | [`openapi.json`](openapi.json), montado em [`src/config/openapi.ts`](src/config/openapi.ts); com a API rodando, o Swagger em `/api/docs` |
| CI e modelo de pull request | [`.github/`](.github/) |
| Configuração do Claude Code para o time | [`.claude/settings.json`](.claude/settings.json) |
| Front-end | `../fhdod-satisfacao-web`, com o `docs/plano-frontend.md` e, depois do ticket 01 do front, o próprio `AGENTS.md` |
