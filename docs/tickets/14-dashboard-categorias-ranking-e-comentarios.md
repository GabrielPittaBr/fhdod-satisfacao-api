# 14 — Dashboard: categorias, melhores e piores pontos e comentários

**Issue:** [#14](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/14)

**O que construir:** O dashboard mostra onde o hospital está bem e onde está mal: a média e o % de notas 4 e 5 de cada categoria, os pontos (setor e categoria) com a melhor e a pior avaliação e os comentários mais recentes, com elogios e reclamações no mesmo destaque. Tudo com os mesmos filtros e o mesmo escopo do ticket 13.

**Bloqueado por:** 11 — Comentário e pedido de retorno depois do envio; 13 — Dashboard: filtros, resumo, NPS por setor e evolução

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] `GET /dashboard/categorias` devolve `{ categoriaId, categoria, media, percentual45, total }` só das categorias com notas no período, na ordem das categorias.
- [ ] `GET /dashboard/ranking` devolve `melhores` e `piores`, até 3 em cada, no formato `{ setorId, setor, categoriaId, categoria, media, percentual45, total }`; só entram pontos com 5 notas ou mais, e nenhum ponto aparece nas duas listas.
- [ ] `GET /dashboard/comentarios` exige também `comentarios:ver`, aceita `tipo` e `porPagina` (padrão 8) e devolve os mais recentes primeiro, no formato `{ id, respostaId, tipo, texto, setor, dataAtendimento, enviadoEm, classificacao }`, com `meta.total`.
- [ ] O cálculo das médias por ponto fica pronto para ser reaproveitado pela TV (destaques) e pelas exportações.
- [ ] Testes de integração: médias, o corte de 5 notas, o filtro por tipo e o Visualizador recebendo 403 nos comentários.
