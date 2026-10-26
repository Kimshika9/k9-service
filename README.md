# K9 Service

K9 Service website, Telegram Mini App, owner workspace and manual KBZPay receipt review. This repository deploys directly to **your own Cloudflare Workers account**. It does not require ChatGPT Sites authentication.

## What works

- Public service catalog, mobile layout and K9 void branding.
- Telegram-verified customer identity; customers can only access their own orders.
- Separate `/owner` workspace. Only `OWNER_TELEGRAM_ID` can manage customer orders, services and payments.
- Custom quotes and fixed MMK service prices, order approval, Processing, delivery and Done.
- KBZPay receiving account, transaction ID and private receipt upload, with owner verification.
- Cloudflare D1 orders, audit history and private receipt/QR storage. R2 is optional.
- Telegram direct orders and Rich Message owner alerts through the same order engine.

**KBZPay is a manual transfer and receipt-review flow. It is not an automatic bank gateway.** Uploading a receipt never marks an order Paid. The owner checks the actual incoming transfer in KBZPay and then verifies it here.

## First deployment: phone-friendly checklist

### 1. GitHub

Create a **private** repository named `k9-service` under your own account. Extract the source ZIP and upload its contents to the repository root. `package.json`, `wrangler.jsonc`, `app/` and `public/` must be at the top level. Do not upload the ZIP itself, `node_modules`, `dist`, local receipts, `.dev.vars`, or tokens.

GitHub mobile browser: open the repository, use **Add file → Upload files** (desktop-site mode may help with folder uploads). Alternatively, use Termux Git. The supplied `.gitignore` excludes local secrets and generated files; `.dev.vars.example` contains only empty placeholders.

### 2. Connect Cloudflare

1. In **Workers & Pages**, create a **Worker connected to GitHub**, select `k9-service`, and choose `main` as the production branch.
2. Use Worker name **`k9-service`**, matching `wrangler.jsonc`.
3. Keep the build command **`pnpm build`**. Use **`pnpm run deploy`** as the deploy command; Cloudflare's default **`npx wrangler deploy`** also works after the Cloudflare build.
4. Use Node **22** and repository root **`/`**.
5. On Cloudflare's Git build (`WORKERS_CI=1`), the build script reuses the named **`k9-service-db`** D1 database or creates it if it does not exist, resolves its ID and applies ordered migrations before building the Worker. An explicit database ID in `wrangler.jsonc` is honored.

**R2 activation, an R2 subscription and an R2 bucket are not required.** Receipt and QR images use private D1 tables, split into 512 KiB chunks to stay below D1's per-row size limit. Receipt images remain limited to 5 MiB and QR images to 2 MiB. The original protected image endpoints enforce owner/customer access. D1 storage and query quotas apply; this default is intended for modest receipt volume.

The Cloudflare build token must have D1 permissions for the account. If setup reports a permission failure, correct the build token's D1 access in Cloudflare and retry. No Cloudflare credentials belong in Git.

Configure production deployments for `main` only. Do not enable branch preview deployments against the production database. Use separate resources if staging is added later.

If a previous deploy failed with **`Please enable R2 ... code 10042`**, pull this version and retry the build. The default Wrangler config no longer declares an R2 binding. Do not retry the older failed commit.

For a future R2 upgrade, enable it in your account yourself and add a private `BUCKET` binding deliberately. The storage adapter then writes new images to R2 and can still read existing D1 images. This does not move old images automatically.

### 3. Runtime configuration

Set these under **Worker → Settings → Variables and Secrets**. Store them as **secrets** so redeploys preserve dashboard values and no credentials enter Git.

| Name | What to enter |
| --- | --- |
| `BOT_TOKEN` | Your Telegram bot token from BotFather |
| `BOT_USERNAME` | Optional username without `@`; the server resolves it with `getMe` when omitted |
| `OWNER_TELEGRAM_ID` | Your numeric Telegram user ID; never a username |
| `TELEGRAM_WEBHOOK_SECRET` | A random 32+ character value using letters, digits, `_` or `-` |
| `SITE_URL` | The exact HTTPS Worker URL returned by Cloudflare, without a trailing slash |
| `KBZPAY_ACCOUNT_NAME` | Your receiving account name |
| `KBZPAY_PHONE` | Your receiving account number |
| `KBZPAY_ENABLED` | `1` after the receiving details are configured |

