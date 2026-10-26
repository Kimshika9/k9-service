import { runtime } from './server';
import { getDb } from '../db';
import { orders } from '../db/schema';
import { eq } from 'drizzle-orm';
export async function telegram(method:string,payload:unknown){const token=runtime().BOT_TOKEN;if(!token)throw new Error('Bot token is not configured');const res=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});const data=await res.json() as {ok:boolean;result:any;description?:string;error_code?:number};if(!data.ok){const e=new Error(data.description||'Telegram request failed') as Error&{code?:number};e.code=data.error_code;throw e;}return data.result;}
export const esc=(s:unknown)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function orderRichHtml(o:any){const rows=[['Order',o.id],['Customer',o.customer],['Contact',o.contact],['Service',o.serviceName],['Budget',o.budget||'To discuss'],['Deadline',o.deadline||'Flexible'],['Source',o.source],['Order status',o.status],['Amount',o.amount==null?'Quote pending':o.amount+' MMK'],['Payment',o.paymentStatus||'Unpaid']];return `<h2>K9 SERVICE · ${o.status==='New'?'NEW ORDER':'ORDER UPDATE'}</h2><table>${rows.map(([k,v])=>`<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table><h3>Project brief</h3><p>${esc(o.details)}</p>${o.reference?`<h3>References</h3><p>${esc(o.reference)}</p>`:''}<p>One identity. Many capabilities.</p>`;}
export async function notifyOwner(id:string,force=false){const e=runtime();if(!e.BOT_TOKEN||!e.OWNER_TELEGRAM_ID)return 'pending';const o=await getDb().select().from(orders).where(eq(orders.id,id)).get();if(!o||o.notification==='sent'&&!force)return o?.notification||'pending';const reply_markup={inline_keyboard:[[{text:'Approve',callback_data:`status:${id}:approve`},{text:'Processing',callback_data:`status:${id}:process`}],[{text:'Done',callback_data:`status:${id}:done`},{text:'Open Owner Page',web_app:{url:(e.SITE_URL||'')+'/owner'}}]]};try{const result=await telegram('sendRichMessage',{chat_id:e.OWNER_TELEGRAM_ID,rich_message:{html:orderRichHtml(o)},reply_markup});await getDb().update(orders).set({notification:'sent',notificationMessage:result.message_id}).where(eq(orders.id,id));return 'sent';}catch{await getDb().update(orders).set({notification:'failed'}).where(eq(orders.id,id));return 'failed';}}

let identityCache:{token:string;value:{id:number;username:string};expires:number}|undefined;
export async function botIdentity(){
 const token=runtime().BOT_TOKEN;if(!token)return null;
 if(identityCache?.token===token&&identityCache.expires>Date.now())return identityCache.value;
 const me=await telegram('getMe',{});if(!Number.isSafeInteger(me.id)||!/^\w{5,32}$/.test(me.username||''))throw new Error('The configured bot identity is invalid.');
 const value={id:me.id,username:me.username};identityCache={token,value,expires:Date.now()+300000};return value;
}
export async function botUsername(){const configured=runtime().BOT_USERNAME?.trim().replace(/^@/,'');if(configured&&/^\w{5,32}$/.test(configured))return configured;return (await botIdentity())?.username||null;}
