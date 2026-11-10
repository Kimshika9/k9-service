import assert from 'node:assert/strict';
import {previewHandler} from './release-preview-worker.mjs';
import {verifyTelegramInitData} from '../lib/telegram-auth.ts';
const site='https://k9-service.kimshikano.workers.dev';
const env={BOT_TOKEN:'12345:synthetic-private-token',OWNER_TELEGRAM_ID:'90001',SITE_URL:site,K9_RELEASE_TEST_KEY:'synthetic-preview-key-never-print'};
const originalFetch=globalThis.fetch,calls=[];
let webhook=site+'/api/telegram/webhook';
globalThis.fetch=async(url,options)=>{
 const method=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body);calls.push({method,body});
 return Response.json({ok:true,result:method==='getMe'?{is_bot:true}:method==='getWebhookInfo'?{url:webhook,allowed_updates:['message','callback_query']}:method==='sendWidget'?{message_id:10,chat:{id:90001,type:'private'}}:true});
};
const app={async fetch(request){
 const route=new URL(request.url).pathname;
 if(route==='/api/health')return Response.json({ready:true,checks:{database:true}});
 if(route==='/api/telegram/webhook')return new Response(null,{status:401});
 const identity=await verifyTelegramInitData(request.headers.get('x-telegram-init-data')||'',env.BOT_TOKEN);
 return Response.json({}, {status:identity?.id===90001?200:401});
}};
try {
 const handler=previewHandler(app,{html:'<p>test</p>',caption:'test'});
 const run=(route,authorized=true)=>handler.fetch(new Request(site+route,{method:'POST',headers:authorized?{Authorization:`Bearer ${env.K9_RELEASE_TEST_KEY}`}:{}}),env,{});
 assert.equal((await run('/inspect',false)).status,404);assert.equal(calls.length,0);
 assert.equal((await handler.fetch(new Request(site+'/inspect'),env,{})).status,404);
 const inspected=await (await run('/inspect')).json();
 assert.equal(inspected.ownerStatus,200);assert.equal(inspected.unauthorizedStatus,401);assert.equal(inspected.wrongSecretStatus,401);
 assert.doesNotMatch(JSON.stringify(inspected),/synthetic-private-token|synthetic-preview-key|90001/);
 assert.equal((await run('/widget-test')).status,200);
 const sends=calls.filter(c=>c.method==='sendWidget');assert.equal(sends.length,1);assert.equal(sends[0].body.chat_id,env.OWNER_TELEGRAM_ID);
 assert.equal(sends[0].body.allow_queries,false);assert.equal(sends[0].body.protect_content,true);
 assert.ok(calls.some(c=>c.method==='editMessageWidgetData'));
 webhook='https://other.invalid/webhook';assert.equal((await run('/widget-test')).status,502);
 assert.equal(calls.filter(c=>c.method==='sendWidget').length,1);
}finally{globalThis.fetch=originalFetch;}
console.log('Private release preview: authentication, signed owner identity, redaction, private owner-only Widget send/edit and wrong-bot refusal passed.');
