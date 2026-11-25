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

## Produção e homologação

Num servidor, o sistema inteiro sobe com um comando, na pasta da API, pelo [`infra/docker-compose.prod.yml`](infra/docker-compose.prod.yml). A homologação e a produção usam o mesmo compose; o que muda é o `infra/.env` de cada servidor.

| Serviço | O que é |
| --- | --- |
| `caddy` | O front, com HTTPS emitido e renovado pelo Caddy, e o `/api` repassado para a API. A imagem é gerada a partir do repositório do front, que fica ao lado deste (o README de lá explica a imagem) |
| `api` | A API, gerada pelo [`Dockerfile`](Dockerfile) desta pasta. Ao iniciar, aplica as migrations pendentes e o seed base (que só cria o que falta) e só então sobe o servidor; só fica "saudável" quando o `/api/health` responde, e o Caddy espera por isso |
| `postgres` | O PostgreSQL 18, em UTC e UTF-8, com os dados no volume `postgres-dados` e sem nenhuma porta aberta para fora: só a API e o backup o alcançam |
| `backup` | O `pg_dump` diário às 3h (Brasília), com 7 cópias diárias, 4 semanais e uma cópia fora do servidor. Os scripts ficam em [`infra/backup/`](infra/backup/) |

Os logs de todos os containers ficam em JSON no disco do Docker, com rotação: no máximo 5 arquivos de 10 MB por container.

### Primeira publicação

O servidor precisa do Docker com o plugin do compose, ligado na inicialização do sistema (`sudo systemctl enable docker`, para os containers voltarem sozinhos depois de um reinício), do domínio apontando para ele e das portas 80 e 443 (TCP e UDP) abertas.

1. Clone os dois repositórios lado a lado, na `main`:

   ```bash
   git clone https://github.com/GabrielPittaBr/fhdod-satisfacao-api.git
   git clone https://github.com/GabrielPittaBr/fhdod-satisfacao-web.git
   cd fhdod-satisfacao-api
   ```

2. Crie o `infra/.env` a partir do modelo e preencha cada variável, como o [`infra/.env.example`](infra/.env.example) explica: o domínio, os segredos (gerados só para este servidor, com os comandos do modelo), o primeiro Super Admin e o destino do backup. Guarde os segredos também fora do servidor: sem a `ENCRYPTION_KEY`, os telefones gravados não se leem mais, nem os das cópias do backup.

   ```bash
   cp infra/.env.example infra/.env
   chmod 600 infra/.env
   ```

3. Configure a cópia de fora do servidor: o remoto do rclone vai no `infra/backup/rclone.conf`, a partir do [modelo](infra/backup/rclone.conf.example), com o S3 e o SFTP, e o caminho, no `BACKUP_DESTINO` do `infra/.env`. O arquivo é lido pelo usuário do container do backup (uid 70):

   ```bash
   cp infra/backup/rclone.conf.example infra/backup/rclone.conf
   # preencha o rclone.conf e depois:
   sudo chown 70 infra/backup/rclone.conf && sudo chmod 600 infra/backup/rclone.conf
   ```

4. Suba tudo. O `--wait` só termina quando todos os serviços estão de pé e saudáveis, ou diz qual não subiu:

   ```bash
   docker compose -f infra/docker-compose.prod.yml up -d --build --wait
   ```

5. Confira: `https://<domínio>/api/health` responde `{"data":{"status":"ok","banco":"ok"}}`; o Super Admin entra no painel com o e-mail e a senha do `infra/.env` e troca a senha; uma pesquisa de teste, num setor criado pelo painel, aparece no dashboard.
6. Confira o backup: `docker compose -f infra/docker-compose.prod.yml exec backup backup.sh` grava uma cópia na hora e a manda para fora do servidor. O agendador já roda um backup quando o container sobe depois das 3h, mas, na primeira publicação, ele pode copiar o banco antes de a API criar as tabelas.
7. Com a conta do Super Admin criada, apague do `infra/.env` o `SEED_ADMIN_EMAIL` e o `SEED_ADMIN_PASSWORD`.

### Publicar uma versão

Depois de a versão entrar na `main` dos dois repositórios (se o contrato mudou, a da API vai primeiro):

```bash
git -C ../fhdod-satisfacao-web pull
git pull
docker compose -f infra/docker-compose.prod.yml up -d --build --wait
```

O compose gera de novo as imagens que mudaram e troca só os containers delas. A API aplica as migrations novas ao subir; enquanto ela reinicia, por alguns segundos, o Caddy responde com erro. Os certificados ficam no volume do Caddy. As imagens antigas continuam no disco: `docker image prune` as apaga.

### No dia a dia

Todos os comandos rodam na pasta da API. Com `export COMPOSE_FILE=infra/docker-compose.prod.yml` no terminal, basta `docker compose ps`, sem o `-f`.

| Comando | O que faz |
| --- | --- |
| `docker compose -f infra/docker-compose.prod.yml ps` | Mostra cada serviço e se está saudável |
| `docker compose -f infra/docker-compose.prod.yml logs -f api` | Acompanha os logs da API (ou de `caddy`, `postgres` e `backup`) |
| `docker compose -f infra/docker-compose.prod.yml restart api` | Reinicia a API |
| `docker compose -f infra/docker-compose.prod.yml down` | Para tudo, sem apagar nada. **Nunca use `down -v`**: ele apaga os volumes, com o banco e as cópias do backup |

Para trocar a senha do banco, mude-a primeiro no PostgreSQL (`docker compose -f infra/docker-compose.prod.yml exec postgres psql -U app -d satisfacao` e, lá dentro, `\password app`), depois no `POSTGRES_PASSWORD` do `infra/.env`, e rode o `up -d --wait` de novo. O `POSTGRES_PASSWORD` só vale sozinho na criação do volume.

