import { getDb } from '../../../db';
import { services } from '../../../db/schema';
import { validateAmount } from '../../../lib/order-policy';
import { owner,readBody,textField,error,json,ApiError } from '../../../lib/server';
export async function POST(request:Request){try{await owner(request);const b=await readBody(request);const service={id:textField(b.id,60)||crypto.randomUUID(),name:textField(b.name,80,true),category:textField(b.category,50,true),description:textField(b.description,500,true),price:textField(b.price,80,true),delivery:textField(b.delivery,80,true),icon:textField(b.icon,20)||'sparkles',tag:textField(b.tag,40),active:b.active===true,featured:b.featured===true,priceMmk:priceAmount(b.priceMmk),requirements:Array.isArray(b.requirements)?b.requirements.slice(0,8).map((r:unknown)=>textField(r,200)).filter(Boolean):[]};await getDb().insert(services).values({id:service.id,data:JSON.stringify(service),updatedAt:new Date().toISOString()}).onConflictDoUpdate({target:services.id,set:{data:JSON.stringify(service),updatedAt:new Date().toISOString()}});return json({service});}catch(e){return error(e);}}

function priceAmount(value:unknown){if(value==null||value==='')return null;try{return validateAmount(value)}catch(e){throw new ApiError(400,(e as Error).message)}}
