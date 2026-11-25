#!/bin/sh
# Um backup do banco: o pg_dump no formato próprio do PostgreSQL (o que o pg_restore lê), conferido antes de
# substituir a cópia do dia, a retenção (7 cópias diárias e 4 semanais) e a cópia fora do servidor, pelo
# rclone. O agendar.sh o roda todo dia às 3h; para rodar na hora, na pasta da API:
#   docker compose -f infra/docker-compose.prod.yml exec backup backup.sh
#
# A conexão vem das variáveis do PostgreSQL (PGHOST, PGUSER, PGPASSWORD e PGDATABASE), e o destino de fora, do
# BACKUP_DESTINO: um caminho do rclone, como fora:fhdod-backups/producao, ou "nenhum". O remoto (fora) fica no
# rclone.conf, ao lado deste arquivo no servidor (o modelo é o rclone.conf.example).
#
# As cópias ficam em /backups (o volume backups do compose):
#   diarios/fhdod-AAAA-MM-DD.dump   uma por dia; rodar de novo no mesmo dia substitui a do dia
#   semanais/fhdod-AAAA-Wss.dump    a última de cada semana (ISO, de segunda a domingo), trocada a cada backup
#   estado e ultimo-sucesso         o resultado da última tentativa, para o agendar.sh e o saude.sh

set -u

PASTA=/backups
COPIAS_DIARIAS=7
COPIAS_SEMANAIS=4
DESTINO=${BACKUP_DESTINO:-}

registrar() {
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') backup: $*"
}

falhar() {
  registrar "FALHOU: $*"
  echo "falhou $(date '+%Y-%m-%d %H:%M:%S %Z'): $*" > "$PASTA/estado"
  exit 1
}

# Apaga as cópias mais antigas da pasta $1, deixando as $2 mais recentes. Os nomes começam pela data, então a
# ordem alfabética é a do tempo.
manter_as_mais_recentes() {
  ls -1 "$1" | grep -E '^fhdod-.+\.dump$' | sort -r | tail -n +"$(($2 + 1))" | while read -r arquivo; do
    rm -f "$1/$arquivo" && registrar "cópia antiga apagada: $(basename "$1")/$arquivo"
  done
}

# O mesmo, no destino de fora do servidor.
manter_as_mais_recentes_fora() {
  rclone lsf --files-only "$1" | grep -E '^fhdod-.+\.dump$' | sort -r | tail -n +"$(($2 + 1))" |
    while read -r arquivo; do
      rclone deletefile "$1/$arquivo" && registrar "cópia antiga apagada fora do servidor: $arquivo"
    done
}

mkdir -p "$PASTA/diarios" "$PASTA/semanais" || falhar "não deu para criar as pastas em $PASTA"

# Um backup de cada vez: um que já está rodando (o agendado ou outro pedido na mão) faz este parar. A trava sai
# sozinha quando o processo termina, também se ele cair no meio.
exec 9> "$PASTA/.trava"
if ! flock -n 9; then
  registrar "outro backup já está rodando; este não começou"
  exit 1
fi

touch "$PASTA/ultima-tentativa"
echo "rodando $(date '+%Y-%m-%d %H:%M:%S %Z')" > "$PASTA/estado"
rm -f "$PASTA"/diarios/*.parcial "$PASTA"/semanais/*.parcial

hoje=$(date +%F)
diaria="$PASTA/diarios/fhdod-$hoje.dump"
semanal="$PASTA/semanais/fhdod-$(date +%G-W%V).dump"

registrar "começando: banco $PGDATABASE em $PGHOST"

# Depois de o servidor reiniciar, o banco pode levar alguns segundos para aceitar conexões.
pg_isready --timeout=120 > /dev/null || falhar "o PostgreSQL não respondeu em 2 minutos"

# A cópia é gravada à parte e só substitui a do dia depois de conferida: uma cópia pela metade (o banco caiu, o
# disco encheu) nunca toma o lugar de uma boa.
pg_dump --format=custom --file="$diaria.parcial" || falhar "o pg_dump não conseguiu copiar o banco"
pg_restore --list "$diaria.parcial" > /dev/null || falhar "a cópia gerada não se lê com o pg_restore"
mv "$diaria.parcial" "$diaria" || falhar "não deu para gravar $diaria"
registrar "cópia do dia gravada: diarios/$(basename "$diaria") ($(du -h "$diaria" | cut -f1))"

# A da semana é sempre a mais recente dela: quando a semana acaba, fica a do domingo.
cp "$diaria" "$semanal.parcial" && mv "$semanal.parcial" "$semanal" || falhar "não deu para gravar $semanal"
registrar "cópia da semana gravada: semanais/$(basename "$semanal")"

manter_as_mais_recentes "$PASTA/diarios" "$COPIAS_DIARIAS"
manter_as_mais_recentes "$PASTA/semanais" "$COPIAS_SEMANAIS"

# A cópia de fora recebe o que falta lá (o copy nunca apaga nada no destino) e depois guarda as mesmas 7 e 4.
# Com o sync, um volume de backups apagado por engano apagaria também as cópias de fora no backup seguinte.
case "$DESTINO" in
  '')
    falhar "BACKUP_DESTINO não foi definido: use um caminho do rclone, como fora:fhdod-backups/producao, ou nenhum"
    ;;
  nenhum)
    registrar "sem cópia fora do servidor (BACKUP_DESTINO=nenhum)"
    ;;
  *)
    # O nome do remoto, sem o caminho: um destino escrito com as credenciais na própria variável não vai para o log.
    remoto=${DESTINO%%:*}
    for pasta in diarios semanais; do
      rclone copy --include 'fhdod-*.dump' "$PASTA/$pasta" "$DESTINO/$pasta" ||
        falhar "não deu para mandar as cópias de $pasta para fora do servidor (remoto ${remoto:-do BACKUP_DESTINO})"
    done
    manter_as_mais_recentes_fora "$DESTINO/diarios" "$COPIAS_DIARIAS"
    manter_as_mais_recentes_fora "$DESTINO/semanais" "$COPIAS_SEMANAIS"
    registrar "cópias mandadas para fora do servidor (remoto ${remoto:-do BACKUP_DESTINO})"
    ;;
esac

echo "$hoje" > "$PASTA/ultimo-sucesso"
echo "ok $(date '+%Y-%m-%d %H:%M:%S %Z')" > "$PASTA/estado"
registrar "concluído"
