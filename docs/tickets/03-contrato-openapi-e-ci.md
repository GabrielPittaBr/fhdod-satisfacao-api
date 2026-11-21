# 03 — Contrato: Swagger, `openapi.json` e CI

**Issue:** [#3](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/3)

**O que construir:** A documentação da API sai dos mesmos schemas Zod que validam as rotas, então nunca fica desatualizada. Quem desenvolve vê tudo no Swagger em `/api/docs`, e o front gera os seus tipos a partir do `openapi.json` commitado na raiz do repositório. A cada pull request, o CI confere lint, tipos, testes contra um PostgreSQL de verdade, se o `openapi.json` bate com o código e se o build passa.

**Bloqueado por:** 02 — Fundação: API no ar respondendo `/api/health`

**Status:** done

**Critérios de aceite:**

- [x] Swagger UI em `/api/docs` e o documento OpenAPI em `/api/docs/openapi.json`, ligados em desenvolvimento e homologação e desligados por padrão em produção (`DOCS_ENABLED`).
- [x] Cada módulo registra as próprias rotas na documentação com os mesmos schemas Zod que as validam; o `/api/health` é a primeira rota registrada.
- [x] O erro padrão é um componente do documento, usado nas respostas de erro de todas as rotas.
- [x] Os schemas que viram tipos no front são registrados com nome, os mesmos nomes dos tipos que o front já usa (por exemplo, `Setor`, `Pergunta`, `Sessao`, `PesquisaPublica`, `RespostaCriada`, `Resumo` e `IndicadoresTv`), para o front trocar os tipos escritos à mão pelos gerados sem renomear nada.
- [x] `pnpm openapi:exportar` grava o documento em `openapi.json`, na raiz do repositório, e o arquivo é commitado.
- [x] CI no GitHub Actions a cada pull request e a cada push na `develop` e na `main`: instalação com pnpm e cache, lint, checagem de tipos, testes com um serviço PostgreSQL 18, exportação do contrato (falha se o `openapi.json` mudou sem ser commitado) e build.
- [x] Modelo de pull request com o que mudou, como testar e o link do ticket.
