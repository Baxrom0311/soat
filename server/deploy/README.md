# deploy/ — systemd units

Version-controlled copies of the units that run on the production box
(`/root/nursecall_backend`). Editing a file here does **not** change the server; it has
to be copied over and reloaded (below).

## nursecall-billing-warn.timer

Runs `jobs/check_expiring_subscriptions.py` once a day at **05:30 UTC (10:30 Toshkent)**,
`Persistent=true` so a run missed while the server was down fires on the next boot.

The job is read-only. It loads every clinic, keeps the ones
`app.core.billing.needs_expiry_warning()` flags — i.e. from `BILLING_WARN_BEFORE_DAYS`
(default 5) ahead of `paid_until` all the way through the grace window — and sends **one
summary message** listing each of them with:

- clinic name,
- days left (or how many days overdue),
- the date management access is actually cut (`billing.blocked_at`, = `paid_until` +
  `BILLING_GRACE_PERIOD_DAYS`),
- the amount owed (`billing.effective_price`, from the clinic's plan and device count).

Trial clinics, clinics with `enforcement_enabled=False` and already-blocked clinics are
never warned. Nothing is written to the DB, so the job is safe to run as often as you
like. Network failures on one channel are logged and the other channel still fires; the
unit only exits non-zero if the DB itself was unreachable.

## Env vars (read from `/root/nursecall_backend/.env`)

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NTFY_TOPIC_URL` | optional | `""` | Full ntfy topic URL, e.g. `https://ntfy.sh/<maxfiy-topic>` |
| `TELEGRAM_BOT_TOKEN` | optional | `""` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | optional | `""` | Chat id the message is sent to |
| `BILLING_WARN_BEFORE_DAYS` | optional | `5` | How far ahead of `paid_until` warning starts |
| `BILLING_GRACE_PERIOD_DAYS` | optional | `3` | Grace window after `paid_until` |

Each channel is independent: an unconfigured one is skipped with a log line. Telegram
needs **both** the token and the chat id. If neither channel is configured the job logs a
warning and sends nothing.

## Install

```bash
cd /root/nursecall_backend/deploy
cp nursecall-billing-warn.service nursecall-billing-warn.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nursecall-billing-warn.timer
systemctl list-timers nursecall-billing-warn.timer
```

## Test

```bash
# 1. safe: prints the exact message, sends nothing
cd /root/nursecall_backend && .venv/bin/python -m jobs.check_expiring_subscriptions --dry-run

# 2. real run, on demand (sends to whichever channels are configured)
systemctl start nursecall-billing-warn.service
journalctl -u nursecall-billing-warn.service -n 50 --no-pager
```

## ⚠️ Still needed from the vendor: a Telegram bot

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` cannot be created from our side. Bahrom must:

1. open **@BotFather** in Telegram, send `/newbot`, pick a name → BotFather returns the
   token → that is `TELEGRAM_BOT_TOKEN`;
2. send any message to the new bot (a bot cannot start a chat), then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[0].message.chat.id`
   → that is `TELEGRAM_CHAT_ID` (or add the bot to a group and use the group's negative
   id);
3. put both into `/root/nursecall_backend/.env`.

Until then **only the ntfy channel fires** — the timer still works and still warns, the
Telegram half is just skipped with a log line. No restart of the API is needed; the
timer's next run picks up the new `.env` values.
