# K9 Service — production readiness audit

Audit date: November 1, 2026 (Asia/Yangon). Upstream baseline: `b4cb3a877b35e69f5a5448cecad1c001e7b97391` (October 26). Existing application, branding, routes, order engine and storage architecture are preserved.

## Decision

**Not yet certified for production.** Local functional checks are separate from deployment and real Telegram/KBZPay verification. No live customer records, payments, secrets, owner permissions or existing hosted Site were modified in this audit.

## Phase status

| Phase | Evidence / status |
| --- | --- |
| 1 — Repository audit | Source, dependencies, SQL migrations, CI and test harness inspected. Existing unit, connector, type and build checks passed at baseline. Dependency audit found 23 production advisories: 3 critical, 7 high, 9 moderate, 4 low. Remediation and final validation are recorded below. |
| 2 — Integration | Owner identity signature, cookie/launch continuity and authorization pass local tests. HTML 403 diagnostics fixed in both UI API callers. Token-bearing network exceptions sanitized. Webhook registration is now checked against Telegram; owner-only status diagnostics added. |
| 3 — Deployment | Build and local schema/migration checks are available. Remote D1 binding, migrations, runtime secrets, deployment and origin health remain unverified: Wrangler reports no authenticated account and no production Worker URL was supplied. |
| 4 — Order lifecycle | Local D1 API harness covers Customer Order → Quote → Receipt → Manual Verification → Approval → Processing → Delivered → Done, plus direct-bot ordering. Telegram calls are intercepted and test identities signed using a fake token. |
| 5 — Polish | HTTP error handling, expired launch-header handling, blocked localStorage handling, webhook diagnostics, Rich Message fallback and deploy preflight improved. Browser/mobile UI verification remains blocked by preview startup/network failure; no production visual QA is claimed. |

## First actionable blockers and findings

1. A successful GitHub workflow named **pages build and deployment** publishes `https://kimshika9.github.io/k9-service/`. It is not proof of a Cloudflare Worker deployment. The separate **Check K9 Service** workflow passed at the baseline commit.
2. The previous ChatGPT Site is a separate, access-controlled publication. It is not proof that an anonymous Telegram webhook can reach the user's standalone Worker. Its audience and source were left unchanged.
3. `wrangler.jsonc` intentionally contains a placeholder D1 ID. Existing preparation scripts resolve the named database and run migrations with authenticated Cloudflare access. The placeholder is not itself a confirmed defect; the remote configuration is unknown here.
4. Both UI fetch wrappers assumed JSON even on upstream HTML errors, obscuring HTTP 403 with a parsing error. These now show bounded status/Ray diagnostics without displaying the HTML response.
5. The old connector could report webhook mode even when Telegram pointed to a different site. It now rejects mismatched URLs and checks D1 readiness before connecting.
6. The deploy script previously prepared/migrated remote D1 before checking for a built artifact. It now checks the artifact and entry point first.
7. The original API test skipped Delivered. The extended test explicitly traverses it, checks webhook setup/status authorization and mismatch detection, direct bot draft/confirmation/replay, Rich Message fallback, cross-origin rejection and competing owner updates.
8. Original dependency versions have published advisories. A registry audit is a dependency finding, not proof every advisory is reachable in this Vinext application. In particular, source inspection found no `next/og`, `use cache` or `next/image` usage; the server is Vinext on Workers. The affected production packages and React server-component stack were patched as recorded below; the remaining lower-severity development-chain advisories still require follow-up.

## Completed code changes

- Added `/api/health`: read-only configuration and complete D1 table/column readiness; HTTP 503 on missing binding/schema/configuration; no SQL details, credentials or customer rows returned.
- Added authenticated `/api/telegram/status` and **Check webhook** in the existing owner connection card. Returns registration match, pending update count and error-presence/time; never returns Telegram's raw error text or private endpoint details.
- Connection setup validates configuration before Telegram mutations and confirms `getWebhookInfo` retained the configured target. Its response explicitly says `deliveryVerified: false`.
- Kept signed Telegram authentication and owner ID authorization. UI navigation retains the signed launch handoff, expired launch data is no longer resent from a stale ref, and blocked language storage no longer throws.
- Added safe HTML/non-JSON HTTP error handling shared by customer and owner API callers.
- Preserved Telegram Rich Messages. Explicit 400 rejections fall back to a bounded plain-text owner alert; 403/429/network failures do not trigger an automatic second send.
- Updated `bot.py` diagnostics/readiness/exact-target verification and removed raw webhook error logging.
- Added deployment preflight tests and expanded functional/security regression coverage. No new D1 migration or customer data transformation was needed.

## Validation

### Dependency results

