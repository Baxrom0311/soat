#!/bin/bash
# Alert channel comes from the server's .env, not from this file. These scripts are in
# version control now (they were previously the only copy, on one disk); the ntfy topic
# is effectively a password -- anyone who knows it can read every alert and post fake
# ones -- so it stays where the other secrets are.
NTFY_TOPIC_URL=$(grep -h '^NTFY_TOPIC_URL=' /root/nursecall_backend/.env 2>/dev/null | cut -d= -f2-)
STATE_FILE=/root/nursecall_backups/.uptime_state
URL=https://nurcecall.boos.uz/health

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || echo '000')
LAST=$(cat "$STATE_FILE" 2>/dev/null || echo 'unknown')

if [ "$CODE" = "200" ]; then
  if [ "$LAST" = "down" ]; then
    curl -s -H 'Title: NurseCall qayta ishladi' -H 'Priority: default' -d "nurcecall.boos.uz yana 200 qaytaryapti" "$NTFY_TOPIC_URL" >/dev/null || true
  fi
  echo up > "$STATE_FILE"
else
  if [ "$LAST" != "down" ]; then
    curl -s -H 'Title: NurseCall ISHLAMAYAPTI' -H 'Priority: urgent' -d "nurcecall.boos.uz HTTP $CODE qaytardi ($(date -Iseconds))" "$NTFY_TOPIC_URL" >/dev/null || true
  fi
  echo down > "$STATE_FILE"
fi
