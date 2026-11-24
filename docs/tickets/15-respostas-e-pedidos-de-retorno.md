# 15 — Respostas e pedidos de retorno no painel

**Issue:** [#15](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/15)

**O que construir:** A Ouvidoria e os gestores consultam as avaliações uma a uma, com filtros e ordenação, e abrem o detalhe com as perguntas como o paciente viu, a nota de cada uma, o comentário e o telefone mascarado. A Ouvidoria e o Super Admin veem os pedidos de retorno e, quando precisam ligar, revelam o número completo, e essa ação fica registrada.

**Bloqueado por:** 11 — Comentário e pedido de retorno depois do envio; 13 — Dashboard: filtros, resumo, NPS por setor e evolução

**Status:** done

**Critérios de aceite:**

- [x] `GET /respostas` exige `respostas:ver` e respeita o escopo. Aceita os filtros do painel (todos opcionais aqui), `classificacao`, `comComentario`, `comRetorno`, `pagina`, `porPagina` (padrão 20), `ordenarPor` (`dataAtendimento`, `enviadoEm` ou `nps`; padrão `enviadoEm`) e `ordem` (`asc` ou `desc`; padrão `desc`).
- [x] Cada linha vem como `{ id, setorId, setor, canal, dataAtendimento, turno, nps, classificacao, enviadoEm, temComentario, pediuRetorno }`, com `meta`.
- [x] `GET /respostas/:id` traz também `itens` (`perguntaId`, `perguntaTexto`, `categoria`, `tipo`, `valorNumero`, `valorTexto` e `classificacao`, esta só nas notas de 1 a 5), `comentario` e `contato` (`id`, `telefoneMascarado`, `status`). Resposta de setor fora do escopo devolve 403, e inexistente, 404.
- [x] O telefone aparece sempre mascarado nas listas e no detalhe, como `•••• 0042`, montado com os 4 últimos dígitos, sem decifrar.
- [x] `GET /contatos` exige `contatos:ver` e devolve os pedidos de retorno, os mais recentes primeiro, no formato `{ id, respostaId, setor, dataAtendimento, nps, classificacao, comentario, telefoneMascarado, consentimentoEm, status }`, paginados e com filtros de período e setor.
- [x] `POST /contatos/:id/revelar-telefone` exige `contatos:ver`, devolve `{ telefone }` completo e registra na auditoria quem revelou e quando.
- [x] Testes de integração: filtros e ordenação, escopo do gestor, Visualizador sem acesso às respostas, Gestor sem acesso aos pedidos de retorno, máscara do telefone e auditoria ao revelar.
