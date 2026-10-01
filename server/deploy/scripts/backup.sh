#!/bin/bash
set -euo pipefail

BACKUP_DIR=/root/nursecall_backups
VOL_DIR=/mnt/volume_nyc1_1780927295183/nursecall_backups
VOL_MOUNT=/mnt/volume_nyc1_1780927295183
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/nursecall_db_$STAMP.sql.gz"
# Alert channel comes from the server's .env, not from this file. These scripts are in
# version control now (they were previously the only copy, on one disk); the ntfy topic
# is effectively a password -- anyone who knows it can read every alert and post fake
# ones -- so it stays where the other secrets are.
NTFY_TOPIC_URL=$(grep -h '^NTFY_TOPIC_URL=' /root/nursecall_backend/.env 2>/dev/null | cut -d= -f2-)
LOG="$BACKUP_DIR/backup.log"

# DB parol skriptda saqlanmaydi -> /root/.pgpass (mode 600)
export PGPASSFILE=/root/.pgpass

if pg_dump -h 127.0.0.1 -p 5432 -U nursecall nursecall_db | gzip > "$FILE"; then
  chmod 600 "$FILE"
  SIZE=$(du -h "$FILE" | cut -f1)
  echo "$(date -Iseconds) OK $FILE ($SIZE)" >> "$LOG"
  find "$BACKUP_DIR" -name 'nursecall_db_*.sql.gz' -mtime +7 -delete

  # --- Ikkinchi nusxa: alohida volume (30 kun saqlanadi). Xato bo'lsa faqat ogohlantirish. ---
  if mountpoint -q "$VOL_MOUNT"; then
    if mkdir -p "$VOL_DIR" && cp -p "$FILE" "$VOL_DIR/" && sync; then
      echo "$(date -Iseconds) OK volume-copy $VOL_DIR/$(basename "$FILE")" >> "$LOG"
      find "$VOL_DIR" -name 'nursecall_db_*.sql.gz' -mtime +30 -delete || true
    else
      echo "$(date -Iseconds) WARN volume-copy failed (cp/mkdir error) - primary backup OK" >> "$LOG"
    fi
  else
    echo "$(date -Iseconds) WARN volume-copy skipped: $VOL_MOUNT not mounted - primary backup OK" >> "$LOG"
  fi
else
  echo "$(date -Iseconds) FAILED" >> "$LOG"
  curl -s -H "Title: NurseCall backup FAILED" -H "Priority: urgent" -d "pg_dump muvaffaqiyatsiz tugadi, $(hostname) serverida" "$NTFY_TOPIC_URL" >/dev/null || true
  exit 1
fi
