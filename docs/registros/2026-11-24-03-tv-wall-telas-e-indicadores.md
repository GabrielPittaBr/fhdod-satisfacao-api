# TV Wall: telas e indicadores

24/11/2026 · Agente (Claude Code)

> Ticket [16](../tickets/16-tv-wall-telas-e-indicadores.md), issue [#16](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/16). O Super Admin cadastra as TVs do hospital e recebe, uma vez só, o token do link de cada uma. A TV abre o link e lê os números gerais da pesquisa, de todos os setores, sem nenhum comentário, telefone ou texto do paciente. Desativada, a tela para de abrir na consulta seguinte.

## O que foi feito

- **Módulo `tv-wall`** (`src/modules/tv-wall/`):
  - `GET /tv-telas`, `POST /tv-telas` e `PATCH /tv-telas/:id/status`, com `authenticate` → `authorize('tvwall:gerenciar')` → `validate`. As telas vêm como `{ id, nome, ativa, ultimoAcessoEm }`, em ordem alfabética e sem o token nem o hash.
  - `POST /tv-telas` valida o nome (de 2 a 100 caracteres, sem os espaços das pontas) e responde 201 com `{ tela, token }` e `Cache-Control: no-store`. O token sai do `gerarTokenOpaco()` (32 bytes em base64url); o banco guarda o `hashDoToken` e quem criou a tela.
  - `PATCH /tv-telas/:id/status` recebe `{ ativa }` e responde 204; tela inexistente dá 404 ("Tela não encontrada."). Ativada de novo, a tela volta a abrir com o mesmo link.
  - `GET /tv/indicadores`, com o `tvToken` no lugar do `authenticate`: `{ tela, geradoEm, mes, npsPorSetor, evolucao, destaques }`, no formato do `IndicadoresTv` do front.
- **Middleware `tv-token`** (`src/middlewares/tv-token.ts`): lê o `X-Tv-Token`, busca a tela pelo hash e a guarda em `req.tela` (o controller a lê com `telaAutenticada(req)`). Sem o token, com um que não existe ou de uma tela desativada, 401 com "Esta tela não está ativa.". O último acesso é gravado na primeira consulta e depois no máximo a cada 5 minutos, com a condição no próprio `UPDATE`.
- **Indicadores**, todos pela data do atendimento, até hoje em Brasília e de todos os setores (os `setorIds` `null`):
  - `mes`: o resumo do dashboard no mês corrente (NPS, total, promotores, neutros, detratores e `mediaEscala`);
  - `npsPorSetor`: o NPS de cada setor no mês, `{ setor, nps, total }`, na ordem do dashboard;
  - `evolucao`: as 12 semanas até a atual, de segunda a domingo, inclusive as vazias, com a primeira inteira;
  - `destaques`: o melhor ponto de até 3 setores diferentes nos 30 dias até hoje, só com os pontos de 5 notas ou mais, como `{ setor, categoria, media, percentual45 }`.
- **Regras e peças compartilhadas:**
  - `destacarPontos(pontos)` e `SETORES_NOS_DESTAQUES`, em `src/shared/rules/ranking-de-pontos.ts`, com a ordem (`melhorPrimeiro`) e o corte de 5 notas do ranking.
  - `src/shared/rules/calendario.ts`: o `hojeEmBrasilia`, que saiu da pesquisa, o `diaDoCalendario` e a `segundaDaSemana`, que saíram do dashboard, e o `dataDoDia`, o `somarDias` e o `primeiroDiaDoMes`, novos.
  - As contas do `dashboardService` passaram a receber os `setorIds`, como o `pontosAvaliados` já recebia: o controller do dashboard passa os de quem está logado, e a TV, `null`. O `mediaSchema` e o `percentual45Schema` do dashboard foram exportados para os destaques.
  - O `TelaAutenticada` (`src/shared/security/acesso.ts`) e o `req.tela` (`src/shared/types/express.d.ts`).
  - O logger passou a ocultar também o `token`, a chave do token na resposta da criação.
- **Contrato:** as quatro rotas no Swagger e no `openapi.json`, com os schemas `TelaTv` e `IndicadoresTv`, nos nomes dos tipos do front, e o esquema de segurança `tokenTv` (o `X-Tv-Token`). O diff do `openapi.json` só acrescenta, fora uma linha nova na descrição geral do documento.
- **Testes:** são 513 (eram 479), em 46 arquivos.
  - `tests/integration/tv-wall.test.ts` (22): o 401 sem login e o 403 do Gestor, da Ouvidoria e do Visualizador nas três rotas das telas, e o 403 da senha provisória. As telas: a lista em ordem alfabética, sem o token nem o hash; a criação com o 201, o `no-store`, o token de 43 caracteres e só o hash no banco; o token da criação abrindo a TV, um por tela; o 400 do nome; a desativação que para a tela na hora sem parar as outras, e a ativação que devolve o mesmo link; o 400 do `ativa` e do ID e o 404. O token: o 200 com o nome da tela; o 401 sem o token, vazio, desconhecido e de tela desativada; o login do painel e o hash do token não abrindo a TV; o último acesso na primeira consulta, de novo só depois de 5 minutos (4min59s não grava), sem mexer no `atualizado_em`, e nunca para a tela desativada. Os números, com o relógio parado: o mês e o NPS por setor de três setores, um deles desativado, iguais aos do dashboard; o mês que vira à meia-noite de Brasília; as 12 semanas da evolução com as pontas; os destaques com o primeiro e o último dos 30 dias, o corte de 5 notas, um ponto por setor e o limite de 3; os números vazios; e a resposta sem nenhum campo pessoal, conferida pelas chaves e pelo texto.
  - Unitários: o `destacarPontos` (6) e as contas de calendário (7, com o teste do `hojeEmBrasilia`, que saiu do `pesquisa.schemas.test.ts`).
  - A factory `criarTelaTv`, e o teste do logger com o `token`.
- `AGENTS.md`: a seção "TV Wall"; as contas do dashboard pelos setores; o calendário em "Modelo de dados" e nas regras de "Organização por módulo"; a factory; a LGPD; e o módulo e o middleware em "Onde estão as coisas". Ticket 16 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| O token é o `gerarTokenOpaco()`, de 32 bytes, com o `hashDoToken` no banco, e só sai no 201, com `Cache-Control: no-store` | O ticket pede o token aleatório, mostrado uma vez só, com só o hash no banco ("Token da TV", no plano). É o formato do refresh e do complemento, e o `token_hash` do banco já tem os 64 caracteres do SHA-256. O `no-store` é o mesmo da senha provisória e do token de complemento |
| A TV entra por um middleware, o `tvToken`, no lugar do `authenticate` | O plano põe o `tv-token` na cadeia de cada rota ("Ciclo de uma requisição") e na estrutura de pastas. Lendo a rota, dá para saber quem pode chamá-la, como nas outras |
| Sem o token, com um desconhecido ou de uma tela desativada, o mesmo 401 e a mesma mensagem | O ticket pede "Esta tela não está ativa." nos dois casos. Mensagens diferentes contariam a quem tenta tokens quais existem, e a tela do front mostra o mesmo aviso |
| Cada consulta confere a tela no banco, sem cache nem sessão | "Desativar a tela faz o link parar de funcionar na hora" (ticket): a TV desativada recebe 401 na consulta seguinte, em até 30 s |
| A tela desativada pode ser ativada de novo, com o mesmo link | O pedido é `{ ativa }`, `true` ou `false`, e a tela do front tem o botão "Ativar de novo". O hash continua no banco, e nada se apaga ("Modelo de dados", no `AGENTS.md`) |
| Sem limite por IP nos indicadores | Como o complemento: só passa quem tem o token, que não se adivinha, e o token errado custa uma busca pelo índice único. As TVs saem pelo IP do hospital e consultam a cada 30 s: um limite por IP contaria todas juntas |
| O último acesso é gravado na primeira consulta e depois no máximo a cada 5 minutos, com a condição no `UPDATE` | É o que o ticket pede. Com a condição no próprio `UPDATE`, duas TVs com o mesmo link, ao mesmo tempo, gravam uma vez só |
| O último acesso entra por SQL | Como o último login (`auth.repository.ts`): o `atualizado_em` marca a mudança no cadastro da tela, e um `update` do Prisma o mudaria a cada 5 minutos |
| Os indicadores usam o `dashboardService`, com os `setorIds` `null` | São as mesmas contas do painel, sem copiar a regra do NPS e da média ("Regras que existem num lugar só", no `AGENTS.md`). O `null` é o "todos os setores" do Super Admin, e o ticket pede os indicadores "sem escopo de usuário" |
| As contas do dashboard passaram a receber os `setorIds`, e não quem está logado | A TV não tem login. O `pontosAvaliados` já recebia os setores "para a TV e as exportações" (ticket 14); as outras contas passaram a fazer o mesmo, e o controller do dashboard passa os de quem está logado |
| Tudo pela data do atendimento, até hoje em Brasília | O ticket diz "pela data do atendimento" para o mês; a evolução e os destaques usam a mesma base, que é a padrão das listas e a do mock do front. O dia vira à meia-noite de Brasília, como o "hoje" da pesquisa ("Modelo de dados", no `AGENTS.md`) |
| A evolução vai da segunda-feira de 11 semanas atrás até hoje: 12 pontos, com a semana atual pela metade | "Semanal, nas últimas 12 semanas" (ticket), com a semana do painel, de segunda a domingo. A primeira começa na segunda para não ficar pela metade, como no mock |
| Os destaques são dos 30 dias até hoje, contando hoje (de 26/10 a 24/11, num dia 24/11) | "Nos últimos 30 dias" (ticket). O mock do front conta 31 dias (`subDays(agora, 30)` até hoje); ver as pendências |
| Nos destaques, o melhor ponto de cada setor na ordem do ranking (a média, o % de notas 4 e 5, o total e o nome) | "O ponto mais bem avaliado de até 3 setores diferentes" (ticket). Com a mesma ordem, o melhor ponto da TV é o mesmo do ranking do painel; o mock desempata só pelo total |
| A regra dos destaques fica em `ranking-de-pontos.ts` | Ela usa o corte de 5 notas e a ordem do ranking, e assim é testada sem banco, como o `ranquearPontos` |
| Os setores desativados entram no mês, no NPS por setor e nos destaques | Como no dashboard: as respostas do período continuam valendo depois que o setor sai da pesquisa |
| O service copia os campos um a um, e o `npsPorSetor` sai sem o `setorId` | O ticket proíbe qualquer campo pessoal, e o formato é o do front (`Omit<NpsSetor, 'setorId'>`). Com a cópia, um campo novo nas contas do dashboard não chega à TV sem alguém escolher |
| A lista das telas vem em ordem alfabética | Como as outras listas da API (`porNome`); o mock devolve na ordem de criação |
| O nome tem de 2 a 100 caracteres | O mínimo e a mensagem são os do formulário do front ("Informe onde a tela fica"); o máximo, o dos setores |
| O `token` entrou nas chaves que o logger oculta | Como o `senhaProvisoria` e o `tokenComplemento`: um log descuidado da resposta da criação não mostra o token ("LGPD", no `AGENTS.md`) |
| O `hojeEmBrasilia` e as contas de calendário foram para `src/shared/rules/calendario.ts` | A pesquisa, o dashboard e a TV usam as mesmas contas, e um módulo não importa outro só por uma conta de datas |
| A criação e a mudança de situação das telas não vão para a auditoria | O plano lista na auditoria os logins, as perguntas, as permissões, as exportações e os telefones, e o ticket não pede. Quem criou a tela fica em `criado_por_id`; ver as pendências |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("TV Wall", "Endpoints da API", "Autenticação, perfis e permissões", "Modelo de dados" e "LGPD"), o ticket 16, o `AGENTS.md`, o registro do ticket 15 e, no front, `src/lib/api/tipos.ts`, `src/mocks/consultas.ts`, `src/mocks/cadastros.ts`, as páginas de `src/features/tv-wall/` e o ticket 08 do front.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 513 testes (46 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega, e os schemas novos foram lidos à mão: os `null` do mês, a evolução com o `PontoEvolucao`, os destaques com os quatro campos e o `tokenTv` como `apiKey` no cabeçalho.
- **Os testes pegam o erro:** um roteiro quebrou 33 regras, uma de cada vez, rodou os testes da TV (e os das regras e do logger, quando a mudança era neles) e conferiu que algum falhou. Pegou todas.
  - **Acesso:** o `authorize` tirado de cada uma das três rotas das telas e o `tvToken` tirado dos indicadores.
  - **Token:** a tela desativada abrindo a TV, o token gravado em claro, a criação sem o `no-store`, o hash do token na lista e o 404 sumido.
  - **Último acesso:** gravado a cada consulta, a cada 6 minutos ou nunca; gravado pelo Prisma, mexendo no `atualizado_em`; e gravado para a tela desativada.
  - **Períodos:** o mês como os últimos 30 dias, o hoje em UTC, a base do envio, 13 semanas, a primeira semana pela metade, a semana começando no domingo, os destaques com 31 ou 29 dias e sem o dia de hoje.
  - **Números:** os destaques como os melhores do ranking (dois pontos do mesmo setor), com quatro setores, sem o mínimo de notas ou sem a regra de um ponto por setor; o escopo de nenhum setor; e campos a mais na resposta (as notas baixas no mês, o `setorId` no NPS por setor, o total de notas nos destaques).
  - **Logger:** sem ocultar o `token`.
- O banco de desenvolvimento não foi usado, o build não foi aberto contra um banco, e o Swagger não foi aberto no navegador.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **A tela volta a ser ativada:** o plano descreve o `PATCH /tv-telas/:id/status` como "Desativa a tela"; a rota também ativa de novo, com o mesmo link, porque o pedido é `{ ativa }` e o front tem o botão "Ativar de novo".
- **Além do ticket:** o `Cache-Control: no-store` na criação, o `token` no logger, o limite de 100 caracteres no nome e a ordem alfabética da lista.

## Pendências e dúvidas

- **Front (ticket 08, TV Wall ligada à API):** as diferenças para o mock:
  - os destaques contam 30 dias, com hoje, e não 31, e desempatam como o ranking: o % de notas 4 e 5, o total e o nome;
  - o NPS por setor desempata pelo total e pelo nome, como o dashboard;
  - a lista das telas vem em ordem alfabética, e não na de criação;
  - o 404 da tela diz "Tela não encontrada." (o mock diz "Tela não encontrado.");
  - o nome aceita até 100 caracteres;
  - a TV manda o token no `X-Tv-Token`, e a resposta da criação, `{ tela, token }`, não tem nome de schema, como o tipo do front, que também é escrito na hora.
- **Auditoria das telas:** a criação e a desativação não ficam na auditoria; o autor fica em `criado_por_id`, e a última mudança, só no `atualizado_em`. Se o hospital quiser saber quem desativou uma tela, as duas ações podem entrar na auditoria, como as mudanças de usuário.
- **Carga das TVs:** cada consulta faz cinco leituras no banco (a tela e as quatro contas), e a cada 5 minutos grava o último acesso. Com poucas TVs, não pesa; com muitas, os números podem ser guardados por 30 s e divididos entre as telas.
- **Setores desativados na TV:** entram nos números enquanto tiverem respostas no período, como no dashboard. Se o hospital preferir escondê-los na TV, é um filtro no service da TV.
