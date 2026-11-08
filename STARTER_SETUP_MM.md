# K9 Service Center · Free deployment တစ်ခုတည်း

Python 3.10+ · Startup file: `start_hosting.py` · Runtime: `local`

Website၊ Mini App၊ orders နဲ့ Service Bot webhook က Cloudflare မှာ ဆက်အလုပ်လုပ်ပါတယ်။ ဒီ deployment မှာ Hosting worker နဲ့ ကိုကိုယုံကြည်တဲ့ bot project တွေကို အတူ run ပါမယ်။ Child deployment၊ Bot-Hosting API key နဲ့ Docker မလိုပါ။

## 1. Files နှင့် Startup

ZIP ကို deployment Files မှာတင်ပြီး root ထဲဖြည်ပါ။ ရှိပြီးသား `k9-hosting-data/` folder ကို ထိန်းထားပါ။ Startup → Python 3.12 → Entry file `start_hosting.py` ထားပါ။ Default က local mode ဖြစ်ပါတယ်။ ယခင် settings ရှိရင် `K9_HOSTING_RUNTIME=local` ပြောင်းပါ။

Free plan က deployment ၁ ခု၊ RAM 256 MB၊ CPU 25%၊ disk 512 MB ဖြစ်ပြီး manual renew ၄ ရက်တစ်ခါ လုပ်ရပါတယ်။ အကန့်အသတ်မရှိ bot run ပေးတာ မဟုတ်ပါ။ Default က bot project ၂ ခုအထိ တစ်ပြိုင်နက် စမ်းခွင့်ပြုပြီး memory မလောက်ရင် လျှော့ရပါမယ်။

## 2. Worker Environment: မဖြစ်မနေ field ၅ ခု

| Key | Value |
| --- | --- |
| SITE_URL | https://k9-service.kimshikano.workers.dev |
| BOT_TOKEN | Cloudflare ထဲက K9 Service token အတူတူ |
| OWNER_TELEGRAM_ID | မူရင်း numeric owner ID |
| TELEGRAM_WEBHOOK_SECRET | Cloudflare ထဲက မူရင်း webhook secret အတူတူ |
| K9_HOSTING_SECRET | Hosting အတွက် သီးခြား random secret၊ Cloudflare နဲ့ worker နှစ်ဖက်လုံး တူရမယ် |

Token/secret တွေကို panel မှာ Secret အဖြစ် ထည့်ပါ။ `ENVIRONMENT.example.txt` ဖိုင်က example ဖြစ်ပြီး အလိုအလျောက် load မလုပ်ပါ။ `BOT_HOSTING_API_KEY`, worker ID နဲ့ child ID မလိုတော့ပါ။

Hosting secret က စာလုံး 32–128 လုံး၊ A–Z / a–z / 0–9 / _ / - ဖြစ်ပြီး webhook secret နဲ့ မတူရပါ။ Termux မှာ generate လုပ်နိုင်ပါတယ်—

