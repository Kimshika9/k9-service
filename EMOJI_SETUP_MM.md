# K9 custom emoji, native color buttons and Rich Messages

လက်ရှိ K9 က Cloudflare TypeScript webhook + Python Hosting worker ဖြစ်ပါတယ်။ telebot သို့ ပြန်မပြောင်းပါ။

## Config ဖိုင်များ

- `emoji/packs.json`: pack name, primary purpose, default key, normal fallback
- `emoji/emoji_roles.json`: approved role → pack + emoji key
- `emoji/emoji_ids.json`: Telegram getStickerSet က ထုတ်ထားတဲ့ real IDs, original index, fallback, animated/video flags
- `emoji/presentation.json`: native button styles, button icon switch, Rich Message switch

သုံးခုလုံး fetch အောင်မြင်ထားပါတယ်။ CATS 40 / WORK 96 / NEWS 100။ `emoji/emoji_list.txt` ကိုကြည့်ပြီး pack + index နဲ့ ရွေးပါ။ Production config မှာ emoji role/default ကို မရွေးထားသေးပါ။ Config null ဖြစ်ချိန်မှာ normal fallback သာသုံးပါတယ်။

ဥပမာ `welcome` အတွက် CATS နံပါတ်တစ်ခု ရွေးမယ်ဆိုရင် list ထဲက အဲဒီ row ရဲ့ `CATS:...` key တစ်ခုလုံးကို `emoji_roles.json` ရဲ့ `welcome.emoji` မှာထည့်ပါ။ Pack ရဲ့ default ကိုလည်း list ထဲက အဲဒီ pack ရဲ့ key တစ်ခုဖြင့် ရွေးနိုင်ပါတယ်။ ID ကို စိတ်ကြိုက်မထည့်ပါနှင့်။

Roles: thanks / welcome / chat = CATS; order / price / payment = WORK; announcement = NEWS။ Mixed business message က WORK သုံးပါတယ်။ မသိတဲ့ role အတွက် CATS default/fallback ကိုပဲသုံးပြီး config ထဲ role အသစ် အလိုအလျောက်မဖန်တီးပါ။

## Phone မှာ refresh လုပ်ရန်

ZIP ကိုဖြည်ပြီး `fetch_emoji.py` နဲ့ `emoji/` folder ကို တစ်နေရာတည်းထားပါ။

Termux:

```sh
pkg install python
python fetch_emoji.py
```

Token မရှိရင် script က device ပေါ်မှာ hidden input နဲ့မေးပါမယ်။ Environment BOT_TOKEN ထည့်ပြီးသား hosting မှာတော့ token ပြန်မတောင်းပါ။ Pydroid 3 မှာ `fetch_emoji.py` ကိုဖွင့်ပြီး Run လုပ်နိုင်ပါတယ်။ pip dependency မလိုပါ။ Script က getStickerSet ကိုသာခေါ်ပြီး Telegram message မပို့ပါ။

List ပြန်ကြည့်ချင်ရင်:

```sh
python fetch_emoji.py --offline
```

Pack အသစ်အတွက် packs.json မှာ name, key, purpose, default, fallback ထည့်ပြီး script ပြန် run ပါ။ Role အသစ်ကို ကိုကို approve ပြီးမှ emoji_roles.json ထဲထည့်ပါ။ Helper code ပြောင်းဖို့မလိုပါ။

## Existing project ထဲအသုံးပြုပုံ

Cloudflare: `lib/emoji.ts` က safe `e(role)` helper ဖြစ်ပြီး `lib/telegram.ts` က Rich → HTML custom emoji → HTML normal fallback အဆင့်လိုက်ပို့ပါတယ်။ `/start`, services/order flow, owner notifications နဲ့ Hosting worker message တွေအတွက် ချိတ်ထားပါတယ်။ `sendRichMessage` က `rich_message.html` သုံးပြီး `sendMessage` fallback က `parse_mode=HTML` သုံးပါတယ်။ User text ကို escape လုပ်ပါတယ်။

Button မှာ tag မထည့်ပါ။ API ရဲ့ `icon_custom_emoji_id` သာသုံးပါတယ်။ `style` က primary / success / danger သာရပြီး Telegram theme က အရောင်ပြပါတယ်။ Custom purple hex ကို native inline button မှာ မသတ်မှတ်နိုင်ပါ။ ကိုကို့ button-icon request အတိုင်း icon support ဖွင့်ထားပေမယ့် WORK default မရွေးခင် custom icon မပေါ်သေးပါ။

Owner ရဲ့ Telegram Premium eligibility လိုအပ်ပါတယ်။ Normal fallback က unsupported rendering/notifications စတဲ့နေရာတွေအတွက်ပါ။ Non-Premium viewer အားလုံးကို custom emoji မမြင်ရဘူးလို့ မယူဆပါနှင့်။

Hosting upload prompt ကို plain text အတိုင်းထားပါတယ်။ လက်ရှိ authenticated reply-to-upload flow က exact prompt ကိုစစ်တာကြောင့် ဖြစ်ပါတယ်။

## Deploy / tests

ဒီ ZIP ထဲက Cloudflare files ကို bot-hosting.net မှာ run မလုပ်ပါနှင့်။ Source repo branch မှာ ပြင်ဆင်ထားပြီး role/default ရွေးချယ်ပြီးမှ production update တင်ရပါမယ်။ Python Hosting side အတွက် `emoji_helpers.py`, `emoji/` နဲ့ updated `hosting/__main__.py` ကို အတူတင်ရပါမယ်။ Existing `k9-hosting-data/` ကို ထိန်းထားပါ။

ရွေးချယ်ပြီးနောက် test list:

1. Customer account `/start`: welcome CATS custom emoji၊ Mini App button အလုပ်လုပ်မှု။
2. `/services`, order review, confirmation: WORK emoji နဲ့ callback မပျက်မှု။
3. Owner order notification: Rich table နဲ့ Approve / Processing / Done colored controls။
4. Hosting menu/cards: WORK icon; upload prompt reply နဲ့ project upload ဆက်အလုပ်လုပ်မှု။
5. Missing role/ID: normal fallback ရပြီး raw ID မပေါ်မှု။
6. User input `<`, `>`, `&`: HTML tag အဖြစ်မဖြစ်ဘဲ စာသားအတိုင်းပေါ်မှု။
7. Rich/custom presentation API က 400 ပြန်ရင် fallback path ပေါ်မှု။ Network/permission failure အားလုံးကို success လို့ဖုံးမထားပါ။

Role ရွေးရန်: CATS default, WORK default, NEWS default နဲ့ approved role 7 ခုအတွက် pack + index ပေးပါ။ Default နဲ့တူမယ့် role တွေကို "default" လို့ရေးနိုင်ပါတယ်။