### Dados de demonstração na homologação

Com as cinco variáveis `DEMO_PASSWORD_*` no `infra/.env` (a homologação roda em production, e o comando as exige), rode o comando dos dados de demonstração dentro do container da API, com a confirmação na linha do comando, como na máquina:

```bash
docker compose -f infra/docker-compose.prod.yml exec -e DEMO_CONFIRM=satisfacao api node dist/demonstracao.js
```

**Nunca em produção:** ele apaga e grava de novo os setores de demonstração, achados pelo endereço (ver "Dados de demonstração", acima).

### Backup

Todo dia às 3h, no horário de Brasília, o container `backup` grava uma cópia do banco com o `pg_dump`, no formato próprio do PostgreSQL, e a confere com o `pg_restore` antes de substituir a do dia. As cópias ficam no volume `backups`:

- `diarios/fhdod-AAAA-MM-DD.dump`: uma por dia, as 7 mais recentes;
- `semanais/fhdod-AAAA-Wss.dump`: a última de cada semana (de segunda a domingo), trocada a cada backup da semana; as 4 mais recentes. Quando a semana acaba, fica a do domingo.

Depois, o rclone manda para o `BACKUP_DESTINO` o que ainda não está lá e apaga de lá as cópias que saíram da retenção. Ele nunca espelha a pasta: se o volume dos backups for apagado por engano, as cópias de fora continuam.

Se o servidor estava desligado às 3h, o backup do dia roda assim que ele volta; se um backup falhar, ele tenta de novo a cada 30 minutos. O `docker compose -f infra/docker-compose.prod.yml ps` mostra o `backup` como `unhealthy` quando a última tentativa falhou ou quando o último backup bom tem mais de 26 horas; o motivo está no `logs backup`.

| Comando (com `docker compose -f infra/docker-compose.prod.yml` na frente) | O que faz |
| --- | --- |
| `exec backup backup.sh` | Faz um backup na hora (substitui a cópia do dia) |
| `exec backup ls -l /backups/diarios /backups/semanais` | Lista as cópias do servidor |
| `cp backup:/backups/diarios/fhdod-AAAA-MM-DD.dump .` | Copia uma cópia do volume para a pasta atual |
| `run --rm backup rclone lsf -R fora:fhdod-backups` | Lista as cópias de fora (com o remoto e a pasta do seu `BACKUP_DESTINO`) |

As cópias têm as avaliações e os comentários dos pacientes, e os telefones cifrados. O destino de fora precisa ser de confiança, de preferência no Brasil, e a `ENCRYPTION_KEY` nunca vai junto com elas. Para o destino guardar só arquivos cifrados, o `rclone.conf.example` mostra um remoto `crypt`.

### Restaurar um backup

O [`restaurar.sh`](infra/backup/restaurar.sh) restaura uma cópia com o `pg_restore` num banco vazio: cria o banco se ele não existir e para se ele já tiver tabelas, sem apagar nada. A restauração é feita numa transação só: ou a cópia entra inteira, ou o banco fica como estava. No fim, ele mostra quantos setores, usuários e respostas entraram e a data da resposta mais recente. O teste mensal na homologação, que o plano pede, é o primeiro caso abaixo.

**Conferir uma cópia, num banco à parte**, sem mexer no banco da API:

```bash
docker compose -f infra/docker-compose.prod.yml run --rm backup restaurar.sh /backups/diarios/fhdod-AAAA-MM-DD.dump satisfacao_restaurada
docker compose -f infra/docker-compose.prod.yml exec postgres dropdb -U app satisfacao_restaurada
```

**Voltar o banco da API para uma cópia.** Tudo o que entrou depois dela se perde, por isso o passo 2 guarda o estado atual antes:

1. Pare quem grava no banco: `docker compose -f infra/docker-compose.prod.yml stop caddy api backup`.
2. Guarde o banco como está: `docker compose -f infra/docker-compose.prod.yml run --rm backup pg_dump --format=custom --file=/backups/antes-da-restauracao.dump`.
3. Apague o banco: `docker compose -f infra/docker-compose.prod.yml exec postgres dropdb -U app satisfacao`.
4. Restaure a cópia, que cria o banco de novo: `docker compose -f infra/docker-compose.prod.yml run --rm backup restaurar.sh /backups/diarios/fhdod-AAAA-MM-DD.dump`.
5. Suba tudo: `docker compose -f infra/docker-compose.prod.yml up -d --wait`.

**Num servidor novo**, com o servidor antigo perdido, a cópia vem de fora:

1. Faça os passos 1 a 3 da primeira publicação, com a mesma `ENCRYPTION_KEY` do servidor antigo. Sem ela, os telefones da cópia não se leem.
2. Suba só o banco, que nasce vazio: `docker compose -f infra/docker-compose.prod.yml up -d --build --wait postgres`.
3. Traga a cópia de fora para o volume: `docker compose -f infra/docker-compose.prod.yml run --rm backup rclone copy fora:fhdod-backups/producao/diarios/fhdod-AAAA-MM-DD.dump /backups/restaurar/` (com o caminho do seu `BACKUP_DESTINO`).
4. Restaure: `docker compose -f infra/docker-compose.prod.yml run --rm backup restaurar.sh /backups/restaurar/fhdod-AAAA-MM-DD.dump`.
5. Suba o resto: `docker compose -f infra/docker-compose.prod.yml up -d --build --wait`. As migrations da cópia já estão aplicadas, e o seed base não cria nada, porque o banco já tem usuários.
