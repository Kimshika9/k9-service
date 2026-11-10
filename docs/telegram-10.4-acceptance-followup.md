# K9 Service Center — post-deployment acceptance follow-up

Checked 2026-11-10 18:58 +0630. Source baseline: `e51e40c195929497e584abf86ad7127b86ec3b97`.

## Fresh production observation

Re-ran the existing read-only `Verify released K9 Service` observation job, without running a deployment, migration, export or restore. Evidence: [workflow run 42762423544](https://github.com/Kimshika9/k9-service/actions/runs/42762423544), latest attempt, job `129824158064`.

All three observations reported active version `686b82d3-28ba-4bf6-90e9-89455652c598`, Widgets enabled, website/assets/health HTTP 200, ready=true, hostingQueue=true, widgets=true, and unauthenticated owner API HTTP 401. This is a fresh health/routing check; it does not itself retrieve Telegram getWebhookInfo or prove a user-generated Widget query response.

## Live browser checks

| Flow | Observed result |
| --- | --- |
| Public website/catalog | Loaded; six available services displayed |
| Select Telegram Bot | Selected radio row; primary action enabled |
| Open order form | Correct service and two-step brief/review form shown |
| Review a synthetic brief | Review showed the entered values and Telegram sign-in requirement |
| Submit without Telegram identity | Rejected with “Sign in to manage your orders.”; no success state/order reference returned. Server authorization runs before order creation. |
| Back from review | Name/contact/brief retained in the open form |
| English/Myanmar switch | Navigation, hero, process copy and primary catalog action changed to Burmese Unicode |
| Public owner route | Displayed owner sign-in gate and a link to Telegram; no dashboard/customer rows disclosed |
| Configured Telegram link | Resolved to the configured K9 bot; this browser could not load the t.me landing page |
| Telegram Web | Reached the sign-in screen; private-chat Widget/real Mini App verification requires the owner's Telegram session |

The form used synthetic test text only. No payment proof, service configuration, customer order status or hosting job was changed. No real order/payment was created for this acceptance check.

## Lint

Re-ran whole-project ESLint: **33 errors / 50 warnings**, matching the recorded baseline. Error categories: 28 explicit-any type findings, 3 set-state-in-effect findings, 1 internal-link finding and 1 ref-access finding. No lint rules were disabled and no unrelated refactor was made.

## Remaining live acceptance

- Complete owner Telegram authentication through the secure browser flow, then verify genuine Widget Refresh queries, the real Mini App launch and owner controls without changing payment/order decisions.
- A designated customer account is needed for a real customer/owner acceptance order and cross-account UI checks; isolated automated equivalents already passed during release.
- This desktop-browser check does not certify Android viewport rendering, an older Telegram client or native Burmese review.
- External bot-hosting.net runtime and its optional heartbeat deployment remain outside this read-only follow-up. Hosting readiness does not establish that a child bot is running.

No production code, credentials, webhook registration or D1 resources were modified by this follow-up.
