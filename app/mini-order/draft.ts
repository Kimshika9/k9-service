import type {CloudStorage} from './telegram';

export const briefLimit=1200;
export const timings=['soon','month','flexible'] as const;
export type Timing=typeof timings[number];
export type Step=1|2|3;
export type Draft={serviceId:string;details:string;timing:Timing|null;step:Step;requestId:string};
export type Snapshot={savedAt:number;draft:Draft|null};
const cloudKey='k9_draft';
const ttl=7*24*60*60*1000;
const uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;

export function parseSnapshot(raw:string|null|undefined,now=Date.now()):Snapshot|null{
 if(!raw||raw.length>4096)return null;
 try{
  const {savedAt,draft}=JSON.parse(raw);
  if(!Number.isSafeInteger(savedAt)||savedAt<now-ttl||savedAt>now+5*60*1000)return null;
  if(draft===null)return {savedAt,draft};
  if(!draft||typeof draft.serviceId!=='string'||!draft.serviceId||draft.serviceId.length>60||
   typeof draft.details!=='string'||draft.details.length>briefLimit||
   (draft.timing!==null&&!timings.includes(draft.timing))||
   ![1,2,3].includes(draft.step)||typeof draft.requestId!=='string'||!uuid.test(draft.requestId))return null;
  return {savedAt,draft};
 }catch{return null;}
}

export function newest(local:Snapshot|null,cloud:Snapshot|null){
 return cloud&&(!local||cloud.savedAt>local.savedAt)?cloud:local;
}

export function resumeDraft(draft:Draft,services:string[],requested?:string):Draft{
 const wanted=requested&&services.includes(requested)?requested:undefined;
 if(wanted&&wanted!==draft.serviceId)return {...draft,serviceId:wanted,step:1};
 if(!services.includes(draft.serviceId))return {...draft,serviceId:'',step:1};
 if(draft.step===3&&draft.details.trim().length<10)return {...draft,step:2};
 return draft;
}

export function telegramDraftScope(raw:string){
 try{
  const id=JSON.parse(new URLSearchParams(raw).get('user')??'null')?.id;
  return Number.isSafeInteger(id)&&id>0?String(id):null;
 }catch{return null;}
}

function cloudRead(cloud:CloudStorage){
 return new Promise<Snapshot|null>(resolve=>{
  const finish=(raw?:string)=>{clearTimeout(timer);resolve(parseSnapshot(raw));};
  const timer=setTimeout(finish,900);
  try{cloud.getItem(cloudKey,(error,raw)=>finish(error?undefined:raw));}catch{finish();}
 });
}

const pendingCloud=new WeakMap<CloudStorage,Promise<void>>();
function cloudWrite(cloud:CloudStorage,snapshot:Snapshot){
 const previous=pendingCloud.get(cloud)??Promise.resolve();
 const write=previous.then(()=>new Promise<void>(resolve=>{
  const finish=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(finish,1600);
  try{cloud.setItem(cloudKey,JSON.stringify(snapshot),finish);}catch{finish();}
 }));
 pendingCloud.set(cloud,write);
}

export function draftStorage(scope:string|null,cloud?:CloudStorage){
 const key=scope?'k9-mini-order:'+scope:null;
 return {
  async restore(){
   let local:null|Snapshot=null;
   if(key)try{local=parseSnapshot(localStorage.getItem(key));}catch{}
   if(cloud)await pendingCloud.get(cloud);
   return newest(local,cloud?await cloudRead(cloud):null);
  },
  save(draft:Draft|null,sync:boolean){
   const snapshot={savedAt:Date.now(),draft};
   if(key)try{localStorage.setItem(key,JSON.stringify(snapshot));}catch{}
   if(sync&&cloud)cloudWrite(cloud,snapshot);
  }
 };
}
