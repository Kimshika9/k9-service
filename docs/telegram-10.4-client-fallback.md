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

The controlled release must export and privately restore-verify production D1,
verify the separate staging database, preserve protected bindings, apply only
the additive migration, record the active rollback Worker and verify actual
owner/hosting Widget **and companion** references before declaring success.
Deployment and post-release client evidence will be appended after execution.

Telegram Web A cannot exercise Widget sandbox JavaScript or generate a real
Widget query. Android Widget rendering, native Premium Emoji animation and a
genuine Widget-query timing check remain device acceptance items. Existing
automated coverage verifies the bounded 15-second answer path, permissions,
customer isolation, safe state and hosting heartbeat expiry. No heartbeat or
running bot is invented.
