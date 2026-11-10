# Telegram client acceptance and readable Widget fallback

Follow-up to the [API 10.4 deployment](telegram-10.4-deployment.md), 10 November 2026.

## Observed production behavior

Read-only production checks confirmed the public website, JavaScript asset,
health, D1, hosting queue and enabled Widgets were healthy. Unauthenticated
owner access returned 401. Browser checks confirmed catalog selection, order
review, draft retention and English/Myanmar navigation. An unauthenticated
submission stayed behind the existing sign-in gate; no test order was created.

After the owner completed Telegram sign-in, an actual `/widgets` command
reached the existing bot. Telegram Web A displayed only “This message is not
supported on the web version of Telegram”. It hid the Widget caption and
buttons too. Caption-only fallback was therefore insufficient on this client.
The existing Owner Page button launched the authorized Mini App successfully.
No customer order, payment, receipt or hosting job was changed during review.

## Minimal fix

Each new Widget is paired with a conventional message using the existing
Rich Message/Premium Emoji presenter and its HTML fallback. It shows the same
privacy-limited state, Refresh and authorized Mini App controls. This intentionally
adds a readable companion on capable clients too; server-side client capability
is not inferred. Ordinary Refresh edits the existing pair rather than sending
another pair. Both surfaces recheck the same server-side identity and ownership.

Owner status changes update the companion even when Widget edits fail. A
confirmed deleted Widget keeps its readable companion active. A confirmed
missing companion is recreated; ambiguous/transient API errors do not trigger
blind resends. Widget-send failures can retain a text-only tracked card.

Migration `0005_crazy_electro.sql` only adds nullable `fallback_message_id` and
`widget_available INTEGER DEFAULT 1 NOT NULL` to `telegram_widget_messages`.
Existing references and business rows remain intact. Old Worker versions ignore
the additive columns, so rollback must retain them and all new customer data.
Health checks require both columns when Widgets are enabled. Reused empty
staging databases add only missing reviewed columns.

Changed files: Widget orchestration, webhook callback message-ID forwarding,
health/schema, generated migration metadata, guarded release/staging helpers,
Widget API/migration/release regression tests, and this report. No dependencies,
emoji IDs/roles, owner identity, payment policy, hosting runtime or styles changed.

## Local verification

| Check | Actual result |
| --- | --- |
| `pnpm test` | Passed |
| `pnpm test:api` | Passed, including compiled Worker/D1 fallback and replay tests |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed; existing large scene/route-classification warnings remain |
| Six Python scripts used by the release workflow | Passed: 40 tests |
| Five release helper suites | Passed |
| Lint of changed Widget module/tests and all release scripts | Passed |
| Full-project lint | Existing baseline remains 33 errors / 50 warnings; not clean |
| `git diff --check` | Passed |

New regression coverage includes conventional-message delivery when Widget send
succeeds, in-place Refresh, replay without extra messages, order-state updates
during Widget API failure, deleted Widgets, deleted companions, text-only cards,
ambiguous API failures, companion recovery, and old-row migration preservation.
Automated Telegram calls use a stub; they are not live Telegram evidence.

## Release and remaining limits

Controlled release [42821322052](https://github.com/Kimshika9/k9-service/actions/runs/42821322052)
completed successfully at 13:07 UTC. Application source:
`77fb53d22adec6d321e75c0a04278b4452e99c18`. Verified Worker version:
`eb3301db-3222-4296-9ae6-43a8f85c9bdd`, 100% traffic. Immediate rollback:
`686b82d3-28ba-4bf6-90e9-89455652c598` (earlier Widget-enabled implementation).
The previously verified Widget-disabled rollback remains available as documented
in the release runbook.

The workflow privately export/restore-verified 14 tables in
`k9-service-backup-20261110130623`, reused the separate empty staging D1,
verified a real private owner Widget send/edit, preserved all eight production
bindings and applied only `0005_crazy_electro.sql`. Live owner and hosting command
probes persisted both a Widget and a conventional companion. Three independent
live observations returned website/assets/health 200, signed owner access 200,
unauthenticated/wrong-secret access 401, hosting queue 200, all three webhook
subscriptions present, zero pending updates and no delivery error. Raw exports
and preview credentials were excluded from artifacts; only
[safe metadata](https://github.com/Kimshika9/k9-service/actions/runs/42821322052/artifacts/13767067196)
was retained.

After deployment, a real owner `/widgets` command in Telegram Web A displayed
the readable summary and its controls. Clicking Refresh retained the same
message and unchanged card count. The companion's **Open Owner Dashboard**
button launched the existing authenticated Mini App; the owner heading and
order search were visible. No real order action or payment decision was taken.
An actual `/hostingstatus` command also displayed its readable companion. Its
Refresh retained the same message and card count; with no verified heartbeat,
runtime, observation time and counts correctly remained Unknown.

Release build measurements: client JS/CSS 28 files / 1,364,327 raw bytes;
server JS/CSS 97 files / 1,921,227 raw bytes; unchanged largest scene JS 555,131
raw / 138,481 gzip bytes. These are file sizes, not first-page transfer size.

Telegram Web A cannot exercise Widget sandbox JavaScript or generate a real
Widget query. Android Widget rendering, native Premium Emoji animation and a
genuine Widget-query timing check remain device acceptance items. Existing
automated coverage verifies the bounded 15-second answer path, permissions,
customer isolation, safe state and hosting heartbeat expiry. No heartbeat or
running bot is invented.
