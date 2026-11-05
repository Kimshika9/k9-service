'use client';

import {useEffect,useState} from 'react';
import {ArrowDown,ArrowUpRight} from 'lucide-react';
import GradientASCII from '../components/k9/GradientASCII';
import {money,type Service} from '../lib/catalog';
import {loadTelegramSDK} from '../lib/telegram-launch';

const background = '#060a1c';
const palette = ['#1e3fd8','#f6f8ff','#a5d8ff','#38bdf8'];
type OrderButton = {
 setParams: (params:{text:string;color:string;text_color:string})=>void;
 show:()=>void; hide:()=>void; onClick:(handler:()=>void)=>void; offClick:(handler:()=>void)=>void;
};
type Telegram = {
 platform?:string; ready?:()=>void; expand?:()=>void;
 setHeaderColor?:(color:string)=>void; setBackgroundColor?:(color:string)=>void;
 setBottomBarColor?:(color:string)=>void; disableVerticalSwipes?:()=>void; enableVerticalSwipes?:()=>void;
 MainButton?:OrderButton; HapticFeedback?:{selectionChanged?:()=>void};
};
function telegram() {
 const app = (window as Window & {Telegram?:{WebApp?:Telegram}}).Telegram?.WebApp;
 return app?.platform && app.platform !== 'unknown' ? app : undefined;
}

export default function HorizonCatalog({services,name,lang,error,onRetry,onOrder,modalOpen}:{
 services:Service[];name?:string;lang:'EN'|'MM';error:string;onRetry:()=>void;
 onOrder:(service:Service)=>void;modalOpen:boolean;
}) {
 const [selection,setSelection]=useState<string|null>(null);
 const [host,setHost]=useState<Telegram>();
 const service=services.find(s=>s.id===selection);
 const mm=lang==='MM';
 const action=service?(mm?'အော်ဒါစတင်ရန်':`Order ${service.name}`):(mm?'ဝန်ဆောင်မှုတစ်ခု ရွေးပါ':'Choose a service to continue');
 useEffect(()=>{
  let active=true;
  let app:Telegram|undefined;
  void loadTelegramSDK().then(()=>{
   if(!active) return;
   app=telegram();
   if(!app) return;
   app.ready?.();
   app.expand?.();
   app.setHeaderColor?.(background);
   app.setBackgroundColor?.(background);
   app.setBottomBarColor?.(background);
   app.disableVerticalSwipes?.();
   setHost(app);
  });
  return ()=>{active=false;app?.enableVerticalSwipes?.();};
 },[]);
 useEffect(()=>{
  const button=host?.MainButton;
  if(!button) return;
  if(!service||modalOpen){button.hide();return;}
  const order=()=>onOrder(service);
  button.setParams({text:Array.from(action).slice(0,64).join(''),color:'#1e3fd8',text_color:'#ffffff'});
  button.onClick(order);
  button.show();
  return ()=>{button.offClick(order);button.hide();};
 },[action,host,modalOpen,onOrder,service]);
 return <div className="horizon-home">
  <section className="horizon-hero" aria-labelledby="horizon-title">
   <div className="horizon-graphics" aria-hidden="true">
    <GradientASCII colors={palette} shape="horizon" characters=" =+xX0S8#@" cellSize={18}
      density={0.8} dpr={1.5} style={undefined}/>
   </div>
   <div className="horizon-wrap horizon-top">
    <span className="horizon-kicker">K9 / SERVICE CENTER</span>
    {name&&<span className="horizon-name">{name}</span>}
   </div>
   <div className="horizon-wrap horizon-copy">
    <p className="horizon-kicker"><span/> {mm?'လိုအပ်ချက်အလိုက် ဖန်တီးပေးမယ်':'BUILT AROUND YOUR IDEA'}</p>
    <h1 id="horizon-title">{mm?<>စိတ်ကူးကို<br/><em>အသက်သွင်းမယ်။</em></>:<>Your next<br/><em>build starts here.</em></>}</h1>
    <p>{mm?'Telegram Bot၊ Mini App နဲ့ Website တွေအတွက် ဝန်ဆောင်မှုတစ်ခုရွေးပြီး Project စတင်ပါ။':'Telegram bots, Mini Apps, and websites. Choose a service and tell us what you want to build.'}</p>
    <a href="#horizon-services" onClick={event=>{
     event.preventDefault();
     document.getElementById('horizon-services')?.scrollIntoView();
    }} aria-label={mm?'ဝန်ဆောင်မှုများကြည့်ရန်':'Go to services'}><ArrowDown size={19}/></a>
   </div>
  </section>
  <section className="horizon-wrap horizon-services" id="horizon-services" aria-labelledby="horizon-services-title">
   <div className="horizon-list-title">
    <div><p className="horizon-kicker">01 / CATALOG</p><h2 id="horizon-services-title">{mm?'ဝန်ဆောင်မှု ရွေးပါ':'Choose a service'}</h2></div>
    <span>{String(services.length).padStart(2,'0')} {mm?'ခု':'AVAILABLE'}</span>
   </div>
   {error?<div className="notice error" role="alert">{error} <button onClick={onRetry}>Retry</button></div>:null}
   <fieldset className="horizon-list" aria-labelledby="horizon-services-title">
    {services.map(item=><label key={item.id} className="horizon-row">
     <input type="radio" name="k9-horizon-service" value={item.id} checked={item.id===selection}
      onChange={()=>{setSelection(item.id);host?.HapticFeedback?.selectionChanged?.();}}/>
     <span className="horizon-radio" aria-hidden="true"/>
     <span className="horizon-item"><strong>{item.name}</strong><span>{item.description}</span></span>
     <span className="horizon-price">{item.priceMmk==null?item.price:money(item.priceMmk)}</span>
    </label>)}
   </fieldset>
   {!services.length&&!error&&<p>{mm?'လက်ရှိ ဝန်ဆောင်မှု မရှိသေးပါ။':'No services are available right now.'}</p>}
   {!host?.MainButton&&<div className="horizon-dock">
    <button type="button" disabled={!service} onClick={()=>{if(service)onOrder(service);}}>
     {action}<ArrowUpRight size={18}/>
    </button>
   </div>}
  </section>
 </div>;
}
