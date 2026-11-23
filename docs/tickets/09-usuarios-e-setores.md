# 09 — Usuários e seus setores

**Issue:** [#9](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/9)

**O que construir:** O Super Admin cria as contas do painel com uma senha provisória, mostrada uma única vez, define o perfil e os setores de cada pessoa, desativa quem saiu e redefine a senha de quem esqueceu. Desativar ou redefinir a senha encerra na hora as sessões abertas daquela pessoa.

**Bloqueado por:** 05 — Login, sessão e acesso por perfil e setor

**Status:** done

**Critérios de aceite:**

- [x] Todas as rotas exigem `usuarios:gerenciar`.
- [x] `GET /usuarios` devolve `{ id, nome, email, perfil, ativo, trocarSenha, setorIds, ultimoLoginEm }`, em ordem alfabética, sem paginação.
- [x] `POST /usuarios` valida o nome (pelo menos 3 caracteres), o e-mail e o perfil, grava o e-mail em minúsculas e devolve 201 com `{ usuario, senhaProvisoria }`. A senha provisória segue a regra de senha, só aparece nessa resposta e obriga a troca no primeiro acesso. E-mail repetido devolve 409 com "Já existe um usuário com este e-mail.".
- [x] `PATCH /usuarios/:id` edita o nome e o perfil; o e-mail não muda.
- [x] `PUT /usuarios/:id/setores` recebe `{ setorIds }`, recusa setor inexistente (400 em `setorIds`) e responde 204.
- [x] `PATCH /usuarios/:id/status` recebe `{ ativo }` e responde 204. Desativar revoga todas as sessões da pessoa, e ninguém desativa a própria conta (409 com "Você não pode desativar a própria conta.").
- [x] `POST /usuarios/:id/redefinir-senha` gera outra senha provisória, devolve `{ senhaProvisoria }`, obriga a troca e revoga as sessões.
- [x] Mudanças de perfil, de setores, de status e de senha vão para a auditoria, sem nenhuma senha.
- [x] Testes de integração: criação com senha provisória, primeiro login com `trocarSenha`, sessão derrubada ao desativar e as regras acima.
