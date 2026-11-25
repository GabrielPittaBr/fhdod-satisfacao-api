#!/bin/sh
# Restaura uma cópia do backup num banco vazio, com o pg_restore. Na pasta da API (o passo a passo, com o que
# fazer antes e depois, está no README, em "Restaurar um backup"):
#   docker compose -f infra/docker-compose.prod.yml run --rm backup restaurar.sh <cópia> [banco]
#
# <cópia> é o caminho dentro do container, como /backups/diarios/fhdod-2026-11-25.dump. O banco padrão é o da
# API (o PGDATABASE, satisfacao). Se ele não existir, é criado; se existir, precisa estar vazio, sem nenhuma
# tabela: o script nunca apaga nada. O pg_restore roda numa transação só: ou a cópia entra inteira, ou nada muda.

set -u

copia=${1:-}
banco=${2:-$PGDATABASE}

parar() {
  echo "A cópia não foi restaurada: $*" >&2
  exit 1
}

if [ -z "$copia" ]; then
  echo "Diga qual cópia restaurar. As que estão no servidor:" >&2
  ls -1 /backups/diarios/*.dump /backups/semanais/*.dump >&2 2> /dev/null
  parar "faltou o caminho da cópia, como /backups/diarios/fhdod-$(date +%F).dump"
fi
[ -f "$copia" ] || parar "o arquivo $copia não existe no container (as cópias do servidor ficam em /backups)."
pg_restore --list "$copia" > /dev/null 2>&1 ||
  parar "$copia não é uma cópia do pg_dump no formato próprio do PostgreSQL."
echo "$banco" | grep -Eq '^[a-z_][a-z0-9_]*$' ||
  parar "o nome do banco ($banco) só pode ter letras minúsculas sem acento, números e _."

existe=$(psql -d postgres -tA -c "SELECT 1 FROM pg_database WHERE datname = '$banco'") ||
  parar "não deu para conectar ao PostgreSQL em $PGHOST."
if [ "$existe" = 1 ]; then
  tabelas=$(psql -d "$banco" -tA -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')") ||
    parar "não deu para ler o banco $banco."
  [ "$tabelas" = 0 ] ||
    parar "o banco $banco não está vazio (tem $tabelas tabelas). Restaure num banco novo, ou apague este antes, como diz o README."
else
  createdb "$banco" || parar "não deu para criar o banco $banco."
  echo "Banco $banco criado."
fi

echo "Restaurando $copia no banco $banco..."
pg_restore --dbname="$banco" --no-owner --no-privileges --exit-on-error --single-transaction "$copia" ||
  parar "o pg_restore falhou, e o banco $banco ficou como estava (vazio)."

resumo=$(psql -d "$banco" -tA -F ' | ' -c "
  SELECT (SELECT count(*) FROM setores) || ' setores',
         (SELECT count(*) FROM usuarios) || ' usuários',
         (SELECT count(*) FROM respostas) || ' respostas',
         'a mais recente enviada em ' || coalesce(
           to_char((SELECT max(enviado_em) FROM respostas) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
           'nenhuma'),
         (SELECT count(*) FROM _prisma_migrations) || ' migrations'")
echo "Cópia restaurada no banco $banco: $resumo."
