# SistemaAvaliacaoFHDOD

API do Sistema de Satisfação Hospitalar da FHDOD: Node.js 26, Express 5, Prisma 7 e PostgreSQL 18.

Antes de trabalhar no repositório, leia o [`AGENTS.md`](AGENTS.md): fluxo de branches, padrão de commits, tickets e definição de pronto. As regras de negócio estão no [Plano de Desenvolvimento](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md).

## Como rodar do zero

Precisa de Node.js 26 (a versão fica no `.nvmrc`), pnpm 12 e Docker.

```bash
pnpm install            # dependências, cliente do Prisma e hooks do Git
cp .env.example .env    # variáveis de desenvolvimento, já apontando para o banco do Docker
docker compose up -d    # PostgreSQL 18 de desenvolvimento e de teste
pnpm dev                # API em http://localhost:3333, recarregando a cada alteração
```

Para conferir, abra <http://localhost:3333/api/health>. Com o banco no ar, a resposta é `{"data":{"status":"ok","banco":"ok"}}`; sem ele, o status é 503.

Os testes rodam com `pnpm test`, depois do `docker compose up -d`. Os outros comandos estão no `AGENTS.md`, em "Comandos do projeto".
