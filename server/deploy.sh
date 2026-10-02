#!/usr/bin/env bash
#
# Deploy the server to production, with a way back.
#
# Before this existed, deployment was an rsync typed from memory and there was no way
# back at all: /root/nursecall_backend is not a git repository, so a bad release could
# only be fixed by remembering what the good one looked like. That is a bad position to
# be in at 2am with four wards running.
#
# What it does, in order, stopping at the first failure:
#   1. refuses to run with uncommitted changes or a red test suite
#   2. snapshots the live code and the database
#   3. rsyncs the new code
#   4. runs migrations
#   5. restarts and health-checks
#   6. on any failure after step 3, puts the old code back and restarts
#
#   ./server/deploy.sh              # the whole thing
#   ./server/deploy.sh --dry-run    # show what would be copied, change nothing
#   ./server/deploy.sh --rollback   # go back to the most recent snapshot
#
set -euo pipefail

HOST="${NURSECALL_HOST:-root@67.205.171.93}"
SSH_KEY="${NURSECALL_SSH_KEY:-$HOME/docean}"
REMOTE_DIR=/root/nursecall_backend
SNAPSHOT_DIR=/root/nursecall_releases
HEALTH_URL="${NURSECALL_HEALTH_URL:-https://nurcecall.boos.uz/api/v1/calls/active}"
KEEP_SNAPSHOTS=5

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$SSH_KEY" "$HOST")

# Never overwrite what only lives on the server: its secrets, its uploads, its venv,
# and the dashboard build (which this script builds and sends separately).
RSYNC_EXCLUDES=(
  --exclude='.venv/'
  --exclude='__pycache__/'
  --exclude='.env'
  --exclude='*.log'
  --exclude='static/'
  --exclude='dashboard/'
  --exclude='firebase-service-account.json'
  --exclude='tests/'
  --exclude='.pytest_cache/'
  --exclude='backups_dump/'
)

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mXATO: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- rollback

rollback_to_latest() {
  say "Oldingi versiyaga qaytarilmoqda"
  "${SSH[@]}" bash -se <<REMOTE
set -euo pipefail
latest=\$(ls -1d "$SNAPSHOT_DIR"/*/ 2>/dev/null | sort | tail -1 || true)
[ -n "\$latest" ] || { echo "snapshot topilmadi"; exit 1; }
echo "qaytarilmoqda: \$latest"
rsync -a --delete \
  --exclude='.venv/' --exclude='.env' --exclude='static/' \
  --exclude='firebase-service-account.json' \
  "\$latest" "$REMOTE_DIR/"
systemctl restart nursecall-api
REMOTE
  sleep 3
  check_health || fail "qaytarilgandan keyin ham sog'lik tekshiruvi o'tmadi — qo'lda ko'rish kerak"
  say "Qaytarildi va ishlayapti"
}

check_health() {
  # 401 is the right answer from an alerting route with no token: it proves the app is
  # up, routing, and talking to the database. A 502 or a timeout is what failure
  # actually looks like here.
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$HEALTH_URL" || echo 000)
  [[ "$code" == "401" || "$code" == "403" || "$code" == "200" ]]
}

if [[ "${1:-}" == "--rollback" ]]; then
  rollback_to_latest
  exit 0
fi

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ------------------------------------------------------------ preflight

say "Tekshiruvlar"

cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain -- server web-dashboard)" ]]; then
  git status --short -- server web-dashboard
  $DRY_RUN || fail "commit qilinmagan o'zgarishlar bor — avval commit qiling"
fi

GIT_SHA=$(git rev-parse --short HEAD)
echo "commit: $GIT_SHA"

if [[ -d server/.venv ]]; then
  ( cd server && .venv/bin/python -m pytest -q ) || fail "server testlari o'tmadi"
else
  echo "ogohlantirish: server/.venv yo'q, testlar o'tkazib yuborildi"
fi

say "Dashboard yig'ilmoqda"
( cd web-dashboard && npm run build >/dev/null ) || fail "dashboard yig'ilmadi"

if $DRY_RUN; then
  say "DRY RUN — yuborilmaydi, faqat farqlar"
  rsync -rcni "${RSYNC_EXCLUDES[@]}" -e "ssh -i $SSH_KEY" server/ "$HOST:$REMOTE_DIR/"
  exit 0
fi

# ------------------------------------------------------------- snapshot

STAMP=$(date +%Y%m%d_%H%M%S)
say "Zaxira nusxa olinmoqda ($STAMP)"
"${SSH[@]}" bash -se <<REMOTE
set -euo pipefail
mkdir -p "$SNAPSHOT_DIR/$STAMP"
rsync -a --exclude='.venv/' --exclude='__pycache__/' "$REMOTE_DIR/" "$SNAPSHOT_DIR/$STAMP/"
# A database snapshot too: a migration is the one step a code rollback cannot undo.
PGPASSFILE=/root/.pgpass pg_dump -h 127.0.0.1 -U nursecall nursecall_db \
  | gzip > "$SNAPSHOT_DIR/$STAMP/db.sql.gz"
ls -1d "$SNAPSHOT_DIR"/*/ | sort | head -n -$KEEP_SNAPSHOTS | xargs -r rm -rf
REMOTE

# ---------------------------------------------------------------- deploy

say "Kod yuborilmoqda"
rsync -rc --delete "${RSYNC_EXCLUDES[@]}" -e "ssh -i $SSH_KEY" server/ "$HOST:$REMOTE_DIR/"
rsync -rc --delete -e "ssh -i $SSH_KEY" web-dashboard/dist/ "$HOST:$REMOTE_DIR/dashboard/"

# static/ is excluded above and then handled here, separately and WITHOUT --delete.
# The directory holds two different kinds of thing: files that live in git (the
# landing page, the favicons) and files that only ever exist on the server (the
# APKs, which are 50MB and are uploaded after a build). Excluding the whole
# directory protected the second kind and silently never deployed the first --
# which is how an edited landing page sat in git for a day without reaching
# production. Listing git's own files is what keeps the two apart.
# `git ls-files` run from inside the directory already prints paths relative to
# it, so no rewriting is needed. The first version of this piped through `sed -z`,
# which exists in GNU sed and not in the BSD sed macOS ships -- it failed on the
# machine that runs this script, which is the only machine that runs this script.
say "static/ dagi versiyalangan fayllar"
( cd "$REPO_ROOT/server/static" && git ls-files ) \
  | rsync -rc --files-from=- -e "ssh -i $SSH_KEY" \
      "$REPO_ROOT/server/static/" "$HOST:$REMOTE_DIR/static/"

say "Migratsiya va qayta ishga tushirish"
if ! "${SSH[@]}" bash -se <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
.venv/bin/alembic upgrade head
systemctl restart nursecall-api
REMOTE
then
  rollback_to_latest
  fail "migratsiya yoki restart muvaffaqiyatsiz — eski versiya qaytarildi"
fi

say "Sog'lik tekshiruvi"
for attempt in 1 2 3 4 5; do
  sleep 2
  if check_health; then
    say "Tayyor — $GIT_SHA ishlayapti"
    "${SSH[@]}" "echo '$(date -Iseconds) $GIT_SHA' >> $SNAPSHOT_DIR/deployed.log"
    exit 0
  fi
  echo "  urinish $attempt: hali javob yo'q"
done

rollback_to_latest
fail "yangi versiya javob bermadi — eski versiya qaytarildi"
