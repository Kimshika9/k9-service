# K9 Service Center · controlled Widget rollout

This is a runbook, not an executed deployment. Production authorization has not
been granted. The work is on local branch `upgrade/telegram-10-4`; nothing has
been pushed to main or deployed. Repository rollback candidate:
`984d06b565f1079d006614d32f330b304567ecd0`. First record the actual live Worker
version and its source commit; they are not known from this checkout.

## Local verification

The implementation adds no dependency and leaves the lockfile unchanged.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
python3 -m unittest discover -s scripts -p 'test_*.py'
env -u WORKERS_CI -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID pnpm build
pnpm test:api
```

Build before API tests: they execute the compiled Worker under Miniflare with
an independent local D1 and a mocked Telegram HTTP service. API tests never
call a real bot. The Widget test restarts the Worker and reuses only its own
temporary synthetic database, then deletes that temporary directory.

Do not run `pnpm deploy`, `pnpm db:migrate`, or main's automatic Cloudflare
build workflow during local review. Existing deploy/build preparation can
create/resolve D1 and apply remote migrations. Those behaviors were preserved.

## Staging configuration

Use an isolated checkout with no copied `.dev.vars`, `.env`, connector settings,
hosting project folders, or production exports. Provision a separate Telegram
test bot, Worker and D1 before deployment; none were provisioned by this task.

| Value | Staging requirement |
| --- | --- |
| `wrangler.jsonc` name | A distinct staging Worker name |
| D1 `DB` binding | Staging database name and its verified real UUID; never production or the zero placeholder |
| `K9_PUBLIC_ORIGIN`, `SITE_URL` | The staging base HTTPS origin, no `/owner` suffix |
| `BOT_TOKEN`, `BOT_USERNAME` | Only the test bot |
| `OWNER_TELEGRAM_ID` | Verified numeric test owner account |
| `TELEGRAM_WEBHOOK_SECRET` | Independent staging secret |
| `K9_HOSTING_SECRET` | Independent staging hosting secret, distinct from the webhook secret |
| `K9_WIDGETS_ENABLED` | Start with `0`; change to `1` only after migration/preflight |
| Python `K9_HOSTING_HEARTBEAT` | Optional `1` on the staging hosting worker, default off |
| Python hosting data/runtime | Separate private staging directory and test child; never production projects/child deployment |

Inspect both source and generated deployment configuration. Do not merely use
a staging Worker name with a production DB binding. Do not use a preview that
inherits production resources for migration or order tests.

After verifying these bindings, apply migrations to the **staging** DB, build
and deploy the staging Worker through the existing workflow. Configure the
Python connector in this staging checkout with only staging values. Its
`--connect` mode changes that bot's webhook/menu, so verify the target first.
The connector checks that Telegram retained all three subscriptions:
`message`, `callback_query`, `widget_query`. Pending updates are never dropped.

The authenticated `/api/telegram/status` now reports safe `allowedUpdates` and
`subscriptionsReady`. A correct URL alone is insufficient. `/api/health` checks
all Widget columns when enabled, without reading customer records.

## Real-chat acceptance

Use two customer accounts and the owner in private chats with the test bot.

1. Place an order through the existing bot and through the Mini App. Refresh
   the order card and open **Open order details** below it. Confirm the Mini App
   receives real Telegram launch data and opens the authorized order panel.
2. Try the other customer's order URL, card reference and forged refresh
   action. No order data should be disclosed. Try owner controls as a customer.
3. Keep the customer card visible while the owner changes the order through
   the existing dashboard. Check the state, caption and regular bot updates.
   Do not bypass manual KBZPay verification or simulate real customer payments.
4. Check existing Premium emoji/owner roles, Rich Message formatting and
   conventional message fallback. Test the caption/inline controls on a client
   without Widget support. Payload tests do not prove old-client rendering.
5. Owner: `/widgets` or Start → **Owner summary**; `/hostingstatus` or Start →
   **Hosting status**. Detailed order actions and receipts stay in the existing
   owner dashboard; existing authorized status callbacks also remain available.
6. Without heartbeat data, confirm health is unknown. With the opt-in staging
   worker, check the actual observation and counts. Stop that worker, wait over
   two minutes, then refresh: no current running count should be asserted.
7. Confirm hosting upload, entry selection, start/stop/restart, claim/ack and
   emoji sync still work. Restart the staging worker with its existing private
   data directory. Confirm queue replay cannot repeat a completed action.
8. Test Android at 320px and typical phone width, English/Myanmar, long service
   names and light/dark Telegram themes. Widgets have no text inputs or external
   fonts/network. Native Myanmar review is still required.

Telegram production currently supports Widgets only in the bot's private chat.
No group, inline, shared or forwarded customer/owner Widgets are enabled.
References: <https://core.telegram.org/bots/widgets> and
<https://core.telegram.org/bots/api>.

## Production gate and backup

Before asking for explicit production deployment authorization, retain the
staging evidence, target Worker version/commit, exact DB identity, expected
subscriptions, and a rollback operator/runbook. Current production probes from
this environment returned HTTP 403; investigate through an authorized
Cloudflare session without assuming a webhook secret mismatch.

Export production D1 using the supported Cloudflare export command, after the
real binding has been verified. Use a private directory outside Git with
`umask 077`. The export can contain receipts and financial/customer data:
never attach it to a PR, chat, report or public artifact.

```sh
umask 077
mkdir -p "$HOME/k9-private-backups"
k9_backup_file="$HOME/k9-private-backups/k9-service-$(date -u +%Y%m%dT%H%M%SZ).sql"
pnpm exec wrangler d1 export k9-service-db --remote --config wrangler.jsonc --output="$k9_backup_file"
```

Verify this private destination before running the commands. They were not run.
Resolve the actual production DB ID in the audited configuration first;
do not run the repository auto-prepare helper just to discover it.

Verify the export and restore it to a separate disposable database. Confirm
record counts and private receipt round-trips there. Record the pre-change
Worker version. Migration 0004 only creates three tables and their indexes;
it does not rewrite any existing order, receipt, setting, session or queue job.

Export reference:
<https://developers.cloudflare.com/d1/best-practices/import-export-data/>.

Only after explicit deployment authorization: apply the additive migration,
deploy with Widgets disabled, check the old flows, verify subscriptions with
the existing setup, and then enable Widgets for the controlled rollout.
These are separate production changes; do not silently rotate secrets.

Monitor safe aggregate webhook errors/backlog, HTTP failures, Widget error
stages/codes, owner/customer access failures and heartbeat freshness. Do not
log update bodies, chat IDs, widget state, receipts, financial values, tokens
or raw Telegram error descriptions. Current Widget logs only contain a stage
and numeric API code or `unavailable`.

## Rollback

1. Disable `K9_WIDGETS_ENABLED`; turn off optional heartbeat reporting if needed.
2. Restore the recorded known-good Worker version through Cloudflare. Confirm
   original website, Mini App, owner dashboard, payments and queue operate.
3. Reapply the recorded webhook subscription list using the known bot/secret
   only if subscriptions need reverting; keep `drop_pending_updates=false`.
4. Retain all additive tables. Old code ignores them. Do not roll the database
   back over orders/payments created after deployment. Database recovery needs
   a separate reconciliation decision and verified backup.
5. Old Widget cards respond as disabled/unavailable; normal Mini App controls
   remain. A new template needs a new message because sent HTML is immutable.

## Operational limits

- Query preparation is bounded to 6 seconds, answer transport to 2.5 seconds,
  before any state/caption edit. Delivery latency before the Worker receives
  the update still requires real Telegram staging verification.
- Rate limits are persisted in D1: 5 accepted queries per user per 5 seconds.
  Both query IDs and update IDs are deduplicated across Worker restarts.
- Cards are private, non-shared, versioned and expire after 90 days. Explicit
  replacement retires the old reference; request a fresh card from `/orders`.
- Push updates are best effort. Telegram failures never undo a committed
  order/payment. Refresh reloads from D1 and repairs state/caption; there is no
  new background retry/outbox service or infrastructure in this upgrade.
- Hosting heartbeats report at most 20 child observations per sample; further
  projects count as unknown. Only coarse counters/runtime/receipt time are
  stored. A fresh worker observation is not proof of a bot's Telegram responses
  or business behavior. Stale observations do not assert running child counts.
- Rich/Premium Emoji implementations and their saved role IDs are unchanged.
  Widget essential content also appears in the caption because current Widget
  accessibility semantics are limited.
