# Imagem Docker e ambiente de produção

25/11/2026 · Agente (Claude Code)

> Ticket [19](../tickets/19-docker-e-producao.md), issue [#19](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/19). Com os dois repositórios lado a lado num servidor, um comando sobe o sistema inteiro em homologação ou produção: o Caddy com o front e o HTTPS, a API aplicando as migrations ao iniciar, o PostgreSQL fechado para a internet e um backup diário com retenção e uma cópia fora do servidor.

## O que foi feito

- **A imagem da API** (`Dockerfile` e `.dockerignore`), em três estágios: o build no `node:26`, com o pnpm do `packageManager`; as dependências de produção instaladas de novo no `node:26-alpine`; e a imagem final no `node:26-alpine`, só com o Node, essas dependências, o `dist/`, o schema e as migrations, rodando como o usuário `node`. Ao iniciar, roda o `prisma migrate deploy`, o seed base (`node dist/seed.js`) e só então o servidor, com `exec`, para o Node receber o SIGTERM do Docker. Nenhum `.env` entra na imagem.
- **O build** (`tsup.config.ts`) gera, além do `dist/server.js`, o `dist/seed.js` e o `dist/demonstracao.js`: o seed base e os dados de demonstração rodam no container sem o `tsx`. O código em comum vai para arquivos `chunk-*.js`.
- **O CLI do Prisma** (`prisma`) passou a dependência de produção, porque a API aplica as migrations ao iniciar. O `env.ts` exporta o `VARIAVEIS`, a lista das variáveis que a API lê.
- **O compose de produção** (`infra/docker-compose.prod.yml`, projeto `fhdod-satisfacao-prod`):
  - `caddy`, gerado a partir de `../../fhdod-satisfacao-web`, com o `DOMAIN`, as portas 80, 443 e 443/udp e os volumes dos certificados e da configuração; só sobe com a API saudável;
  - `api`, gerado a partir da pasta da API, com `init: true`, cada variável da API, do seed e da demonstração uma a uma, e o healthcheck no `/api/health` (o `wget` do Alpine); só sobe com o PostgreSQL saudável;
  - `postgres`, o `postgres:18`, em UTC e UTF-8, com o volume `postgres-dados`, o `pg_isready` e nenhuma porta publicada;
  - `backup`, gerado a partir de `infra/backup/`, com o volume `backups`, o fuso de Brasília e a pasta `infra/backup` montada só para leitura, de onde o rclone lê o `rclone.conf`;
  - logs `json-file` com rotação (5 arquivos de 10 MB por container) e `restart: unless-stopped` em todos.
- **As variáveis do servidor** ficam no `infra/.env`, que o compose lê sozinho por estar na pasta dele, com o modelo `infra/.env.example`: cada variável explicada, as obrigatórias vazias (o compose para e diz quais faltam) e os comandos do `openssl` que geram os segredos. O `.env.example` da raiz aponta para ele.
- **O backup** (`infra/backup/`, numa imagem `postgres:18-alpine` com o rclone, como o usuário `postgres`):
  - `agendar.sh`, o processo do container: confere a cada minuto se passou das 3h e se o backup do dia ainda não deu certo; roda também quando o servidor volta depois das 3h e tenta de novo a cada 30 minutos depois de uma falha;
  - `backup.sh`: espera o banco aceitar conexões, grava o `pg_dump` em formato custom numa cópia à parte, confere com o `pg_restore --list` e só então substitui a do dia; troca a da semana; guarda 7 diárias e 4 semanais; manda o que falta para o `BACKUP_DESTINO` com o `rclone copy` e aplica a mesma retenção lá; grava o resultado em `estado` e `ultimo-sucesso`. Um backup de cada vez (`flock`);
  - `restaurar.sh`: restaura uma cópia num banco vazio (criado se não existir), numa transação só, e mostra quantos setores, usuários e respostas entraram;
  - `saude.sh`, o healthcheck: com problema se a última tentativa falhou ou se o último backup bom tem mais de 26 horas;
  - `rclone.conf.example`, com o S3 (e outros compatíveis), o SFTP e o `crypt`, para o destino guardar só arquivos cifrados.
- **O `.gitignore`** deixa de fora o `infra/backup/rclone.conf` e a chave do SFTP; o `infra/.env` já estava coberto pelo `.env`.
- **O teste do compose** (`tests/producao.test.ts`, 4 testes, sem banco): a API recebe todas as variáveis do `env.ts` e as do seed e da demonstração do `.env.example`; o compose só lê do `.env` do servidor variáveis que o `infra/.env.example` explica, e o modelo não tem sobras; e o Caddy e o backup não recebem os segredos da API. São 614 testes (eram 610), em 53 arquivos.
- **Documentação:** a seção "Produção e homologação" no README (o que sobe, a primeira publicação, publicar uma versão, o dia a dia, os dados de demonstração na homologação, o backup e a restauração em três casos); a seção do mesmo nome no `AGENTS.md`, com o comando do build, a regra das variáveis e a linha em "Onde estão as coisas"; e, no plano, a estrutura de `infra/`, o serviço de backup e o passo a passo de publicação.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| O seed base roda a cada subida, depois das migrations | O ticket pede que um único comando suba o sistema inteiro. Sem o seed, a primeira publicação teria um passo à mão para criar as categorias, os turnos, as configurações e o primeiro Super Admin. O seed base só cria o que falta (as categorias e os turnos só com a tabela vazia, as configurações pela chave, o Super Admin só sem usuários) e foi feito para rodar em produção quantas vezes for preciso. Uma configuração nova de uma versão futura entra sozinha |
| O `prisma` (CLI) como dependência de produção | O plano e o ticket pedem que a API aplique as migrations ao iniciar, e isso precisa do CLI e do motor das migrations dentro da imagem. A alternativa era um serviço à parte só para as migrations, que muda o desenho do plano |
| As dependências de produção instaladas de novo no Alpine | O argon2 das senhas e o motor das migrations do Prisma têm um binário para cada sistema. Os do estágio do build são do Debian (glibc) e não rodam no Alpine (musl) |
| `npm pkg delete scripts` antes do `pnpm install --prod` | O `postinstall` do projeto gera o cliente do Prisma (que já está no build) e o `prepare` chama o Husky, que não está nas dependências de produção. Os scripts das dependências continuam rodando, como o que baixa o motor das migrations |
| O seed e a demonstração no build (`dist/seed.js` e `dist/demonstracao.js`) | A imagem não tem o `tsx`, que é de desenvolvimento, e a homologação precisa carregar os dados de demonstração (ticket 20) sem Node no servidor. Era uma pendência do registro do ticket 12 |
| O `.env` do servidor em `infra/.env`, com um modelo próprio | O compose lê o `.env` da pasta do arquivo (conferido com o Compose 5.7), então o comando do plano funciona sem `--env-file`. O modelo da raiz é de desenvolvimento: copiado para um servidor, levaria a `ENCRYPTION_KEY` e o segredo do JWT que estão no repositório. O do servidor vem com os segredos vazios e os comandos para gerá-los |
| As variáveis da API uma a uma no compose, e não um `env_file` | Cada container recebe só o que usa: o Caddy e o backup nunca recebem a `ENCRYPTION_KEY`, e o backup, que manda o banco para fora do servidor, não tem a chave que lê os telefones. O custo (uma variável nova da API entra também no compose) fica coberto pelo `tests/producao.test.ts` |
| `BACKUP_DESTINO` obrigatório, com `nenhum` para dizer que não há cópia de fora | O ticket pede uma cópia fora do servidor. Sem a variável, o compose não sobe: quem publica decide de propósito, e uma produção não fica sem a cópia por esquecimento |
| `CORS_ORIGIN` separado do `DOMAIN` | O `DOMAIN` do Caddy pode ser `:80` ou `localhost` num teste, e a origem precisa do `https://`. A demonstração também a usa para o link da TV |
| O projeto `fhdod-satisfacao-prod` | O compose de desenvolvimento se chama `fhdod-satisfacao` e também tem um serviço `postgres` com o volume `postgres-dados`. Com o mesmo nome, testar o de produção na máquina trocaria o container do banco de desenvolvimento e usaria o volume dele |
| O `postgres:18` (Debian) no banco e o `postgres:18-alpine` no backup | O banco é o mesmo do desenvolvimento e do CI, com o locale UTF-8 de que o índice `lower(nome)` das categorias depende (`AGENTS.md`). O backup só precisa dos clientes da mesma versão (o `pg_dump` 18.7, igual ao servidor), do fuso de Brasília, que a imagem Alpine já traz, e do rclone, que o Alpine tem no `apk` |
| O agendador num laço do `sh`, e não o `crond` | O `crond` do busybox não passa as variáveis do container para as tarefas (a senha do banco, o destino) e manda a saída por e-mail, e não para o log do Docker. O laço confere a cada minuto, então também roda o backup do dia quando o servidor estava desligado às 3h e tenta de novo depois de uma falha |
| As 3h no fuso de Brasília (`TZ` no container do backup) | O plano diz 3h, a hora do hospital. O banco continua em UTC; só o agendamento e o nome das cópias usam o fuso |
| A cópia conferida com o `pg_restore --list` antes de substituir a do dia | Uma cópia pela metade (o banco caiu, o disco encheu) nunca toma o lugar de uma boa. O ticket pede o formato próprio do PostgreSQL, que o `pg_restore` lê |
| A cópia semanal é a mais recente da semana, trocada a cada backup | A primeira versão guardava a primeira cópia da semana. No teste, ela foi a do banco ainda sem tabelas, feita junto com as migrations da primeira publicação, e ficaria assim a semana toda. Com a mais recente, cada semana que termina guarda a do domingo |
| `rclone copy` e a retenção por contagem no destino, nunca o `sync` | Com o `sync`, um volume de backups apagado por engano (um `down -v`, por exemplo) faria o backup seguinte apagar também as cópias de fora. Com o `copy`, elas continuam, e as mais antigas saem pela mesma regra de 7 e 4 |
| O destino num `rclone.conf`, na pasta `infra/backup` montada só para leitura | O rclone fala com qualquer destino (S3 e compatíveis, SFTP, Google Drive...), e as credenciais do destino ficam fora do `.env`, longe dos segredos da API. A pasta montada existe no repositório, então o compose sobe mesmo antes de o arquivo ser criado |
| O remoto `crypt` no modelo | As cópias têm os comentários dos pacientes e os telefones cifrados. O `crypt` faz o destino guardar só arquivos cifrados, com uma senha que não fica com o provedor (LGPD) |
| Um healthcheck no backup | Um backup que falha em silêncio só é descoberto na hora de restaurar. Com ele, o `docker compose ps` mostra `unhealthy`, e o motivo está no log |
| O `restaurar.sh` só restaura num banco vazio, numa transação | O ticket pede a restauração numa base vazia. O script nunca apaga nada: apagar o banco da API é um passo à parte, no README, depois de guardar o estado atual. A transação deixa o banco vazio se o `pg_restore` falhar no meio |
| `--wait` no comando de publicar | Sem ele, o `up -d` termina antes de a API aplicar as migrations, e quem publica não sabe se deu certo. Com ele, o comando só termina com todos os serviços saudáveis, ou diz qual não subiu |
| `init: true` na API e no backup | O `sh` como PID 1 ignora o SIGTERM, e o Prisma abre processos durante as migrations. O init repassa o sinal e recolhe os processos |
| O healthcheck da API com o `wget` do Alpine | A imagem não tem o `curl`. O `wget --spider` do busybox sai com erro no 503, como o teste com o banco parado mostrou. O prazo inicial de 2 minutos cobre as migrations e o seed |
| Sem consultas do Prisma à internet (`CHECKPOINT_DISABLE` e `PRISMA_HIDE_UPDATE_MESSAGE`) | O servidor não precisa avisar ninguém de versão nova nem mandar telemetria a cada subida |

## Ferramentas e skills usadas

- Claude Code, lendo o ticket, o plano, o `AGENTS.md`, o `Dockerfile`, o `Caddyfile` e o README do front, o seed base, o comando da demonstração, o cliente gerado do Prisma e o carregador de configuração do CLI.
- Docker Desktop 29.9.3 com o Compose 5.7.0: as imagens da API, do backup e do front, o compose de produção inteiro na máquina e um destino S3 de teste.
- O navegador do Claude Code, para responder a pesquisa pelo front servido pelo Caddy.
- A skill do navegador embutido; nenhuma outra.

## Como foi verificado

No Windows, com o Docker Desktop, o Node 26.13.1 e o pnpm 12.21.0. O compose de produção subiu com um `.env` de teste fora do repositório (`--env-file`, com segredos gerados para o teste e `DOMAIN=:80`) e um arquivo a mais, também fora do repositório, com um serviço `fora`: o próprio rclone servindo um S3 (`rclone serve s3`), no papel do destino de fora, configurado num `infra/backup/rclone.conf` de teste (apagado no fim).

- **Subida:** `docker compose -f infra/docker-compose.prod.yml up -d --build --wait` terminou com os cinco serviços saudáveis. O log da API mostra a migration aplicada, o seed base (7 categorias, 3 turnos, 8 configurações e 1 Super Admin) e só então "API no ar". Sem o `.env`, o compose parou listando cada variável obrigatória que faltava.
- **Republicar:** o mesmo comando, com uma variável nova, trocou só os containers que mudaram; a API subiu com "No pending migrations to apply" e o seed sem nenhum registro novo.
- **O front pelo Caddy:** `/`, `/s/pronto-atendimento`, `/totem/...`, `/tv` e `/painel/login` responderam o `index.html` sem cache e com zstd; o `/api/health` e o Swagger (`DOCS_ENABLED=true`) chegaram à API; um `/assets/` que não existe deu 404.
- **Uma pesquisa chegou ao banco:** os dados de demonstração foram carregados dentro do container (`exec -e DEMO_CONFIRM=satisfacao api node dist/demonstracao.js`, com as cinco senhas no `.env`; sem a confirmação, ele recusou). No navegador, `http://localhost/s/pronto-atendimento` abriu pelo Caddy, e a avaliação (hoje, tarde, cinco notas, um sim, NPS 10 e um elogio) foi gravada: a resposta 966, com 6 itens e o comentário. Um login pela API, pelo Caddy, devolveu o cookie `Secure` e `HttpOnly`, e a auditoria gravou o IP de quem acessou (o gateway da rede do Docker), e não o do container do Caddy: o `X-Forwarded-For` chega à API.
- **Saúde:** com o PostgreSQL parado, o `/api/health` respondeu 503 pelo Caddy e o `wget` do healthcheck saiu com erro; com o banco de volta, 200, sem reiniciar a API.
- **Segurança e logs:** a API roda como `node` (uid 1000) e o backup como `postgres` (uid 70); só o Caddy publica portas (80, 443 e 443/udp); os quatro serviços têm `json-file` com `max-size` 10m e `max-file` 5. O `docker compose stop api` levou 2 segundos, com "API encerrada" no log.
- **HTTPS:** com `DOMAIN=localhost`, o Caddy emitiu o certificado da autoridade dele, o `/api/health` respondeu por HTTPS e o HTTP redirecionou com 308.
- **Backup:** o primeiro rodou assim que o container subiu (eram 15h30), gravou a cópia do dia e a da semana e as mandou para o destino de teste. Com 12 cópias diárias e 6 semanais de mentira no volume, um backup na hora deixou 7 e 4, aqui e no destino. Com o destino parado, o backup falhou, o `saude.sh` acusou o motivo e, com o destino de volta, o backup seguinte passou e a saúde voltou. A cópia de 120 KB (965 avaliações de demonstração e a do navegador) foi conferida com o `pg_restore`.
- **Agendador:** rodado em containers à parte, com o fuso trocado: em Xangai (2h41 de 26/11) não rodou; em Tóquio (3h42 de 26/11) rodou; com a última tentativa falha há 5 minutos não rodou, e há 31 minutos, rodou. Republicado no mesmo dia, depois de um backup bom, não rodou de novo.
- **Restauração:** o `restaurar.sh` recusou a chamada sem cópia (listando as do servidor), um arquivo que não é cópia, um nome de banco inválido e o banco da API, que não está vazio. Numa base vazia (`satisfacao_restaurada`, criada por ele), restaurou com as mesmas contagens do banco de origem em dez tabelas (6 setores, 35 perguntas, 6 usuários, 966 respostas, 4.904 itens, 261 comentários, 29 pedidos de retorno, 1 linha de auditoria, 2 telas e 8 configurações). Uma cópia trazida do destino de fora com o `rclone copy` também foi restaurada. O roteiro do README para voltar o banco da API a uma cópia (parar, guardar o estado atual, apagar, restaurar e subir) rodou do começo ao fim, e a API voltou sem migrations pendentes.
- **Comandos do README:** `exec backup backup.sh`, `cp backup:/backups/...`, `run --rm backup rclone lsf -R` e os da restauração, cada um rodado como está escrito.
- **O teste do compose pega o erro:** sem uma variável da API no compose, com o segredo do JWT no Caddy e com uma variável que o modelo não explica, o `tests/producao.test.ts` falhou nos três casos.
- `pnpm lint`, `pnpm typecheck`, o Prettier, os 614 testes (53 arquivos) e `pnpm build`. O `pnpm openapi:exportar` não mudou o `openapi.json`: nenhuma rota mudou.
- No fim, os containers, os volumes e as imagens do teste foram apagados (`down -v --rmi local`).
- O CI só roda no GitHub: o resultado fica no PR deste ticket.

## O que mudou em relação ao plano

- **O seed base também roda ao iniciar**, além das migrations (ver "Decisões"). O plano e o ticket falam só das migrations.
- **O comando de publicar tem o `--wait`**, e as variáveis do servidor ficam no `infra/.env`. O plano foi atualizado.
- **O backup tem mais que o `backup.sh`:** o agendador, a restauração, a saúde e o modelo do destino, numa imagem própria. O plano foi atualizado.
- **A imagem da API não é tão enxuta:** tem 787 MB descompactada. O Node 26 sozinho tem 139 MB, e o `node_modules`, 406 MB: perto de 180 MB vêm do CLI do Prisma e do que ele traz para o Studio e o `prisma dev` (que a imagem não usa), e 71 MB, do `@prisma/client`, com os motores de consulta de todos os bancos. É o preço de aplicar as migrations ao iniciar, como o plano pede.

## Pendências e dúvidas

- **Ticket 20 (homologação):** o destino da cópia de fora (o provedor e o bucket, de preferência no Brasil) depende da hospedagem, que ainda não foi escolhida. O teste usou um S3 local; falta um provedor de verdade.
- **O `rclone.conf` no servidor** precisa ser legível pelo usuário 70 (`chown 70`), como o README diz. No Docker Desktop do Windows, as pastas montadas não têm essas permissões, então isso só se confere num servidor Linux.
- **O CI não gera as imagens:** um Dockerfile quebrado por uma dependência nova só aparece no servidor. Um passo `docker build` no CI resolve, ao custo de alguns minutos por PR.
- **A mensagem da demonstração sem a confirmação** diz `DEMO_CONFIRM=<banco> pnpm db:demo`, também dentro do container, onde o comando é outro (o README da homologação tem o certo).
- **Na primeira publicação**, o backup que roda ao subir pode copiar o banco antes de a API criar as tabelas. O README pede um `exec backup backup.sh` depois da pesquisa de teste, e o das 3h já copia tudo.
- **O PR #41** (documentação, ainda aberto) também muda o `AGENTS.md`, em outras seções; quem entrar depois pode precisar resolver um conflito pequeno.
