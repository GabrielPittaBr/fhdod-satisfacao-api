-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('SUPER_ADMIN', 'GESTOR', 'OUVIDORIA', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "tipo_pergunta" AS ENUM ('ESCALA_1_5', 'SIM_NAO', 'MULTIPLA_ESCOLHA', 'TEXTO');

-- CreateEnum
CREATE TYPE "canal" AS ENUM ('WEB', 'TOTEM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "classificacao" AS ENUM ('NORMAL', 'BAIXA', 'BAIXISSIMA');

-- CreateEnum
CREATE TYPE "tipo_comentario" AS ENUM ('ELOGIO', 'RECLAMACAO', 'SUGESTAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "status_retorno" AS ENUM ('NOVO', 'PENDENTE', 'EM_ATENDIMENTO', 'RESOLVIDO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocar_senha" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_setores" (
    "usuario_id" INTEGER NOT NULL,
    "setor_id" INTEGER NOT NULL,

    CONSTRAINT "usuario_setores_pkey" PRIMARY KEY ("usuario_id","setor_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogado_em" TIMESTAMPTZ(3),
    "substituido_por_id" INTEGER,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setores" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_fim" VARCHAR(5) NOT NULL,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perguntas" (
    "id" SERIAL NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" "tipo_pergunta" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas" (
    "id" SERIAL NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "canal" "canal" NOT NULL,
    "data_atendimento" DATE NOT NULL,
    "turno_id" INTEGER NOT NULL,
    "nps" SMALLINT NOT NULL,
    "classificacao" "classificacao" NOT NULL,
    "enviado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chave_idempotencia" UUID NOT NULL,
    "token_complemento_hash" VARCHAR(64),
    "token_complemento_expira_em" TIMESTAMPTZ(3),

    CONSTRAINT "respostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resposta_itens" (
    "id" SERIAL NOT NULL,
    "resposta_id" INTEGER NOT NULL,
    "pergunta_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "pergunta_texto" TEXT NOT NULL,
    "tipo" "tipo_pergunta" NOT NULL,
    "valor_numero" SMALLINT,
    "valor_texto" TEXT,

    CONSTRAINT "resposta_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios" (
    "id" SERIAL NOT NULL,
    "resposta_id" INTEGER NOT NULL,
    "tipo" "tipo_comentario" NOT NULL,
    "texto" TEXT NOT NULL,
    "categoria_id" INTEGER,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos_retorno" (
    "id" SERIAL NOT NULL,
    "resposta_id" INTEGER NOT NULL,
    "telefone_cifrado" TEXT NOT NULL,
    "telefone_final" CHAR(4) NOT NULL,
    "consentimento_em" TIMESTAMPTZ(3) NOT NULL,
    "status" "status_retorno" NOT NULL DEFAULT 'NOVO',
    "responsavel_id" INTEGER,
    "observacoes" TEXT,
    "resolvido_em" TIMESTAMPTZ(3),

    CONSTRAINT "contatos_retorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tv_telas" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acesso_em" TIMESTAMPTZ(3),
    "criado_por_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tv_telas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizado_por_id" INTEGER,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "dados" JSONB,
    "ip" INET,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuario_setores_setor_id_idx" ON "usuario_setores"("setor_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_substituido_por_id_key" ON "refresh_tokens"("substituido_por_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "setores_slug_key" ON "setores"("slug");

-- CreateIndex
CREATE INDEX "perguntas_setor_id_idx" ON "perguntas"("setor_id");

-- CreateIndex
CREATE UNIQUE INDEX "respostas_chave_idempotencia_key" ON "respostas"("chave_idempotencia");

-- CreateIndex
CREATE INDEX "respostas_setor_id_enviado_em_idx" ON "respostas"("setor_id", "enviado_em");

-- CreateIndex
CREATE INDEX "respostas_data_atendimento_idx" ON "respostas"("data_atendimento");

-- CreateIndex
CREATE INDEX "resposta_itens_pergunta_id_idx" ON "resposta_itens"("pergunta_id");

-- CreateIndex
CREATE INDEX "resposta_itens_categoria_id_idx" ON "resposta_itens"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "resposta_itens_resposta_id_pergunta_id_key" ON "resposta_itens"("resposta_id", "pergunta_id");

-- CreateIndex
CREATE UNIQUE INDEX "comentarios_resposta_id_key" ON "comentarios"("resposta_id");

-- CreateIndex
CREATE UNIQUE INDEX "contatos_retorno_resposta_id_key" ON "contatos_retorno"("resposta_id");

-- CreateIndex
CREATE INDEX "contatos_retorno_status_idx" ON "contatos_retorno"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tv_telas_token_hash_key" ON "tv_telas"("token_hash");

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_substituido_por_id_fkey" FOREIGN KEY ("substituido_por_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perguntas" ADD CONSTRAINT "perguntas_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perguntas" ADD CONSTRAINT "perguntas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas" ADD CONSTRAINT "respostas_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas" ADD CONSTRAINT "respostas_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_itens" ADD CONSTRAINT "resposta_itens_resposta_id_fkey" FOREIGN KEY ("resposta_id") REFERENCES "respostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_itens" ADD CONSTRAINT "resposta_itens_pergunta_id_fkey" FOREIGN KEY ("pergunta_id") REFERENCES "perguntas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resposta_itens" ADD CONSTRAINT "resposta_itens_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_resposta_id_fkey" FOREIGN KEY ("resposta_id") REFERENCES "respostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos_retorno" ADD CONSTRAINT "contatos_retorno_resposta_id_fkey" FOREIGN KEY ("resposta_id") REFERENCES "respostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos_retorno" ADD CONSTRAINT "contatos_retorno_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tv_telas" ADD CONSTRAINT "tv_telas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------
-- Restrições que o Prisma não declara no schema, escritas à mão ("Decisões do modelo", no plano). O Prisma
-- não as lê nem as compara, então nenhuma migration gerada depois vai apagá-las.

-- NPS de 0 a 10. Obrigatório pelo NOT NULL da coluna.
ALTER TABLE "respostas" ADD CONSTRAINT "respostas_nps_check" CHECK ("nps" BETWEEN 0 AND 10);

-- Nota de 1 a 5. Os itens que não são nota (sim ou não, múltipla escolha e texto) ficam com valor_numero
-- nulo, que o CHECK aceita.
ALTER TABLE "resposta_itens" ADD CONSTRAINT "resposta_itens_valor_numero_check" CHECK ("valor_numero" BETWEEN 1 AND 5);

-- Categorias sem nome repetido, mesmo com maiúsculas diferentes: "Recepção" e "RECEPÇÃO" são a mesma.
CREATE UNIQUE INDEX "categorias_nome_lower_key" ON "categorias" (lower("nome"));

-- Horários dos turnos no formato HH:mm, de 00:00 a 23:59. Não há CHECK de início antes do fim: o turno da
-- noite passa da meia-noite (19:00 às 07:00).
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_hora_inicio_check" CHECK ("hora_inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_hora_fim_check" CHECK ("hora_fim" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
