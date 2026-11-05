# K9 Service Center · Bot-Hosting.net Starter

Starter မှာ shared 1 GB RAM၊ 50% CPU၊ 5 GB storage နဲ့ deployment slot 2 ခုရှိပါတယ်။ K9 Hosting worker က 1 slot သုံးပြီး hosted bot က 1 slot သုံးပါတယ်။ Website၊ Telegram webhook နဲ့ order database ကို Cloudflare မှာ deploy လုပ်ရပါမယ်။

## 1. Cloudflare ကို အရင်ပြင်ပါ

- [VPS_HOSTING_MM.md](VPS_HOSTING_MM.md) ရဲ့ Cloudflare အပိုင်းအတိုင်း `SITE_URL` စစ်ပါ၊ `K9_HOSTING_SECRET` ထည့်ပါ၊ approved Worker code နဲ့ D1 migration `0003_hosting_jobs.sql` ကို deploy လုပ်ပါ။
- `/api/health` မှာ HTTP 200၊ `ready: true` နဲ့ `hostingQueue: true` စစ်ပါ။
- ရှိပြီးသား Telegram webhook က ဒီ Worker ရဲ့ `/api/telegram/webhook` ကို ညွှန်းရပါမယ်။ မချိတ်ရသေးရင် Owner Dashboard ရဲ့ **Bot connection → Connect bot** ကနေ ချိတ်ပါ။

## 2. ZIP တစ်ခုလုံးတင်ပါ

1. Bot-Hosting.net → **New Deployment → Application → Archive → Python** ကိုရွေးပါ။
2. `K9-Service-Center-Starter.zip` တစ်ခုလုံးကို တင်ပါ။ ZIP ထဲမှာ root folder အပိုမပါပါ။ **Startup → Entry file** ကို `start_hosting.py` လို့ ထည့်ပါ။ Python 3.10 နှင့်အထက် သုံးပါ။
3. ပထမ deployment ကို `k9-service-worker`၊ ဒုတိယ deployment ကို `k9-hosted-child` လို့ သတ်မှတ်ပါ။ Child က **Blank Application** ဖြစ်ရပါမယ်။ တင်မယ့် bot အလိုက် Python သို့မဟုတ် Node.js runtime ရွေးပြီး stopped ထားပါ။ Panel မှာ resource allocation ကို သတ်မှတ်တဲ့အခါ child အတွက် RAM/CPU/storage ချန်ထားပါ။
4. Developer API key ကို `deployments:read`, `deployments:write`, `deployments:power` နဲ့ `files:write` scopes ဖြင့် ဖန်တီးပါ။ **Worker deployment → Environment** မှာ အောက်က values ထည့်ပါ။ Token နဲ့ key တွေကို Secret အဖြစ် ထားပါ။

```ini
SITE_URL=https://k9-service.kimshikano.workers.dev
BOT_TOKEN=<existing K9 Service Bot token>
OWNER_TELEGRAM_ID=<existing numeric owner ID>
TELEGRAM_WEBHOOK_SECRET=<existing Cloudflare webhook secret>
K9_HOSTING_SECRET=<dedicated Cloudflare Hosting secret>
BOT_HOSTING_API_KEY=<Bot-Hosting developer API key>
BOT_HOSTING_WORKER_ID=<k9-service-worker deployment ID>
BOT_HOSTING_CHILD_ID=<k9-hosted-child deployment ID>
```

5. Worker deployment ကို **Start** လုပ်ပါ။ Console မှာ `K9 Hosting is connected to Bot-Hosting.net and the Cloudflare queue.` ပေါ်ရပါမယ်။ Worker က project state ကို `k9-hosting-data/` မှာ သိမ်းပါတယ်။

## 3. Telegram Hosting သုံးပုံ

1. K9 Service Bot ကို Owner account နဲ့ private chat ထဲမှာ `/start` → **Hosting** → **Upload project** နှိပ်ပါ။
2. Prompt ကို reply လုပ်ပြီး `.py`, `.js` သို့မဟုတ် `.zip` တင်ပါ။ လိုရင် ZIP ထဲက startup file ရွေးပါ။ **Stage deployment** ကိုနှိပ်ပါ။
3. Child ရဲ့ **Environment** မှာ အဲဒီ bot သုံးမယ့် token/key ကို ထည့်ပါ။ Telegram ကနေ **Start** နှိပ်ပြီး **Refresh** သို့မဟုတ် **Logs** ကြည့်ပါ။ Python `requirements.txt` သို့မဟုတ် Node `package.json` ကို ZIP root ဒါမှမဟုတ် startup file ရှိတဲ့ folder ထဲ ထည့်နိုင်ပါတယ်။
4. Stage လုပ်ပြီးသား project ကို **Delete** အတည်ပြုရင် dedicated child deployment နဲ့ data ပါ ဖျက်ပါမယ်။ နောက် bot အတွက် child deployment အသစ်ဖန်တီးပြီး Worker ရဲ့ `BOT_HOSTING_CHILD_ID` ပြောင်းကာ restart လုပ်ပါ။

Bot-Hosting documentation [Archive deployment](https://bot-hosting.net/docs/guides/create-a-deployment) · [Startup configuration](https://bot-hosting.net/docs/guides/set-up-a-deployment) · [API key scopes](https://bot-hosting.net/docs/pages-and-resources/developer-api-connected-apps-and-mcp)
