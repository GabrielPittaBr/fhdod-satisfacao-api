# 21 — Pesquisa geral: escolha dos setores e envio de vários setores

**Issue:** [#44](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/44). O número não é o do ticket porque os números de 21 a 43 já eram pull requests.

**O que construir:** Hoje o hospital divulga um link do Google Forms. Nele a pessoa escolhe o setor que quer avaliar e, no fim, pode deixar um telefone para retorno. A pesquisa geral substitui esse link: é o `/avaliar`, no front. A pessoa escolhe um ou mais setores, responde só as perguntas deles e, no fim, dá uma nota de 0 a 10, que vale para todos os setores escolhidos. A API abre a pesquisa com os setores ativos e as perguntas de cada um e grava, num envio só, uma avaliação por setor. Cada avaliação é como a de quem lê o QR Code daquele setor.

**Bloqueado por:** 10 — Pesquisa pública: abertura e envio da avaliação; 11 — Comentário e pedido de retorno depois do envio

**Status:** done

**Critérios de aceite:**

- [x] `GET /publico/pesquisa`, sem login, devolve:
  - os setores ativos, em ordem alfabética, cada um com `nome`, `slug`, `descricao` e as `perguntas` ativas na ordem, no formato da pesquisa do setor;
  - os `turnos`, o `npsTexto` e o `textoLimiteCaracteres`.
  
  Sem setores ativos, a lista vem vazia.
- [x] `POST /publico/respostas` recebe `canal`, `dataAtendimento`, `turnoId`, `nps`, `site` e `setores` (de 1 a 20, cada um com `slug`, `chaveIdempotencia` e `itens`). Devolve 201 com uma avaliação por setor (`slug`, `id`, `classificacao`, `tokenComplemento`, `expiraEm`), na ordem do pedido e sem cache.
- [x] Cada avaliação tem a nota, a data, o turno e o canal do envio, os itens do próprio setor e a classificação pelas notas dele. As avaliações entram numa transação só: com um problema em qualquer setor, nada é gravado.
- [x] A validação traz um item em `detalhes` por problema:
  - setor repetido, inexistente ou desativado, em `setores.N.slug`;
  - chave repetida ou inválida, em `setores.N.chaveIdempotencia`;
  - itens em `setores.N.itens.M`, com as regras do envio de um setor;
  - nota, data, turno, canal e isca, como no envio de um setor.
- [x] As mesmas chaves de novo devolvem as avaliações gravadas, com tokens novos. Dão 409:
  - só parte das chaves gravada;
  - chave usada noutro setor;
  - avaliação já complementada.
- [x] O envio de um setor e o envio geral dividem o mesmo limite por IP, e um envio geral conta uma vez.
- [x] O complemento de qualquer avaliação do envio funciona com o token dela.
- [x] O Plano de Desenvolvimento registra as regras novas: o setor escolhido na pesquisa geral, a nota única para vários setores e o telefone oferecido a todos no fim da pesquisa pela web.
- [x] Testes de integração das duas rotas, `openapi.json` regenerado e registro da entrega.
