// Used only by the authenticated, short-lived edge-preview session. This file
// is never a production entry point and does not expose app routes publicly.
export function previewHandler(app,widget) {
 return {
  async fetch(request,env,ctx) {
   if(request.method!=='POST'||request.headers.get('Authorization')!==`Bearer ${env.K9_RELEASE_TEST_KEY}`)
    return new Response(null,{status:404});
   const operation=new URL(request.url).pathname;
   const site='https://k9-service.kimshikano.workers.dev';
   async function telegram(method,payload) {
    let response,result;
    try {
     response=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(7000)});
     result=await response.json();
    }catch{throw new Error(`Telegram ${method} was unavailable.`);}
    if(!response.ok||result.ok!==true)throw new Error(`Telegram ${method} failed with code ${Number(result.error_code)||response.status}.`);
    return result.result;
   }
   async function signed(id) {
    const encoder=new TextEncoder();
    const key=await crypto.subtle.importKey('raw',encoder.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const secret=await crypto.subtle.sign('HMAC',key,encoder.encode(env.BOT_TOKEN));
    const signKey=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),first_name:'Release check'})});
    const data=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const hash=new Uint8Array(await crypto.subtle.sign('HMAC',signKey,encoder.encode(data)));
    params.set('hash',[...hash].map(b=>b.toString(16).padStart(2,'0')).join(''));
    return params.toString();
   }
   try {
    if(operation==='/inspect') {
     const me=await telegram('getMe',{}),info=await telegram('getWebhookInfo',{});
     const origin=(env.SITE_URL||env.K9_PUBLIC_ORIGIN||'').replace(/\/$/,'');
     const health=await app.fetch(new Request(site+'/api/health'),env,ctx);
     const unauthorized=await app.fetch(new Request(site+'/api/owner/orders'),env,ctx);
     const owner=await app.fetch(new Request(site+'/api/owner/orders',{headers:{'x-telegram-init-data':await signed(env.OWNER_TELEGRAM_ID)}}),env,ctx);
     const wrongSecret=await app.fetch(new Request(site+'/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':'invalid-release-check'},body:'{"update_id":1}'}),env,ctx);
     return Response.json({botVerified:me.is_bot===true,originMatches:origin===site,webhookUrlMatches:info.url===site+'/api/telegram/webhook',
      allowedUpdates:info.allowed_updates??[],pendingUpdates:info.pending_update_count??0,webhookHasError:!!info.last_error_message,
      healthStatus:health.status,health:await health.json(),ownerStatus:owner.status,unauthorizedStatus:unauthorized.status,wrongSecretStatus:wrongSecret.status});
    }
    if(operation==='/widget-test') {
     const info=await telegram('getWebhookInfo',{});
     if(info.url!==site+'/api/telegram/webhook')throw new Error('Bot webhook does not match K9 Service.');
     if(!/^[1-9]\d{0,15}$/.test(env.OWNER_TELEGRAM_ID??''))throw new Error('Owner binding is invalid.');
     const sent=await telegram('sendWidget',{chat_id:env.OWNER_TELEGRAM_ID,...widget,protect_content:true,allow_queries:false});
     if(sent.chat?.type!=='private'||String(sent.chat.id)!==env.OWNER_TELEGRAM_ID||!Number.isSafeInteger(sent.message_id))throw new Error('Widget did not target the private owner chat.');
     await telegram('editMessageWidgetData',{chat_id:env.OWNER_TELEGRAM_ID,message_id:sent.message_id,chat_data:JSON.stringify({v:1,r:2,name:'K9 Service Center',description:'Staging send and edit verified. Visual client review pending.',price:'—'})});
     return Response.json({privateOwnerWidgetSent:true,widgetEditVerified:true,visualClientReview:'pending'});
    }
    if(operation==='/connect') {
     const before=await telegram('getWebhookInfo',{});
     if(before.url!==site+'/api/telegram/webhook')throw new Error('Refusing to replace a different bot webhook.');
     const allowed=[...new Set([...(before.allowed_updates??[]),'message','callback_query','widget_query'])];
     await telegram('setWebhook',{url:before.url,secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:allowed,drop_pending_updates:false,...(before.max_connections?{max_connections:before.max_connections}:{})});
     const after=await telegram('getWebhookInfo',{});
     return Response.json({urlMatches:after.url===before.url,subscriptionsReady:['message','callback_query','widget_query'].every(t=>after.allowed_updates?.includes(t)),pendingUpdates:after.pending_update_count??0,hasDeliveryError:!!after.last_error_message});
    }
    if(operation==='/verify-live') {
     async function live(route,options={}) {
      const response=await fetch(site+route,{...options,signal:AbortSignal.timeout(15000)});
      return response;
     }
     const health=await live('/api/health'),root=await live('/');
     const page=await root.text();
     const asset=page.match(/(?:src|href)="(\/_next\/static\/[^"?#]+\.js)(?:[?#][^"]*)?"/);
     const assetStatus=asset?(await live(asset[1])).status:null;
     const unauthorized=await live('/api/owner/orders');
     const owner=await live('/api/owner/orders',{headers:{'x-telegram-init-data':await signed(env.OWNER_TELEGRAM_ID)}});
     const wrong=await live('/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':'invalid-release-check'},body:'{"update_id":1}'});
     const authenticatedMalformed=await live('/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':env.TELEGRAM_WEBHOOK_SECRET},body:'{"update_id":1}'});
     const hosting=await live('/api/hosting/queue',{method:'POST',headers:{'Content-Type':'application/json','x-k9-hosting-secret':env.K9_HOSTING_SECRET??''},body:JSON.stringify({op:'check',ownerId:env.OWNER_TELEGRAM_ID})});
     const info=await telegram('getWebhookInfo',{});
     return Response.json({rootStatus:root.status,assetStatus,healthStatus:health.status,health:await health.json(),ownerStatus:owner.status,unauthorizedStatus:unauthorized.status,wrongSecretStatus:wrong.status,authenticatedMalformedStatus:authenticatedMalformed.status,hostingStatus:hosting.status,
      webhookUrlMatches:info.url===site+'/api/telegram/webhook',subscriptionsReady:['message','callback_query','widget_query'].every(t=>info.allowed_updates?.includes(t)),pendingUpdates:info.pending_update_count??0,hasDeliveryError:!!info.last_error_message});
    }
    return new Response(null,{status:404});
   }catch(error){return Response.json({error:error instanceof Error?error.message:'Release preview failed.'},{status:502});}
  }
 };
}