The existing private preview's secrets, database and receipts do **not** transfer automatically. Configure the receiving details again in this new account. Do not put real tokens, passwords, customer orders or receipts in the repository. Any existing production records require a separate, explicit data migration.

No public first-user owner activation exists. Set the correct `OWNER_TELEGRAM_ID` before launch.

### 4. Telegram connection

For a phone-first setup, download `bot.py` and follow **[BOT_SETUP_MM.md](BOT_SETUP_MM.md)**. Python 3.10+ is enough; no pip packages are required. It writes private local configuration, verifies the website settings and registers the webhook. Cloudflare credentials are never requested by the script. Add the runtime secrets above in Cloudflare once.

1. In BotFather, select the bot and configure its **Menu Button** to open the exact `SITE_URL`. This first menu setup lets you enter the Mini App before registering its webhook.
2. Open the bot in Telegram with your owner account. Press the menu button to open K9 Service.
3. The signed Telegram identity automatically opens `/owner` for the configured owner.
4. Open **Bot connection → Connect bot**. This registers the webhook, commands and menu button using the server-side token.
5. Optionally configure the bot's Main Mini App in BotFather with the same URL.
6. In **KBZPay settings**, verify the receiving details and upload your genuine account QR if desired. No QR is fabricated.
7. Test from a different Telegram customer account: create order → owner quote → customer uploads test proof → owner verifies → Processing → Done. Do not send real money during testing.

Outside Telegram, anyone can view the catalog. Ordering and owner controls require opening the Mini App in Telegram. `Open in Telegram` sends visitors to the bot; use its menu button to enter. Verified Telegram data is retained in a Secure, HttpOnly cookie for route navigation. The Mini App also carries its original signed launch data through same-origin owner navigation using session storage, covering webviews that block cookies. The server revalidates the Telegram HMAC on every authenticated request; client-cached identity never grants permissions. Sessions expire within one hour; reopen the Mini App when asked.

## Local development and validation

```sh
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm dev
```

There is no fake production owner or customer login. For full authenticated checks, use the isolated test harness below or Telegram with an HTTPS development deployment and a separate bot/resources.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:api
```

The API integration test uses local, isolated D1 (and optional R2) and fake Telegram identities signed with a test-only token. Telegram network calls are intercepted. It checks forged-header rejection, disabled public owner activation, session identity, customer isolation, protected receipts, server prices, payment verification, stale updates, multi-chunk receipt round-trips and Processing/Done.

GitHub Actions runs these checks on pushes to `main` and pull requests. It has read-only repository permission and no deployment secrets. Cloudflare handles deployment through its own GitHub connection.

## Architecture

- `app/`: website, owner workspace, customer payment UI and API routes.
- `lib/server.ts`: Telegram identity and permission guards.
- `lib/order-engine.ts`, `lib/order-policy.ts`: order lifecycle and atomic updates.
- `lib/telegram-auth.ts`, `lib/telegram-session.ts`: signed identity verification and route sessions.
- `lib/payment-config.ts`, `lib/receipt-files.ts`: receiving details and private proof files.
- `db/`, `drizzle/`: D1 schema and ordered SQL migrations.
- `worker/index.ts`, `vite.config.ts`, `wrangler.jsonc`: standalone Cloudflare runtime and build.

Keep the source private unless you deliberately choose to publish it. Receipt images are served through protected APIs, never public storage URLs.

## Bot connector modes

`python bot.py` configures Cloudflare webhook mode and exits when connected; the phone can then be switched off. `--setup` writes device-local settings only, `--check` validates those settings without network access, and `--status` checks both the backend connection and Telegram webhook. `--poll` is an explicit optional polling bridge that removes the webhook and forwards Telegram updates to the same authenticated backend. Use only one polling process. `--connect` restores webhook mode.

The public `/api/connection/status` endpoint exposes connection readiness and public bot identity, never tokens or the owner ID. Its POST check requires the shared webhook secret and verifies that bot.py and Cloudflare agree on bot ID, owner ID and site URL.
