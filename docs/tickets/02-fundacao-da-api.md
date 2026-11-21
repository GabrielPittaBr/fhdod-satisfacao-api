# 02 — Fundação: API no ar respondendo `/api/health`

**Issue:** [#2](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/2)

**O que construir:** Qualquer pessoa clona o repositório, sobe o PostgreSQL com um comando e roda a API em modo de desenvolvimento. `GET /api/health` diz se a API e o banco estão no ar. Toda requisição já passa pela cadeia de middlewares do plano: ganha um ID, aparece no log sem dados sensíveis e, se algo der errado, volta no formato padrão de erro. É o caminho por onde todas as rotas dos próximos tickets vão passar.

**Bloqueado por:** 01 — Configuração dos agentes e do fluxo de trabalho

**Status:** done

**Critérios de aceite:**

- [x] Projeto com pnpm, TypeScript em modo strict, ESLint e Prettier com a mesma configuração do front, `.editorconfig` e versão do Node fixada; scripts para desenvolvimento com recarga, build, lint, checagem de tipos, testes e os comandos do banco.
- [x] Antes de cada commit, o lint roda nos arquivos alterados e a mensagem é conferida no padrão Conventional Commits; mensagem com coautoria do Claude é recusada.
- [x] `docker compose up` sobe o PostgreSQL 18 de desenvolvimento, em UTC e UTF-8, e um banco separado para os testes.
- [x] O Prisma acessa o PostgreSQL por um cliente único, compartilhado pela API toda.
- [x] As variáveis de ambiente são validadas ao iniciar: se faltar alguma, a API nem sobe e diz qual falta. O `.env.example` documenta todas, sem valores reais.
- [x] A cadeia de middlewares segue a ordem do plano: ID da requisição devolvido em `X-Request-Id`, log de entrada e saída, cabeçalhos de segurança, CORS só para a origem configurada, corpo JSON de até 100 kB e leitura de cookies; as rotas ficam sob `/api/v1`, com o 404 e o tratador de erros no fim.
- [x] Sucesso no formato `{ data }`, e listas paginadas com `meta: { pagina, porPagina, total }`.
- [x] Erros sempre no formato `{ erro: { codigo, mensagem, detalhes, requestId } }`: dados inválidos viram 400 `VALIDACAO`, com um item em `detalhes` por campo e `campo` igual ao caminho do campo no corpo (`nome`, `contato.telefone`); rota inexistente vira 404 `NAO_ENCONTRADO`; erro inesperado vira 500 `ERRO_INTERNO`, com mensagem genérica e o detalhe só no log.
- [x] Os códigos de erro são os que o front já trata: `VALIDACAO`, `NAO_AUTENTICADO`, `SEM_PERMISSAO`, `NAO_ENCONTRADO`, `CONFLITO`, `LIMITE_ATINGIDO` e `ERRO_INTERNO`.
- [x] Um middleware aplica os schemas Zod de corpo, query e parâmetros e entrega os dados já convertidos ao controller.
- [x] Logs em JSON com `requestId`, rota, status e duração, sem nunca mostrar `authorization`, `cookie`, `x-tv-token`, `x-complemento-token`, senha ou telefone.
- [x] `GET /api/health` responde 200 com o banco no ar e 503 sem ele.
- [x] Ao receber o sinal de parada, a API termina as requisições em curso e fecha a conexão com o banco.
- [x] Testes de integração (Vitest e Supertest, sem subir servidor, contra o banco de teste) cobrem o health, o 404 e os formatos de erro.
- [x] O README explica como rodar a API do zero em poucos comandos, e o `AGENTS.md` ganha a seção com os comandos do projeto.
