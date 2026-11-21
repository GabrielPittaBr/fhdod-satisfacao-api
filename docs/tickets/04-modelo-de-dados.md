# 04 — Modelo de dados do MVP

**Issue:** [#4](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/4)

**O que construir:** O banco ganha as 14 tabelas do MVP descritas no plano, com os tipos, as chaves, as restrições e os índices do PostgreSQL. Um seed base, seguro para rodar em produção, cria o que o sistema precisa para funcionar: as categorias, os turnos provisórios e as configurações padrão. Daqui em diante, as funcionalidades usam o modelo pronto, sem duas pessoas criando migrations ao mesmo tempo.

**Bloqueado por:** 02 — Fundação: API no ar respondendo `/api/health`

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] Schema Prisma com as 14 tabelas do MVP e os enums do plano (perfis, tipos de pergunta, canal, classificação, tipo de comentário e status do retorno), com tabelas e colunas em snake_case.
- [ ] Os tipos que o plano decidiu: instantes em `timestamptz` (`@db.Timestamptz(3)`), `data_atendimento` em `date`, NPS em `smallint`, chave de idempotência em `uuid`, opções das perguntas em `text[]`, e configurações e dados da auditoria em `jsonb`.
- [ ] Os horários dos turnos saem no formato `HH:mm`, e um turno pode terminar antes de começar (o da noite passa da meia-noite).
- [ ] Restrições escritas na migration: `nps` entre 0 e 10, `valor_numero` entre 1 e 5 e índice único sobre `lower(nome)` nas categorias. Testes provam que o banco recusa cada caso inválido.
- [ ] Os índices do plano (`respostas(setor_id, enviado_em)`, `respostas(data_atendimento)`, `resposta_itens(categoria_id)` e `contatos_retorno(status)`) e um índice em cada chave estrangeira usada para buscar registros filhos.
- [ ] Seed base idempotente (rodar duas vezes não duplica nada): as 7 categorias do plano, os turnos provisórios Manhã (07h–13h), Tarde (13h–19h) e Noite (19h–07h) e as 8 configurações com os valores padrão da tabela do plano.
- [ ] Comandos para aplicar as migrations, rodar o seed e abrir o Prisma Studio; o banco de teste é recriado limpo antes da suíte de testes.
