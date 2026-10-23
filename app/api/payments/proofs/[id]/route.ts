import {getDb} from '../../../../../db';
import {payments} from '../../../../../db/schema';
import {eq} from 'drizzle-orm';
import {actor,ApiError,error} from '../../../../../lib/server';
import {getOrder} from '../../../../../lib/order-engine';
import {imageResponse} from '../../../../../lib/receipt-files';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const a=await actor(request);if(!a)throw new ApiError(401,'Sign in to view the receipt.');const p=await getDb().select().from(payments).where(eq(payments.id,(await params).id)).get();if(!p)throw new ApiError(404,'Receipt not found.');const o=await getOrder(p.orderId);if(!a.isOwner&&o.customerKey!==a.key)throw new ApiError(404,'Receipt not found.');return imageResponse(p.proofKey);}catch(e){return error(e);}}
