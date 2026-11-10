# K9 Service Center — Bot API 10.4 deployment

Deployed and verified on 10 November 2026, 05:21 UTC. This report supersedes the earlier local-only status in the audit and implementation history.

- Website: https://k9-service.kimshikano.workers.dev/
- Application source: `194d8c306ab658146202e3ca3d970a0e805c752c`.
- Verified Worker version: `818c9ca5-bc5a-48dd-b293-36e82d159ffd`, 100% traffic.
- Widgets: enabled through the production `K9_WIDGETS_ENABLED=1` binding.
- Immediate rollback version: `953228e9-164c-4ff0-9e88-fe842cc1f492` — verified compatibility release with Widgets off.
- Original runtime rollback: `6c48a91e-caf1-4c01-ab0e-bdf4d08e1c92`.
- Original repository baseline: `984d06b565f1079d006614d32f330b304567ecd0`.
- Production D1 binding remains `k9-service-db`; no replacement, reset or customer-data rewrite.
- Successful deployment evidence: [run 42761382476](https://github.com/Kimshika9/k9-service/actions/runs/42761382476).
- [Sanitized metadata artifact](https://github.com/Kimshika9/k9-service/actions/runs/42761382476/artifacts/13737234710): no raw exports, credentials or customer rows.

## Phase results

| Phase | Inspection and changes | Files / evidence | Result and remaining limits |
| --- | --- | --- | --- |
| 1 — Audit | Existing Worker/webhook, Python utility, D1, authorization, payment/receipt handling, Rich Messages, emoji roles, hosting queue, migrations and deployment scripts inspected. Actual live subscriptions and readiness rechecked. | [Audit](telegram-10.4-audit.md); `bot.py`, `worker/`, `app/api/telegram/`, `lib/telegram*.ts`, `lib/emoji-manager.ts`, `lib/order-engine.ts`, `lib/hosting.ts`, `db/schema.ts`, hosting files, tests/configuration | Complete. Live URL matched the configured bot. Initial subscription set contained message/callback only, pending updates 0, no Telegram delivery error. Public production probes now return 200; the earlier executor 403 did not establish a production secret mismatch. |
| 2 — API layer | Typed official HTTP wrappers for sendWidget, answerWidgetQuery, editMessageWidgetData; payload/encoding limits and timeouts; existing transport retained. | `lib/telegram-widget-api.ts`, `lib/telegram.ts`; Widget/emoji/Rich Message tests | Implemented and tested. Real private-chat send and edit succeeded. Shared methods intentionally omitted because these views contain private state and have no shared-widget use case. No framework or dependency upgrade. |
| 3 — Webhook | Added widget_query subscriptions, separate routing, sender/role/order checks, persistent atomic replay/rate limiting, safe failures and bounded answers. | `bot.py`, setup/status/webhook routes; `lib/telegram-webhook-validation.ts`, `lib/telegram-widget-response.ts`, `lib/telegram-widgets.ts` | Implemented and deployed. All three subscriptions retained; pending updates 0 and no delivery error. Preparation is bounded at 6 seconds, answer work at 2.5 seconds, before edits. Timing/replay/failure scenarios passed compiled-Worker tests; an actual user-generated Widget query was not automated. |
| 4 — Widget UI | Four compact, inline, sandbox-safe templates; English/Myanmar text; captions and conventional controls; no external fonts/network/text entry. | `lib/telegram-widget-ui.ts`, `lib/i18n/widgets/`; template/DOM/limit tests | Implemented. Largest template 2,709 UTF-8 bytes / 1,272 zlib bytes. Android visual rendering, older-client appearance and native Burmese wording still need device review; they are not claimed as visually verified. |
| 5 — Customer orders | DB-backed tracking, safe references, refresh, authorized Mini App links and best-effort status synchronization after committed owner actions. | Order engine, Widget orchestration, Mini App track navigation, schema and `drizzle/0004_nebulous_retro_girl.sql` | Implemented/deployed. Synthetic customer submission, payment policy, isolation, owner transitions and restart tests passed. No real customer order/payment was created or modified for release QA. |
| 6 — Owner/hosting | Read-only owner counts and recorded hosting observations; owner commands and existing detailed dashboard/manual KBZPay flow retained. | Owner/hosting Widget code, queue heartbeat extension and optional Python heartbeat; Python hosting tests | Live owner Summary and Hosting Status commands returned 200 and persisted message references after real Telegram delivery. Hosting queue check returned 200 without claiming/acknowledging jobs. External bot-hosting.net runtime was not redeployed; no running child/heartbeat is invented. |
| 7 — Regression/security | Widget limits/routing/fallbacks, Premium Emoji persistence, Rich fallback, auth/isolation, orders/payments, duplicate updates, invalid actions, API failures/timeouts, additive migration, queue and reconnection coverage. | `pnpm test`, `pnpm test:api`, `pnpm typecheck`, `pnpm build`; Python suites; `scripts/test-release-*` | Automated checks passed; 39 Python tests passed. Release-script lint passed. Whole-project lint previously failed at the unchanged baseline of 33 errors / 50 warnings; it is not claimed clean. |
| 8 — Deployment | Verified actual DB/version identities; private supported export + restore comparison; separate staging D1/private preview; inherited protected secrets; candidate binding verification; additive migration; controlled rollout and monitoring. | `.github/workflows/telegram-10-4-release.yml`, `scripts/release-*`; run above | Deployed/active with three successful live observations. A prior probe failure triggered a successful automatic Worker rollback; probing was corrected before successful releases. Device-level acceptance remains separate from verified HTTP/API behavior. |

See [implementation history](telegram-10.4-implementation.md) for the detailed feature and test inventory.

## Verified live behavior

Three observations after activation each recorded:

| Check | Actual result |
| --- | --- |
| Website / JavaScript asset | 200 / 200 |
| Public health | 200; ready=true; database, hostingQueue and widgets=true |
| Signed owner order access | 200 |
| Unauthenticated owner access | 401 |
| Wrong webhook secret | 401 |
| Authenticated malformed update | 200, safely ignored |
| Authenticated hosting queue check | 200 |
| Webhook URL and all required subscriptions | Match / ready |
| Telegram pending updates / delivery error | 0 / none |

The release helper sent **synthetic, authenticated, read-only owner command probes** for `/widgets` and `/hostingstatus` through the active production Worker. Both returned 200; real Telegram Widget sends created active D1 message references. These probes were not represented as real Telegram-origin updates. Customer data, payment decisions and hosting jobs were untouched.

## Backup and migration

Production was exported through Cloudflare's supported D1 export endpoint. Full SQL stayed only in private temporary runner storage and private Cloudflare resources. It was never committed, logged or uploaded to GitHub artifacts.

The pre-activation private restored snapshot is `k9-service-backup-20261110052022`; 14 tables were verified against the original exported snapshot, including exact receipt BLOBs, nulls, Unicode and column metadata. Source foreign-key violations: 0. Older private snapshots were retained.

Native receipt exports contained statements exceeding D1's statement limit. Backup-only preparation split large values into statements no larger than 32,192 bytes, created referenced schemas first and restored parent rows before child rows. It verified the transformed export against the original before upload, then compared a fresh export of the restored backup. Production receipt rows were not transformed.

Migration 0004 creates only `telegram_widget_messages`, `telegram_widget_queries`, `hosting_health` and indexes. It was applied once during rollout and retained through Worker rollback; later deployments found no pending migration.

Staging used `k9-service-stage-20261110045452`, a separate empty D1, and an authenticated, short-lived edge preview. A separate test bot was unavailable: protected existing bot bindings were inherited solely in that private preview for owner-only Telegram tests. The live webhook URL was never redirected to staging. Preview credentials were excluded from artifacts and removed from the runner.

## Build measurements

| Measurement | Bytes |
| --- | ---: |
| Client JS/CSS, 28 files, aggregate raw size | 1,364,327 |
| Server JS/CSS, 97 files, aggregate raw size | 1,919,772 |
| Largest client JS, existing scene chunk | 555,131 raw / 138,481 gzip |

These totals are file sizes, not first-page transfer size. The existing >500kB scene warning and vinext route-classification warnings remain.

## Rollback

To disable Widgets promptly while retaining the verified API compatibility release, deploy Worker version `953228e9-164c-4ff0-9e88-fe842cc1f492` to 100%. The original pre-upgrade version above also remains available. Keep the same D1 and protected secrets.

Do **not** drop additive tables or restore the production DB in place as an ordinary code rollback. New customer records after a backup must be preserved. A database restore needs its own recovery assessment; the release workflow never performs an in-place D1 restore.

## Remaining acceptance work

- On the owner's Telegram Android client, refresh the delivered Summary/Hosting cards and open the existing dashboard.
- Review English/Myanmar layout, client fallback appearance, Premium Emoji rendering and order-detail navigation on actual devices.
- Run a genuine customer/owner end-to-end acceptance order using designated accounts when available; automated equivalent coverage already passed with isolated synthetic data.
- Deploy the optional Python heartbeat through the existing external hosting workflow if recorded live runtime observations are wanted. Until a fresh verified heartbeat exists, the Hosting Widget correctly shows unknown/stale rather than claiming a bot is running.
