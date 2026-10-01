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

## nursecall-device-offline.timer

Runs `jobs/check_offline_devices.py` **every 10 minutes** (not daily like the billing
warning: a dead receiver means the ward it covers is uncovered right now, so the useful
unit of delay is minutes, not hours).

A receiver that stops heartbeating is otherwise invisible. The clinic sees a dashboard
with no calls on it, which looks exactly like a quiet ward; nobody finds out until a
patient presses a button and nothing happens. When this job was written, **Med Star had
been completely without coverage for three and a half days** and neither the vendor nor
the clinic knew.

It reports:

- **newly silent receivers** — `last_seen_at` older than `DEVICE_OFFLINE_ALERT_MINUTES`;
- **whole-clinic outages** — a clinic with no working receiver at all, sent at ntfy
  priority `urgent` instead of `high`, because that clinic is not covered;
- **recoveries** — a receiver that was reported down and has started heartbeating again,
  so an outage that resolves itself does not stay open in the vendor's head.

Devices with `last_seen_at IS NULL` never trigger an alert on their own: they were
registered but never connected even once, which is a setup mistake visible in the
dashboard, not an outage. They are listed for context inside a clinic that is already
being reported, and they do count towards "this clinic has no coverage".

### Why it does not spam

The job writes exactly one column, `devices.offline_alerted_at`: its memory of what it
has already reported. Set when an alert goes out, cleared when the device comes back
(which is what produces the recovery line). Without it, a receiver down for three days
would be announced 144 times a day, and an alert that fires constantly is one nobody
reads — the same as having no alert at all.

Delivery failure is handled the other way round on purpose: if **no** channel accepted
the message, nothing is marked as reported and the next run tries again. A duplicate
alert is much cheaper than an outage the vendor never hears about.

## Env vars (read from `/root/nursecall_backend/.env`)

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NTFY_TOPIC_URL` | optional | `""` | Full ntfy topic URL, e.g. `https://ntfy.sh/<maxfiy-topic>` |
| `TELEGRAM_BOT_TOKEN` | optional | `""` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | optional | `""` | Chat id the message is sent to |
| `DEVICE_OFFLINE_ALERT_MINUTES` | optional | `20` | Silence before a receiver is called offline. Far longer than the dashboard's 3-minute `DEVICE_ONLINE_WINDOW_SECONDS`: an alert that fires on a wifi blip trains you to ignore it |
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

cp nursecall-device-offline.service nursecall-device-offline.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nursecall-device-offline.timer
systemctl list-timers nursecall-device-offline.timer
```

The offline job needs migration `0008_device_offline` applied first (it adds
`devices.offline_alerted_at`); without it every run exits non-zero on an unknown column.

## Test

```bash
# 1. safe: prints the exact message, sends nothing
cd /root/nursecall_backend && .venv/bin/python -m jobs.check_expiring_subscriptions --dry-run

# 2. real run, on demand (sends to whichever channels are configured)
systemctl start nursecall-billing-warn.service
journalctl -u nursecall-billing-warn.service -n 50 --no-pager

# same two steps for the offline check
cd /root/nursecall_backend && .venv/bin/python -m jobs.check_offline_devices --dry-run
systemctl start nursecall-device-offline.service
journalctl -u nursecall-device-offline.service -n 50 --no-pager
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

## nursecall-expire-calls.timer

Runs `jobs/expire_stale_calls.py` **every hour**, `Persistent=true`.

Nothing in the system ever closed a call. A patient presses a button, a row goes active,
and unless a nurse taps acknowledge it stays active forever — on her screen, in the badge
count, and in the re-alert job's view of who is still waiting. When this was written: 28
open calls across four clinics, 22 at one of them, the oldest **six days** old.

After `CALL_EXPIRE_HOURS` (default 12) such a call is closed as `expired` — never as
`acknowledged`, because nobody acknowledged it. Every answer-time figure in the product
is computed from `acknowledged_at`, so an expired call is excluded from them by
construction rather than by each caller remembering to.

Twelve hours is longer than any shift at these clinics, so an expired call is one that no
shift ever closed, never one a nurse was about to reach. The write is a single
`UPDATE ... WHERE status = 'active'`, the same condition the acknowledge path uses, so a
nurse answering at the stroke of the deadline keeps the answer and the clock changes
nothing.

`--dry-run` lists what would be closed, per clinic and room, without writing.

## nursecall-backup.timer

Runs `scripts/backup.sh` daily at **03:15 UTC**. `pg_dump | gzip` into
`/root/nursecall_backups` (7 days kept), then a second copy onto the attached volume (30
days). A failed dump sends an urgent ntfy alert; a failed volume copy only warns, because
the primary backup already succeeded.

The script reads `NTFY_TOPIC_URL` from the server's `.env`. The topic is effectively a
password — anyone who knows it can read every alert and post fake ones — so it is not in
this repository.

**These backups are not proven until one has been restored.** Restore the most recent dump
into the staging database (below) and compare clinic and call counts. Worth doing monthly.

## nursecall-uptime.timer

Runs `scripts/uptime_check.sh` every **5 minutes**: one HTTPS request to the public host,
an urgent ntfy alert when it stops answering and a quiet one when it comes back. It keeps
its memory in `.uptime_state` so a long outage is announced once, not every five minutes.

## Deploying

`server/deploy.sh` from the repository root. It refuses to run with uncommitted changes or
a failing test suite, snapshots the live code *and* the database into
`/root/nursecall_releases`, rsyncs, migrates, restarts, health-checks — and puts the old
code back if any of that fails. `--dry-run` shows what would change; `--rollback` returns
to the most recent snapshot.

## Rotating the JWT signing key

The server verifies against `JWT_SECRET_OLD` as well as `JWT_SECRET`, and signs only with
`JWT_SECRET`. So a key can be replaced without logging out a ward mid-shift:

1. `JWT_SECRET_OLD=<the current secret>` and `JWT_SECRET=<a new one>` in `.env`
2. restart — every token in a nurse's pocket keeps working, every new one uses the new key
3. after `JWT_EXPIRE_MINUTES` has passed (90 days), clear `JWT_SECRET_OLD` and restart

Step 3 is the one that actually ends the exposure; skipping it leaves the old key working
forever, which is what the rotation was for.

## scripts/restore_check.sh — proving the backups

Restores the most recent dump into `nursecall_staging` and compares every table's row
count, plus the Alembic version, against production. Exits non-zero on any mismatch.

It does double duty: it is the only evidence the backups work, and it leaves behind the
staging database the project did not have, so a migration can be rehearsed somewhere
other than four live hospitals.

First run, 2026-10-01: every table matched (8 clinics, 27 staff, 1 393 calls) at
`0010_call_expired`. One error appears and is expected — `unrecognized configuration
parameter "transaction_timeout"`, because the dump is written by a newer `pg_dump` than
the `psql` replaying it. Anything else in that list is worth reading.

Run it monthly, and before any migration that is hard to reverse.
