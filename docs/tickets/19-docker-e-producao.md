# 19 — Imagem Docker e ambiente de produção

**Issue:** [#19](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/19)

**O que construir:** Com os dois repositórios lado a lado num servidor, um único comando sobe o sistema inteiro em homologação ou produção: o Caddy servindo o front com HTTPS e repassando `/api` para a API, a API aplicando as migrations ao iniciar e o PostgreSQL com volume persistente, fechado para a internet. Um backup diário guarda cópias do banco com retenção e uma cópia fora do servidor.

**Bloqueado por:** 04 — Modelo de dados do MVP; WEB 03 — Imagem Docker do front com Caddy (repositório do front)

**Status:** ready-for-agent

**Critérios de aceite:**

- [ ] Dockerfile da API em múltiplos estágios: compila numa imagem completa e roda numa imagem enxuta do Node, com um usuário sem privilégios; ao iniciar, aplica as migrations pendentes e só então sobe o servidor.
- [ ] Compose de produção com os serviços `caddy` (construído a partir do repositório do front, ao lado), `api`, `postgres` 18 (volume persistente, sem porta exposta para fora) e `backup`; as variáveis vêm de um `.env` do servidor, documentado no `.env.example`.
- [ ] Verificações de saúde: a API só sobe com o PostgreSQL saudável, e o compose usa `/api/health` para saber se a API está de pé.
- [ ] Backup diário às 3h com `pg_dump`, no formato próprio do PostgreSQL, mantendo 7 cópias diárias e 4 semanais e mandando uma cópia para fora do servidor (destino configurável).
- [ ] Passo a passo de restauração com `pg_restore`, testado numa base vazia.
- [ ] Logs dos containers com rotação, para não encher o disco.
- [ ] O README explica como publicar uma versão: `git pull` nos dois repositórios e um único comando do compose na pasta da API.
- [ ] Testado localmente: o compose sobe tudo, o front abre pelo Caddy, `/api/health` responde e uma pesquisa enviada chega ao banco.
