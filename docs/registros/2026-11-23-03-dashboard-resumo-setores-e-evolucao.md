# Dashboard: filtros, resumo, NPS por setor e evolução

23/11/2026 · Agente (Claude Code)

> Ticket [13](../tickets/13-dashboard-resumo-setores-e-evolucao.md), issue [#13](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/13). A gestão abre o painel e vê o NPS do período, com o número de respostas, os promotores, neutros, detratores e notas baixas, o NPS de cada setor e a evolução por dia, semana ou mês. Os mesmos filtros valem para os três blocos, e cada pessoa só conta os setores que pode ver.

## O que foi feito

- **Rotas** (`src/modules/dashboard/`, nas camadas de sempre), todas com `authenticate` → `authorize('dashboard:ver')` → `setorScope('setorId', 'query')` → `validate`:
  - `GET /dashboard/resumo`: `{ nps, total, promotores, neutros, detratores, notasBaixas, baixissimas, mediaEscala }`. Sem respostas, `nps` e `mediaEscala` vêm `null` e as contagens, 0.
  - `GET /dashboard/nps-por-setor`: `[{ setorId, setor, nps, total }]`, só os setores com respostas no período (também os desativados), do maior NPS para o menor.
  - `GET /dashboard/evolucao`: recebe também a `granularidade` (`DIA`, `SEMANA` ou `MES`) e devolve `[{ periodo, nps, total }]`, um ponto por período, inclusive os vazios, com o `periodo` no primeiro dia (a semana começa na segunda).
- **Filtros do painel**, em `src/shared/http/filtros-do-painel.ts`: `inicio` e `fim` (`AAAA-MM-DD`, incluídos, e o fim igual ou depois do início), `base` (`ATENDIMENTO` ou `ENVIO`), `setorId`, `turnoId` e `canal`. O `filtrosDoDashboardSchema` exige o período e a base; o `filtrosDoPainelSchema`, que as respostas (ticket 15) e as exportações (17 e 18) vão usar, deixa tudo opcional, com a base do atendimento quando ela não vem. Mensagens: "Informe a data inicial", "Informe a data final", "Use uma data válida, no formato AAAA-MM-DD", "Escolha a data do atendimento ou a do envio" e "A data final precisa ser igual ou depois da inicial".
- **SQL dos filtros**, em `src/database/filtros-do-painel.ts`: o `condicoesDoPainel(filtros, setorIds)` monta o `WHERE` com o escopo (`r.setor_id = ANY(...)`) e os filtros, tudo parametrizado no `$queryRaw`. Com `base=ENVIO`, o período é o intervalo de instantes entre a meia-noite do início e a meia-noite depois do fim, em Brasília; o `diaDaResposta(base)` dá o dia de cada resposta para agrupar.
- **Consultas** (`dashboard.repository.ts`): uma para cada rota. O resumo conta tudo numa consulta só, com `FILTER`, e soma as notas dos itens de escala das mesmas respostas; a evolução junta um `generate_series` dos períodos com as respostas, por `date_trunc`, num `LEFT JOIN` que mantém os vazios.
- **Regras** em `src/shared/rules/`:
  - `calcularNps({ total, promotores, detratores })`: % de promotores menos % de detratores, arredondado, ou `null` sem respostas. As constantes `PROMOTOR_A_PARTIR_DE` (9) e `DETRATOR_ATE` (6) entram também no SQL das contagens.
  - `mediaComUmaCasa(soma, quantidade)`: a média das notas de 1 a 5, com uma casa decimal, ou `null` sem notas.
- **Compartilhados:** o `canalSchema` (o `Canal` do contrato) saiu do `pesquisa.schemas.ts` para `src/shared/http/canal.ts`, porque a pesquisa e os filtros usam o mesmo; e o fuso `America/Sao_Paulo` virou a constante `FUSO_DE_BRASILIA`, em `src/shared/constants/fuso-horario.ts`, usada pelo `hojeEmBrasilia` e pelo SQL.
- **Contrato:** as três rotas no Swagger e no `openapi.json`, com os schemas `Resumo`, `NpsSetor`, `PontoEvolucao`, `BaseData` e `Granularidade` (os nomes dos tipos do front). O `Canal` da pesquisa ficou igual.
- **Testes:** são 400 (eram 336).
  - `tests/integration/dashboard.test.ts` (43 testes), com as respostas criadas pelo próprio teste e as três rotas conferidas com os mesmos filtros: o 401, o 403 da senha provisória e o de quem não tem `dashboard:ver` (com a permissão tirada da sessão, porque os quatro perfis a têm); os quatro perfis lendo as rotas; o Gestor e o Visualizador com o 403 no setor de fora e contando só os seus setores, com e sem `setorId`; o Gestor sem setores; o Super Admin e a Ouvidoria contando todos; a validação de cada filtro; o período com as duas pontas incluídas; a resposta das 23h30 do dia 10 em Brasília (gravada no dia 11 em UTC) contando no dia 10 com `base=ENVIO`, e a virada da meia-noite de Brasília; setor, turno e canal juntos; cada número do resumo, inclusive a média só das notas de escala; a ordem do NPS por setor, com os empates; a evolução por dia, por semana e por mês com os períodos vazios, a semana começando na segunda, a base do envio na virada do mês e o limite de pontos.
  - Unitários: `calcular-nps.test.ts`, `media.test.ts`, `filtros-do-painel.test.ts`, `canal.test.ts` e `dashboard.schemas.test.ts` (a contagem de períodos e o limite).
  - A factory `criarResposta` ganhou o canal, o dia do atendimento, o instante do envio, a classificação e a nota da escala, todos opcionais.
- `AGENTS.md`: a seção "Dashboard", o fuso em "Modelo de dados", as regras novas em "Organização por módulo", a factory em "Login, permissões e escopo de setor" e os arquivos em "Onde estão as coisas". Ticket 13 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| As consultas só contam; o NPS e a média são calculados no código | O ticket pede o NPS de uma única regra, com testes unitários. Com o `round` no SQL, cada consulta teria a sua cópia da conta. Os limites de promotor e detrator também entram no SQL pelas constantes da regra |
| O NPS arredonda o meio para longe do zero, em inteiros | É o `round` do PostgreSQL, o do exemplo de consulta do plano, e fica simétrico: 12,5 dá 13, e -12,5 dá -13. O `Math.round` do mock do front daria -12. A conta em inteiros não depende do ponto flutuante |
| O filtro fica em `src/shared/http/`, e o SQL dele, em `src/database/` | O ticket pede um filtro só para o dashboard, as respostas e as exportações, que são módulos diferentes. Os schemas não importam o Prisma (o `openapi:exportar` roda sem banco), então o SQL fica num arquivo à parte |
| Com `base=ENVIO`, o período é um intervalo de instantes, e não o dia convertido de cada linha | Converter cada `enviado_em` para o dia de Brasília não usaria o índice de `(setor_id, enviado_em)`, que o plano criou para o dashboard. O intervalo de meia-noite a meia-noite de Brasília dá o mesmo resultado e usa o índice. Para agrupar a evolução, aí sim, cada resposta é convertida |
| O NPS por setor traz só os setores com respostas | É o que o mock e a tela do front esperam: a lista vazia mostra "Nenhum setor recebeu respostas neste período.". Um setor sem respostas não tem NPS para comparar. Os desativados com respostas no período entram, porque os números são deles |
| No empate do NPS, vem o setor com mais respostas e depois a ordem alfabética | O ticket só pede "do maior NPS para o menor". Sem desempate, a ordem de dois setores com o mesmo NPS mudaria entre duas chamadas, e o painel recarrega a cada 60 s |
| O `nps` do `NpsSetor` é anulável no contrato | É o tipo do front (`NpsSetor` e o `npsPorSetor` da TV, no ticket 16). Nesta rota ele nunca vem `null`, porque só entram setores com respostas |
| A evolução começa no período que contém o `inicio` | O ticket pede o `periodo` no primeiro dia do período, e o mock do front faz assim (a segunda-feira da semana do início). Só contam as respostas de `inicio` a `fim`, para o primeiro ponto não somar dias de fora do filtro |
| A evolução tem no máximo 366 pontos | Sem limite, um período de séculos por dia faria o banco gerar e a API devolver milhões de pontos. 366 cobre um ano bissexto inteiro por dia; um período maior pode ser visto por semana ou por mês, e a mensagem diz isso |
| A `granularidade` é obrigatória | O ticket diz que a rota recebe a granularidade, e o front sempre a manda. Um padrão escondido faria a mesma URL mudar de sentido se o padrão mudasse |
| O `periodoEmOrdem` só compara duas datas válidas | No Zod 4, a data fora do formato não interrompe o objeto, e a regra recebia o texto como veio: "2026-13-01" ganhava um segundo erro, em `fim`. O teste "data fora do formato" pegou isso |
| O 403 de quem não tem `dashboard:ver` é testado tirando a permissão da sessão | A definição de pronto pede o 403 sem a permissão, mas os quatro perfis a têm. O teste troca o `authService.autenticar` por um que devolve a sessão sem `dashboard:ver`, como ficaria se o mapa de permissões mudasse, e confere que o `authorize` de cada rota barra |
| O `Canal` virou um schema compartilhado | A pesquisa e os filtros aceitam os mesmos canais. Dois schemas com o mesmo `id` no OpenAPI seriam dois componentes com o mesmo nome |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Por que PostgreSQL", "Exemplo: consulta de relatório", "Endpoints da API", "Painel" e "Perfis e permissões"), o ticket 13, o `AGENTS.md`, os registros dos tickets 10 e 11 e, no front, `src/lib/api/tipos.ts`, `src/mocks/consultas.ts`, `src/mocks/regras.ts`, `src/features/dashboard/filtros.ts` e `src/features/dashboard/components/blocos.tsx`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 400 testes (40 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega; o diff só acrescenta (as três rotas e os cinco schemas novos), e o `Canal` ficou igual.
- **Os testes pegam o erro:** um roteiro quebrou 34 regras, uma de cada vez, rodou os testes do dashboard e das regras novas e conferiu que algum falhou. Pegou 33.
  - **Filtros e escopo:** o escopo, o setor, o turno e o canal ignorados; a base do envio trocada pela do atendimento; o dia do envio em UTC, no filtro e no agrupamento; o fim do envio sem o dia seguinte; as pontas do período do atendimento exclusivas; o período invertido aceito; e a base opcional no dashboard.
  - **Contas:** promotor a partir de 8, detrator até 5, o NPS com `Math.round`, os neutros contando o 6, as notas baixas só com a `BAIXA`, as baixíssimas contando a `BAIXA` e a média sem arredondar.
  - **Evolução:** sem os períodos vazios, a semana agrupada por dia, a série começando no `inicio` em vez do período dele, e o limite de pontos tirado ou um a menos.
  - **NPS por setor:** sem ordem, sem o desempate pelo total e sem o desempate pelo nome. Esse escapou na primeira rodada: os dois setores empatados tinham sido criados na ordem alfabética, e a ordem do ID dava o mesmo resultado. O teste passou a criá-los na ordem inversa, e a mutação passou a ser pega.
  - **Rotas:** o `setorScope` e o `authorize` tirados de cada uma das três. O `authorize` só foi pego depois que entrou o teste "sem dashboard:ver: 403".
  - **A que escapou:** tirar o `i.tipo = 'ESCALA_1_5'` da média. É uma mutação equivalente: só a escala grava `valor_numero`, e o `count` e o `sum` ignoram o nulo dos outros tipos. A condição fica para a média continuar sendo só da escala se um tipo novo gravar número.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador: o teste de contrato confere as rotas no documento, e os parâmetros e schemas novos do `openapi.json` foram lidos à mão.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Regras além do ticket:** o fim igual ou depois do início, o limite de 366 pontos na evolução, o desempate do NPS por setor e a lista do NPS por setor só com os setores que tiveram respostas.
- **Mensagens:** o ticket não as define. As dos filtros ficaram em `MENSAGENS_DOS_FILTROS`, e as da evolução, no `dashboard.schemas.ts`.

## Pendências e dúvidas

- **Front (ticket do dashboard de lá):** as diferenças para o mock:
  - o NPS arredonda o meio para longe do zero (-12,5 dá -13; o `Math.round` do mock dá -12);
  - com `base=ENVIO`, o mock compara o dia do envio no fuso do navegador; a API usa sempre o de Brasília;
  - no empate do NPS por setor, a API desempata pelo número de respostas e pelo nome;
  - a evolução recusa mais de 366 pontos (o filtro "Escolher datas" com mais de um ano por dia recebe 400 em `granularidade`).
- **Tickets 15, 17 e 18:** as respostas e as exportações usam o `filtrosDoPainelSchema` e o `condicoesDoPainel`, para os números baterem com os do dashboard.
- **Ticket 16 (TV Wall):** os indicadores da TV podem reaproveitar as consultas do `dashboardRepository` com o período do mês corrente.
