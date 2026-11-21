# 13 — Dashboard: filtros, resumo, NPS por setor e evolução

**Issue:** [#13](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/13)

**O que construir:** A gestão abre o painel e vê os números principais da pesquisa no período escolhido: o NPS com o número de respostas, promotores, neutros, detratores e notas baixas, o NPS de cada setor e a evolução por dia, semana ou mês. Os filtros (período, base da data, setor, turno e canal) valem para todos os blocos, e cada pessoa só vê os setores que pode.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor; 10 — Pesquisa pública: abertura e envio da avaliação

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] Os filtros do painel são um só, reaproveitado pelo dashboard, pelas respostas e pelas exportações: `inicio` e `fim` (`AAAA-MM-DD`), `base` (`ATENDIMENTO` ou `ENVIO`), `setorId`, `turnoId` e `canal`. No dashboard, `inicio`, `fim` e `base` são obrigatórios.
- [ ] Com `base=ENVIO`, a data comparada é o dia do envio no horário de Brasília: uma resposta enviada às 23h30 do dia 10, em Brasília, conta no dia 10, mesmo gravada em UTC no dia 11.
- [ ] Gestor e Visualizador só recebem dados dos seus setores, mesmo pedindo todos, e pedir um setor de fora devolve 403. O escopo entra na própria consulta.
- [ ] Todas as rotas exigem `dashboard:ver`.
- [ ] `GET /dashboard/resumo` devolve `nps`, `total`, `promotores` (9 e 10), `neutros` (7 e 8), `detratores` (0 a 6), `notasBaixas` (classificação baixa ou baixíssima), `baixissimas` e `mediaEscala` (média das notas de 1 a 5, com uma casa decimal); `nps` e `mediaEscala` vêm `null` quando não há resposta.
- [ ] `GET /dashboard/nps-por-setor` devolve `{ setorId, setor, nps, total }` de cada setor, do maior NPS para o menor.
- [ ] `GET /dashboard/evolucao` recebe `granularidade` (`DIA`, `SEMANA` ou `MES`) e devolve um ponto por período do intervalo, inclusive os vazios (`nps` `null` e `total` 0), no formato `{ periodo, nps, total }`, com `periodo` no primeiro dia do período (a semana começa na segunda).
- [ ] O NPS sai de uma única regra (% de promotores menos % de detratores, arredondado), com testes unitários.
- [ ] Testes de integração com respostas criadas pelos próprios testes: os números de cada bloco, o escopo do gestor e do visualizador, a base da data e a evolução com períodos vazios.
