import {runtime,json} from '../../../lib/server';
import {configurationChecks} from '../../../lib/readiness';
// A read-only readiness probe. It never creates tables or calls Telegram.
export async function GET(){
 const e=runtime(),checks:{[key:string]:boolean}={...configurationChecks(e),database:false};
 if(e.DB)try{
  // Check every runtime table and its expected columns, including migration 0002.
  // LIMIT 0 checks schema without reading customer records or receipts.
  await e.DB.batch([
   e.DB.prepare('SELECT key,value FROM settings LIMIT 0'),
   e.DB.prepare('SELECT id,data,updated_at FROM services LIMIT 0'),
   e.DB.prepare('SELECT id,amount,currency,service_snapshot,payment_status,version,internal_note,delivery_note,customer_key,customer,contact,service_id,service_name,details,budget,deadline,reference,source,status,history,telegram_chat,notification,notification_message,created_at,updated_at FROM orders LIMIT 0'),
   e.DB.prepare('SELECT chat_id,data,updated_at FROM bot_sessions LIMIT 0'),
   e.DB.prepare('SELECT id,created_at FROM webhook_updates LIMIT 0'),
   e.DB.prepare('SELECT id,order_id,provider,transaction_id,payer_name,amount,status,proof_key,proof_type,reason,created_at,verified_at,verified_by FROM payments LIMIT 0'),
   e.DB.prepare('SELECT id,order_id,actor_id,actor_role,event,from_status,to_status,reason,metadata,created_at FROM order_events LIMIT 0'),
   e.DB.prepare('SELECT key,content_type,size,created_at FROM receipt_images LIMIT 0'),
   e.DB.prepare('SELECT image_key,position,data FROM receipt_chunks LIMIT 0'),
  ]);checks.database=true;
 }catch{ /* Report readiness only; do not expose SQL or customer data. */ }
 const ready=Object.values(checks).every(Boolean);
 return json({service:'k9-service',ready,checks},ready?200:503);
}
