#!/bin/bash
#
# Prove the backups by restoring one, and leave a staging database behind.
#
# An untested backup is a guess. Before this script existed there were nine dumps on
# disk, a second copy on a volume, an alert if the dump ever failed -- and no evidence
# that any of it could be turned back into a working database. The word "restore" did
# not appear once in the backup log.
#
# Restoring into nursecall_staging does double duty: it checks the backup AND it gives
# the project the staging database it did not have, so a migration can be run somewhere
# other than four live hospitals.
#
# Worth running monthly, and always before a migration that is hard to reverse.
#
#     /root/nursecall_backend/deploy/scripts/restore_check.sh
#
set -uo pipefail

STAGING=${STAGING_DB:-nursecall_staging}
PROD=${PROD_DB:-nursecall_db}
BACKUP_DIR=${BACKUP_DIR:-/root/nursecall_backups}
export PGPASSFILE=/root/.pgpass

TABLES="clinics staff rooms devices buttons calls push_tokens payments"

LATEST=$(ls -1t "$BACKUP_DIR"/nursecall_db_*.sql.gz 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "backup topilmadi: $BACKUP_DIR"; exit 1; }
echo "backup: $(basename "$LATEST")  ($(du -h "$LATEST" | cut -f1))"

# .pgpass is written per-database, so the staging name needs its own line or psql will
# sit there asking for a password nobody is there to type.
PW=$(awk -F: -v db="$PROD" '$3==db{print $5; exit}' "$PGPASSFILE")
[ -n "$PW" ] || { echo ".pgpass ichida $PROD uchun satr yo'q"; exit 1; }
grep -q ":$STAGING:" "$PGPASSFILE" || echo "127.0.0.1:5432:$STAGING:nursecall:$PW" >> "$PGPASSFILE"
chmod 600 "$PGPASSFILE"

sudo -u postgres psql -q -c "DROP DATABASE IF EXISTS $STAGING" >/dev/null 2>&1
sudo -u postgres psql -q -c "CREATE DATABASE $STAGING OWNER nursecall" || exit 1

# "transaction_timeout" is expected and harmless: the dump is written by a newer pg_dump
# than the psql replaying it, and that one SET is all it disagrees about. Anything else
# in this list is worth reading.
echo "--- tiklashdagi xatolar (transaction_timeout kutilgan) ---"
gunzip -c "$LATEST" | psql -h 127.0.0.1 -U nursecall -d "$STAGING" 2>&1 | grep -iE "ERROR" | sort -u

echo "--- jadvallar solishtiruvi ---"
failed=0
for t in $TABLES; do
  a=$(psql -tA -h 127.0.0.1 -U nursecall -d "$PROD" -c "select count(*) from $t" 2>/dev/null)
  b=$(psql -tA -h 127.0.0.1 -U nursecall -d "$STAGING" -c "select count(*) from $t" 2>/dev/null)
  if [ "$a" = "$b" ] && [ -n "$a" ]; then m="OK"; else m="FARQ"; failed=1; fi
  printf "  %-13s prod=%-7s tiklangan=%-7s %s\n" "$t" "$a" "$b" "$m"
done

va=$(psql -tA -h 127.0.0.1 -U nursecall -d "$PROD" -c 'select version_num from alembic_version' 2>/dev/null)
vb=$(psql -tA -h 127.0.0.1 -U nursecall -d "$STAGING" -c 'select version_num from alembic_version' 2>/dev/null)
[ "$va" = "$vb" ] || failed=1
printf "  %-13s prod=%-7s tiklangan=%-7s %s\n" "alembic" "$va" "$vb" "$([ "$va" = "$vb" ] && echo OK || echo FARQ)"

if [ "$failed" -eq 0 ]; then
  echo "NATIJA: backup tiklandi va prod bilan mos — $STAGING tayyor"
else
  echo "NATIJA: FARQ BOR — backupga ishonib bo'lmaydi, qo'lda tekshiring"
  exit 1
fi
