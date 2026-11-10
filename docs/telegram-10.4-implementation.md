# K9 Service Center · local upgrade results

10 November 2026 (Asia/Yangon). Local branch: `upgrade/telegram-10-4`.
Baseline: `984d06b565f1079d006614d32f330b304567ecd0`. Remote main was checked
again after implementation and still points to this baseline. No push, staging
deployment or production deployment was performed.

**Repository audit and local implementation/testing are complete. Live
production readiness is not certified.** Widgets are disabled by default.

Companion documents: `docs/telegram-10.4-audit.md` contains baseline evidence,
minimum changes, compatibility decisions and regression risks;
`docs/telegram-10.4-rollout.md` contains staging, backup and rollback procedures.

## Phase 1 · audit

Inspected the existing Cloudflare webhook/Worker, Python connector, Mini App,
owner/customer authorization, Rich/Premium Emoji code and saved roles, order
engine, payment/receipt access, hosting worker/queue, D1 schema/migrations,
dependencies, build/deploy scripts and tests. The existing implementation was
retained rather than replaced. The detailed audit is committed separately.

Baseline checks passed for unit/API integration, typecheck, build and 34 Python
tests. Baseline lint failed with 33 errors and 50 warnings. Live read-only
health/connection probes returned HTTP 403 from this environment; this cannot
establish the current production webhook secret, subscriptions or queue health.

Status: repository/local baseline complete; live inspection remains blocked.

## Phase 2 · compatibility layer

Changed `lib/telegram-widget-api.ts` and the existing `lib/telegram.ts` transport.
Added typed `sendWidget`, `answerWidgetQuery`, `editMessageWidgetData` wrappers
over Telegram's official HTTPS API. Existing calls retain their 12-second
timeout; Widget answer/edit calls use shorter timeouts. No bot framework,
dependency upgrade or lockfile change was introduced.

HTML, compressed HTML, caption, UTF-8 validity, state and private target checks
run before sending. Widgets use private `chat_data`, never shared/public
customer state. `sendSharedWidget` / `editSharedWidgetData` were deliberately
deferred because none of these four private views has an appropriate public
shared-state use case. No unused or fake shared implementation was added.

Verified typed method payloads/timeouts and encoding/limit failures in
`scripts/test-telegram-widgets.mjs`; verified API rejection handling in the
compiled Worker integration test. Existing Rich/Premium Emoji tests pass.

Status: implemented and locally tested; real Telegram methods need staging.

## Phase 3 · webhook integration

Changed `bot.py`, Telegram setup/status/webhook routes and related tests.
Setup includes and verifies `message`, `callback_query`, `widget_query`, keeping
`drop_pending_updates=false`. Existing optional phone polling bridge was not
introduced or made the default; it only uses the same subscription list.

New `lib/telegram-webhook-validation.ts` validates bounded request bodies,
update identity/shape, callback data and private sender/chat identity. Widget
queries route before ordinary message/callback handling. Private message
references are bound to user, chat, kind, resource, template and expiry in D1.
Refresh is the only accepted Widget query action. Owner-only summaries require
the configured server owner ID; customer cards recheck the order's actor key.

Query/update replay records and the 5-per-user/5-second rate limit persist in
D1. Their atomic claim also records the update in existing `webhook_updates`.
`lib/telegram-widget-response.ts` caps preparation at 6 seconds and answer work
at 2.5 seconds, before any state/caption editing. Late preparation cannot edit
a Widget after a timeout response. Logs contain safe stages/codes only.

Tests cover wrong secrets, invalid/mixed updates, invalid actions, unsupported
wallet/shared/inline/group contexts, forged sender/reference, concurrent query
limits, duplicate query/update IDs, missing/expired/old messages, stalled
preparation/answers, answer-before-edit and Worker restart persistence.

Status: implemented and locally tested. Real Telegram delivery delay and the
15-second end-to-end deadline still require staging evidence.

## Phase 4 · reusable Widget UI

Added `lib/telegram-widget-ui.ts` plus EN/Myanmar copy under `lib/i18n/widgets/`.
There are four templates, each in both languages. New Myanmar strings are
explicitly marked “needs native review”. English is the default; Telegram's
`language_code=my` selects Myanmar when requesting a new card.

| Template | EN HTML / zlib bytes | Myanmar HTML / zlib bytes |
| --- | --- | --- |
| Service preview | 2043 / 1038 | 2500 / 1202 |
| Customer order | 2024 / 1033 | 2438 / 1205 |
| Owner summary | 2129 / 1064 | 2577 / 1237 |
| Hosting status | 2227 / 1090 | 2709 / 1272 |

