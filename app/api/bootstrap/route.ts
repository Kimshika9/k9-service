import {rememberTelegram} from '../../../lib/telegram-session';
import {actor,catalog,error,json,runtime} from '../../../lib/server';
import {getPaymentConfig,publicPaymentConfig} from '../../../lib/payment-config';
export async function GET(request:Request){try{const a=await actor(request);return rememberTelegram(json({services:await catalog(),user:a?{name:a.name,contact:a.contact,isOwner:a.isOwner}:null,paymentConfig:publicPaymentConfig(await getPaymentConfig()),integration:{configured:false,botUsername:runtime().BOT_USERNAME||null}}),request);}catch(e){return error(e);}}
