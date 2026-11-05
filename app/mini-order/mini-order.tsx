'use client';

import {useEffect,useEffectEvent,useMemo,useRef,useState} from 'react';
import {CheckCircle2,ChevronLeft,HelpCircle} from 'lucide-react';
import GradientASCII from '../../components/k9/GradientASCII';
import {defaultServices,type Service} from '../../lib/catalog';
import {briefLimit,draftStorage,resumeDraft,timings,type Draft,type Timing} from './draft';
import {localizedService,miniCopy} from './copy';
import type {MiniHost} from './telegram';

const voidColor='#08070c', violet='#a78bfa', buttonInk='#0b0818';
const palette=['#4a2fd1','#f6f3ff','#cdbcff','#8b7cf6'];
const mainServices=new Set(defaultServices.filter(service=>service.active).map(service=>service.id));
const supported=(host:MiniHost,version:string)=>!host.isVersionAtLeast||host.isVersionAtLeast(version);
const newDraft=():Draft=>({serviceId:'',details:'',timing:null,step:1,requestId:crypto.randomUUID()});
const replyTime:Record<Timing,string>={soon:'As soon as possible',month:'This month',flexible:'No rush'};

export default function MiniOrder({host,services,language,setLanguage,scope,authenticated,loading,error,
 requested,username,onOrders,onRetry,sendOrder}:{
 host:MiniHost;services:Service[];language:'EN'|'MM';setLanguage:(language:'EN'|'MM')=>void;
 scope:string|null;authenticated:boolean;loading:boolean;error:string;requested?:string;username?:string|null;
 onOrders:()=>void;onRetry:()=>void;sendOrder:(draft:{serviceId:string;requestId:string;details:string;deadline:string})=>Promise<string>;
}){
 const words=miniCopy[language];
 const available=services.filter(service=>service.active);
 const serviceIds=available.map(service=>service.id).join('|');
 const [draft,setDraft]=useState<Draft|null>(null);
 const [order,setOrder]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [failed,setFailed]=useState(false);
 const sending=useRef(false);
 const restored=useRef(false);
 const mounted=useRef(false);
 const storage=useMemo(()=>draftStorage(scope,authenticated&&supported(host,'6.9')?host.CloudStorage:undefined),[scope,authenticated,host]);
 const picked=available.find(item=>item.id===draft?.serviceId);
 const primary=available.filter(item=>mainServices.has(item.id));
 const options=picked&&!mainServices.has(picked.id)?[...primary.slice(0,5),picked]:primary;
 const display=picked?localizedService(picked,language):null;
 const step=draft&&picked?draft.step:1;
 const ready=Boolean(draft&&!loading&&!error&&authenticated);
 const meaningful=Boolean(draft&&(draft.serviceId||draft.details.trim()));
 const action=order?words.orders:busy?words.sending:step===1?words.quote:step===2?words.review:words.send;
 const enabled=Boolean(order||ready&&picked&&!busy&&(step===1||(draft?.details.trim().length??0)>=10));
 const main=host.MainButton;
 const back=host.BackButton;
 const secondary=supported(host,'7.10')?host.SecondaryButton:undefined;
 const bot=(username??'').replace(/^@/,'');
 const helpLink=/^\w{5,32}$/.test(bot)?'https://t.me/'+bot:undefined;

 useEffect(()=>{
  mounted.current=true;
  return ()=>{mounted.current=false;};
 },[]);
 useEffect(()=>{
  host.ready?.();
  host.expand?.();
  host.setHeaderColor?.(voidColor);
  host.setBackgroundColor?.(voidColor);
  if(supported(host,'7.10'))host.setBottomBarColor?.(voidColor);
  const swipes=host.isVerticalSwipesEnabled!==false;
  if(supported(host,'7.7'))host.disableVerticalSwipes?.();
  return ()=>{if(swipes&&supported(host,'7.7'))host.enableVerticalSwipes?.();};
 },[host]);
 useEffect(()=>{
  let active=true;
  if(!authenticated||loading||error||restored.current)return;
  void storage.restore().then(saved=>{
   if(!active)return;
   const next=resumeDraft(saved?.draft??newDraft(),serviceIds.split('|').filter(Boolean),requested);
   restored.current=true;
   setDraft(next);
  });
  return ()=>{active=false;};
 },[authenticated,error,loading,requested,serviceIds,storage]);
 useEffect(()=>{
  if(!meaningful||order||!supported(host,'6.2'))return;
  host.enableClosingConfirmation?.();
  return ()=>host.disableClosingConfirmation?.();
 },[host,meaningful,order]);

 function update(next:Draft,sync=false){
  setDraft(next);
  if(authenticated)storage.save(next,sync);
 }
 function choose(id:string){
  if(!draft||busy)return;
  host.HapticFeedback?.selectionChanged?.();
  update({...draft,serviceId:id,step:1});
 }
 function previous(){
  if(!draft||sending.current||step===1||order)return;
  setFailed(false);
  update({...draft,step:step===3?2:1},true);
 }
 function help(){
  if(helpLink&&host.openTelegramLink)host.openTelegramLink(helpLink);
  else if(helpLink)window.location.assign(helpLink);
  else host.close?.();
 }
 async function advance(){
  if(order){onOrders();return;}
  if(!enabled||!draft||sending.current)return;
  if(step<3){update({...draft,step:step===1?2:3},true);return;}
  sending.current=true;
  setBusy(true);
  setFailed(false);
  storage.save(draft,true);
  try{
   const id=await sendOrder({serviceId:draft.serviceId,requestId:draft.requestId,details:draft.details.trim(),
    deadline:draft.timing?replyTime[draft.timing]:''});
   storage.save(null,true);
   if(mounted.current){setOrder(id);host.HapticFeedback?.notificationOccurred?.('success');}
  }catch{if(mounted.current)setFailed(true);}
  finally{sending.current=false;if(mounted.current)setBusy(false);}
 }
 const activateNative=useEffectEvent(()=>{void advance();});
 const goBackNative=useEffectEvent(previous);
 const helpNative=useEffectEvent(help);
 useEffect(()=>{window.scrollTo(0,0);},[step,order]);
 useEffect(()=>{
  if(!main)return;
  main.setParams({text:action,color:violet,text_color:buttonInk,is_active:enabled});
  const activate=()=>activateNative();
  main.onClick(activate);
  main.show();
  if(busy)main.showProgress?.(false);else main.hideProgress?.();
  return ()=>{main.offClick(activate);main.hideProgress?.();main.hide();};
 },[main,action,enabled,busy]);
 useEffect(()=>{
  if(!back||!ready||step===1||order||busy)return;
  const handle=()=>goBackNative();
  back.onClick(handle);
  back.show();
  return ()=>{back.offClick(handle);back.hide();};
 },[back,ready,step,order,busy]);
 useEffect(()=>{
  if(!secondary)return;
  secondary.setParams({text:words.help,is_active:true});
  const handle=()=>helpNative();
  secondary.onClick(handle);
  secondary.show();
  return ()=>{secondary.offClick(handle);secondary.hide();};
 },[secondary,words.help]);

 return <section className="mini-order" lang={language==='MM'?'my':'en'} aria-labelledby="mini-order-heading">
  <header className="mini-header">
   <strong>{words.brand}</strong>
   <label>
    <span className="mini-visually-hidden">{words.language}</span>
    <select aria-label={words.language} value={language} onChange={event=>setLanguage(event.target.value==='MM'?'MM':'EN')}>
     <option value="EN" lang="en">English</option><option value="MM" lang="my">မြန်မာ</option>
    </select>
   </label>
   <button type="button" className="mini-help" onClick={help}><HelpCircle size={17}/>{words.help}</button>
  </header>
  {step===1&&!order&&<div className="mini-hero" aria-hidden="true">
   <GradientASCII colors={palette} shape="horizon" characters=" =+xX0S8#@" cellSize={24} density={.45}
    glyphOpacity={.55} glow={.12} flicker={0} grain={0} speed={.3} clickEffect="none" dpr={1.5} style={undefined}/>
  </div>}
  <div className="mini-content">
   {!order&&<>
    <p className="mini-step">{words.progress(step)}</p>
    <progress max={3} value={step} aria-label={words.progress(step)}/>
   </>}
   <h1 id="mini-order-heading">{order?words.result:words.titles[step-1]}</h1>
   {order?<div className="mini-result" role="status">
    <CheckCircle2 size={28} aria-hidden="true"/>
    <p>{words.reference}</p><strong>{order}</strong><p>{words.next}</p>
   </div>:!ready?<div className="mini-status" role="status">
    <p>{loading||authenticated&&!error?words.loading:words.signIn}</p>
    {error&&<button type="button" onClick={onRetry}>{words.retry}</button>}
   </div>:step===1?<div>
    <p>{words.catalog}</p>
    <fieldset className="mini-options" aria-labelledby="mini-order-heading">
     {options.map(item=>{
      const text=localizedService(item,language);
      return <label className="mini-option" key={item.id}>
       <input type="radio" name="mini-service" checked={item.id===draft?.serviceId} onChange={()=>choose(item.id)}/>
       <span><strong>{text.name}</strong><span>{text.description}</span></span>
      </label>;
     })}
    </fieldset>
    <p>{!options.length?words.unavailable:options.some(item=>item.id==='custom')?words.custom:null}</p>
   </div>:step===2?<div>
    <label className="mini-brief">{words.brief}
     <textarea rows={5} maxLength={briefLimit} placeholder={words.placeholder} value={draft?.details??''} aria-describedby="mini-brief-hint"
      onChange={event=>{if(draft)update({...draft,details:event.target.value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')});}}/>
    </label>
    <p id="mini-brief-hint">{words.min}</p>
    <fieldset className="mini-timings"><legend>{words.timing}</legend>
     {timings.map(timing=><button key={timing} type="button" aria-pressed={draft?.timing===timing}
      onClick={()=>{if(draft)update({...draft,timing:draft.timing===timing?null:timing});}}>{words.times[timing]}</button>)}
    </fieldset>
    <p>{words.voice}</p>
   </div>:<div>
    <h2>{words.summary}</h2>
    <dl className="mini-review">
     <dt>{words.service}</dt><dd>{display?.name}</dd>
     <dt>{words.description}</dt><dd>{draft?.details.trim()}</dd>
     <dt>{words.time}</dt><dd>{draft?.timing?words.times[draft.timing]:words.unspecified}</dd>
    </dl>
   </div>}
   {failed&&<p className="mini-error" role="alert">{words.failed}</p>}
   {!main&&<div className="mini-dock"><button type="button" disabled={!enabled} onClick={()=>{void advance();}}>{action}</button></div>}
   {!back&&step>1&&!order&&<button type="button" disabled={busy} className="mini-back" onClick={previous}><ChevronLeft size={18}/>{words.back}</button>}
  </div>
 </section>;
}