All are below 32768 HTML bytes and 4096 bytes with zlib level 9. They contain
inline CSS/JavaScript only, no network/fonts/libraries/text entry. Data becomes
literal text nodes, never executable HTML. Updates with older revisions are
ignored. Essential information is also in a caption; conventional Refresh and
Mini App controls work without the Widget UI. No external imagery or 3D code
was added.

Colors reuse the actual K9 void/lavender/violet tokens; minimum button target is
48px, system type is 17px English / 18px Myanmar with 1.8 line height. Static
contrast checks: body 17.86:1, secondary 11.11:1, heading 13.14:1, button 7.27:1.
Telegram theme hint colors are client-dependent and need device review.

Tests render scripts against a sandbox-style DOM shim, check text injection,
initial/state-change behavior, revisions, captions and both size limits. This
does not claim native Telegram visual/accessibility verification.

Status: implemented and locally tested; native rendering/Myanmar review pending.

## Phase 5 · customer order tracking

Added `lib/telegram-widgets.ts`, connected `lib/order-engine.ts`, and made a
small navigation addition in `app/studio.tsx`. New Telegram-backed orders can
receive a private tracking card; `/orders` retains the original readable list
and exposes card controls when enabled. Service selection retains the existing
draft flow and can also send a preview.

The card shows saved service name, a short reference and canonical status only.
No percentage, delivery date, amount, receipt, contact, internal note or payment
transaction is placed in Widget state. Refresh reloads from D1. **Open order
details** is a conventional `web_app` button into the existing Mini App; `track`
is only a navigation hint. The existing authenticated `/api/orders/:id` call
still decides access.

Central order commits synchronize state and captions after the database commit,
including owner, customer and payment transitions. Telegram failure never rolls
back a saved order/payment. Updates are best effort; manual refresh repairs
missed edits. No separate background retry/outbox system was introduced.

Migration `0004_nebulous_retro_girl.sql` creates only:

- `telegram_widget_messages`: private, versioned, expiring message references.
- `telegram_widget_queries`: persistent query/update dedupe and rate history.
- `hosting_health`: optional authenticated observations.

Existing rows/schema are unchanged; the migration test seeds every pre-existing
table, compares before/after hashes and checks SQLite integrity/foreign keys.
The generated Drizzle journal/snapshot is included. If the migration is absent,
enabled Widget readiness fails, while valid customer orders can still save.

Tests verify cross-customer HTTP/Widget isolation, forged references, automatic
cards, status/caption changes, missing/old cards and restart recovery. Existing
direct bot ordering, receipts, sessions and optimistic concurrency tests pass.

Status: implemented and locally tested; actual Mini App launch remains a staging
acceptance item.

## Phase 6 · owner and hosting

Owner `/widgets` / Start → Owner summary shows aggregate order counts and opens
the existing authenticated dashboard. Group definitions are explicit:

| Label | Stored statuses counted |
| --- | --- |
| New orders | `New`, `Pending Payment` |
| Pending review | `Pending Review`, `Pending Approval` |
| Processing | `Processing`, legacy `In Progress` |
| Delivered / Done | `Delivered`, `Done`, legacy `Completed` |

Owner-origin/test-owner records remain excluded as in the existing owner list.
The Widget itself is read only. Approved order actions continue through the
existing dashboard/status callbacks with server owner authorization, order
version checks and payment policy. KBZPay verification remains manual.

Owner `/hostingstatus` / Start → Hosting status reads D1 observations. Changed
only the existing hosting queue route, `hosting/__main__.py` and readiness probe
to add the optional `heartbeat` operation. Claim/ack payloads, lease duration,
projects, child runtime, secrets and deployment infrastructure are preserved.

The Python reporter is opt in (`K9_HOSTING_HEARTBEAT=1`), samples coarse actual
runtime state at most every 30 seconds, and never uploads names/logs/tokens.
Server receipt time defines freshness. No observation means unknown; after two
minutes no current running count is asserted. Heartbeat failures do not stop
normal queue processing. More than 20 projects are counted as unknown beyond
the sampled set. This is runtime telemetry, not application-response monitoring.

Python/API tests cover opt-in, redacted errors, throttling, missing/stale health,
invalid/unauthorized observations and unchanged hosting queue/replay behavior.

Status: implemented and locally tested; actual bot-hosting.net heartbeat and
child restart behavior still need the separate staging runtime.

