# Production readiness follow-up — 10 November 2026

## Baseline and scope

Started from production source `710c9ce12684771ff0b3c679048c5f49aac76f50`,
after the verified API 10.4/client-fallback release. Fresh whole-project lint
confirmed the previously reported **33 errors / 50 warnings**. The main Worker,
D1, customer/owner separation, payment policy, Rich Message presenter and saved
emoji roles remain the existing architecture.

The remaining lint errors came from untyped API/Telegram data, React effect
initialization, a customer-site link and updating the ASCII renderer ref during
render. The fix does not introduce another framework or change dependencies.

## Changes

- Typed the existing API transport and frontend response contracts. Request
  bodies and decoded external JSON begin as `unknown`; order methods keep the
  existing server validation. These compile-time contracts do not replace
  server authorization or claim runtime validation of every response property.
- Typed Telegram results, order summaries and SDK access. Existing Rich Message
  and Premium Emoji delivery and fallback behavior remain in their presenter.
- Narrowed message/callback updates before handling. Malformed optional sender
  strings/entities and malformed hosting file metadata cannot reach business
  handlers. Missing optional Telegram `file_size` is represented as zero; the
  existing hosting downloader still bounds actual bytes.
- Made API callbacks stable, added request cancellation/late-response guards,
  and scheduled browser initialization after first paint using the existing
  Orbit pattern. Pending frames and requests are cancelled on cleanup. The
  ASCII settings ref is updated only after commit, before waking the renderer.
- Removed unused UI imports/state and used the existing Next Link component for
  the owner gate's customer-site link. Visual styling, wording, localization,
  price/payment rules, services and project storage paths were preserved.
- Added `pnpm lint` to the normal main CI and controlled-release gates. No lint
  rule was disabled, no dependency/lockfile changed, and no migration added.

Affected groups: `lib/api-{client,types}.ts`, server/order/Telegram/hosting types
and validation, connection/setup/status/webhook and order-action routes,
`app/{studio,owner-workspace,workspace-ui,payment-ui}.tsx`, the ASCII settings
ref, regression scripts, package scripts and both CI workflows.

## Actual local checks

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed: **0 errors / 14 warnings**, down from 33 / 50 |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed |
| `pnpm build` | Passed; existing large-chunk and route-classification warnings |
| `pnpm test:api` | Passed: compiled Worker/D1 auth, receipts, orders, emoji, Widgets, hosting leases/replays |
| Six Python regression scripts | Passed: **40 tests** |
| Five release helper suites | Passed |
| `git diff --check` | Passed |

New cases cover non-object API responses, malformed sender/entity fields,
malformed hosting metadata and valid uploads with no Telegram size field.
Telegram calls in automated tests are mocked, not live-client evidence.

The 14 remaining lint warnings are six existing image recommendations, two
existing full-navigation recommendations, five intentionally omitted private
order/payment fields, and the existing Worker default-export style. They are
reported rather than disabled. Images carrying private receipt/blob URLs keep
their existing authenticated delivery; optimizing them is separate work.

Local build measurements: client JS/CSS 28 files / 1,364,921 raw bytes; server
JS/CSS 99 files / 1,924,370 raw bytes. Largest scene JS remains 555,131 raw /
138,481 gzip bytes. These are file sizes, not initial transfer or phone FPS.

## Hosting inspection and release status

The controlled release [42827443791](https://github.com/Kimshika9/k9-service/actions/runs/42827443791)
passed with application source `a737f2032ed677c5f1c38466d87665b722ebcaa5`.
It verified and activated Worker `840adc08-6730-4f91-b27c-c46012d46a54` at
100%. Immediate code rollback: `691ddb32-fd91-41ec-9118-0b34ab00931d`;
source rollback: `710c9ce12684771ff0b3c679048c5f49aac76f50`.
The workflow privately export/restore-verified 14 tables in
`k9-service-backup-20261110134647`, verified the existing separate staging D1
and real owner-only Widget send/edit, preserved all eight production bindings,
and found **no pending migrations**. Three live checks returned website/assets/
health 200, signed owner access 200, unauthenticated/wrong-secret access 401,
hosting queue 200, all three update subscriptions, zero pending updates and
no Telegram delivery error. No production restore/drop or secret rotation ran.

Release build measurements: client JS/CSS 28 files / 1,364,912 raw bytes;
server JS/CSS 99 files / 1,924,278 raw bytes; largest scene unchanged at
555,131 raw / 138,481 gzip bytes. Normal main-branch builds can create another
Worker version from the same application source; the post-main report records
the actual version serving traffic after that build.

The separate existing **k9-service-worker** deployment was inspected in its
already authenticated Bot-Hosting panel. Its `hosting/__main__.py` lacked the
reporter. A downloaded backup matched repository baseline
`984d06b565f1079d006614d32f330b304567ecd0` byte for byte (SHA-256
`60f91a077508a7e616d8b66373c92420020667021f05f0e1a2f5e060a83fbbbf`).
Only that file was uploaded from the already tested repository version. A new
download matched the replacement bytes exactly (SHA-256
`92115911d70afb24318b16acd1ded36f715e3975d3804a6aed654be007f56e1c`).
The only environment addition was non-secret `K9_HOSTING_HEARTBEAT=1`.
The existing deployment was restarted. No child source, project data directory,
credential, startup path, infrastructure or other K9 project was changed.

An actual owner `/hostingstatus` command then displayed runtime **local**,
**1 recorded project / 1 observed running / 0 unknown**, with a fresh database
observation at **20:24:05 Asia/Yangon (13:54:05 UTC), 10 November 2026**.
That is an actual supervisor observation, not a synthetic test heartbeat,
child-bot response check or uptime promise. The post-main observer now also
reads only these coarse recorded D1 fields and reports freshness; it never
creates a heartbeat or claims/acknowledges a hosting job. Its diagnostic failure
message includes sanitized status/health checks rather than hiding which check
failed. Runtime health remains separate from website readiness.

After activation, browser checks confirmed six customer catalog options,
English/Myanmar navigation and the sign-in gate on My Orders. The actual
Telegram companion's dashboard button opened the authenticated Owner Mini App
and the Customer Orders heading was visible. No real order, payment or receipt
was created or changed for these checks.

Hosting rollback: restore only `hosting/__main__.py` from the baseline commit
above, unset the opt-in flag and restart the same deployment. Keep all project
data. Worker rollback similarly retains D1 and all additive tables/columns.

Android Widget sandbox rendering and an actual device-generated Widget query
remain device acceptance items. Telegram Web A's conventional companion and
Mini App controls were verified in the preceding release; its unsupported
Widget UI is not represented as an Android rendering test.
