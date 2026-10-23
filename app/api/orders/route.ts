import {getDb} from '../../../db';
import {orders} from '../../../db/schema';
import {eq,desc} from 'drizzle-orm';
import {customer,readBody,error,json} from '../../../lib/server';
import {createOrder,presentOrder} from '../../../lib/order-engine';
import {notifyOwner} from '../../../lib/telegram';
export async function GET(request:Request){try{const a=await customer(request);const rows=await getDb().select().from(orders).where(eq(orders.customerKey,a.key)).orderBy(desc(orders.createdAt)).limit(200);return json({orders:rows.map(o=>presentOrder(o))});}catch(e){return error(e);}}
export async function POST(request:Request){try{const a=await customer(request),b=await readBody(request);const order=await createOrder(a,b);const notification=await notifyOwner(order.id);return json({order:{...order,notification}},201);}catch(e){return error(e);}}
