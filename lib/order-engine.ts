import {env} from 'cloudflare:workers';
import {getDb} from '../db';
import {orders,orderEvents,payments} from '../db/schema';
import {eq,desc,and,gte} from 'drizzle-orm';
import {ApiError,catalog,textField,type Actor} from './server';
import {normalizeStatus} from './catalog';
import {assertOwnerAction,actionStatus,validateAmount} from './order-policy';
export async function getOrder(id:string){const o=await getDb().select().from(orders).where(eq(orders.id,id)).get();if(!o)throw new ApiError(404,'Order not found.');return {...o,status:normalizeStatus(o.status)};}
export function presentOrder(o:any,owner=false){const {customerKey,notificationMessage,internalNote,...safe}=o;return {...safe,status:normalizeStatus(o.status),...(owner?{internalNote}: {})};}
export async function detailOrder(id:string,a:Actor){const o=await getOrder(id);if(!a.isOwner&&o.customerKey!==a.key)throw new ApiError(404,'Order not found.');const attempts=await getDb().select().from(payments).where(eq(payments.orderId,id)).orderBy(desc(payments.createdAt));const safePayments=attempts.map(({proofKey,proofType,verifiedBy,...p})=>({...p,proofPath:`/api/payments/proofs/${p.id}`}));const events=a.isOwner?await getDb().select().from(orderEvents).where(eq(orderEvents.orderId,id)).orderBy(desc(orderEvents.createdAt)):undefined;return {...presentOrder(o,a.isOwner),payments:safePayments,events};}
export async function createOrder(a:Actor,b:Record<string,any>,source?:string){
 if(a.isOwner)throw new ApiError(403,'Owner accounts cannot place customer orders.');
 const service=(await catalog()).find(s=>s.id===b.serviceId);if(!service)throw new ApiError(400,'This service is not available.');
 const key=textField(b.requestId,36,true);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(key))throw new ApiError(400,'Please reopen the order form.');
 const id='K9-'+key,db=getDb();const existing=await db.select().from(orders).where(eq(orders.id,id)).get();if(existing){if(existing.customerKey!==a.key)throw new ApiError(409,'Please try again.');return presentOrder(existing);}
 const recent=await db.select({id:orders.id}).from(orders).where(and(eq(orders.customerKey,a.key),gte(orders.createdAt,new Date(Date.now()-60000).toISOString())));if(recent.length>=5)throw new ApiError(429,'Please wait a minute before creating another order.');
 const now=new Date().toISOString(),amount=service.priceMmk==null?null:validateAmount(service.priceMmk),status=amount==null?'Pending Review':'Pending Payment';
 const data={id,customerKey:a.key,customer:textField(b.customer||a.name,100,true),contact:textField(b.contact||a.contact,150,true),serviceId:service.id,serviceName:service.name,serviceSnapshot:JSON.stringify(service),amount,currency:'MMK',paymentStatus:'Unpaid',version:0,details:textField(b.details,5000,true),budget:textField(b.budget,100),deadline:textField(b.deadline,100),reference:textField(b.reference,1500),source:source||(a.telegram?'Mini App':'Website'),status,history:JSON.stringify([{status,at:now}]),telegramChat:a.telegram,notification:'pending',createdAt:now,updatedAt:now};
 const result=await db.insert(orders).values(data).onConflictDoNothing().returning();if(result.length)await db.insert(orderEvents).values({id:crypto.randomUUID(),orderId:id,actorId:a.key,actorRole:'customer',event:'created',fromStatus:'',toStatus:status,createdAt:now});else{const found=await getOrder(id);if(found.customerKey!==a.key)throw new ApiError(409,'Please try again.');return presentOrder(found);}
 return presentOrder(result[0]);
}
const columns:Record<string,string>={status:'status',amount:'amount',paymentStatus:'payment_status',internalNote:'internal_note',deliveryNote:'delivery_note',history:'history',updatedAt:'updated_at'};
export async function commitOrder(o:Awaited<ReturnType<typeof getOrder>>,a:Actor,event:string,patch:Record<string,unknown>,reason='',extra:((eventId:string)=>D1PreparedStatement[])=()=>[]){
 if(!env.DB)throw new ApiError(503,'Order storage is unavailable.');const now=new Date().toISOString(),eventId=crypto.randomUUID(),nextStatus=String(patch.status||o.status);const fields:Record<string,unknown>={...patch,updatedAt:now};
 if(patch.status&&patch.status!==o.status)fields.history=JSON.stringify([...JSON.parse(o.history),{status:nextStatus,at:now,...(reason?{reason}:{})}]);
 const keys=Object.keys(fields);if(keys.some(k=>!columns[k]))throw new Error('Invalid order update');
 const eventStatement=env.DB.prepare('INSERT INTO order_events (id,order_id,actor_id,actor_role,event,from_status,to_status,reason,metadata,created_at) SELECT ?,?,?,?,?,?,?,?,?,? FROM orders WHERE id=? AND version=?').bind(eventId,o.id,a.key,a.isOwner?'owner':'customer',event,o.status,nextStatus,reason,'{}',now,o.id,o.version);
 const update=env.DB.prepare(`UPDATE orders SET ${keys.map(k=>columns[k]+'=?').join(',')},version=version+1 WHERE id=? AND version=?`).bind(...keys.map(k=>fields[k as keyof typeof fields]),o.id,o.version);
 const results=await env.DB.batch([eventStatement,update,...extra(eventId)]);if(results[1].meta.changes!==1)throw new ApiError(409,'This order changed. Refresh it and try again.');return getOrder(o.id);
}
export async function ownerAction(a:Actor,b:Record<string,any>){if(!a.isOwner)throw new ApiError(403,'Owner access is required.');const o=await getOrder(textField(b.id,70,true));if(Number(b.version)!==o.version)throw new ApiError(409,'This order changed. Refresh it and try again.');const action=textField(b.action,30,true),reason=textField(b.reason,1000);try{assertOwnerAction(action,o,reason);}catch(e){throw new ApiError(400,(e as Error).message);}const patch:Record<string,unknown>={};if(actionStatus[action])patch.status=actionStatus[action];if(action==='quote'){try{patch.amount=validateAmount(b.amount);}catch(e){throw new ApiError(400,(e as Error).message);}patch.paymentStatus='Unpaid';}if(action==='note')patch.internalNote=textField(b.note,3000);if(action==='deliver'||action==='done')patch.deliveryNote=textField(b.deliveryNote,3000);return commitOrder(o,a,action,patch,reason);}
