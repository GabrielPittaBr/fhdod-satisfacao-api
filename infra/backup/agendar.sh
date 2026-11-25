#!/bin/sh
# O agendador do backup, o processo do container: roda o backup.sh todo dia às 3h, no fuso do TZ (o de
# Brasília, no compose).
#
# A cada minuto, confere se já passou das 3h e se o backup de hoje ainda não deu certo. Assim, se o servidor
# estava desligado às 3h, ou o container subiu depois disso (na primeira publicação, por exemplo), o backup do
# dia roda assim que ele volta. Depois de uma falha, tenta de novo a cada 30 minutos, até dar certo.

set -u

PASTA=/backups
HORA=3
MINUTOS_ENTRE_TENTATIVAS=30

hora_atual() {
  date +%-H
}

deve_rodar() {
  [ "$(hora_atual)" -ge "$HORA" ] || return 1
  [ "$(cat "$PASTA/ultimo-sucesso" 2> /dev/null)" != "$(date +%F)" ] || return 1
  # A última tentativa (que falhou, já que o backup de hoje não deu certo) foi há menos de 30 minutos?
  [ -z "$(find "$PASTA/ultima-tentativa" -mmin -"$MINUTOS_ENTRE_TENTATIVAS" 2> /dev/null)" ]
}

echo "$(date '+%Y-%m-%d %H:%M:%S %Z') backup: agendado para as ${HORA}h, todo dia"

while :; do
  if deve_rodar; then
    backup.sh || echo "$(date '+%Y-%m-%d %H:%M:%S %Z') backup: nova tentativa em $MINUTOS_ENTRE_TENTATIVAS minutos"
  fi
  sleep 60
done
