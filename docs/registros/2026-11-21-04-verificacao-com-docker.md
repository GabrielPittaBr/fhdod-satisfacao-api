# Verificação da fundação com Docker

21/11/2026 · Agente (Claude Code)

> Pendência do [registro 02](2026-11-21-02-fundacao-da-api.md), do ticket [02](../tickets/02-fundacao-da-api.md), issue [#2](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/2). O `docker-compose.yml` ainda não tinha rodado em nenhuma máquina.

## O que foi feito

Tudo na `develop` do merge do PR #23, no Node 26.13.1 (instalador oficial, pelo winget) e no Docker 29.9.3 (Docker Desktop).

- **Compose:** `docker compose up -d --wait` deixou os dois PostgreSQL 18.7 (imagem Debian) saudáveis pelo healthcheck.
- **Os dois bancos:** `SHOW timezone` e `SHOW log_timezone` dão `UTC`, e `SHOW server_encoding` dá `UTF8`. A collation é `en_US.utf8`, e o contêiner tem `TZ` e `PGTZ` em UTC. A ordenação com acento sai certa: "ana, Ângela, eduardo, Érico, olaria, Ótica, Zélia".
- **Dados:** depois de um `docker compose down` e um novo `up`, o banco de desenvolvimento manteve uma tabela criada para o teste. Os dados ficam no volume `postgres-dados`, em `/var/lib/postgresql/18/docker`. O banco de teste voltou vazio, porque usa tmpfs.
- **Projeto do zero:** `pnpm install --frozen-lockfile` sem `node_modules`, depois `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`. Os 52 testes passaram sem `TEST_DATABASE_URL` definido, ou seja, contra o `postgres-teste` do compose.
- **Prova de que os testes usam o banco do Docker:** com o `postgres-teste` parado, `pnpm test --project integration` para no `tests/setup.ts`, com o aviso para subir o banco. Religado o banco, os 22 testes de integração passam.
- **API no ar:** `pnpm dev`, com o `.env` copiado do `.env.example`.
  - `/api/health` com o banco no ar: 200, `{ "data": { "status": "ok", "banco": "ok" } }`.
  - Banco de desenvolvimento parado: 503, com `indisponivel`, em 33 ms. A falha vai para o log com `code: ECONNREFUSED`, sem a senha nem o endereço do banco.
  - Banco de volta: 200 de novo, sem reiniciar a API.
  - Rota inexistente: 404 `NAO_ENCONTRADO`.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| Nesta verificação, o banco de desenvolvimento subiu na porta 5434, com um override fora do repositório (`ports: !override`), e o `DATABASE_URL` do `.env` local apontou para ela | A máquina tem um PostgreSQL 19 instalado como serviço do Windows, ouvindo na 5432 em todas as interfaces, e o Docker não consegue essa porta. Parar o serviço mexeria num banco que não é deste projeto. O banco de teste (5433) e o `docker-compose.yml` não mudaram |
| Nenhuma mudança no código | Tudo passou como estava na `develop` |

## Ferramentas e skills usadas

- Claude Code, com o Docker Desktop e o winget.
- Nenhuma skill.

## O que mudou em relação ao plano

- Nada.

## Pendências e dúvidas

- **Porta 5432 ocupada.** Quem já tem um PostgreSQL instalado na máquina não consegue subir o `postgres` do compose como está: o `docker compose up -d` falha com "ports are not available", e o `DATABASE_URL` padrão acaba apontando para o PostgreSQL da máquina, não para o do Docker. Uma variável para a porta no compose, com 5432 como padrão, resolveria. A decidir.
