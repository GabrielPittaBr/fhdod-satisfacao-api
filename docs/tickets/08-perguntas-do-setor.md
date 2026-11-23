# 08 — Perguntas do setor

**Issue:** [#8](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/8)

**O que construir:** O gestor monta a pesquisa dos seus setores, e o Super Admin a de qualquer setor: cria perguntas, edita o texto, a categoria e as opções, muda a ordem e ativa ou desativa. Nada é apagado. Uma pergunta que já tem respostas não muda de tipo, para o histórico não mudar de sentido.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor

**Status:** done

**Critérios de aceite:**

- [x] Todas as rotas exigem `perguntas:gerenciar` e o escopo do setor: o gestor só mexe nos seus setores e recebe 403 nos outros.
- [x] `GET /setores/:setorId/perguntas` devolve as perguntas do setor, ativas e inativas, na ordem, no formato `{ id, setorId, categoriaId, texto, tipo, opcoes, ordem, ativa, temRespostas }`, sem paginação.
- [x] `POST /setores/:setorId/perguntas` e `PATCH /perguntas/:id` validam: texto de 5 a 140 caracteres, categoria existente, um dos quatro tipos e, só na múltipla escolha, de 2 a 5 opções sem repetir (nos outros tipos, `opcoes` é `null`). A pergunta nova entra no fim da ordem.
- [x] Mudar o tipo de uma pergunta que tem respostas devolve 409 com "Esta pergunta já tem respostas, então o tipo não pode mudar. Crie outra pergunta e desative esta.".
- [x] `PUT /setores/:setorId/perguntas/ordem` recebe `{ ids }` com todas as perguntas do setor na nova ordem (lista incompleta → 400 em `ids`) e responde 204.
- [x] `PATCH /perguntas/:id/status` recebe `{ ativa }` e responde 204.
- [x] Criar, editar, reordenar e ativar ou desativar perguntas vai para a auditoria.
- [x] Testes de integração: validações, bloqueio da troca de tipo, ordem e o escopo do gestor.
