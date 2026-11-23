# 07 — Categorias e turnos

**Issue:** [#7](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/7)

**O que construir:** O Super Admin mantém as categorias, que permitem comparar etapas iguais entre setores (Recepção, Triagem...), e os turnos, que o paciente escolhe na pesquisa e que o totem calcula sozinho pelo horário. Todos os perfis logados podem ler as duas listas.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor

**Status:** done

**Critérios de aceite:**

- [x] `GET /categorias` (qualquer pessoa logada) devolve `{ id, nome, ordem, ativa }` na ordem definida; `POST /categorias` e `PATCH /categorias/:id` exigem `categorias:gerenciar`.
- [x] A categoria nova entra no fim da ordem; o `PATCH` muda o nome, desativa ou faz os dois (`{ nome?, ativa? }`).
- [x] O nome tem pelo menos 2 caracteres, e um nome repetido, mesmo com maiúsculas diferentes, devolve 409 com "Já existe uma categoria com este nome.".
- [x] `GET /turnos` (qualquer pessoa logada) devolve `{ id, nome, horaInicio, horaFim, ordem }` na ordem; `POST /turnos` e `PATCH /turnos/:id` exigem `turnos:gerenciar` e recebem o nome e os horários.
- [x] Horários no formato `HH:mm` (erros em `horaInicio` e `horaFim`), com o fim diferente do início; o fim pode ser menor que o início, no turno que passa da meia-noite.
- [x] Turnos não são desativados nem apagados, como no plano.
- [x] Testes de integração das regras e das permissões.
