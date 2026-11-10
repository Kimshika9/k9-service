import {owner,runtime,json,error} from '../../../../lib/server';
import {telegram,type WebhookInfo} from '../../../../lib/telegram';
import {expectedWebhook} from '../../../../lib/readiness';
import {TELEGRAM_UPDATES} from '../../../../lib/telegram-widget-api';
export async function GET(request:Request){try{
 await owner(request);
 let info:WebhookInfo;try{info=await telegram<WebhookInfo>('getWebhookInfo',{});}catch{return json({error:'Telegram webhook status is unavailable. Check the bot token and retry.'},502);}
 const subscribed=info.allowed_updates;const allowedUpdates=Array.isArray(subscribed)?TELEGRAM_UPDATES.filter(type=>subscribed.includes(type)):[];
 return json({registered:!!info.url,urlMatches:info.url===expectedWebhook(runtime().SITE_URL),allowedUpdates,subscriptionsReady:TELEGRAM_UPDATES.every(type=>allowedUpdates.includes(type)),pendingUpdates:info.pending_update_count||0,lastErrorAt:info.last_error_date||null,hasDeliveryError:!!info.last_error_message});
 // Telegram's raw last_error_message can contain private URL details.
 }catch(e){return error(e);}}
