# Dashboard: categorias, melhores e piores pontos e comentários

24/11/2026 · Agente (Claude Code)

> Ticket [14](../tickets/14-dashboard-categorias-ranking-e-comentarios.md), issue [#14](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/14). O dashboard mostra onde o hospital está bem e onde está mal: a média e o % de notas 4 e 5 de cada categoria, os pontos (um setor numa categoria) com a melhor e a pior avaliação e os comentários mais recentes, com os mesmos filtros e o mesmo escopo do ticket 13.

## O que foi feito

- **Rotas** no módulo `dashboard`, com `authenticate` → `authorize('dashboard:ver')` → `setorScope('setorId', 'query')` → `validate`, como as do ticket 13:
  - `GET /dashboard/categorias`: `[{ categoriaId, categoria, media, percentual45, total }]`, só as categorias com notas de 1 a 5 no período (também as desativadas), na ordem das categorias. O `total` é o número de notas.
  - `GET /dashboard/ranking`: `{ melhores, piores }`, até 3 pontos em cada lista, no formato `{ setorId, setor, categoriaId, categoria, media, percentual45, total }`. Só entram pontos com 5 notas ou mais, e os piores saem dos que não estão nos melhores.
  - `GET /dashboard/comentarios`: exige também `comentarios:ver` (o Visualizador não tem). Aceita `tipo`, `pagina` e `porPagina` (padrão 8, até 100) e devolve `{ data: [{ id, respostaId, tipo, texto, setor, dataAtendimento, enviadoEm, classificacao }], meta: { pagina, porPagina, total } }`, do envio mais recente para o mais antigo.
- **Consultas** (`dashboard.repository.ts`): as categorias e os pontos leem os itens de escala das respostas dos filtros e do escopo pelo mesmo trecho (`notasDaEscala`) e contam a quantidade, a soma e as notas 4 e 5. A categoria de cada nota é a do item, gravada no momento da resposta. Os comentários saem numa transação com duas consultas: a página e o total.
- **Regras** em `src/shared/rules/`:
  - `notas-da-escala.ts`: `indicadoresDasNotas({ quantidade, soma, boas })` dá a média com uma casa (o `mediaComUmaCasa` do ticket 13) e o `percentual45` (`percentualInteiro`, em inteiros, com o meio para cima); `NOTA_BOA_A_PARTIR_DE` (4) entra também no SQL.
  - `ranking-de-pontos.ts`: `ranquearPontos`, com o `MINIMO_DE_NOTAS_DO_PONTO` (5), o `TAMANHO_DO_RANKING` (3) e as ordens `melhorPrimeiro` e `piorPrimeiro`.
- **Pronto para a TV e as exportações:** o `dashboardService.pontosAvaliados(filtros, setorIds)` devolve todos os pontos com notas, com a média e o `percentual45`, sem ordem e sem o mínimo. Recebe os `setorIds`, e não quem está logado, porque a TV não tem login; os destaques do ticket 16 e as abas das exportações (17 e 18) usam o mesmo cálculo e o mesmo mínimo de notas.
- **Contrato:** as três rotas no Swagger e no `openapi.json`, com os schemas `IndicadorCategoria`, `ItemRanking`, `Ranking` e `ComentarioRecente`, os nomes dos tipos do front. Os comentários reaproveitam o `TipoComentario` e a `Classificacao` da pesquisa. O diff do `openapi.json` só acrescenta.
- **Testes:** são 443 (eram 400).
  - `tests/integration/dashboard.test.ts` passou de 43 para 74 testes. Os de acesso e de validação passam pelas seis rotas: o 401, o 403 da senha provisória e o de quem não tem `dashboard:ver`, o setor de fora e o período obrigatório. Os comentários têm o 403 do Visualizador e o 200 dos outros três perfis.
  - Categorias: a média e o % de cada uma, a ordem das categorias, a desativada com notas, a sem notas e o sim ou não fora da conta, a nota que fica na categoria do momento da resposta, o escopo do Gestor, o canal e a lista vazia.
  - Ranking: os 3 melhores e os 3 piores, com os números de cada ponto; o ponto com 4 notas fora e, com a quinta nota, dentro (desempatando pelo nome); o Gestor só com os seus pontos e os piores vazios com poucos pontos; e as notas de fora do período que não contam para o corte de 5.
  - Comentários: o formato e a ordem, só das respostas com comentário; as 8 por página no padrão, a segunda página com 3 por página e a página depois do fim, sempre com o `total` de todas; o filtro por tipo; o escopo do Gestor, o período pelo atendimento e pelo envio em Brasília; e o 400 em `tipo`, `pagina` e `porPagina`.
  - Unitários: `notas-da-escala.test.ts` e `ranking-de-pontos.test.ts` (o corte, as duas listas sem repetir, a lista curta dos piores e cada desempate).
  - A factory `criarResposta` ganhou o comentário, opcional.
- `AGENTS.md`: a seção "Dashboard" com as rotas novas, as notas da escala, as categorias, o ranking e os comentários; as regras novas em "Organização por módulo"; a factory; e os arquivos em "Onde estão as coisas". Ticket 14 marcado como `done`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Os piores saem dos pontos que não estão nos melhores | O ticket pede que nenhum ponto apareça nas duas listas, e o mock do front faz assim. Com até 6 pontos, a lista dos piores fica curta; com 3 ou menos, vazia, e a tela já tem a mensagem para isso ("Há poucos pontos avaliados para separar os piores.") |
| No empate da média, vale o % de notas 4 e 5, depois o ponto com mais notas e depois o nome | O mock desempata só pelo %. Com o total e o nome, a ordem nunca varia entre duas recargas do painel. Nas duas listas, o empate favorece o ponto com mais notas: ele mostra a mesma coisa com mais gente |
| O ranking ordena pela média com uma casa, a que aparece na tela | Dois pontos que aparecem com 4,2 seguem para o desempate pelo %, em vez de um ficar na frente por uma diferença que ninguém vê. É também o que o mock faz |
| A categoria da nota é a do item, e não a da pergunta hoje | O plano manda cada item copiar a categoria do momento da resposta, para o histórico nunca mudar de sentido. Mudar a pergunta de categoria não mexe nas notas antigas |
| Categorias e pontos desativados com notas no período aparecem | Os números são deles. É a mesma regra do NPS por setor no ticket 13 |
| O cálculo dos pontos recebe os `setorIds`, e não o usuário | O critério pede o cálculo pronto para a TV e as exportações. A TV não tem login: ela vai passar os setores da tela, ou `null` para todos |
| As regras da escala e do ranking ficam em `src/shared/rules/` | São as contas que o dashboard, a TV e as exportações precisam fazer igual. Ali, elas têm testes unitários sem banco |
| Os comentários aceitam também `pagina` | O ticket pede o `porPagina` e o `meta.total`; com a página, a lista segue o formato de toda lista paginada da API (`{ data, meta: { pagina, porPagina, total } }`) e o painel pode mostrar mais comentários sem outra rota. Sem `pagina`, é a primeira |
| Os comentários vêm do envio mais recente para o mais antigo | O comentário não guarda a hora em que foi escrito, só a avaliação guarda a do envio; o complemento chega no máximo 30 minutos depois. No empate do instante, vem o comentário de ID maior |
| A página e o total saem numa transação | Sem ela, um comentário gravado entre as duas consultas faria o `total` não bater com a página |

## Ferramentas e skills usadas

- Claude Code, lendo o plano ("Painel", "Endpoints da API" e "Perfis e permissões"), o ticket 14, o `AGENTS.md`, o registro do ticket 13 e, no front, `src/lib/api/tipos.ts`, `src/mocks/consultas.ts` e `src/features/dashboard/components/blocos.tsx`.
- Docker Desktop: o `postgres-teste` na 5433 para a suíte.
- Nenhuma skill.

## Como foi verificado

No Node 26.13.1, com o pnpm 12.21.0 e o Docker Desktop:

- `pnpm lint`, `pnpm typecheck`, os 443 testes (42 arquivos), `pnpm build` e o Prettier. O `pnpm openapi:exportar` gerou o `openapi.json` desta entrega, e os parâmetros e schemas novos foram lidos à mão.
- A primeira rodada da suíte inteira, logo depois de o Docker Desktop subir, levou 119 s (o normal é uns 47) e teve um teste falhando; a saída dela não foi guardada. As duas rodadas seguintes passaram inteiras, e a falha não se repetiu. Pela demora, a suspeita é um teste que mede tempo com a máquina ainda carregando o Docker, mas não deu para confirmar qual.
- **Os testes pegam o erro:** um roteiro quebrou 34 regras, uma de cada vez, rodou os testes do dashboard e das regras novas e conferiu que algum falhou. Pegou todas.
  - **Categorias:** a ordem pelo nome no lugar da ordem das categorias, a categoria atual da pergunta no lugar da do item e o escopo ignorado.
  - **Contas:** a nota boa a partir de 3 e o percentual truncado.
  - **Ranking:** o mínimo de 4 e de 6 notas, 2 e 4 pontos por lista, os piores repetindo os melhores ou na ordem dos melhores, cada desempate tirado ou invertido (o %, o total e a categoria), o setor fora do agrupamento dos pontos e o escopo ignorado, na consulta e no service.
  - **Comentários:** do mais antigo para o mais recente, sem o filtro do tipo, sem o escopo, sem os filtros do painel, sem a página, sem o limite, o total só da página e 20 por página no padrão.
  - **Rotas:** o `authorize` e o `setorScope` tirados das três, e o `comentarios:ver` dos comentários.
- O banco de desenvolvimento não foi usado, e o Swagger não foi aberto no navegador.
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **Além do ticket:** a `pagina` nos comentários, o desempate do ranking pelo total e pelo nome, e o limite de 100 comentários por página (o mesmo das outras listas).

## Pendências e dúvidas

- **Front (ticket do dashboard de lá):** as diferenças para o mock:
  - no empate da média e do %, a API desempata pelo número de notas e pelo nome;
  - os comentários aceitam `pagina`, e o `meta.pagina` vem com a página pedida;
  - nada muda nos formatos: os campos são os mesmos dos tipos de `tipos.ts`.
- **Ticket 16 (TV Wall):** os destaques usam o `dashboardService.pontosAvaliados` com o `MINIMO_DE_NOTAS_DO_PONTO`. O mock pega o ponto mais bem avaliado de cada setor, até três; essa escolha fica para lá.
- **Tickets 17 e 18:** a aba de categorias e o PDF usam o `dashboardService.categorias` (ou a consulta dele com os `setorIds`) e o `pontosAvaliados`, para os números baterem com os do painel.
