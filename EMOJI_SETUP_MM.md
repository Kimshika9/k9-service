# K9 Service Center — Premium Emoji + Rich Message Fix

လက်ရှိ Cloudflare webhook bot နဲ့ Python Hosting worker ကို ဆက်သုံးထားသည်။ Bot အသစ်ပြန်ဆောက်ခြင်း၊ telebot သို့ ပြောင်းခြင်း၊ polling ထပ် run ခြင်း မလိုပါ။

## ပြင်ထားသည်များ

- `emoji/emoji_ids.json`: role -> {id, fallback, pack}။ IDs အားလုံး string ဖြစ်သည်။
- မူရင်း pack များမှ fetch လုပ်ထားသည့် IDs များကို `emoji/emoji_catalog.json` တွင် သိမ်းထားသည်။ Role defaults တွင် CATS / WORK / NEWS ကို သူ့ purpose အတိုင်း သုံးထားသည်။
- `emoji_manager.py`: Python emoji, button, send/edit wrappers အားလုံး။ `emoji_helpers.py` သည် အဟောင်း imports အတွက် compatibility file ဖြစ်သည်။
- `lib/emoji-manager.ts`: Cloudflare D1 တွင် owner ရွေးထားသော roles ကို သိမ်းသည်။ ရှိပြီးသား `settings` table ကို သုံး၍ migration မလိုပါ။
- Rich Message တွင် emoji ကို heading အစ၌ထားပြီး paragraphs, order table နဲ့ native color buttons ပါသည်။ Telegram က format ကို ပယ်ချမှ error ကို log ရေး၍ HTML fallback သုံးသည်။ Network/permission error ကို format error အဖြစ် မဖုံးကွယ်ပါ။
- Hosting worker သည် authenticated queue မှ role settings ကို ရယူသည်။ `/addemoji` တစ်ခါပြင်လျှင် နှစ်ဖက်စလုံးမှာ အသက်ဝင်သည်။

## Owner က အသုံးပြုပုံ

1. Bot ကို owner account မှ `/start` ပို့ပါ။
2. `/emojitest` ကို အရင်ပို့ပါ။ Role တစ်ခုစီ၏ Premium emoji၊ Rich Message heading၊ button icon ကို ကြည့်ပါ။
3. `/addemoji welcome` ပို့ပြီး CATS pack မှ Premium emoji တစ်ခုကို text အဖြစ် ပို့ပါ။ Sticker/photo မဟုတ်ပါ။
4. `/addemoji order` ပို့ပြီး WORK pack မှ တစ်ခု ပို့ပါ။
5. `/addemoji announcement` ပို့ပြီး NEWS pack မှ တစ်ခု ပို့ပါ။
6. `/emojis` သည် owner-only role / pack / ID စာရင်းဖြစ်သည်။ Customer messages တွင် raw IDs မထွက်ပါ။
7. `/delemoji welcome` သည် role ၏ custom ID ကို ဖယ်၍ normal fallback ကို ဆက်သုံးသည်။
8. `/cancel` ဖြင့် emoji ရွေးခြင်းကို ရပ်နိုင်သည်။ ရွေးချယ်ချိန် 10 မိနစ်ဖြစ်သည်။

Role အသစ်ကို owner ကိုယ်တိုင် `/addemoji my_role WORK` ဟု ထည့်နိုင်သည်။ Role အမည်မှာ English lowercase, digits, underscore ဖြင့် 32 လုံးအထိ ဖြစ်ရမည်။ Pack မသတ်မှတ်ပါက ပို့ထားသော emoji ၏ တကယ့် pack ကို Telegram မှ စစ်၍ ရွေးသည်။ Pack purpose ကို ပြောင်း၍ မရောပါ။

Pack အသစ်အတွက် `emoji/packs.json` တွင် name, key, purpose, default, fallback ထည့်ပြီး `python3 fetch_emoji.py` ကို run ပါ။ Fetch သည် catalog ကိုသာ ပြင်သည်။ ရွေးထားပြီးသော role IDs ကို မဖျက်ပါ။

## Deployment

Cloudflare source files ကို deploy လုပ်ရန် လိုသည်။ Message rendering နဲ့ owner tools တို့ကို Cloudflare က ဆောင်ရွက်သောကြောင့် ဖြစ်သည်။ Secrets ပြင်စရာ မလိုပါ။

Cloudflare deploy ပြီးမှ Hosting ZIP ထဲက complete files ကို လက်ရှိ deployment ထဲ တင်၍ restart လုပ်ပါ။ `k9-hosting-data` နှင့် environment variables မဖျက်ပါနှင့်။ Entry point သည် `start_hosting.py` အတိုင်း ဖြစ်သည်။

## Phone / Termux / Pydroid 3

လက်ရှိ bot က cloud ပေါ်တွင် run နေ၍ ဖုန်းမှာ polling process ထပ် run စရာမလိုပါ။ စစ်ဆေးချင်လျှင် ZIP ဖြည်ထားသည့် folder မှ connector ကို သုံးပါ။

```sh
python bot.py --setup
python bot.py --check
python bot.py --status
```

Webhook ပြန်ချိတ်ရန်သာ လိုပါက `python bot.py --connect` ကို သုံးပါ။ Hosting supervisor ကို bot-hosting.net ၏ Linux container မှာ run ပါ။

## စမ်းသပ်ရန်

- `/emojitest` → Premium emoji / rich heading / button icon မြင်ရမည်။
- `/addemoji order` → WORK emoji ပို့ → `/emojis` တွင် ID string သိမ်းထားရမည်။
- Emoji မတိုင်မီ စာ၊ အခြား emoji ပါသည့် message မှလည်း UTF-16 offsets မှန်စွာ ဖတ်နိုင်ရမည်။
- CATS role အတွက် WORK emoji ပို့လျှင် မသိမ်းရ။
- Owner မဟုတ်သူ `/addemoji`, `/emojis`, `/delemoji`, `/emojitest` အသုံးမပြုနိုင်ရ။
- Restart ပြီး `/emojitest` ထပ်စမ်းလျှင် ရွေးထားသော emoji မပျောက်ရ။
- Customer `/start` → service → order → owner notification / status edit သည် Rich Message နဲ့ ဖြစ်ရမည်။
- Hosting menu / project card တွင် emoji နဲ့ color buttons ပါရမည်။
