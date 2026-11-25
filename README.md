# SistemaAvaliacaoFHDOD

API do Sistema de Satisfação Hospitalar da FHDOD: Node.js 26, Express 5, Prisma 7 e PostgreSQL 18.

Antes de trabalhar no repositório, leia o [`AGENTS.md`](AGENTS.md): fluxo de branches, padrão de commits, tickets e definição de pronto. As regras de negócio estão no [Plano de Desenvolvimento](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md).

## Como rodar do zero

Precisa de Node.js 26 (a versão fica no `.nvmrc`), pnpm 12 e Docker.

```bash
pnpm install            # dependências, cliente do Prisma e hooks do Git
cp .env.example .env    # variáveis de desenvolvimento, já apontando para o banco do Docker
docker compose up -d    # PostgreSQL 18 de desenvolvimento e de teste
pnpm db:deploy          # cria as tabelas, aplicando as migrations
pnpm db:seed            # categorias, turnos, configurações e o primeiro Super Admin
pnpm dev                # API em http://localhost:3333, recarregando a cada alteração
```

O primeiro Super Admin entra com o e-mail e a senha de `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`, do `.env`; no primeiro acesso, a troca da senha é obrigatória. Se o seu `.env` é de antes do login, copie dele as variáveis novas do `.env.example`: sem `JWT_ACCESS_SECRET`, a API não sobe.

Para ver os dados, `pnpm db:studio` abre o Prisma Studio em <http://localhost:5555>.

## Dados de demonstração

Para a apresentação e para a homologação, o `pnpm db:demo` grava no banco os mesmos dados que o front mostrava com o mock: os 6 setores (a Maternidade desativada), as perguntas de cada um na ordem da jornada, uma conta de cada perfil, duas telas de TV e cerca de quatro meses de avaliações até hoje, com comentários e pedidos de retorno. Tudo é inventado. Precisa do seed base antes.

O comando apaga e grava de novo os dados de demonstração, então só roda com a confirmação: o nome do banco em `DEMO_CONFIRM`, na mesma linha do comando (no `.env` não vale). Sem ela, ele diz qual banco mudaria e como confirmar.

```bash
DEMO_CONFIRM=satisfacao pnpm db:demo
```

No PowerShell, é `$env:DEMO_CONFIRM='satisfacao'; pnpm db:demo; Remove-Item Env:DEMO_CONFIRM`.

Ao terminar, ele mostra as contas e o link da TV. Na sua máquina, as senhas são estas, que estão no repositório:

| Conta | Perfil | Senha |
| --- | --- | --- |
| `admin@fhdod.example` | Super Admin | `admin-demo-2026` |
| `marta@fhdod.example` | Gestor do Pronto Atendimento e da Internação | `gestor-demo-2026` |
| `renata@fhdod.example` | Ouvidoria | `ouvidoria-demo-2026` |
| `diego@fhdod.example` | Visualizador do Raio-X | `leitura-demo-2026` |
| `luana@fhdod.example` | Gestor do Laboratório, no primeiro acesso (troca a senha ao entrar) | `provisoria-2026` |

A TV abre em `http://localhost:5173/tv#demo-recepcao-fhdod` (o endereço do front é o primeiro do `CORS_ORIGIN`). A outra tela, `demo-corredor-desativada`, está desativada e não abre.

- **Rodar de novo** substitui os dados de demonstração, sem duplicar nada: os setores, as contas e as telas voltam ao que eram, com os mesmos IDs; as perguntas e as avaliações desses setores, também as respondidas depois, são geradas outra vez até a data de hoje. As contas voltam com as senhas de demonstração, e as sessões abertas delas caem. Outros setores, contas e telas, as categorias, os turnos e as configurações ficam como estão.
- **As avaliações** saem com uma semente fixa por dia: rodado no mesmo dia, o comando grava sempre as mesmas, que são as que o mock do front mostrava nesse dia. A classificação usa a regra e os limites de nota baixa da API.
- **Na homologação**, que fica na internet, as senhas do repositório não valem: com `NODE_ENV=production`, o comando exige as cinco variáveis `DEMO_PASSWORD_*` do `.env.example`, uma por conta, e não as mostra no fim.
- **Nunca rode em produção.** Os setores de demonstração são achados pelo endereço (`pronto-atendimento`, `internacao`...): num banco do hospital com setores de mesmo endereço, as avaliações deles seriam apagadas.

Para conferir, abra <http://localhost:3333/api/health>. Com o banco no ar, a resposta é `{"data":{"status":"ok","banco":"ok"}}`; sem ele, o status é 503.

As rotas estão documentadas no Swagger, em <http://localhost:3333/api/docs>. O mesmo documento fica no [`openapi.json`](openapi.json), na raiz: é o contrato de que o front gera os tipos, e o `pnpm openapi:exportar` o grava de novo quando uma rota muda.

Os testes rodam com `pnpm test`, depois do `docker compose up -d`. Em todo pull request, o CI do GitHub Actions roda lint, tipos, testes (com um PostgreSQL 18), contrato e build. Os outros comandos estão no `AGENTS.md`, em "Comandos do projeto".
