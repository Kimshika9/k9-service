# K9 Service Center — controlled release and rollback

Production deployment is authorized in this session and the API 10.4 release is active. See [deployment evidence and phase results](telegram-10.4-deployment.md) for exact versions, checks and remaining device acceptance work. Earlier local-only reports are historical.

## Existing hosting workflow

The application remains the existing Cloudflare Worker: website, Mini App, APIs and Telegram webhook. D1 remains the original production database. The Android `bot.py` utility and separate bot-hosting.net worker remain separate components. No polling replacement, framework, project rebuild or production secret rotation was introduced.

The normal main-branch Cloudflare build/deploy workflow remains supported. `keep_vars=true` and retained secret bindings preserve the production Widget flag and owner/bot configuration; migration 0004 is additive and already applied.

## Controlled release workflow

The dedicated upgrade-branch workflow:

1. Verifies Cloudflare access, exact existing Worker/DB and rollback identity using read-only requests.
2. Runs repository tests, typecheck, Python tests, build, API tests and release-helper lint.
3. Uses the supported D1 export endpoint and stores/restores a private snapshot in the same account. Receipt-safe import preparation and original/restored comparison must pass.
4. Tests the compiled Worker against separate staging D1 using an authenticated ephemeral preview. It never redirects the live webhook to staging.
5. Uploads a non-active candidate, inherits existing bindings without reading secret values, checks binding identity and permits only the reviewed pending migration 0004.
6. Switches production traffic only after those gates. Sets the same webhook URL/secret with all required updates and `drop_pending_updates=false`.
7. Verifies public website/assets/health and protected owner/hosting behavior, sends read-only owner Widget probes, verifies persisted references and takes three live observations.
8. Restores the previous Worker version on a material post-deployment verification failure. It never restores or resets production D1 automatically.

Raw SQL, receipt contents, private owner credentials and preview credentials never belong in artifacts. Only the explicit sanitized JSON metadata files are uploaded.

## Recovery

The recommended Widget-disable rollback version is `953228e9-164c-4ff0-9e88-fe842cc1f492`. It preserves the compatibility code and uses the same database, with Widgets disabled.

An authorized operator can select that version in Cloudflare Deployments, or use:

```sh
pnpm exec wrangler versions deploy 953228e9-164c-4ff0-9e88-fe842cc1f492@100 --name k9-service --yes
```

The original pre-upgrade version is `6c48a91e-caf1-4c01-ab0e-bdf4d08e1c92`. Record the currently active version before any later release; use the newly recorded verified version for subsequent rollbacks.

Leave the three additive tables and all customer rows intact. For database recovery, first assess writes since the snapshot and restore to a separate private database for comparison. Never overwrite live D1 as a routine code rollback.

## Manual acceptance

Use actual owner/customer Telegram accounts for device rendering, refresh, Mini App details, existing Premium Emoji/Rich Message appearance and the manual payment workflow. The release report distinguishes API/automated verification from device checks. Hosting status must continue to reflect recorded heartbeat age; absent/expired observations remain unknown/stale.
