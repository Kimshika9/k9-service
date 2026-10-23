import { env } from 'cloudflare:workers';
import { verifyTelegramInitData } from './telegram-auth';
import { telegramCookie } from './telegram-session';
import { getDb } from '../db';
import { settings, services } from '../db/schema';
import { eq } from 'drizzle-orm';
import { defaultServices, type Service } from './catalog';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export const runtime = () => env as Cloudflare.Env & { BOT_TOKEN?:string; OWNER_TELEGRAM_ID?:string; TELEGRAM_WEBHOOK_SECRET?:string; BOT_USERNAME?:string; SITE_URL?:string; K9_OWNER_SETUP?:string; };
export async function actor(request:Request) {
 const header=request.headers.get('x-telegram-init-data');
 const init=header||telegramCookie(request);
 if(init){
  const token=runtime().BOT_TOKEN;if(!token)throw new ApiError(503,'Telegram connection is not configured yet.');
  const u=await verifyTelegramInitData(init,token);if(!u)throw new ApiError(401,'Telegram verification expired. Please reopen the Mini App from the bot.');
  return {key:`tg:${u.id}`,name:[u.first_name,u.last_name].filter(Boolean).join(' '),contact:u.username?`@${u.username}`:String(u.id),telegram:String(u.id),isOwner:String(u.id)===runtime().OWNER_TELEGRAM_ID};
 }
 return null;
}
export type Actor=NonNullable<Awaited<ReturnType<typeof actor>>>;
export async function customer(request:Request){const a=await actor(request);if(!a)throw new ApiError(401,'Sign in to manage your orders.');if(a.isOwner)throw new ApiError(403,'Owner accounts manage customer orders from /owner and cannot place customer orders.');return a;}
export async function owner(request:Request){const a=await actor(request);if(!a)throw new ApiError(401,'Sign in to open Owner Control.');if(!a.isOwner)throw new ApiError(403,'Owner access is required.');return a;}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,'Invalid request origin.');}
export async function readBody(request:Request):Promise<Record<string,any>>{sameOrigin(request);const raw=await request.text();if(raw.length>30000)throw new ApiError(413,'This request is too large.');try{const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw new ApiError(400,'Invalid request.');}}
export function textField(v:unknown,max:number,required=false){if(typeof v!=='string')v='';const out=(v as string).trim();if((required&&!out)||out.length>max)throw new ApiError(400,`Please check the required fields (maximum ${max} characters).`);return out;}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function error(e:unknown){if(e instanceof ApiError)return json({error:e.message},e.status);console.error(e instanceof Error?e.message:'Request failed');return json({error:'Something went wrong. Please try again.'},500);}
export async function catalog(all=false){const rows=await getDb().select().from(services).all();const overrides=new Map(rows.map(r=>[r.id,JSON.parse(r.data) as Service]));const result=defaultServices.map(s=>overrides.get(s.id)||s);for(const [id,s]of overrides)if(!defaultServices.some(d=>d.id===id))result.push(s);return all?result:result.filter(s=>s.active);}
