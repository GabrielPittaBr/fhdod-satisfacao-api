#!/bin/sh
# A saúde do backup, para o healthcheck do compose (o docker compose ps mostra "unhealthy"). Com problema se a
# última tentativa falhou ou se o último backup que deu certo tem mais de 26 horas (o agendador parou, por
# exemplo). Antes do primeiro backup, num volume novo, fica saudável: está esperando as 3h.

PASTA=/backups

if [ "$(cut -d ' ' -f 1 "$PASTA/estado" 2> /dev/null)" = falhou ]; then
  cat "$PASTA/estado"
  exit 1
fi

if [ -e "$PASTA/ultimo-sucesso" ] && [ -z "$(find "$PASTA/ultimo-sucesso" -mmin -1560)" ]; then
  echo "o último backup que deu certo foi em $(cat "$PASTA/ultimo-sucesso"), há mais de 26 horas"
  exit 1
fi

exit 0
