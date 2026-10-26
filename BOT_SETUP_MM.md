# K9 Service Bot — ဖုန်းကနေ ချိတ်ရန်

`bot.py` က Python standard library ပဲသုံးထားလို့ **Pydroid 3 / Termux မှာ package ထပ်တင်စရာမလိုပါဘူး။** Website နဲ့ database က Cloudflare ပေါ်မှာပဲ အလုပ်လုပ်မယ်။

## ပထမဆုံး run

1. `bot.py` ကို ဖုန်းထဲ download လုပ်ပြီး Pydroid 3 မှာ Run နှိပ်ပါ။
2. Terminal မေးတဲ့အခါ ဒီသုံးခုထည့်ပါ။
   - BotFather က **Bot Token**
   - ကိုကို့ deployed website ရဲ့ **HTTPS URL** (`/owner` မပါရ)
   - ကိုကို့ **numeric Telegram user ID** (`@username` မဟုတ်ရ)
3. Bot username ကို script က `getMe` နဲ့ အလိုအလျောက်သိမယ်။ Webhook secret ကိုလည်း အလိုအလျောက်ထုတ်ပေးမယ်။
4. Script folder ထဲမှာ `CLOUDFLARE-SECRETS.txt` နဲ့ `.k9-service-config.json` ပေါ်လာမယ်။ ဒီဖိုင်နှစ်ခုက ကိုကို့ဖုန်းထဲမှာပဲထားရမယ့် private configuration ဖြစ်တယ်။ GitHub/Chat ထဲမတင်ပါနဲ့။

## Cloudflare မှာ တစ်ကြိမ်ထည့်ပေးရမယ်

Cloudflare → Workers & Pages → **k9-service** → Settings → **Variables and Secrets** မှာ `CLOUDFLARE-SECRETS.txt` ထဲက values ကို Secret အဖြစ်ထည့်ပါ။

| Name | Value |
| --- | --- |
| `BOT_TOKEN` | bot.py ထဲက token နဲ့ အတူတူ |
| `OWNER_TELEGRAM_ID` | ကိုကို့ numeric Telegram ID |
| `TELEGRAM_WEBHOOK_SECRET` | script ကထုတ်ပေးထားတဲ့ value |
| `SITE_URL` | HTTPS website base URL |
| `BOT_USERNAME` | script သိထားတဲ့ username; မထည့်လည်း server က token နဲ့ရှာနိုင်ပြီ |

Secret တွေထည့်ပြီး latest Worker version ကို deploy လုပ်ပါ။ Script က ကိုကို့ Cloudflare account credentials ကိုမယူပါဘူး။ အဲဒါကြောင့် Cloudflare settings ကို ဒီတစ်ကြိမ် ကိုကိုထည့်ပေးရမယ်။

## Bot ကို live ချိတ်မယ်

Settings ထည့်ပြီး `bot.py` ကို ထပ် Run ပါ။ Script က website နဲ့ bot token/owner ID/site URL/connection secret ကိုတိုက်စစ်ပြီး:

- Cloudflare webhook ချိတ်ပေးမယ်။
- `/start`, `/services`, `/order`, `/orders`, `/id`, `/cancel` commands ထည့်ပေးမယ်။
- Customer အတွက် **Open K9 Service** menu နဲ့ Owner အတွက် **Owner dashboard** menu ထည့်ပေးမယ်။

**Connected** လို့ပြပြီးရင် Python process ကိုပိတ်လို့ရတယ်။ Bot က Cloudflare webhook နဲ့ ဆက်အလုပ်လုပ်နေမယ်။

ကိုကို့ bot ရဲ့ chat ထဲကိုသွားပြီး **Start → Owner dashboard** နှိပ်ပါ။ ပထမဆုံး menu မပေါ်သေးရင် bot ကို Start နှိပ်ပြီး script ကိုထပ် Run ပါ။

Owner page က `OWNER_TELEGRAM_ID` မှန်တဲ့ account ကိုပဲ ဝင်ခွင့်ပေးမယ်။ Customer ကို owner အဖြစ်ပြောင်းပေးတဲ့ public activation မရှိပါဘူး။

## Termux commands

```sh
python bot.py --setup
python bot.py --check
python bot.py --status
python bot.py --connect
```

`--setup` က settings ပြင်ပြီးပဲ ရပ်မယ်။ Flag မပါဘဲ Run ရင် settings မရှိသေးတာကိုမေးပြီး webhook ဆက်ချိတ်မယ်။

`python bot.py --poll` က ဖုန်းကိုဖွင့်ထားပြီး updates တွေကို Cloudflare backend ဆီ ပို့တဲ့ optional mode ဖြစ်တယ်။ ဒီ mode က webhook ကိုဖြုတ်ပြီး polling သုံးမယ်။ တစ်ချိန်တည်းမှာ polling process တစ်ခုသာ run ပါ။ `--connect` နဲ့ webhook mode ပြန်ထားနိုင်တယ်။

## Error ဖြစ်ရင်

- **Cloudflare settings are missing…** → private text file ထဲက အဲဒီ keys တွေ Cloudflare Secret မှာထည့်ပါ။
- **different bot tokens** → website နဲ့ bot.py မှာ တူညီတဲ့ bot token သုံးပါ။
- **OWNER_TELEGRAM_ID differs…** → နှစ်နေရာလုံးမှာ ကိုကို့ numeric ID ကို တူအောင်ထားပါ။
- **verification expired** → Mini App ကိုပိတ်ပြီး bot menu ကနေ အသစ်ဖွင့်ပါ။
- **Another polling process…** → အခြား run နေတဲ့ process ကိုပိတ်ပါ။

Payment receipts၊ order status၊ Rich Message tables နဲ့ owner callbacks တွေကို Cloudflare backend ကပဲ ကိုင်တွယ်တယ်။ Python ထဲမှာ order database အသစ်ခွဲမဆောက်ထားပါဘူး။
