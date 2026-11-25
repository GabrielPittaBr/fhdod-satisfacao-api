# Imagem do backup: o pg_dump e o pg_restore do PostgreSQL 18 (a mesma versão do banco) e o rclone, que manda a
# cópia para fora do servidor. O processo do container é o agendar.sh, que roda o backup.sh todo dia às 3h.
# Os scripts estão nesta pasta, e o passo a passo, no README da API, em "Backup".
FROM postgres:18-alpine

RUN apk add --no-cache rclone

COPY agendar.sh backup.sh restaurar.sh saude.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/agendar.sh /usr/local/bin/backup.sh /usr/local/bin/restaurar.sh /usr/local/bin/saude.sh

# As cópias ficam em /backups, do usuário postgres, que já vem na imagem: o volume novo nasce com esse dono, e o
# backup roda sem privilégios. O rclone.conf do servidor é lido por esse usuário (uid 70).
RUN mkdir /backups && chown postgres:postgres /backups
USER postgres

# Sem o entrypoint da imagem do PostgreSQL, que prepara um servidor de banco: aqui só rodam os clientes.
ENTRYPOINT []
CMD ["agendar.sh"]
