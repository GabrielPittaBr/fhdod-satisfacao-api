# README visual e o passo a passo da homologação

25/11/2026 · Agente (Claude Code)

> Prepara o ticket [20](../tickets/20-publicacao-em-homologacao.md), issue [#20](https://github.com/GabrielPittaBr/fhdod-satisfacao-api/issues/20), que continua com o time. Os READMEs da API e do front ficam visuais, com o que o sistema faz e como rodar na máquina, e o da API ganha o passo a passo da homologação numa VPS ou com o banco no Supabase: o hospital já tem um domínio, mas ainda não se sabe como ele hospeda o site.

## O que foi feito

- **O README da API**, reescrito: o logo, as badges das tecnologias e do CI, os prints da pesquisa, do painel e da TV, o que a API faz, um diagrama do sistema (Mermaid), como rodar na máquina, os dados de demonstração e os comandos principais. O resto dos comandos e das regras continua no `AGENTS.md`.
- **A homologação passo a passo**, em "Produção e homologação": o domínio do hospital (como descobrir quem cuida do DNS e o registro a pedir), a escolha entre tudo na VPS e o banco no Supabase, e dez passos, da VPS ao teste com o hospital. O publicar uma versão continua à vista; o dia a dia, o backup e a restauração ficam recolhidos (`<details>`), com o mesmo conteúdo do ticket 19.
- **O banco fora do servidor:** o `infra/docker-compose.banco-externo.yml`, que entra por cima do compose de produção. A API usa o `DATABASE_URL` do `infra/.env`, sem esperar o `postgres`, e o `postgres` e o `backup` ficam no perfil `banco-local`, que ninguém liga. O `infra/.env.example` explica o `DATABASE_URL` (comentado, como as `DEMO_PASSWORD_*`), e o `tests/producao.test.ts` lê os dois composes e ganhou dois testes do arquivo novo.
- **O `AGENTS.md`**, com o banco fora do servidor em "Produção e homologação" e em "Onde estão as coisas".
- **As imagens dos READMEs**, em `docs/imagens/`: o logo do front e os prints do ticket 10 do front, com os dados de demonstração.
- **No front**, o README no mesmo estilo e, no `AGENTS.md` de lá, o `npm install --global pnpm@12` no lugar do `corepack pnpm`, porque o Node 26 não traz mais o Corepack.

## Decisões e por quê

| Decisão | Por quê |
| --- | --- |
| No Supabase, só o banco; a API e o front continuam na VPS | O Supabase hospeda o PostgreSQL (e serviços que o sistema não usa). A API é um processo Node que fica ligado, e o front precisa do Caddy na frente, com o HTTPS e o `/api` no mesmo domínio, como o plano decidiu. O README diz isso antes de qualquer passo, para ninguém esperar o sistema inteiro no Supabase |
| Um arquivo por cima do compose de produção, e não um compose à parte | Ele troca só a URL do banco: toda variável nova da API continua chegando sozinha. O `depends_on: !reset {}` tira a espera pelo `postgres`, e o perfil `banco-local` deixa o `postgres` e o `backup` parados |
| O `POSTGRES_PASSWORD` e o `BACKUP_DESTINO` continuam obrigatórios no caminho do Supabase | O compose interpola o arquivo de produção inteiro antes de juntar os dois (conferido com o Compose 5.7), e os dois usam `${...:?}`. Tirar isso pediria mudar o compose de produção do ticket 19; os comandos do passo 5 já geram a senha, e o `BACKUP_DESTINO` fica `nenhum` |
| O Session pooler do Supabase | A conexão direta é IPv6 nos planos Free e Pro, e os containers da VPS saem por IPv4. O pooler em modo de sessão aceita IPv4 e guarda a sessão inteira, o que as migrations precisam |
| `sslmode=no-verify` na URL do Supabase | O `pg` 8.23 trata o `require` como `verify-full`, e o certificado do Supabase é de uma autoridade própria, que o Node não conhece: com o `require`, a API não conecta. O `no-verify` cifra a conexão sem conferir o certificado, e o motor das migrations do Prisma, que não conhece esse valor, também conecta com TLS. O `verify-full` com o certificado baixado do Supabase (`sslrootcert`) funciona, mas pede o arquivo montado no container; fica para a produção, se ela for para o Supabase |
| Data API desligado, SSL obrigatório e Network Restrictions no Supabase | As tabelas que o Prisma cria no `public` poderiam ficar expostas pela API REST do Supabase, que o sistema não usa. Com o SSL obrigatório, nenhuma conexão sem TLS entra; com a restrição, só o IP do servidor alcança o banco, como no compose, que não abre a porta do `postgres` |
| `COMPOSE_FILE` no `~/.bashrc` | Os comandos ficam iguais e curtos nos dois caminhos. No do Supabase, rodar só com o arquivo de produção sobe um PostgreSQL vazio e liga a API nele; e sem nenhum, na pasta da API, o `docker compose` usa o de desenvolvimento. O README avisa as duas coisas e pede os comandos sem `sudo`, que apagaria a variável |
| A `develop` na homologação e nos clones do README | A `main` dos dois repositórios só tem o commit inicial. A homologação testa a versão candidata, e a aprovada vai para a `main` com tag (ticket 20) |
| O subdomínio no DNS do hospital, sem mexer no site | Como o hospital hospeda o site não importa: quem cuida do DNS cria um registro `A` para o servidor. O README mostra como descobrir quem é (`nslookup -type=NS`) e pede o registro sem o proxy da Cloudflare, que atrapalharia o certificado e faria a API ver o IP dela no lugar do de cada paciente (o limite de envios contaria todos juntos) |
| Os prints do ticket 10 do front | São os mais recentes, com os dados de demonstração da API (tudo inventado), e mostram as três áreas: a pesquisa no celular, o painel e a TV |
| Tabelas, alertas e `<details>` no lugar de parágrafos | O pedido foi um README visual, sem texto massivo. O que é consulta (backup, restauração, falhas, `.env`) fica recolhido; o que é passo a passo fica à vista. O passo do Supabase ficou aberto também porque o GitHub não mostra alertas dentro de um `<details>` |

## Ferramentas e skills usadas

- Claude Code, lendo os READMEs, os `AGENTS.md`, o plano, os tickets 19 e 20, os composes, o `Dockerfile`, o `Caddyfile`, o `env.ts` e o cliente do Prisma.
- A documentação do Supabase (conexão, SSL, Data API, backups e Network Restrictions), lida por um agente de busca, e buscas na web sobre a versão do PostgreSQL do Supabase e a pausa do plano gratuito.
- Docker Desktop 29.9.3 com o Compose 5.7.0, o `postgres:17` e o openssl 3.2, para o banco que imita o do Supabase.
- A API de Markdown do GitHub, para renderizar os READMEs como o GitHub mostra, e o Playwright, para conferir a página, no claro e no escuro.
- A skill do navegador embutido; nenhuma outra.

## Como foi verificado

- **No PostgreSQL 17, o padrão do Supabase:** os 614 testes (53 arquivos) passaram com o `TEST_DATABASE_URL` num `postgres:17` descartável (17.12).
- **O TLS, como no Supabase:** um `postgres:17` com SSL obrigatório (o `pg_hba.conf` só com `hostssl`) e o certificado de uma autoridade criada para o teste, que o Node não conhece:

  | URL | `pg` (a API) | `prisma migrate deploy` |
  | --- | --- | --- |
  | Sem `sslmode` | Recusada: sem TLS | Aplicou |
  | `sslmode=require` | Falhou: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Aplicou |
  | `sslmode=no-verify` | Conectou, com TLSv1.3 | Aplicou |
  | `sslmode=require&uselibpqcompat=true` | Conectou, com TLSv1.3 | Aplicou |
  | `sslmode=verify-full&sslrootcert=<certificado>` | Conectou, com TLSv1.3 | Aplicou |

- **O compose com o banco de fora:** o `docker compose config` mostrou só a `api` e o `caddy` (os quatro com `--profile banco-local`) e, sem o `POSTGRES_PASSWORD` e o `BACKUP_DESTINO`, parou dizendo que faltavam. O `up -d --build --wait`, num projeto à parte (`fhdod-teste-externo`), com `DOMAIN=:80` e o banco de teste numa rede à parte, terminou com os dois serviços saudáveis: a migration, o seed base e "API no ar" no log; o `/api/health` respondeu `ok` pelo Caddy; a conexão da API com o banco, em TLSv1.3 (`pg_stat_ssl`). O comando dos dados de demonstração recusou sem a confirmação e sem as `DEMO_PASSWORD_*` e gravou 966 avaliações com elas; a pesquisa do `pronto-atendimento` abriu (200). No fim, os containers, os volumes, as imagens, o banco de teste e os segredos do teste foram apagados.
- **Os comandos do passo 5:** numa cópia do `infra/.env.example`, preencheram os três segredos (a `ENCRYPTION_KEY` com 32 bytes) e as cinco `DEMO_PASSWORD_*`, e deixaram o `# DATABASE_URL=` como estava.
- **Os testes do compose:** os seis passam; sem o perfil do `backup` no arquivo novo, ou sem o `DATABASE_URL` no modelo, um deles falha. `pnpm lint`, `pnpm typecheck` e o Prettier passaram, e os 616 testes (53 arquivos), no PostgreSQL 18 do compose.
- **Os READMEs:** renderizados pela API de Markdown do GitHub e abertos no Playwright, no tema claro e no escuro: o Mermaid renderizou, todas as imagens carregaram, os alertas apareceram como alertas, e nenhum bloco de código nem tabela passou da largura. Os links relativos apontam para arquivos que existem, as âncoras batem com o slug do GitHub (também as de um README para o outro), e os 14 endereços de fora responderam 200.

## O que mudou em relação ao plano

- O plano deixa a hospedagem para depois, entre uma VPS, o servidor do hospital e uma plataforma gerenciada. Agora a plataforma gerenciada tem um caminho pronto só para o banco (o Supabase), com a API e o front na VPS. A decisão continua com o time e o hospital, no ticket 20.

## Pendências e dúvidas

- **O Supabase de verdade:** o caminho foi testado com um banco que imita o dele (PostgreSQL 17, SSL obrigatório e certificado próprio), não com um projeto do Supabase. O pooler, o Network Restrictions e a pausa do plano gratuito ficam para conferir na homologação.
- **O backup no caminho do Supabase** fica com o Supabase: nenhum no plano gratuito, diário com 7 dias no Pro. Para a produção nele, o container `backup` poderia apontar para o pooler, o que pede mudar os scripts.
- **A página dos repositórios no GitHub** mostra o README da `main`, que só tem o commit inicial: o README novo aparece lá quando a primeira versão entrar na `main`, ou se a `develop` virar a branch padrão.
- **O DNS do hospital:** falta saber quem cuida do domínio, para pedir o registro do subdomínio da homologação.
