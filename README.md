<div align="center">

<img src="docs/imagens/logo.png" alt="FHDOD — Fundação Hospitalar Dr. Oswaldo Diesel" width="240">

<h1>Sistema de Satisfação Hospitalar · API</h1>

<p><b>A API da pesquisa de satisfação dos pacientes, do painel da gestão e da TV Wall da FHDOD.</b></p>

<p>
<img src="https://img.shields.io/badge/Node.js-26-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 26">
<img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 6">
<img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5">
<img src="https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma 7">
<img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 18">
<img src="https://img.shields.io/badge/Zod-4-3E67B1?style=for-the-badge&logo=zod&logoColor=white" alt="Zod 4">
<img src="https://img.shields.io/badge/OpenAPI-Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" alt="OpenAPI e Swagger">
<img src="https://img.shields.io/badge/Vitest-5-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest 5">
<img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose">
<img src="https://img.shields.io/badge/Caddy-HTTPS-1F88C0?style=for-the-badge&logo=caddy&logoColor=white" alt="Caddy com HTTPS">
<img src="https://img.shields.io/badge/pnpm-12-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm 12">
</p>

<p>
<a href="https://github.com/GabrielPittaBr/fhdod-satisfacao-api/actions/workflows/ci.yml"><img src="https://github.com/GabrielPittaBr/fhdod-satisfacao-api/actions/workflows/ci.yml/badge.svg?branch=develop" alt="CI da develop"></a>
<a href="https://www.conventionalcommits.org/pt-br/"><img src="https://img.shields.io/badge/commits-convencionais-FE5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits"></a>
<a href="https://github.com/GabrielPittaBr/fhdod-satisfacao-web/tree/develop"><img src="https://img.shields.io/badge/front--end-fhdod--satisfacao--web-0A6C6C?logo=github&logoColor=white" alt="Repositório do front-end"></a>
</p>

<p>
<a href="#-sobre">Sobre</a> ·
<a href="#-como-funciona">Como funciona</a> ·
<a href="#-rodar-localmente">Rodar localmente</a> ·
<a href="#-produção-e-homologação">Homologação</a> ·
<a href="#-documentação">Documentação</a>
</p>

</div>

---

## ✨ Sobre

