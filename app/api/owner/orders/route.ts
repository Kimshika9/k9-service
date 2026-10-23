import {getDb} from '../../../../db';
import {orders} from '../../../../db/schema';
import {desc,and,ne} from 'drizzle-orm';
import {owner,readBody,textField,runtime,error,json} from '../../../../lib/server';
import {detailOrder,presentOrder,ownerAction} from '../../../../lib/order-engine';
import {notifyOwner,telegram} from '../../../../lib/telegram';
export async function GET(request:Request){try{const a=await owner(request),id=new URL(request.url).searchParams.get('id');if(id)return json({order:await detailOrder(id,a)});const conditions=[ne(orders.customerKey,a.key),ne(orders.customerKey,'web:local-dev-owner')];const tg=runtime().OWNER_TELEGRAM_ID;if(tg)conditions.push(ne(orders.customerKey,'tg:'+tg));const rows=await getDb().select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(200);return json({orders:rows.map(o=>presentOrder(o,true))});}catch(e){return error(e);}}
export async function POST(request:Request){try{const a=await owner(request),b=await readBody(request);if(b.action==='retry')return json({notification:await notifyOwner(textField(b.id,70,true),true)});const o=await ownerAction(a,b);if(o.telegramChat)try{await telegram('sendMessage',{chat_id:o.telegramChat,text:`K9 Service · ${o.serviceName}\nOrder ${o.id.slice(3,11).toUpperCase()}\n${o.status}${b.reason?'\n'+b.reason:''}`});}catch{}return json({order:await detailOrder(o.id,a)});}catch(e){return error(e);}}
