-- Uma conta só de leitura no banco, para a banca avaliar e para relatórios fora do sistema
-- (docs/seguranca-e-nuvem.md, "Acesso para a banca").
--
-- Roda uma vez, como o dono do banco (o usuário do DATABASE_URL), com o psql:
--
--   psql "<DATABASE_URL>" -v senha='<senha forte>' -v validade='2026-12-31' -f infra/banco/leitura-da-banca.sql
--
-- A conta lê todas as tabelas, menos as colunas de segredo: o hash das senhas, os hashes dos tokens e o
-- telefone cifrado (fica o telefone_final, os 4 últimos dígitos). Não grava nada: não tem permissão de escrita, e
-- toda transação dela é só de leitura. Deixa de entrar na data da validade. Para apagá-la antes:
--
--   DROP OWNED BY banca_leitura; DROP ROLE banca_leitura;

\set ON_ERROR_STOP on

BEGIN;

CREATE ROLE banca_leitura LOGIN PASSWORD :'senha' VALID UNTIL :'validade';
ALTER ROLE banca_leitura SET default_transaction_read_only = on;

SELECT format('GRANT CONNECT ON DATABASE %I TO banca_leitura', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO banca_leitura;

-- As tabelas sem segredo, inteiras.
GRANT SELECT ON setores, categorias, turnos, perguntas, resposta_itens, comentarios, usuario_setores,
  configuracoes, auditoria TO banca_leitura;

-- As tabelas com segredo, só as outras colunas.
GRANT SELECT (id, nome, email, perfil, ativo, trocar_senha, ultimo_login_em, criado_em, atualizado_em)
  ON usuarios TO banca_leitura;
GRANT SELECT (id, setor_id, canal, data_atendimento, turno_id, nps, classificacao, enviado_em, chave_idempotencia)
  ON respostas TO banca_leitura;
GRANT SELECT (id, resposta_id, telefone_final, consentimento_em, status, responsavel_id, observacoes, resolvido_em)
  ON contatos_retorno TO banca_leitura;
GRANT SELECT (id, nome, ativa, ultimo_acesso_em, criado_por_id, criado_em, atualizado_em)
  ON tv_telas TO banca_leitura;
-- refresh_tokens fica de fora: só tem sessões e hashes.

COMMIT;