O paciente avalia o atendimento pelo celular (o QR Code do setor) ou pelo totem, sem login e em menos de 2 minutos. A gestão acompanha o NPS, as notas e os comentários no painel, cada perfil só com os setores que lhe cabem, e a TV da recepção mostra os números do mês. **Este repositório é a API REST** que guarda as avaliações e calcula os indicadores; as telas ficam no [front-end](https://github.com/GabrielPittaBr/fhdod-satisfacao-web/tree/develop).

<table>
  <tr>
    <td align="center" rowspan="2">
      <img src="docs/imagens/pesquisa.png" alt="Pesquisa no celular: Como foi o seu atendimento?, com os rostinhos de 1 a 5" width="260"><br>
      <sub><b>📱 Pesquisa</b> no celular e no totem</sub>
    </td>
    <td align="center">
      <img src="docs/imagens/painel.png" alt="Painel: indicadores de satisfação, com o NPS do período e o NPS por setor" width="500"><br>
      <sub><b>📊 Painel</b> da gestão</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/imagens/tv.png" alt="TV Wall: o NPS do mês e a média das notas de 1 a 5" width="500"><br>
      <sub><b>📺 TV Wall</b> da recepção</sub>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><b>📱 Pesquisa sem login</b><br><sub>Pelo QR Code do setor ou pelo link geral, em que a pessoa escolhe os setores. NPS de 0 a 10 e as perguntas de cada setor, com comentário e pedido de retorno. O IP do paciente não é gravado.</sub></td>
    <td width="33%"><b>📊 Indicadores</b><br><sub>NPS, médias de 1 a 5, evolução, categorias, ranking e comentários, com filtros de período, setor, turno e canal.</sub></td>
    <td width="33%"><b>🔐 Perfis e setores</b><br><sub>Super Admin, Gestor, Ouvidoria e Visualizador, com a permissão e o setor conferidos em cada rota.</sub></td>
  </tr>
  <tr>
    <td><b>📺 TV Wall</b><br><sub>Só números agregados, por um link com token que o Super Admin cria e desativa.</sub></td>
    <td><b>📤 Exportações</b><br><sub>O resumo em Excel e em PDF e as respostas em Excel, com os filtros da tela e registro na auditoria.</sub></td>
    <td><b>🛡️ LGPD</b><br><sub>Telefone cifrado (AES-256-GCM), mascarado nas telas e revelado só com permissão e auditoria.</sub></td>
  </tr>
</table>

## 🧭 Como funciona

```mermaid
flowchart LR
    paciente["📱 Paciente<br/>celular e totem"]
    gestao["💻 Gestão<br/>painel"]
    tv["📺 TV da recepção"]

    subgraph servidor["Servidor · Docker Compose"]
        caddy["Caddy<br/>HTTPS e o front"]
        api["API<br/>Node.js e Express"]
        banco[("PostgreSQL 18")]
        backup["Backup diário"]
    end

    fora[("Cópia fora<br/>do servidor")]

    paciente & gestao & tv -- HTTPS --> caddy
    caddy -- "/api" --> api
    api --> banco
    backup --> banco
    backup -.-> fora
```

- **Um domínio só:** o Caddy serve o front em `/` e repassa `/api` para a API. Sem CORS no caminho e com o cookie da sessão no modo mais restrito.
- **Só a API fala com o banco**, e é ela quem decide: classificação da nota, NPS, permissões e o escopo de setor. O front só exibe.
- **O contrato é o [`openapi.json`](openapi.json)**, gerado dos mesmos schemas Zod que validam as rotas. O front gera os tipos dele.

## 🚀 Rodar localmente

| Precisa de | Versão | Para conferir |
| --- | --- | --- |
| Node.js | 26 (fica no `.nvmrc`) | `node --version` |
| pnpm | 12 (`npm install --global pnpm@12`, se não tiver) | `pnpm --version` |
| Docker | com o plugin do compose | `docker compose version` |

```bash
# A develop é a base do trabalho; a main só recebe as versões estáveis
git clone -b develop https://github.com/GabrielPittaBr/fhdod-satisfacao-api.git
cd fhdod-satisfacao-api

pnpm install                          # dependências, cliente do Prisma e hooks do Git
cp .env.example .env                  # variáveis de desenvolvimento, já com o banco do Docker
docker compose up -d                  # PostgreSQL 18: desenvolvimento (5432) e testes (5433)
pnpm db:deploy                        # cria as tabelas
pnpm db:seed                          # categorias, turnos, configurações e o Super Admin
DEMO_CONFIRM=satisfacao pnpm db:demo  # opcional: os dados de demonstração (abaixo)
pnpm dev                              # API em http://localhost:3333, com recarga automática
```

> [!NOTE]
> No PowerShell, o `db:demo` é `$env:DEMO_CONFIRM='satisfacao'; pnpm db:demo; Remove-Item Env:DEMO_CONFIRM`.

**Pronto!** Com a API no ar:

| Endereço | O que é |
| --- | --- |
| <http://localhost:3333/api/health> | Saúde da API e do banco: `{"data":{"status":"ok","banco":"ok"}}` (503 sem o banco) |
| <http://localhost:3333/api/docs> | Swagger, com todas as rotas e os erros de cada uma |
| <http://localhost:5555> | Prisma Studio, com `pnpm db:studio`, para ver e editar os dados |

O primeiro Super Admin entra com o `SEED_ADMIN_EMAIL` e o `SEED_ADMIN_PASSWORD` do `.env`, e a troca da senha é pedida no primeiro acesso. Para ver as telas, rode o [front-end](https://github.com/GabrielPittaBr/fhdod-satisfacao-web/blob/develop/README.md#-como-rodar) ao lado.

### 🎭 Dados de demonstração

O `pnpm db:demo` grava os 6 setores (a Maternidade desativada) com as perguntas de cada um, uma conta de cada perfil, duas telas de TV e cerca de quatro meses de avaliações até hoje, com comentários e pedidos de retorno. **Tudo é inventado.** Ele precisa do seed base antes e só roda com o nome do banco em `DEMO_CONFIRM`, na linha do comando (no `.env` não vale).

| Conta | Perfil | Senha na sua máquina |
| --- | --- | --- |
| `admin@fhdod.example` | Super Admin | `admin-demo-2026` |
| `marta@fhdod.example` | Gestor do Pronto Atendimento e da Internação | `gestor-demo-2026` |
| `renata@fhdod.example` | Ouvidoria | `ouvidoria-demo-2026` |
| `diego@fhdod.example` | Visualizador do Raio-X | `leitura-demo-2026` |
| `luana@fhdod.example` | Gestor do Laboratório, no primeiro acesso (troca a senha ao entrar) | `provisoria-2026` |

A TV abre em <http://localhost:5173/tv#demo-recepcao-fhdod> (o endereço do front é o primeiro do `CORS_ORIGIN`). A outra tela, `demo-corredor-desativada`, está desativada e não abre.

<details>
<summary><b>Rodar de novo, homologação e por que nunca em produção</b></summary>

- **Rodar de novo** substitui os dados de demonstração, sem duplicar nada: os setores, as contas e as telas voltam ao que eram, com os mesmos IDs, e as perguntas e as avaliações desses setores são geradas outra vez até hoje. As contas voltam com as senhas de demonstração, e as sessões abertas delas caem. Outros setores, contas e telas, as categorias, os turnos e as configurações ficam como estão.
- **As avaliações** saem com uma semente fixa por dia: no mesmo dia, o comando grava sempre as mesmas. A classificação usa a regra e os limites de nota baixa da API.
- **Na homologação**, que fica na internet, as senhas do repositório não valem: com `NODE_ENV=production`, o comando exige as cinco variáveis `DEMO_PASSWORD_*`, uma por conta, e não as mostra no fim.
- **Nunca rode em produção.** Os setores de demonstração são achados pelo endereço (`pronto-atendimento`, `internacao`...): num banco do hospital com setores de mesmo endereço, as avaliações deles seriam apagadas.

</details>

### 🧰 Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | A API com recarga automática |
| `pnpm test` | Testes unitários e de integração, no banco de teste do compose (`--project unit` roda só os que não precisam de banco) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Checagem de tipos do TypeScript |
| `pnpm build` | Gera o build em `dist/`, que o `pnpm start` roda |
| `pnpm openapi:exportar` | Grava o contrato em `openapi.json`, que vai no mesmo commit da mudança |
| `pnpm db:migrate` | Cria e aplica uma migration (depois, `pnpm db:generate`) |
| `pnpm db:reset` | Apaga o banco de desenvolvimento e roda as migrations e o seed base de novo |

Em todo pull request, o CI roda lint, tipos, testes (com um PostgreSQL 18), contrato e build. Os outros comandos e as regras do repositório estão no [`AGENTS.md`](AGENTS.md).

## 🌐 Produção e homologação

Homologação e produção sobem com o mesmo [`infra/docker-compose.prod.yml`](infra/docker-compose.prod.yml): um servidor com os dois repositórios lado a lado e **um comando**, na pasta da API. O que muda é o `infra/.env` de cada servidor. A homologação é onde o hospital testa antes de ir ao ar, com os dados de demonstração e o Swagger ligado.

| Serviço | O que faz |
| --- | --- |
| `caddy` | Serve o front com HTTPS, emitido e renovado sozinho, e repassa `/api` para a API. A imagem sai do repositório do front, ao lado |
| `api` | Aplica as migrations pendentes e o seed base ao iniciar e só então sobe. O Caddy espera o `/api/health` responder |
| `postgres` | PostgreSQL 18 com os dados num volume, sem nenhuma porta aberta para fora |
| `backup` | `pg_dump` diário às 3h (Brasília), com 7 cópias diárias, 4 semanais e uma cópia fora do servidor |

### 🏥 O domínio do hospital

> [!TIP]
> **Não importa como o site do hospital é hospedado.** O sistema ganha um **subdomínio**, como `avaliacao-teste.<domínio do hospital>`, apontado para o servidor. O site e o e-mail do hospital continuam onde estão: só quem cuida do DNS do domínio precisa criar um registro.

Para descobrir quem cuida do DNS, veja os servidores de nome do domínio (no Windows, no Linux ou no macOS):

```bash
nslookup -type=NS exemplo.com.br
```

| Os servidores de nome são... | Quem cria o registro |
| --- | --- |
| `*.dns.br`, como `a.auto.dns.br` | O titular do domínio, no painel do [Registro.br](https://registro.br/), na zona DNS do domínio |
| `*.ns.cloudflare.com` | Quem administra a conta da Cloudflare, em **DNS › Records** |
| Os da hospedagem do site (HostGator, Locaweb, Hostinger...) | Quem tem o acesso ao painel da hospedagem, na zona DNS |
| Do próprio hospital | O TI do hospital |

O registro a pedir, com o IP do servidor:

| Tipo | Nome | Valor |
| --- | --- | --- |
| `A` | `avaliacao-teste` | O IPv4 do servidor |
| `AAAA` | `avaliacao-teste` | O IPv6 do servidor, se ele tiver |

> [!WARNING]
> Na Cloudflare, o registro fica **sem o proxy** (a nuvem cinza, "DNS only"). Com o proxy, o Caddy não consegue emitir o certificado sozinho, e a API veria o IP da Cloudflare no lugar do de cada paciente, o que faria o limite de envios da pesquisa barrar todo mundo junto.

### 🧩 Onde rodar: VPS ou Supabase

> [!IMPORTANT]
> **O Supabase hospeda só o banco de dados.** A API é um servidor Node.js que fica ligado, e o front precisa do Caddy na frente, com o HTTPS: os dois continuam numa VPS. O caminho 🅱️ troca só o PostgreSQL da VPS pelo do Supabase.

| | 🅰️ **Tudo na VPS** (recomendado) | 🅱️ **VPS e o banco no Supabase** |
| --- | --- | --- |
| Caddy, front e API | Na VPS | Na VPS |
| PostgreSQL | Na VPS, num volume | No Supabase, na região de São Paulo |
| Backup | Diário, com 7 diárias, 4 semanais e uma cópia fora do servidor | O do Supabase: diário só no plano Pro |
| O time cuida de | O servidor e o banco | O servidor |
| Compose | `infra/docker-compose.prod.yml` | O mesmo e o [`infra/docker-compose.banco-externo.yml`](infra/docker-compose.banco-externo.yml) por cima |

Nos dois caminhos, a VPS é a mesma: **Ubuntu 24.04 LTS, 2 vCPU, 4 GB de RAM e 40 GB de disco**, de preferência num data center no Brasil. Um servidor do hospital também serve, se o TI liberar as portas 80 e 443 para a internet: os pacientes respondem de casa.

### 🛠️ Passo a passo da homologação

**1. Prepare a VPS.** Entre por SSH com o acesso que o provedor mandou e instale o Docker:

```bash
ssh root@IP-DO-SERVIDOR
curl -fsSL https://get.docker.com | sudo sh   # o Docker e o plugin do compose
sudo systemctl enable --now docker            # o Docker volta sozinho depois de um reinício

# O firewall: SSH, HTTP e HTTPS (a 443 em UDP é a do HTTP/3)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
```

Se o provedor tiver um firewall no painel, libere lá as mesmas portas: 22, 80 e 443 (TCP) e 443 (UDP). Se você não entrou como `root`, ponha o seu usuário no grupo `docker` (`sudo usermod -aG docker $USER`) e entre de novo: os comandos do compose rodam sem `sudo`.

**2. Aponte o subdomínio** para o IP do servidor, como na tabela acima, e espere o DNS responder com ele. O Caddy só emite o HTTPS depois disso:

```bash
nslookup avaliacao-teste.exemplo.com.br
```

**3. Clone os dois repositórios lado a lado.** Na homologação, a `develop`, com a versão a aprovar; em produção, a `main`, com a tag aprovada.

```bash
git clone -b develop https://github.com/GabrielPittaBr/fhdod-satisfacao-api.git
git clone -b develop https://github.com/GabrielPittaBr/fhdod-satisfacao-web.git
cd fhdod-satisfacao-api
```

**4. Só no caminho 🅱️: crie o banco no Supabase.** No caminho 🅰️, pule para o passo 5.

1. Em [supabase.com](https://supabase.com/dashboard), crie um projeto (**New project**) na região de São Paulo (`sa-east-1`), com uma senha do banco forte e **só com letras e números**: ela vai dentro de uma URL. Se a tela de criação mostrar **Automatically expose new tables**, deixe desmarcado.
2. Desligue o Data API, em **Integrations › Data API** (**Enable Data API** desligado). A API do sistema fala direto com o PostgreSQL; com o Data API ligado, as tabelas poderiam ficar expostas pela API REST do Supabase.
3. Em **Database Settings**, ligue **Enforce SSL on incoming connections** e, em **Network Restrictions**, deixe entrar só o IP do servidor (`IP-DO-SERVIDOR/32`).
4. Em **Connect**, no alto da página do projeto, escolha o **Session pooler**, copie a URL, ponha a senha do banco no lugar indicado e acrescente `?sslmode=no-verify` no fim:

   ```text
   postgresql://postgres.REF:SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=no-verify
   ```

> [!NOTE]
> **Por que o Session pooler:** a conexão direta do Supabase é só IPv6, que os containers da VPS não alcançam; o pooler aceita IPv4 e serve também para as migrations. **Por que o `no-verify`:** o `pg`, o driver da API, trata o `sslmode=require` como a conferência completa do certificado, e o do Supabase é de uma autoridade própria, que o Node não conhece. Com o `no-verify`, a conexão vai cifrada (TLS), sem conferir o certificado.

> [!WARNING]
> No plano gratuito, o Supabase pausa o projeto depois de uma semana com pouca atividade no banco e não guarda backups: o diário, com 7 dias, é do plano Pro. Para a homologação serve; para a produção, prefira o caminho 🅰️ ou o plano Pro.

**5. Crie o `infra/.env`** a partir do [modelo](infra/.env.example), que explica cada variável. Os comandos abaixo geram os segredos só para este servidor:

```bash
cp infra/.env.example infra/.env && chmod 600 infra/.env

# Os três segredos do sistema
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" infra/.env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 48)|" infra/.env
sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" infra/.env

# Só na homologação: as senhas das cinco contas de demonstração
for c in SUPER_ADMIN GESTOR OUVIDORIA VISUALIZADOR PRIMEIRO_ACESSO; do
  sed -i "s|^# DEMO_PASSWORD_$c=.*|DEMO_PASSWORD_$c=demo-$(openssl rand -hex 6)|" infra/.env
done

nano infra/.env   # o resto, como na tabela abaixo
```

| Variável | Na homologação |
| --- | --- |
| `DOMAIN` | `avaliacao-teste.exemplo.com.br` |
| `CORS_ORIGIN` | `https://avaliacao-teste.exemplo.com.br` |
| `DOCS_ENABLED` | `true`, para o Swagger em `/api/docs` |
| `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` | O primeiro Super Admin. A senha, com pelo menos 10 caracteres, letras e números, é provisória |
| `RATE_LIMIT_ALLOWLIST` | O IP público do hospital, por onde saem os totens, para o limite de envios não barrá-los |
| `BACKUP_DESTINO` | `nenhum`, com os dados de demonstração, ou um remoto do rclone (ver "Backup", abaixo) |
| `DATABASE_URL` | Só no caminho 🅱️: tire o `#` da linha e cole a URL do Supabase |

> [!CAUTION]
> Guarde os segredos do `infra/.env` também num cofre de senhas do time, fora do servidor. Sem a `ENCRYPTION_KEY`, os telefones gravados não se leem mais, nem os das cópias do backup.

**6. Suba o sistema.** O `COMPOSE_FILE` guarda os arquivos do compose do servidor, e os comandos daqui em diante dispensam o `-f`. Rode-os sempre na pasta da API e sem `sudo`: sem o `COMPOSE_FILE`, o `docker compose` de lá usa o `docker-compose.yml` de desenvolvimento.

```bash
# 🅰️ Tudo na VPS
echo 'export COMPOSE_FILE=infra/docker-compose.prod.yml' >> ~/.bashrc

# 🅱️ VPS e o banco no Supabase
echo 'export COMPOSE_FILE=infra/docker-compose.prod.yml:infra/docker-compose.banco-externo.yml' \
  >> ~/.bashrc

source ~/.bashrc
docker compose up -d --build --wait
```

O primeiro build leva alguns minutos. O `--wait` só termina com todos os serviços de pé e saudáveis, ou diz qual não subiu (`docker compose logs api` mostra o porquê).

> [!WARNING]
> No caminho 🅱️, os comandos levam sempre os dois arquivos, e o `COMPOSE_FILE` cuida disso. Só com o de produção, o compose sobe um PostgreSQL vazio na VPS e liga a API nele.

**7. Confira** e, com a conta criada, apague do `infra/.env` o `SEED_ADMIN_EMAIL` e o `SEED_ADMIN_PASSWORD`:

- `https://avaliacao-teste.exemplo.com.br/api/health` responde `{"data":{"status":"ok","banco":"ok"}}`;
- o Super Admin entra em `https://avaliacao-teste.exemplo.com.br/login` com o e-mail e a senha do `infra/.env`, e troca a senha;
- `docker compose ps` mostra todos os serviços `healthy`.

**8. Carregue os dados de demonstração.** O nome do banco vai na confirmação: `satisfacao` no caminho 🅰️, `postgres` no Supabase.

```bash
docker compose exec -e DEMO_CONFIRM=satisfacao api node dist/demonstracao.js   # 🅰️
docker compose exec -e DEMO_CONFIRM=postgres api node dist/demonstracao.js     # 🅱️
```

Ele mostra as contas e o link da TV; as senhas são as das `DEMO_PASSWORD_*` (`grep DEMO_PASSWORD infra/.env`).

**9. Ligue um monitor externo**, como o [UptimeRobot](https://uptimerobot.com/), gratuito: um monitor HTTP(S) de `https://avaliacao-teste.exemplo.com.br/api/health` a cada 5 minutos, com aviso por e-mail para o time. O `/api/health` responde 503 quando o banco cai.

**10. Teste com o hospital**, em aparelhos de verdade. Cada problema encontrado vira uma issue; a versão aprovada vai para a `main`, com tag de versão.

- [ ] Pesquisa no celular, pelo QR Code: uma nota baixa com telefone e uma nota normal com elogio
- [ ] Pesquisa geral, em `/avaliar` (o link que substitui o Google Forms): dois setores, com o comentário e o telefone no setor escolhido
- [ ] Totem reiniciando sozinho, em `/totem/<setor>`
- [ ] Painel com cada perfil: Super Admin, Gestor, Ouvidoria e Visualizador
- [ ] TV em tela cheia, com o link criado em "Telas de TV"
- [ ] Exportações em Excel e em PDF
- [ ] Uma restauração de backup por mês, num banco à parte (caminho 🅰️, em "Restaurar um backup")

> [!NOTE]
> **Em produção**, o passo a passo é o mesmo, com a `main`, outro subdomínio (como `avaliacao.<domínio do hospital>`), o `DOCS_ENABLED` vazio, a cópia de fora configurada no `BACKUP_DESTINO` e **sem** os dados de demonstração.

### 🔄 Publicar uma versão

Depois de a versão entrar na branch do servidor nos dois repositórios (se o contrato mudou, a da API vai primeiro):

```bash
git -C ../fhdod-satisfacao-web pull
git pull
docker compose up -d --build --wait
```

O compose gera de novo só as imagens que mudaram e troca só os containers delas. A API aplica as migrations novas ao subir; enquanto ela reinicia, por alguns segundos, o Caddy responde com erro. As imagens antigas ficam no disco até um `docker image prune`.

<details>
<summary><b>🧯 No dia a dia</b></summary>

Os comandos usam o `COMPOSE_FILE` do passo 6; sem ele, ponha `-f infra/docker-compose.prod.yml` depois do `docker compose` (no caminho 🅱️, também o `-f infra/docker-compose.banco-externo.yml`).

```bash
docker compose ps              # cada serviço e se está saudável
docker compose logs -f api     # os logs da API (ou do caddy, do postgres e do backup)
docker compose restart api     # reinicia a API
docker compose down            # para tudo, sem apagar nada
```

**Nunca use `docker compose down -v`**: ele apaga os volumes, com o banco e as cópias do backup. Os logs de todos os containers ficam em JSON no disco do Docker, com rotação: no máximo 5 arquivos de 10 MB por container.

**Trocar a senha do banco** (caminho 🅰️): mude-a primeiro no PostgreSQL (`docker compose exec postgres psql -U app -d satisfacao` e, lá dentro, `\password app`), depois no `POSTGRES_PASSWORD` do `infra/.env`, e rode o `up -d --wait` de novo. O `POSTGRES_PASSWORD` só vale sozinho na criação do volume.

</details>

<details>
<summary><b>🗄️ Backup</b> (caminho 🅰️)</summary>

Todo dia às 3h, no horário de Brasília, o container `backup` grava uma cópia do banco com o `pg_dump`, no formato próprio do PostgreSQL, e a confere com o `pg_restore` antes de substituir a do dia. As cópias ficam no volume `backups`:

- `diarios/fhdod-AAAA-MM-DD.dump`: uma por dia, as 7 mais recentes;
- `semanais/fhdod-AAAA-Wss.dump`: a última de cada semana, de segunda a domingo, trocada a cada backup da semana; as 4 mais recentes.

Depois, o rclone manda para o `BACKUP_DESTINO` o que ainda não está lá e apaga de lá as cópias que saíram da retenção. Ele nunca espelha a pasta: se o volume dos backups for apagado por engano, as cópias de fora continuam. Se o servidor estava desligado às 3h, o backup roda assim que ele volta; se falhar, tenta de novo a cada 30 minutos. O `docker compose ps` mostra o `backup` como `unhealthy` quando a última tentativa falhou ou quando o último backup bom tem mais de 26 horas; o motivo está no `docker compose logs backup`.

**A cópia de fora do servidor:** o remoto do rclone vai no `infra/backup/rclone.conf`, a partir do [modelo](infra/backup/rclone.conf.example), com o S3 e o SFTP, e o caminho, no `BACKUP_DESTINO` do `infra/.env`. O arquivo é lido pelo usuário do container do backup (uid 70):

```bash
cp infra/backup/rclone.conf.example infra/backup/rclone.conf
# preencha o rclone.conf e depois:
sudo chown 70 infra/backup/rclone.conf && sudo chmod 600 infra/backup/rclone.conf
```

```bash
# Um backup na hora (troca a cópia do dia)
docker compose exec backup backup.sh

# As cópias do servidor, e uma delas trazida para a pasta atual
docker compose exec backup ls -l /backups/diarios /backups/semanais
docker compose cp backup:/backups/diarios/fhdod-AAAA-MM-DD.dump .

# As cópias de fora do servidor
docker compose run --rm backup rclone lsf -R fora:fhdod-backups
```

Na primeira publicação, rode o `backup.sh` depois de a API criar as tabelas: o agendador já faz um backup quando o container sobe depois das 3h, mas pode copiar o banco antes disso. No `rclone lsf`, use o remoto e a pasta do seu `BACKUP_DESTINO`.

As cópias têm as avaliações e os comentários dos pacientes, e os telefones cifrados. O destino de fora precisa ser de confiança, de preferência no Brasil, e a `ENCRYPTION_KEY` nunca vai junto com elas. Para o destino guardar só arquivos cifrados, o `rclone.conf.example` mostra um remoto `crypt`.

</details>

<details>
<summary><b>♻️ Restaurar um backup</b> (caminho 🅰️)</summary>

O [`restaurar.sh`](infra/backup/restaurar.sh) restaura uma cópia com o `pg_restore` num banco vazio: cria o banco se ele não existir e para se ele já tiver tabelas, sem apagar nada. A restauração é feita numa transação só: ou a cópia entra inteira, ou o banco fica como estava. No fim, ele mostra quantos setores, usuários e respostas entraram e a data da resposta mais recente.

**Conferir uma cópia, num banco à parte**, sem mexer no banco da API (o teste mensal da homologação):

```bash
docker compose run --rm backup restaurar.sh /backups/diarios/fhdod-AAAA-MM-DD.dump satisfacao_restaurada
docker compose exec postgres dropdb -U app satisfacao_restaurada
```

**Voltar o banco da API para uma cópia.** Tudo o que entrou depois dela se perde, por isso o passo 2 guarda o estado atual antes:

1. Pare quem grava no banco: `docker compose stop caddy api backup`.
2. Guarde o banco como está: `docker compose run --rm backup pg_dump --format=custom --file=/backups/antes-da-restauracao.dump`.
3. Apague o banco: `docker compose exec postgres dropdb -U app satisfacao`.
4. Restaure a cópia, que cria o banco de novo: `docker compose run --rm backup restaurar.sh /backups/diarios/fhdod-AAAA-MM-DD.dump`.
5. Suba tudo: `docker compose up -d --wait`.

**Num servidor novo**, com o antigo perdido, a cópia vem de fora:

1. Faça os passos 1 a 5 da homologação e o `COMPOSE_FILE` do passo 6, com a mesma `ENCRYPTION_KEY` do servidor antigo (sem ela, os telefones da cópia não se leem) e o `rclone.conf`.
2. Suba só o banco, que nasce vazio: `docker compose up -d --build --wait postgres`.
3. Traga a cópia de fora para o volume: `docker compose run --rm backup rclone copy fora:fhdod-backups/producao/diarios/fhdod-AAAA-MM-DD.dump /backups/restaurar/` (com o caminho do seu `BACKUP_DESTINO`).
4. Restaure: `docker compose run --rm backup restaurar.sh /backups/restaurar/fhdod-AAAA-MM-DD.dump`.
5. Suba o resto: `docker compose up -d --build --wait`. As migrations da cópia já estão aplicadas, e o seed base não cria nada, porque o banco já tem usuários.

</details>

## 📂 Estrutura

```text
fhdod-satisfacao-api/
├── src/
│   ├── modules/       # um assunto por pasta: auth, setores, pesquisa, dashboard, tv-wall...
│   ├── middlewares/   # authenticate, authorize, setor-scope, rate-limit e tv-token
│   ├── shared/        # regras (NPS, classificação da nota, telefone), constantes e segurança
│   ├── database/      # cliente do Prisma, auditoria e o SQL dos filtros do painel
│   └── config/        # variáveis de ambiente, logger e o documento OpenAPI
├── prisma/            # schema, migrations, seed base e dados de demonstração
├── tests/             # testes de integração, factories e helpers
├── infra/             # compose de produção, banco externo e backup
├── docs/              # plano, tickets, registros e as imagens deste README
└── openapi.json       # o contrato, de onde o front gera os tipos
```

## 📚 Documentação

| Documento | Para quê |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Como trabalhar no repositório: branches, commits, tickets, definição de pronto e as convenções da API |
| [Plano de Desenvolvimento](docs/Plano%20de%20Desenvolvimento%20-%20FHDOD.md) | As regras de negócio, a arquitetura e as decisões |
| [`docs/tickets/`](docs/tickets/) | O que fazer, um ticket por arquivo, espelhados nas issues |
| [`docs/registros/`](docs/registros/) | O registro de cada entrega, com as decisões e o porquê |
| [`openapi.json`](openapi.json) | O contrato da API; com ela rodando, o mesmo documento no Swagger, em `/api/docs` |

<div align="center">
<br>
<sub>Feito para a <b>Fundação Hospitalar Dr. Oswaldo Diesel</b> · as telas ficam no <a href="https://github.com/GabrielPittaBr/fhdod-satisfacao-web/tree/develop">fhdod-satisfacao-web</a></sub>
</div>
