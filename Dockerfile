# Imagem da API: compila numa imagem completa do Node e roda numa imagem enxuta (Alpine), com um usuário sem
# privilégios. Ao iniciar, aplica as migrations pendentes e o seed base e só então sobe o servidor.
# Quem gera e roda a imagem é o compose de produção (infra/docker-compose.prod.yml): README, em "Produção e
# homologação".

# Estágio 1: o build, numa imagem completa do Node 26, a mesma versão do .nvmrc e do CI.
FROM node:26 AS build
WORKDIR /app

# Sem os hooks do Git: dentro da imagem não há repositório.
ENV HUSKY=0

# O pnpm na versão do packageManager do package.json. O Node 26 não traz mais o Corepack.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node --print "require('./package.json').packageManager.split('+')[0]")"

# As dependências ficam numa camada própria, refeita só quando elas, o schema ou a configuração do Prisma
# mudam: o postinstall gera o cliente do Prisma a partir do schema.
COPY prisma7.config.ts ./
COPY prisma/schema.prisma prisma/
RUN pnpm install --frozen-lockfile

# O build: dist/server.js, dist/seed.js e dist/demonstracao.js, com o cliente do Prisma dentro.
COPY . .
RUN pnpm build

# Estágio 2: só as dependências de produção, instaladas no Alpine. O argon2 das senhas e o motor das migrations
# do Prisma têm um binário para cada sistema, e os do estágio 1 são do Debian.
FROM node:26-alpine AS dependencias
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node --print "require('./package.json').packageManager.split('+')[0]")"

# Sem os scripts do projeto: o postinstall gera o cliente do Prisma, que já está no build, e o prepare liga os
# hooks do Git. Os das dependências rodam, como o que baixa o motor das migrations.
RUN npm pkg delete scripts && pnpm install --prod --frozen-lockfile

# Estágio 3: a imagem final, com o Node, as dependências de produção, o build e as migrations. Sem o pnpm, o
# código-fonte, os testes e o .env: as variáveis vêm do compose.
FROM node:26-alpine
WORKDIR /app

# O CLI do Prisma no PATH, e sem as consultas que ele faz à internet (aviso de versão nova e telemetria).
ENV NODE_ENV=production \
    PATH=/app/node_modules/.bin:$PATH \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

COPY --from=dependencias /app/node_modules node_modules
COPY package.json prisma7.config.ts ./
COPY prisma/schema.prisma prisma/
COPY prisma/migrations prisma/migrations
COPY --from=build /app/dist dist

# O usuário node, que vem na imagem, só lê os arquivos: tudo foi copiado como root.
USER node
EXPOSE 3333

# As migrations pendentes, depois o seed base (que só cria o que falta e, num banco sem usuários, o primeiro
# Super Admin) e só então a API. Se um dos dois falhar, a API não sobe, e o log diz por quê. O exec põe o Node
# no lugar do sh, para ele receber o SIGTERM do Docker e encerrar com segurança.
CMD ["sh", "-c", "prisma migrate deploy && node dist/seed.js && exec node dist/server.js"]
