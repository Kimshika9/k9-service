# K9 Service Center · Telegram Bot API 10.4 audit

Audit date: 10 November 2026 (Asia/Yangon). Repository baseline and code rollback
candidate: `984d06b565f1079d006614d32f330b304567ecd0` (main, PR #9).
The currently deployed Cloudflare version has **not** been identified; this
commit is not evidence of the version serving production.

## Phase 1 result

Repository audit and local baseline: complete. Live readiness: unverified.
Only this existing repository was checked out. No production secrets, webhook,
database, deployments, or hosting projects were changed.

### Inspected

- `AGENTS.md` and the four repository K9 design/flow instructions.
- `bot.py`, `worker/index.ts`, all Telegram setup/status/webhook routes,
  `lib/telegram.ts`, `lib/telegram-presentation.ts`, `lib/emoji-manager.ts`,
  `lib/emoji-commands.ts`, and the saved emoji catalog/roles/presentation files.
- `lib/server.ts`, Telegram signature/session helpers, `lib/order-engine.ts`,
  `lib/order-policy.ts`, customer/owner/order/payment/receipt API routes.
- `lib/hosting.ts`, hosting queue API, `hosting/__main__.py`, managed, Docker,
  local runtime/supervisor, project storage and replay handling.
- `db/schema.ts`, migrations 0000–0003 and their journal, readiness probes,
  `wrangler.jsonc`, build/prepare/deploy scripts, CI and regression scripts.
- Website/Mini App order navigation and actual brand CSS tokens.

### Actual architecture and baseline

| Area | Observed behavior | Minimum safe change |
| --- | --- | --- |
| Worker | vinext fetch handler; `nodejs_compat`, compatibility date 2026-05-15 | Keep handler and compatibility settings |
| Telegram transport | Direct HTTPS JSON, 12-second abort, no framework | Add typed Widget methods with shorter query-answer timeout |
| Subscription | Python connector and owner setup subscribe to `message`, `callback_query` | Add `widget_query`, verify retained subscriptions |
| Webhook auth | Requires configured `TELEGRAM_WEBHOOK_SECRET` and exact header | Preserve; validate update structure and private sender/chat identity |
| Dedupe | `webhook_updates` primary key, failed handlers release claim | Preserve messages/callbacks; add persistent Widget query dedupe/rate limit |
| Hosting queue | Owner-only, distinct secret, leased oldest job, ack clears payload, Python replay journal | Preserve protocol; add optional authenticated read-only health reports |
| Rich Messages | `sendRichMessage`, HTML/Premium emoji retry, readable `sendMessage` fallback | Keep existing presenter and owner emoji overrides |
| Emoji | IDs from catalog, per-role D1 overrides, UTF-16 entity capture, hosting sync | No edits to IDs, roles, catalog, or existing settings |
| Customer auth | Server verifies Telegram initData HMAC or signed HTTP-only cookie; orders filtered by actor key | Reuse exact actor key; verify Widget message ownership and order ownership |
| Owner auth | Numeric server owner ID; customer access denied; optimistic order version checks | Keep manual quote/payment/fulfillment policy in existing dashboard |
| Payments | Private image access; transaction uniqueness; explicit manual KBZPay verification before fulfillment | No Widget payment verification or financial data |
| Data | D1 orders, events, payments, receipts/chunks, settings, services, bot sessions, updates, hosting jobs | Add tables only, no rewrite of historical rows |
| Hosting health | Runtime state checked by Python; no heartbeat persisted to D1 | Report unknown until a fresh authenticated runtime observation exists |
| Mini App details | Existing order panel loads `/api/orders/:id` after verified login; root supports service `?order=` | Add a customer detail navigation hint; authorization remains server-side |
| Deployment | Main CI build can resolve/create D1 and apply migrations automatically | Run local builds with CI credentials removed; do not push/merge main |

The existing optional `bot.py --poll` bridge predates this upgrade. Default mode
continues to use Cloudflare webhooks; no polling bot will be introduced.

### Baseline checks (before implementation)

| Check | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `pnpm test` | Passed |
| `pnpm test:api` | Passed in local Miniflare/D1, Telegram mocked |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed; no remote preparation/deployment invoked |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | Passed: 34 tests |
| `pnpm exec eslint .` | Failed at baseline: 33 errors, 50 warnings (83 total) |

Baseline lint errors include existing explicit `any`, hook/ref rules and unused
code. Do not claim lint passes or use this upgrade to rewrite unrelated UI.
Build logs also include vinext's existing unknown-route classification notice.

### Previously reported production problems

Unauthenticated, read-only GET probes of `/api/health` and
`/api/connection/status` at the configured production workers.dev origin both
returned HTTP 403 from this execution environment. They did not return a K9
diagnostic body. This does not establish whether the deployed app, edge policy,
or access from this environment caused the rejection.

- Webhook secret mismatch / HTTP 401: existing local negative tests correctly
  reject wrong secrets; current live subscription and secret alignment unknown.
- Hosting queue: local queue schema, owner gate, separate secret, leases,
  acknowledgements and replay tests pass; live configuration/heartbeat unknown.
- Owner login: local HMAC, cookie, owner/customer and forged-header tests pass;
  live Telegram Mini App login remains unverified.
- `wrangler.jsonc` holds a placeholder DB ID resolved by existing deployment
  scripts. It must not be interpreted as a missing production database.

## Compatibility decisions

Official references, checked during the audit:

- <https://core.telegram.org/bots/api#november-9-2026>
- <https://core.telegram.org/bots/api#sendwidget>
- <https://core.telegram.org/bots/api#widgetquery>
- <https://core.telegram.org/bots/api#answerwidgetquery>
- <https://core.telegram.org/bots/api#editmessagewidgetdata>
- <https://core.telegram.org/bots/widgets>
- <https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/>
- <https://developers.cloudflare.com/d1/best-practices/import-export-data/>

| Feature | Official constraint | K9 decision |
| --- | --- | --- |
| Widgets | Production private chats only, protected content | Enforce private sender=chat, non-shared widgets |
| HTML | ≤32768 UTF-8 bytes, ≤4096 bytes zlib level 9 | Measure both before sending; no external resources |
| Data | `chat_data`, `public_data`, answer data each ≤1024 UTF-8 bytes | Customer/owner state only in chat data; whitelist fields |
| Requests | `data` 1–64 UTF-8 bytes, `type` is an object; answer within 15 seconds | Allow refresh only, bind to persisted message; bounded reads and answer call |
| Updates | `widget_query` separate from standard messages | Separate route branch and subscription diagnostics |
| State edits | Answers do not mutate state | Use `editMessageWidgetData` after answering |
| Shared widgets | Public state reusable across copies | Deferred: these four private views have no appropriate shared-data use case |
| Older clients | Unsupported media with caption | Always include a complete text caption and conventional inline controls |
| Entry/UI | No keyboard/network, restricted QuickJS DOM | Small inline script, text nodes, buttons; details open existing authorized Mini App |
| Accessibility | Current widget accessibility semantics limited | Put essential information in caption too; readable 48px+ controls |

## Implementation boundaries / affected files

1. Typed compatibility API, validators, localized Widget templates and isolated
   orchestration modules under `lib/`; reuse the existing Telegram transport.
2. `bot.py`, Telegram setup/status/webhook routes and tests: subscriptions,
   diagnostics, query routing, guarded Widget commands/refresh callbacks.
3. `db/schema.ts`, one additive migration and journal/snapshot: private message
   references, query dedupe/rate history, authenticated hosting observations.
4. Central order commit integration: best-effort Widget synchronization must
   never roll back successful order/payment writes.
5. Hosting queue/Python worker: optional heartbeat operation only; existing
   claim/ack/job payloads and hosting infrastructure remain intact.
6. Minimal customer detail navigation; preserve existing dashboard/payment UI.
7. Unit/API/Python regression scripts, rollout runbook and feature flag example.

Widgets remain disabled by default (`K9_WIDGETS_ENABLED` must be exactly `1`).
Keep existing customer messages, owner notifications and actions as fallbacks.

## Regression risks and controls

- A Widget answer sent after slow D1/Telegram requests can miss 15 seconds:
  bound preparation and answer time independently, answer before state editing,
  and test with injected delays and failures.
- Customer data could leak through shared/public state or client-supplied IDs:
  no shared widgets; bind user, private chat, message, kind and resource in D1;
  recheck order's actor key; never accept an order ID from query data.
- Duplicate updates can repeat operations across Worker restarts: persist query
  IDs/update IDs and rate history; Widget actions are read-only refreshes.
- Missing migrations or disabled feature must not break existing messages:
  feature flag gates new table use; preflight new schema before enablement.
- Widget send timeout can have an ambiguous result: do not blindly resend
  media after transient errors; keep existing text order flows intact.
- Deleted messages and old layouts need safe retirement/fallback: handle
  permanent missing-message errors, retain conventional Mini App access.
- A stale hosting observation must not look healthy: record server receipt time
  and show stale/unknown after expiry; never infer child health from queue access.
- Existing lint debt remains a release concern even with green build/tests.
- Real Telegram rendering, client fallback, touch sizing and Myanmar shaping
  require staging-device verification; a mocked Bot API is not a live test.

## Rollback / deployment gates

No deployment is authorized in this task. Before any future production change:

1. Identify the actual deployed Cloudflare version and its source SHA. Retain
   baseline `984d06b565f1079d006614d32f330b304567ecd0` as the repository fallback.
2. Use a private directory outside Git, `umask 077`, then Cloudflare's supported
   `pnpm exec wrangler d1 export k9-service-db --remote --config wrangler.jsonc
   --output="$k9_backup_file"`. Set `k9_backup_file` to a private dated path as in the rollout runbook. Resolve the real DB binding first; do not run
   repository auto-prepare scripts just to discover it. Protect the export;
   verify restoration against a separate database, never the live DB.
3. Provision an independent staging bot, Worker and D1. Use synthetic orders
   and receipts. Do not reuse production secrets or bind staging to live D1.
4. Apply additive migrations on staging, enable Widgets there, reconnect only
   the staging webhook, and verify `message`, `callback_query`, `widget_query`.
5. Test real private chats on Android, unsupported client captions, customer
   isolation, dashboard/manual payment, hosting and restart/reconnect flows.
6. Obtain explicit deployment authorization with this evidence and backups.
7. Enable gradually and monitor safe aggregate error codes/webhook backlog.
8. On regression, disable Widgets, restore the known Worker version and its
   webhook subscriptions. Leave additive tables/data in place. Do not restore
   an old DB over new customer orders; reconcile data before any DB recovery.

## Assumptions

- English remains the default; Telegram `language_code` selects Myanmar for new
  Widgets. New Myanmar strings are marked “needs native review”.
- Owners continue approving/fulfilling orders through existing authenticated
  controls and manually verifying KBZPay in the dashboard.
- Widget delivery is optional and must never change whether an order is saved.
- No valid staging credentials or production administration session were
  provided; live inspection and deployment cannot be certified locally.
