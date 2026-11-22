# 06 — Setores

**Issue:** [#6](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/6)

**O que construir:** O Super Admin cadastra os setores que têm pesquisa própria: cria, edita o nome, o endereço (slug) e a descrição, e ativa ou desativa. Quem não gerencia setores, como o gestor, vê só os seus, em modo leitura. É do slug que saem os links da pesquisa e do totem e o QR Code.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor

**Status:** done

**Critérios de aceite:**

- [x] `GET /setores` devolve os setores que a pessoa enxerga (todos para Super Admin e Ouvidoria, só os seus para Gestor e Visualizador), ativos e inativos, em ordem alfabética, no formato `{ id, nome, slug, descricao, ativo }`, sem paginação.
- [x] `POST /setores` e `PATCH /setores/:id` exigem `setores:gerenciar` e validam nome com pelo menos 2 caracteres e slug só com letras minúsculas, números e hífen (erros em `nome` e `slug`); a descrição é opcional e, vazia, vira `null`.
- [x] Slug repetido devolve 409 `CONFLITO` com "Já existe um setor com este endereço. Escolha outro.".
- [x] `PATCH /setores/:id/status` recebe `{ ativo }` e responde 204; o setor desativado sai da pesquisa pública, mas o histórico dele continua. (A pesquisa pública ainda não existe: o 404 para o setor inativo é critério do ticket 10. Aqui, desativar só muda o `ativo`, e nada é apagado.)
- [x] Setor inexistente devolve 404.
- [x] Testes de integração com cada perfil: quem cria e edita, quem só lista e o gestor vendo só os seus setores.
