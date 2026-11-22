# 05 — Login, sessão e acesso por perfil e setor

**Issue:** [#5](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/5)

**O que construir:** Quem trabalha no hospital entra no painel com e-mail e senha e continua logado ao recarregar a página, sem digitar a senha de novo. A cada requisição, a API sabe quem é a pessoa, o que o perfil dela permite e quais setores ela enxerga, e barra o resto. No primeiro acesso, a troca da senha provisória é obrigatória. O primeiro Super Admin nasce do seed.

**Bloqueado por:** 03 — Contrato: Swagger, `openapi.json` e CI; 04 — Modelo de dados do MVP

**Status:** done

**Critérios de aceite:**

- [x] `POST /auth/login` confere a senha (argon2id) e devolve `{ data: { tokenAcesso } }`, um JWT de 15 minutos. O refresh token (aleatório, 7 dias) vai num cookie `HttpOnly`, `Secure` e `SameSite=Strict`, válido só em `/api/v1/auth`, e só o hash dele fica no banco. O e-mail vale com qualquer combinação de maiúsculas.
- [x] E-mail ou senha errados, ou usuário inativo, devolvem 401 com "E-mail ou senha incorretos.". Depois de 5 tentativas em 15 minutos para o mesmo IP e e-mail, a resposta é 429 `LIMITE_ATINGIDO` com "Muitas tentativas. Espere 15 minutos e tente de novo.".
- [x] `POST /auth/refresh` troca o refresh a cada uso (o antigo é revogado e aponta para o novo) e devolve um novo token de acesso; refresh vencido, revogado ou de usuário inativo devolve 401.
- [x] `POST /auth/logout` revoga todos os refresh tokens da pessoa, apaga o cookie e responde 204.
- [x] `GET /auth/me` devolve o formato que o front já usa: `usuario` (`id`, `nome`, `email`, `perfil`, `trocarSenha`), `permissoes`, `setores` (`id`, `nome`; vazio quando a pessoa enxerga todos) e `todosSetores`.
- [x] `PATCH /auth/senha` exige a senha atual (erro em `senhaAtual`) e uma nova com no mínimo 10 caracteres, misturando letras e números (erro em `novaSenha`). A troca desliga a obrigação de trocar, revoga as outras sessões e grava um refresh novo, para quem trocou continuar logado.
- [x] O mapa de permissões por perfil é o da tabela do plano e existe só na API; Super Admin e Ouvidoria enxergam todos os setores, Gestor e Visualizador só os seus.
- [x] As permissões não ficam dentro do token: a cada requisição, a API lê o perfil e os setores no banco, e uma mudança feita pelo Super Admin vale na hora.
- [x] Middlewares prontos para as próximas rotas: autenticação (sem token, token vencido ou usuário inativo → 401 `NAO_AUTENTICADO`), exigência de permissão (→ 403 `SEM_PERMISSAO`) e escopo de setor (setor fora dos da pessoa → 403).
- [x] Cada login com sucesso vai para a auditoria e atualiza o último login do usuário.
- [x] O seed base cria o primeiro Super Admin com o e-mail e a senha de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.
- [x] Testes de integração: login, refresh com troca do token, refresh antigo recusado, logout, `/auth/me` de cada perfil, troca de senha e limite de tentativas; testes unitários do mapa de permissões.
