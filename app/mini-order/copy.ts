import {serviceCopy} from '../orbit/my';
import {defaultServices,type Service} from '../../lib/catalog';

const en={
 brand:'K9 Service', language:'Language', help:'Need help?', back:'Back', loading:'Loading your order…',
 titles:['What do you need?','Tell us a little','Check and send'],
 progress:(step:number)=>`Step ${step} of 3`,
 catalog:'Choose a service to get a price.', custom:'Not sure? Choose Custom Project.',
 unavailable:'No services are available right now.', quote:'Get a price', review:'Review order', send:'Send order',
 sending:'Sending…', brief:'What do you want to build?', placeholder:'Describe what you need and what it should do.',
 min:'Please write at least 10 characters.', timing:'When do you need it? (optional)',
 times:{soon:'As soon as possible',month:'This month',flexible:'No rush'},
 voice:'Need a hand? Open the K9 bot chat with Need help.',
 summary:'Your order', service:'Service', description:'What you need', time:'Timing', unspecified:'No preference',
 result:'Order received', reference:'Order number', next:'Check My Orders for the next step and updates.',
 orders:'See my orders', signIn:'Reopen this Mini App from the K9 bot to verify your Telegram account.',
 retry:'Try again', failed:'The order could not be sent. Check your connection and try again.',
};
const my:typeof en={
 // New Burmese copy needs native review.
 brand:'K9 Service', language:'ဘာသာစကား', help:'အကူအညီလိုပါသလား', back:'နောက်သို့', loading:'အော်ဒါဖွင့်နေသည်…',
 titles:['ဘာဝန်ဆောင်မှု လိုပါသလဲ','လိုအပ်ချက် ရေးပါ','စစ်ဆေးပြီး ပို့ပါ'],
 progress:step=>`အဆင့် ${step} / ၃`,
 catalog:'ဈေးနှုန်းမေးဖို့ ဝန်ဆောင်မှုတစ်ခု ရွေးပါ။', custom:'မသေချာရင် ကိုယ်ပိုင် Project ကို ရွေးပါ။',
 unavailable:'လောလောဆယ် ဝန်ဆောင်မှု မရှိသေးပါ။', quote:'ဈေးနှုန်း မေးရန်', review:'အော်ဒါ စစ်ရန်', send:'အော်ဒါ ပို့ရန်',
 sending:'ပို့နေသည်…', brief:'ဘာဖန်တီးချင်ပါသလဲ', placeholder:'ဘာလိုအပ်လဲ၊ ဘာလုပ်ပေးရမလဲ ရေးပြပါ။',
 min:'အနည်းဆုံး စာလုံး ၁၀ လုံး ရေးပါ။', timing:'ဘယ်တော့ လိုပါသလဲ (ရွေးချယ်နိုင်သည်)',
 times:{soon:'တတ်နိုင်သမျှ မြန်မြန်',month:'ဒီလအတွင်း',flexible:'အလျင်မလိုပါ'},
 voice:'အကူအညီလိုရင် အပေါ်က ခလုတ်နဲ့ K9 bot chat ကို ဖွင့်နိုင်ပါတယ်။',
 summary:'ကိုယ့်အော်ဒါ', service:'ဝန်ဆောင်မှု', description:'လိုအပ်ချက်', time:'လိုအပ်မယ့်အချိန်', unspecified:'သတ်မှတ်မထားပါ',
 result:'အော်ဒါ ရရှိပါပြီ', reference:'အော်ဒါနံပါတ်', next:'နောက်ဆက်တွဲ အခြေအနေကို My Orders မှာ ကြည့်နိုင်ပါတယ်။',
 orders:'ကိုယ့်အော်ဒါများ ကြည့်ရန်', signIn:'Telegram အကောင့် စစ်ဆေးရန် K9 bot မှ Mini App ကို ပြန်ဖွင့်ပါ။',
 retry:'ထပ်စမ်းရန်', failed:'အော်ဒါပို့မရပါ။ လိုင်းစစ်ပြီး ထပ်စမ်းပါ။',
};
export const miniCopy={EN:en,MM:my};
export function localizedService(service:Service,language:'EN'|'MM'){
 const original=defaultServices.find(item=>item.id===service.id);
 const translation=serviceCopy[service.id];
 if(language==='EN'||!original||!translation)return service;
 return {
  name:service.name===original.name?translation.name:service.name,
  description:service.description===original.description?translation.description:service.description
 };
}
