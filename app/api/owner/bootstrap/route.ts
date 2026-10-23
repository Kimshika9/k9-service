import {actor,catalog,error,json,runtime} from '../../../../lib/server';
import {rememberTelegram} from '../../../../lib/telegram-session';
import {getPaymentConfig,publicPaymentConfig} from '../../../../lib/payment-config';
export async function GET(request:Request){try{const a=await actor(request),e=runtime();return rememberTelegram(json({user:a?{name:a.name,contact:a.contact,isOwner:a.isOwner}:null,setupRequired:false,...(a?.isOwner?{services:await catalog(true),paymentConfig:publicPaymentConfig(await getPaymentConfig()),integration:{configured:!!(e.BOT_TOKEN&&e.OWNER_TELEGRAM_ID&&e.TELEGRAM_WEBHOOK_SECRET),botUsername:e.BOT_USERNAME||null}}:{})}),request);}catch(e){return error(e);}}
