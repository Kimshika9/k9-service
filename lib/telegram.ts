import { runtime } from './server';
import { getDb } from '../db';
import { orders } from '../db/schema';
import { eq } from 'drizzle-orm';
import {loadEmoji} from './emoji-manager';
import {presenter} from './telegram-presentation';
export type TelegramMessage={message_id:number;rich_message?:unknown;[key:string]:unknown};
export type BotIdentity={id:number;username:string};
export type WebhookInfo={url:string;allowed_updates?:string[];pending_update_count:number;last_error_date?:number;last_error_message?:string};
type OrderSummary=Pick<typeof orders.$inferSelect,'id'|'customer'|'contact'|'serviceName'|'budget'|'deadline'|'source'|'status'|'amount'|'paymentStatus'|'details'|'reference'>;
export async function telegram<T=unknown>(method:string,payload:unknown,options?:{timeoutMs:number}):Promise<T>{
 const token=runtime().BOT_TOKEN;if(!token)throw new Error('Bot token is not configured');
 let res:Response;try{res=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(options?.timeoutMs??12000)});}catch{throw new Error(`Telegram ${method} could not be reached.`);}
 let decoded:unknown;try{decoded=await res.json();}catch{const e=new Error(`Telegram ${method}: HTTP ${res.status}, expected JSON.`) as Error&{code?:number};e.code=res.status;throw e;}
 const data=decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded as Record<string,unknown>:null;
 if(!res.ok||!data?.ok){const e=new Error(typeof data?.description==='string'?data.description.replaceAll(token,'[redacted]'):`Telegram ${method} failed.`) as Error&{code?:number};e.code=typeof data?.error_code==='number'&&data.error_code?data.error_code:res.status;throw e;}return data.result as T;
}
export const esc=(s:unknown)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function sendPresented(chat:string,text:string,reply_markup?:unknown,role='order',richHtml?:string){
 return presenter((method,payload)=>telegram<TelegramMessage>(method,payload),await loadEmoji()).send(chat,text,reply_markup,role,richHtml);
}
export async function editPresented(chat:string,messageId:number,text:string,reply_markup?:unknown,role='order',richHtml?:string){return presenter((method,payload)=>telegram<TelegramMessage>(method,payload),await loadEmoji()).edit(chat,messageId,text,reply_markup,role,richHtml);}
export function orderRichHtml(o:OrderSummary){const rows=[['Order',o.id],['Customer',o.customer],['Contact',o.contact],['Service',o.serviceName],['Budget',o.budget||'To discuss'],['Deadline',o.deadline||'Flexible'],['Source',o.source],['Order status',o.status],['Amount',o.amount==null?'Quote pending':o.amount+' MMK'],['Payment',o.paymentStatus||'Unpaid']];return `<h2>K9 SERVICE · ${o.status==='New'?'NEW ORDER':'ORDER UPDATE'}</h2><table>${rows.map(([k,v])=>`<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table><h3>Project brief</h3><p>${esc(o.details)}</p>${o.reference?`<h3>References</h3><p>${esc(o.reference)}</p>`:''}<p>One identity. Many capabilities.</p>`;}
export function orderPlainText(o:OrderSummary){return `K9 SERVICE · ORDER UPDATE\nOrder: ${o.id}\nCustomer: ${o.customer}\nService: ${o.serviceName}\nStatus: ${o.status}\nAmount: ${o.amount==null?'Quote pending':o.amount+' MMK'}\nPayment: ${o.paymentStatus||'Unpaid'}\n\n${o.details||''}`.slice(0,3800);}
export async function notifyOwner(id:string,force=false){const e=runtime();if(!e.BOT_TOKEN||!e.OWNER_TELEGRAM_ID)return 'pending';const o=await getDb().select().from(orders).where(eq(orders.id,id)).get();if(!o||o.notification==='sent'&&!force)return o?.notification||'pending';const reply_markup={inline_keyboard:[[{text:'Approve',callback_data:`status:${id}:approve`},{text:'Processing',callback_data:`status:${id}:process`}],[{text:'Done',callback_data:`status:${id}:done`},{text:'Open Owner Page',web_app:{url:(e.SITE_URL||'').replace(/\/$/,'')+'/owner'}}]]};try{const result=await sendPresented(e.OWNER_TELEGRAM_ID,orderPlainText(o),reply_markup,'order',orderRichHtml(o));await getDb().update(orders).set({notification:'sent',notificationMessage:result.message_id}).where(eq(orders.id,id));return 'sent';}catch{await getDb().update(orders).set({notification:'failed'}).where(eq(orders.id,id));return 'failed';}}

let identityCache:{token:string;value:{id:number;username:string};expires:number}|undefined;
export async function botIdentity(){
 const token=runtime().BOT_TOKEN;if(!token)return null;
 if(identityCache?.token===token&&identityCache.expires>Date.now())return identityCache.value;
 const me=await telegram<BotIdentity>('getMe',{});if(!Number.isSafeInteger(me.id)||!/^\w{5,32}$/.test(me.username||''))throw new Error('The configured bot identity is invalid.');
 const value={id:me.id,username:me.username};identityCache={token,value,expires:Date.now()+300000};return value;
}
export async function botUsername(){const configured=runtime().BOT_USERNAME?.trim().replace(/^@/,'');if(configured&&/^\w{5,32}$/.test(configured))return configured;return (await botIdentity())?.username||null;}