## Phase 7 · actual verification results

| Command | Final result |
| --- | --- |
| `pnpm test` | Passed, including existing regressions and new Widget unit tests |
| `pnpm test:api` | Passed: old integration, unconfigured connection and new compiled Worker/D1 Widget integration |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed with production/CI credentials removed |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | Passed: 36 tests |
| `python3 scripts/test_local_hosting.py` | Passed: 13 tests after test-race correction |
| `pnpm exec eslint . --format json` | Failed: 33 errors, 50 warnings, unchanged baseline counts |
| New Widget module/test lint findings | 0 |
| `git diff --check` | Passed |

Failures encountered were not suppressed. The full Python suite exposed an
existing double-`/proc` read race in the orphan-cleanup test: a process could
disappear between reads, yielding `None` before indexing. Both predicates now
sample once. This changes only the test, not runtime recovery. The full suite
and focused hosting suite passed afterward. During new-test development, two
harness assertions were corrected: escaped JSON NUL is valid text, and
answer/edit ordering must be scoped to the queried update rather than earlier
automatic edits. The final tests still enforce the intended security/limits.

Expected safe Widget error logs occur during injected missing-schema,
unauthorized-reference and Telegram 400/500 tests. They are fault injection,
not unexplained passing-test production errors.

The build retains existing warnings for a >500kB raw chunk and vinext's unknown
route classification. No dependency or large 3D change was made. Final bundle
measurements (all client JS chunks, not first-load transfer): 1,185,252 raw
bytes / 331,342 bytes summed gzip. The lazy scene is 555,131 raw / 137,221 gzip
bytes; studio is 89,725 raw / 28,076 gzip bytes. Native phone frame rate and
Telegram rendering were not measured.

Status: automated local scope complete. Whole-project lint debt and live client
acceptance remain release risks; a passing local suite is not live readiness.

## Phase 8 · deployment status and remaining gates

**Not executed.** No production D1 export/migration, staging resource creation,
webhook/menu mutation, secret update, deploy or live chat verification occurred.
No hosting project was altered. Repository main and production resources remain
untouched by this work.

Remaining gates:

1. Authorized Cloudflare access to identify actual production version/DB and
   investigate the observed HTTP 403 responses.
2. Separate staging bot/Worker/D1 and test hosting runtime with independent
   credentials; synthetic data only.
3. Real private-chat Widget/old-client/Android/Myanmar acceptance, existing Mini
   App/owner/payment checks and staging heartbeat/restart evidence.
4. Verified private D1 export/restore rehearsal and recorded Worker rollback.
5. Explicit production deployment authorization, followed by controlled rollout
   and monitoring as described in `docs/telegram-10.4-rollout.md`.

Rollback preserves additive tables and new customer records. Disable Widgets,
restore the recorded Worker version and subscriptions without dropping pending
updates. Do not overwrite current production orders with an older database.

## Files affected

| Group | Files |
| --- | --- |
| API/validation/templates | `lib/telegram-widget-api.ts`, `lib/telegram-webhook-validation.ts`, `lib/telegram-widget-response.ts`, `lib/telegram-widget-ui.ts`, `lib/telegram-widgets.ts` |
| Localization | `lib/i18n/widgets/en.ts`, `my.ts`, `index.ts` |
| Existing integration | `lib/telegram.ts`, `lib/server.ts`, `lib/order-engine.ts`, `app/studio.tsx`, `bot.py` |
| Routes | `app/api/telegram/setup/route.ts`, `status/route.ts`, `webhook/route.ts`, `app/api/hosting/queue/route.ts`, `app/api/health/route.ts` |
| Data | `db/schema.ts`, `drizzle/0004_nebulous_retro_girl.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` |
| Hosting | `hosting/__main__.py` |
| Checks | `scripts/test-telegram-widgets.mjs`, `scripts/test-widget-api.mjs`, `scripts/test_widget_migration.py`, `scripts/test-order-api.mjs`, `scripts/test_bot.py`, `scripts/test_hosting.py`, `scripts/test_local_hosting.py` |
| Configuration/docs | `package.json`, `.github/workflows/check.yml`, `.dev.vars.example`, these three reports |

Unchanged: `worker/index.ts`, `wrangler.jsonc`, existing migrations 0000–0003,
lockfile/dependency versions, all emoji catalogs/IDs/roles, emoji manager,
existing Rich/Premium presenter, hosting runtime implementations and project
storage. Existing architecture, owner identity and data resources are preserved.