`pnpm audit --prod --json`: **0 advisories**, down from 23 (3 critical / 7 high / 9 moderate / 4 low) at the baseline. This is a registry audit snapshot, not proof the application has no vulnerabilities.

`pnpm audit --json` including development dependencies: **4 advisories remain — 0 critical, 0 high, 3 moderate, 1 low**. They concern esbuild (2), Satori (1) and minimatch (1) in development/framework tooling paths. Some development dependencies can be included in a server bundle; classification alone does not establish reachability. No claim of an entirely clean full dependency tree is made. Their fixes cross minor/major API boundaries of transitive consumers and need focused compatibility checks rather than blind forced overrides.

| Package / family | Final change |
| --- | --- |
| Next.js / eslint-config-next | 16.3.4 → 16.4.1 |
| React / React DOM / react-server-dom-webpack | 19.2.6 → 19.2.8 (aligned versions; server-component DoS advisory patched even though the dependency is classified dev) |
| Zod | Direct 3.25.76 → 4.6.6; React-hooks lint plugin selects its explicitly supported v4 dependency |
| Vite | 8.0.13 → 8.1.6 |
| Production transitive patches | sharp 0.35.5, @babel/core 7.29.6, browserslist 4.28.7, baseline-browser-mapping 2.11.0, fast-uri 3.1.9, source-map-js 1.2.2 |
| Tooling transitive patches | ws 8.21.0, undici 7.30.1, js-yaml 4.3.2, brace-expansion 1.1.21 / 5.0.12, fflate 0.7.5, image-size 2.0.3 |

The pnpm lockfile was regenerated with pnpm 11.25.0 and a frozen-lockfile install passed. Vinext remains the existing 1.0.0-beta.5 framework; no migration to another architecture was attempted. The beta framework and four residual advisory findings are remaining maintenance risks.

### Functional results

- `pnpm typecheck`: passed.
- `pnpm test`: passed (Telegram HMAC, launch continuity/expiry, order policy, Cloudflare database preparation and deployment/error regressions).
- `python scripts/test_bot.py`: 8 tests passed.
- `pnpm build`: passed with the patched React / Next / Vite stack.
- `pnpm test:api`: passed against the built Worker, isolated Miniflare D1 and fake/intercepted Telegram. All three SQL migrations applied successfully. Covers Delivered and Done, competing updates, customer isolation, private multi-chunk receipts, identity, owner-only webhook operations and direct bot ordering/replay.
- Optional R2 adapter check: passed the same integration lifecycle and >2 MB private receipt round-trip (`K9_TEST_STORAGE=r2 node scripts/test-order-api.mjs`).
- React component review used the React best-practices checklist; existing layout and accessibility controls were retained. Browser/mobile rendering is **unverified** because the supported preview failed to become healthy. No screenshot or actual Telegram-webview test was obtained.

No live deployment, real Telegram message, real bank verification, or cloud data migration was executed.

## Remaining production gates

The four residual development/framework-chain advisories above also remain a maintenance follow-up; production certification is not claimed.

1. Supply the exact public HTTPS Cloudflare Worker URL. No token or secret needs to be pasted in chat.
2. In the correct Cloudflare account, verify the Worker project/production branch, D1 binding and actual database ID. Apply existing migrations `0000`, `0001`, `0002` using the deployment scripts. The build/deploy identity needs D1 permissions. Branch previews must not target production D1.
3. Configure the documented runtime secrets locally in Cloudflare. `/api/health` must return 200 with `ready: true`; `/api/connection/status` must identify the expected bot. Health format checks alone cannot establish token validity or correct ownership.
4. Open the bot's Mini App as the designated owner. Confirm `/owner` loads, connect the bot, check the expected webhook, then send `/start` and verify a real response. Inspect Cloudflare Security events for any actual 403; do not disable protections broadly without identifying the blocking rule.
5. Use a separate customer Telegram account to create a clearly marked test order and verify the entire customer/owner UI, private receipt access, delivery and final state on the actual deployment. This audit sent no Telegram messages and performed no actual financial transaction. Paid-state integration testing here uses synthetic local fixtures; it is not evidence of a real incoming KBZPay payment.
6. Complete mobile browser and Telegram Android webview checks, including cookie-blocked navigation and expired session recovery. The attempted managed preview could not become healthy after a Cloudflare metadata DNS failure; API tests do not substitute for this UI verification.

## Source references

- [GitHub Pages is static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Telegram Mini App validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Telegram Rich Messages](https://core.telegram.org/bots/api#sendrichmessage)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Next.js typed-array cache RCE advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
- [Next.js ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
- [Zod resource-consumption advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Sharp librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)

Remaining advisory references:

- [esbuild development-server origin issue](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- [esbuild additional advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)
- [Satori advisory](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp)
- [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
