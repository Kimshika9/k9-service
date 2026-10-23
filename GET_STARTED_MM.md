# K9 Service — GitHub / Cloudflare စတင်ရန်

ဒီ package က ကိုကို့ Cloudflare account ပေါ် သီးသန့်တင်ဖို့ ပြင်ဆင်ထားတဲ့ source code ဖြစ်ပါတယ်။ လက်ရှိ private website ထဲက account secrets နဲ့ customer data တွေ မပါပါဘူး။

## ပထမဆုံး GitHub repository ဆောက်မယ်

1. ဖုန်း Chrome ကနေ GitHub ဝင်ပါ။
2. **New repository** ကိုနှိပ်ပါ။
3. Repository name ကို **k9-service** လို့ထည့်ပါ။
4. **Private** ကိုရွေးပါ။
5. **Add a README file** ကိုဖွင့်ပြီး Create repository နှိပ်ပါ။
6. Repository link ကို Luna ဆီပေးပါ။ GitHub connection က repo ကိုမြင်ရရင် source တင်ဖို့ ဆက်လုပ်နိုင်မယ်။

ကိုယ်တိုင်တင်မယ်ဆို ZIP ကိုဖြည်ပြီး အထဲက source files/folders တွေကို repo root မှာတင်ပါ။ ZIP တစ်ဖိုင်တည်းကို repo ထဲတင်တာနဲ့ website build မဖြစ်ပါဘူး။

## Cloudflare ချိတ်မယ်

- D1 database: **k9-service-db**
- Private R2 bucket: **k9-service-receipts**
- `wrangler.jsonc` ထဲက sample database ID ကို ကိုကို့ D1 ID နဲ့အစားထိုးပါ။
- Workers & Pages မှာ GitHub repo ကိုချိတ်ပြီး Worker name **k9-service** ရွေးပါ။
- Build command: **pnpm build**
- Deploy command: **pnpm run deploy**
- Node version: **22**
- Production branch: **main**

Bot Token၊ Owner Telegram ID၊ KBZPay လက်ခံအကောင့်နဲ့ website URL ကို Cloudflare ရဲ့ Variables and Secrets မှာထည့်ရမယ်။ တကယ့် token/password တွေ GitHub ထဲမတင်ပါနဲ့။ အသေးစိတ် fields နဲ့ ပထမဆုံး Mini App ချိတ်နည်းကို `README.md` မှာ အဆင့်လိုက်ရေးထားပါတယ်။

ဒီ package ကို ပြင်ဆင်ပြီးဖြစ်ပေမယ့် ကိုကို့ Cloudflare account ပေါ် deploy လုပ်ပြီးသား မဟုတ်သေးပါဘူး။
