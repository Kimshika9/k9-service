// Client launch data is only a transport hint. The server always verifies its HMAC.
const storageKey='k9-telegram-launch';
type LaunchHost={initData?:string;ready?:()=>void;expand?:()=>void;setHeaderColor?:(color:string)=>void;setBackgroundColor?:(color:string)=>void};
type LaunchWindow={Telegram?:{WebApp?:LaunchHost};location:{hash:string};sessionStorage:{getItem:(k:string)=>string|null;setItem:(k:string,v:string)=>void;removeItem:(k:string)=>void}};
export function getTelegramWebApp(w:LaunchWindow|undefined=typeof window==='undefined'?undefined:window as unknown as LaunchWindow){return w?.Telegram?.WebApp;}
export function getLaunchData(w:LaunchWindow|undefined=typeof window==='undefined'?undefined:window as unknown as LaunchWindow,now=Date.now()/1000):string{
 if(!w)return '';
 const valid=(raw:string)=>{const t=Number(new URLSearchParams(raw).get('auth_date'));return raw.length<=16384&&t>0&&now-t<=3600&&t-now<=30;};
 const direct=w.Telegram?.WebApp?.initData||new URLSearchParams(w.location.hash.replace(/^#/,'' )).get('tgWebAppData')||'';
 if(direct){if(valid(direct)){try{w.sessionStorage.setItem(storageKey,direct)}catch{}return direct;}try{w.sessionStorage.removeItem(storageKey)}catch{}return '';}
 try{const saved=w.sessionStorage.getItem(storageKey)||'';if(saved&&valid(saved))return saved;w.sessionStorage.removeItem(storageKey);}catch{}
 return '';
}
export function clearLaunchData(){try{sessionStorage.removeItem(storageKey)}catch{}}
let sdk:Promise<void>|undefined;
export function loadTelegramSDK(){
 if(sdk)return sdk;
 sdk=new Promise<void>(resolve=>{
  if(getTelegramWebApp()){resolve();return;}
  const installed=document.getElementById('telegram-web-app');
  const script=installed||document.createElement('script');
  const finish=()=>{clearTimeout(timer);script.removeEventListener('load',finish);script.removeEventListener('error',finish);resolve();};
  const timer=setTimeout(finish,8000);
  script.addEventListener('load',finish,{once:true});
  script.addEventListener('error',finish,{once:true});
  if(!installed){
   const element=script as HTMLScriptElement;
   element.id='telegram-web-app';
   element.src='https://telegram.org/js/telegram-web-app.js?64';
   element.async=true;
   document.head.appendChild(element);
  }
 });
 return sdk;
}

export function ownerLaunchPath(w:LaunchWindow|undefined=typeof window==='undefined'?undefined:window as unknown as LaunchWindow,now=Date.now()/1000){const raw=getLaunchData(w,now);return '/owner'+(raw?'#tgWebAppData='+encodeURIComponent(raw):'');}
