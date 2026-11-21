# 16 — TV Wall: telas e indicadores

**Issue:** [#16](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/16)

**O que construir:** O Super Admin cadastra as TVs do hospital e recebe, uma única vez, o token do link de cada uma. A TV abre esse link e mostra os números gerais da pesquisa, atualizados a cada 30 segundos. A API nunca devolve à TV comentários, reclamações ou dados pessoais, e desativar a tela faz o link parar de funcionar na hora.

**Bloqueado por:** 14 — Dashboard: categorias, melhores e piores pontos e comentários

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] `GET /tv-telas`, `POST /tv-telas` e `PATCH /tv-telas/:id/status` exigem `tvwall:gerenciar`; as telas vêm como `{ id, nome, ativa, ultimoAcessoEm }`.
- [ ] `POST /tv-telas` valida o nome (onde a tela fica) e devolve 201 com `{ tela, token }`; o token é aleatório, só aparece nessa resposta e só o hash dele fica no banco. O link `/tv#<token>` é montado pelo front.
- [ ] `PATCH /tv-telas/:id/status` recebe `{ ativa }` e responde 204.
- [ ] `GET /tv/indicadores` autentica pelo cabeçalho `X-Tv-Token`; token desconhecido ou de tela inativa devolve 401 com "Esta tela não está ativa.". O último acesso da tela é atualizado no máximo a cada 5 minutos.
- [ ] A resposta segue o formato que o front já usa: `tela` (o nome), `geradoEm`, `mes` (NPS, total, promotores, neutros, detratores e média das notas do mês corrente, pela data do atendimento), `npsPorSetor` (`setor`, `nps`, `total`), `evolucao` (semanal, nas últimas 12 semanas) e `destaques` (o ponto mais bem avaliado de até 3 setores diferentes nos últimos 30 dias, com 5 notas ou mais: `setor`, `categoria`, `media`, `percentual45`).
- [ ] Os indicadores da TV juntam todos os setores, sem escopo de usuário, e não têm nenhum campo de comentário, telefone ou texto escrito pelo paciente.
- [ ] Testes de integração: token válido, inválido e de tela desativada, e a resposta sem nenhum campo pessoal.
