# K9 Service

K9 Service website, Telegram Mini App, owner workspace and manual KBZPay receipt review. This repository deploys directly to **your own Cloudflare Workers account**. It does not require ChatGPT Sites authentication.

## What works

- Public service catalog, mobile layout and K9 void branding.
- Telegram-verified customer identity; customers can only access their own orders.
- Separate `/owner` workspace. Only `OWNER_TELEGRAM_ID` can manage customer orders, services and payments.
- Custom quotes and fixed MMK service prices, order approval, Processing, delivery and Done.
- KBZPay receiving account, transaction ID and private receipt upload, with owner verification.
- Cloudflare D1 orders and audit history; private R2 receipt storage.
- Telegram direct orders and Rich Message owner alerts through the same order engine.

**KBZPay is a manual transfer and receipt-review flow. It is not an automatic bank gateway.** Uploading a receipt never marks an order Paid. The owner checks the actual incoming transfer in KBZPay and then verifies it here.

## First deployment: phone-friendly checklist

### 1. GitHub

Create a **private** repository named `k9-service` under your own account. Extract the source ZIP and upload its contents to the repository root. `package.json`, `wrangler.jsonc`, `app/` and `public/` must be at the top level. Do not upload the ZIP itself, `node_modules`, `dist`, local receipts, `.dev.vars`, or tokens.

GitHub mobile browser: open the repository, use **Add file → Upload files** (desktop-site mode may help with folder uploads). Alternatively, use Termux Git. The supplied `.gitignore` excludes local secrets and generated files; `.dev.vars.example` contains only empty placeholders.

### 2. Cloudflare resources

In your own Cloudflare account:

1. Create a D1 database named **`k9-service-db`**. Copy its database ID.
2. Edit `wrangler.jsonc` in GitHub and replace `00000000-0000-4000-8000-000000000000` with that database ID.
3. Create an R2 bucket named **`k9-service-receipts`**. Keep public bucket access disabled. If Cloudflare requires billing enrollment to enable R2, complete that account step yourself before continuing.
4. In **Workers & Pages**, create a **Worker connected to GitHub**, select `k9-service`, and choose `main` as the production branch.
5. Use Worker name **`k9-service`**, matching `wrangler.jsonc`.

Build configuration:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `pnpm build` |
| Deploy command | `pnpm run deploy` |
| Node version | `22` |
| Production branch | `main` |

Cloudflare installs dependencies from `pnpm-lock.yaml`. The package manager version is pinned in `package.json`. The deploy command applies ordered D1 migrations, then publishes the generated Worker and assets. It refuses to deploy when the database ID is still the placeholder.

Configure production deployments for `main` only. Do not enable branch preview deployments against the production D1/R2 resources. Use separate resources if staging is added later.

### 3. Runtime configuration

Set these under **Worker → Settings → Variables and Secrets**. Store them as **secrets** so redeploys preserve dashboard values and no credentials enter Git.

| Name | What to enter |
| --- | --- |
| `BOT_TOKEN` | Your Telegram bot token from BotFather |
| `BOT_USERNAME` | Bot username without `@` |
| `OWNER_TELEGRAM_ID` | Your numeric Telegram user ID; never a username |
| `TELEGRAM_WEBHOOK_SECRET` | A random 32+ character value using letters, digits, `_` or `-` |
| `SITE_URL` | The exact HTTPS Worker URL returned by Cloudflare, without a trailing slash |
| `KBZPAY_ACCOUNT_NAME` | Your receiving account name |
| `KBZPAY_PHONE` | Your receiving account number |
| `KBZPAY_ENABLED` | `1` after the receiving details are configured |

The existing private preview's secrets, database and receipts do **not** transfer automatically. Configure the receiving details again in this new account. Do not put real tokens, passwords, customer orders or receipts in the repository. Any existing production records require a separate, explicit data migration.

No public first-user owner activation exists. Set the correct `OWNER_TELEGRAM_ID` before launch.

### 4. Telegram connection

1. In BotFather, select the bot and configure its **Menu Button** to open the exact `SITE_URL`. This first menu setup lets you enter the Mini App before registering its webhook.
2. Open the bot in Telegram with your owner account. Press the menu button to open K9 Service.
3. The signed Telegram identity automatically opens `/owner` for the configured owner.
4. Open **Bot connection → Connect bot**. This registers the webhook, commands and menu button using the server-side token.
5. Optionally configure the bot's Main Mini App in BotFather with the same URL.
6. In **KBZPay settings**, verify the receiving details and upload your genuine account QR if desired. No QR is fabricated.
7. Test from a different Telegram customer account: create order → owner quote → customer uploads test proof → owner verifies → Processing → Done. Do not send real money during testing.

Outside Telegram, anyone can view the catalog. Ordering and owner controls require opening the Mini App in Telegram. `Open in Telegram` sends visitors to the bot; use its menu button to enter. Verified Telegram data is retained in a Secure, HttpOnly cookie for route navigation and is reverified on every authenticated request. Sessions expire within one hour; reopen the Mini App when asked.

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

The API integration test uses local, isolated D1/R2 and fake Telegram identities signed with a test-only token. Telegram network calls are intercepted. It checks forged-header rejection, disabled public owner activation, session identity, customer isolation, protected receipts, server prices, payment verification, stale updates and Processing/Done.

GitHub Actions runs these checks on pushes to `main` and pull requests. It has read-only repository permission and no deployment secrets. Cloudflare handles deployment through its own GitHub connection.

## Architecture

- `app/`: website, owner workspace, customer payment UI and API routes.
- `lib/server.ts`: Telegram identity and permission guards.
- `lib/order-engine.ts`, `lib/order-policy.ts`: order lifecycle and atomic updates.
- `lib/telegram-auth.ts`, `lib/telegram-session.ts`: signed identity verification and route sessions.
- `lib/payment-config.ts`, `lib/receipt-files.ts`: receiving details and private proof files.
- `db/`, `drizzle/`: D1 schema and ordered SQL migrations.
- `worker/index.ts`, `vite.config.ts`, `wrangler.jsonc`: standalone Cloudflare runtime and build.

Keep the source private unless you deliberately choose to publish it. Keep R2 private regardless of source visibility.
