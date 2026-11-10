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

The existing Bot-Hosting account session is available. Its **k9-service-worker**
deployment is Running in the provider panel; this alone does not establish a
fresh runtime heartbeat or prove any child bot is healthy. Runtime files and
the opt-in reporter are being checked before any hosting change.

Production source changes must pass the existing private backup/restore,
isolated staging and controlled release before traffic switches. The previously
verified source above and active Worker version are retained as rollback.
No database restore/drop or secret rotation is part of this maintenance.
Live release and hosting evidence will be appended after verification.

Android Widget sandbox rendering and an actual device-generated Widget query
remain device acceptance items. Telegram Web A's conventional companion and
Mini App controls were verified in the preceding release; its unsupported
Widget UI is not represented as an Android rendering test.
