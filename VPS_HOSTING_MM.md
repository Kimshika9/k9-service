# K9 Service Center · VPS Hosting

Customer orders, Mini App, KBZPay receipts, and the Telegram webhook use the existing Cloudflare Worker. The VPS runs a separate Hosting worker. It takes only the Owner's private Hosting jobs through HTTPS requests to Cloudflare. The VPS needs outbound HTTPS and Docker access. There is no inbound Hosting port.

## 1. Cloudflare

1. Open **Workers & Pages → k9-service → Settings → Variables and Secrets**.
2. Set `SITE_URL` to `https://k9-service.kimshikano.workers.dev` (the public base HTTPS URL). Check it matches the VPS setting.
3. Generate a distinct value with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`. Store it as a Cloudflare **Secret** named `K9_HOSTING_SECRET` and in the VPS env file in step 2. Keep the existing Telegram token, webhook secret, and owner ID.
4. Deploy the approved GitHub revision from `main`. The project's Cloudflare build/deploy scripts apply `0003_hosting_jobs.sql` to the existing D1 database. If deploying manually, use `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm deploy` with authenticated Wrangler. Verify the existing D1 database before deploying. Preserve the production Variables and Secrets.
5. Check `/api/health` for HTTP 200 and `ready: true`. With Hosting enabled, expect `hostingQueue: true` as well.

## 2. VPS

Use a Linux VPS with Python 3.10+, Git, and Docker Engine. Run the Hosting worker from a dedicated VPS account with access to Docker. Prefer rootless Docker when available. Use trusted project files and dependencies.

1. Check out the deployed code in `/opt/k9-service`. Create a private directory `/var/lib/k9-hosting` owned by the worker account with mode 700.
2. Set up a private environment file (e.g. `/etc/k9-hosting.env`, mode 600) for the worker. Enter existing values directly on the VPS.

```ini
SITE_URL=https://k9-service.kimshikano.workers.dev
BOT_TOKEN=<existing K9 Service Bot token>
OWNER_TELEGRAM_ID=<existing numeric owner ID>
TELEGRAM_WEBHOOK_SECRET=<existing webhook secret>
K9_HOSTING_SECRET=<same dedicated hosting secret as Cloudflare>
K9_HOSTING_DIR=/var/lib/k9-hosting
```

3. With that environment loaded, run these commands from the repository root.

```bash
python3 bot.py --status
# If Telegram is not connected to this Worker, run: python3 bot.py --connect
python3 -m hosting --check
python3 -m hosting
```

4. Run the VPS worker under systemd for continuous operation. Replace `k9-hosting` with the VPS account you configured. Set `DOCKER_HOST` in the environment file if your Docker setup uses a separate socket.

```ini
[Unit]
Description=K9 Service Center Hosting Worker
After=network-online.target
Wants=network-online.target

[Service]
User=k9-hosting
WorkingDirectory=/opt/k9-service
EnvironmentFile=/etc/k9-hosting.env
ExecStart=/usr/bin/python3 -m hosting
Restart=on-failure
RestartSec=10
UMask=0077

[Install]
WantedBy=multi-user.target
```

Save as `/etc/systemd/system/k9-hosting.service`, then run `sudo systemctl daemon-reload`, `sudo systemctl enable --now k9-hosting`, and `sudo systemctl status k9-hosting`.

## 3. Telegram ထဲမှာ သုံးပုံ

- Owner account နဲ့ K9 Service Bot ရဲ့ private chat ထဲမှာ `/start` → **Hosting** → **Upload project** နှိပ်ပါ။
- Bot ရဲ့ upload prompt ကို reply လုပ်ပြီး `.py`, `.js` သို့မဟုတ် folder ကို `.zip` လုပ်ထားတဲ့ document ပို့ပါ။ Upload limit 20 MiB၊ ZIP unpack limit 60 MiB နှင့် 500 entries ဖြစ်ပါတယ်။ ZIP မှာ startup file များရင် ရွေးပေးပါ။
- Project card မှာ **Start**, **Stop**, **Restart**, **Logs**, **Refresh**, **Delete** ရှိပါတယ်။ Delete က confirmation တောင်းပြီး project နဲ့ Docker volume ကို ဖျက်ပါတယ်။
- Project ID ရလာရင် token/config ကို VPS ထဲက `/var/lib/k9-hosting/project-env/<PROJECT_ID>.env` မှာ worker account ပိုင် mode 600 file အဖြစ် ထည့်ပါ။ ထည့်ပြီး **Start** နှိပ်ပါ။ ရှိပြီးသား bot ရဲ့ env ပြင်ရင် **Restart** နှိပ်ပါ။
- Python `requirements.txt` နဲ့ Node `package.json`/npm lockfile ကို startup file ရဲ့ folder သို့မဟုတ် ZIP root မှာ ထည့်နိုင်ပါတယ်။ npm install scripts ကို ပိတ်ထားပါတယ်။ Project တစ်ခုစီမှာ persistent Docker volume ရှိပြီး Docker daemon ပြန်တက်ရင် run ထားတဲ့ project တွေ ပြန်တက်ပါတယ်။ Project count 20 နှင့် container တစ်ခုစီ 512 MiB RAM / 0.5 CPU ကို သတ်မှတ်ထားပါတယ်။ Docker container ရဲ့ actual status ကို `Refresh` နဲ့ကြည့်ပါ။
- Cloudflare ကို VPS က idle ဖြစ်ချိန်မှာ 2–10 စက္ကန့်ခြား စစ်ပါတယ်။ Hosting jobs တွေက 15 မိနစ်အတွင်း စတင်ရပါမယ်။ VPS ပြတ်နေချိန် Customer orders က Cloudflare webhook ကနေ ဆက်ဝင်နိုင်ပါတယ်။

## 4. Go-live check

- Owner နဲ့ `/start` → **Open Owner Page** ကနေ login စမ်းပါ။
- Owner နဲ့ **Hosting** ထဲမှာ သီးသန့် test project ကို upload → start → logs → stop → restart စမ်းပါ။ Customer account မှာ Hosting button မပေါ်တာ စစ်ပါ။
- သီးသန့် Customer account နဲ့ test order တင်ပြီး Quote → Receipt → Verify → Approve → Processing → Delivered → Done စမ်းပါ။ Production KBZPay ကို မစမ်းမီ controlled test order ဖြစ်ကြောင်း သေချာပါစေ။