```sh
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Cloudflare → k9-service → Settings → Variables and Secrets မှာ `K9_HOSTING_SECRET` ထည့်ပြီး deploy လုပ်ပါ။ Project deployment script က ရှိပြီးသား D1 ထဲ Hosting migration ကို apply လုပ်ပါတယ်။ `/api/health` မှာ `ready: true` နဲ့ `hostingQueue: true` ပေါ်ရပါမယ်။ Owner Dashboard → Bot connection ကနေ webhook URL စစ်ပြီး လိုအပ်ရင် Connect bot နှိပ်ပါ။

## 3. Start နှင့် project upload

1. Worker ကို Start လုပ်ပါ။ Console မှာ `K9 Hosting is connected to single-deployment runner and the Cloudflare queue.` ပေါ်ရပါမယ်။
2. Owner account နဲ့ K9 Service Bot → `/hosting` သို့မဟုတ် `/start` → Hosting → Upload project နှိပ်ပါ။
3. Upload prompt ကို reply လုပ်ပြီး `.py` သို့မဟုတ် `.zip` document ပို့ပါ။ ZIP root သို့မဟုတ် startup file ရှိတဲ့ folder မှာ `requirements.txt` ထည့်နိုင်ပါတယ်။ File များရင် startup file ရွေးပါ။
4. **Prepare runtime** နှိပ်ပါ။ Python project တစ်ခုစီအတွက် venv သီးခြားဖန်တီးပြီး dependencies ထည့်ပါမယ်။ Free RAM နည်းလို့ dependencies ပြင်ဆင်ချိန်မှာ run နေတဲ့ projects ကို အရင် Stop လုပ်ရပါတယ်။
5. Project card က 16-character project ID ကို သိမ်းပါ။ Bot token ထည့်ရန် worker panel → Environment မှာ `K9_PROJECT_<PROJECT_ID>_BOT_TOKEN` ဆိုတဲ့ Secret ထည့်ပါ။ ID ထဲ a–f ပါရင် A–F အကြီးဖြစ်ရပါမယ်။ ဥပမာ project `00000000000000af` ဆိုရင် `K9_PROJECT_00000000000000AF_BOT_TOKEN` ဖြစ်ပါတယ်။
6. အဲဒီ project အတွက် `GROQ_API_KEY` လိုရင် `K9_PROJECT_<PROJECT_ID>_GROQ_API_KEY` အဖြစ် ထည့်ပါ။ Child process က `BOT_TOKEN`, `GROQ_API_KEY` ဆိုတဲ့ မူရင်းနာမည်တွေနဲ့ ရရှိပါမယ်။ Worker management secrets နဲ့ အခြား project settings ကို environment အဖြစ် မပို့ပါ။
7. Environment save/apply ကြောင့် worker restart ဖြစ်နိုင်ပါတယ်။ ပြန်တက်ပြီး Telegram မှာ project → **Start** → **Logs** → **Refresh** စစ်ပါ။

ရွေးချယ်စရာအနေနဲ့ `k9-hosting-data/project-env/<id>.env` ကို private file (chmod 600) အဖြစ်လည်း သုံးနိုင်ပါတယ်။ `KEY=value` format ဖြစ်ပြီး panel မှာ သက်ဆိုင်ရာ prefixed key ထည့်ထားရင် panel value က ဦးစားပေးပါတယ်။

## 4. Free resource ကန့်သတ်ချက်များ

| Optional worker setting | Default | အဓိပ္ပာယ် |
| --- | --- | --- |
| K9_HOSTING_RUNTIME | local | Single deployment mode |
| K9_HOSTING_DIR | ./k9-hosting-data | Persistent project/state folder |
| K9_HOSTING_MAX_RUNNING | 2 | တစ်ပြိုင်နက် run ခွင့်ပြု project အများဆုံး |
| K9_HOSTING_MEMORY_MB | 160 | Child process groups ရဲ့ စုစုပေါင်း RSS budget |
| K9_HOSTING_DISK_MB | 320 | Worker data folder အတွက် disk budget |

Provider ရဲ့ RAM limit ကို တိုးပေးတာ မဟုတ်ပါ။ Memory guard က ၁ စက္ကန့်ခြား စစ်ပြီး headroom နည်းရင် Start တားပါမယ်။ Runtime budget ကျော်ရင် running projects ကို Stop လုပ်ပြီး user က ပြန်စစ်ကာ Start လုပ်ရပါမယ်။ ရုတ်တရက် memory တက်တာကို OS ရဲ့ OOM kill မဖြစ်အောင် အပြည့်အဝ အာမမခံနိုင်ပါ။

Disk budget ထဲ project source၊ dependencies၊ data ပါပါတယ်။ Logs ကို bounded rotation လုပ်ထားပါတယ်။ Video merger/downloader/music streaming လိုကြီးတဲ့အလုပ်ကို ဒီ Free pool ထဲ အများကြီး တစ်ပြိုင်နက် မထည့်ပါနှင့်။

## 5. Restart နှင့် data

Run ထားတဲ့ project ရဲ့ desired state ကို disk မှာ သိမ်းထားပြီး worker ပြန်တက်ရင် ပြန်စတင်ပါမယ်။ Stop နှိပ်ထားတဲ့ project က အလိုအလျောက် မတက်ပါ။ ခဏခဏ crash ဖြစ်တဲ့ bot ကို retry အကန့်အသတ်နဲ့ ရပ်ထားပြီး Logs စစ်ပြီးမှ Start ပြန်နှိပ်ရပါမယ်။

Project ရဲ့ working directory က upload ထဲက startup file ရှိတဲ့ folder ဖြစ်ပါတယ်။ Relative SQLite/JSON data က အဲဒီထဲ ဆက်ရှိပါမယ်။ Worker update လုပ်ရင် `k9-hosting-data/` ကို မဖျက်ပါနှင့်။ Delete project confirmation အတည်ပြုရင် project source၊ venv၊ local data နဲ့ local env file ကို ဖျက်ပါတယ်။ Panel မှာ ဖြည့်ထားတဲ့ project Secret ကိုတော့ ကိုယ်တိုင်ဖြုတ်ရပါတယ်။

## 6. စမ်းသပ်ရန်

ZIP ထဲက `smoke_test.py` ကို Telegram မှာ document အဖြစ်ပို့၊ Prepare runtime → Start → Logs မှာ `K9 child smoke test: running` စစ်ပါ။ Token မလိုပါ။ Stop → Refresh → Start → Restart စမ်းပြီး worker ကို panel က restart လုပ်ပါ။ Run ထားတဲ့ sample ပြန်တက်၊ Stop ထားတဲ့ sample မတက်ကြောင်း စစ်ပါ။

Customer account မှာ Hosting controls မပေါ်တာ၊ upload မလုပ်နိုင်တာ စစ်ပါ။ နောက်ဆုံး customer test order → Quote → Receipt → Verify → Processing → Delivery → Done စစ်ပါ။

Python image ထဲ `node` နဲ့ `npm` ရှိမှ `.js` projects သုံးနိုင်ပါတယ်။ မရှိရင် runtime က ရှင်းပြပြီးရပ်ပါမယ်။ ဒီ build က Node.js ကို အလိုအလျောက် download/install မလုပ်ပါ။

ဒီ mode မှာ project တွေဟာ OS user/filesystem permissions ကို အတူသုံးပါတယ်။ Dependency/environment ခွဲထားပေမယ့် container security isolation မဟုတ်ပါ။ Owner ကိုယ်တိုင်ယုံကြည်ပြီး စစ်ထားတဲ့ code အတွက်သာ သုံးပါ။

Legacy paid two-deployment adapter အတွက် `MANAGED_STARTER_SETUP_MM.md` ကိုကြည့်ပါ။
