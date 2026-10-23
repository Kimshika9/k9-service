import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {Miniflare}=require(require.resolve('miniflare',{paths:[path.dirname(require.resolve('wrangler/package.json'))]}));
const root=path.resolve('dist/server');const modulePaths=(await fs.readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const mf=new Miniflare({modules:modulePaths.map(p=>({type:'ESModule',path:path.join(root,p)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'order-api-test'},r2Buckets:{BUCKET:'receipt-test'},outboundService:async()=>new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{'Content-Type':'application/json'}}),bindings:{BOT_TOKEN:'12345:local-test-only',OWNER_TELEGRAM_ID:'90001',KBZPAY_ENABLED:'1',KBZPAY_ACCOUNT_NAME:'LOCAL TEST ACCOUNT — DO NOT PAY',KBZPAY_PHONE:'09000000000'}});
try{
 const db=await mf.getD1Database('DB');
 for(const filename of ['0000_gorgeous_ben_parker.sql','0001_organic_killmonger.sql']){const sql=await fs.readFile('drizzle/'+filename,'utf8');for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}
 const signed=(id)=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'qa-'+id,user:JSON.stringify({id,first_name:'QA '+id,username:'qa_'+id})});const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update('12345:local-test-only').digest();p.set('hash',createHmac('sha256',secret).update(data).digest('hex'));return p.toString()};
 const identities={owner:{'x-telegram-init-data':signed(90001)},alice:{'x-telegram-init-data':signed(90002)},bob:{'x-telegram-init-data':signed(90003)},forged:{'oai-authenticated-user-id':'owner-test','oai-authenticated-user-email':'owner@example.test'},tampered:{'x-telegram-init-data':signed(90002).replace('90002','90001')}};
 async function call(role,url,method='GET',body){const headers={...(identities[role]||{})};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const prepared=new Request('http://localhost'+url,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const response=await mf.dispatchFetch(prepared.url,{method,headers:Object.fromEntries(prepared.headers),body:method==='GET'?undefined:await prepared.arrayBuffer()});const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error(`${method} ${url}: ${response.status} ${text.slice(0,200)}`)}return {status:response.status,data};}
 let r=await call('forged','/api/owner/orders');assert.equal(r.status,401);r=await call('tampered','/api/owner/orders');assert.equal(r.status,401);
 const sessionResponse=await mf.dispatchFetch('https://localhost/api/bootstrap',{headers:identities.alice});assert.equal(sessionResponse.status,200);const cookie=sessionResponse.headers.get('set-cookie');assert.ok(cookie?.includes('HttpOnly'));assert.ok(cookie?.includes('Secure'));const session=await mf.dispatchFetch('https://localhost/api/bootstrap',{headers:{cookie:cookie.split(';')[0]}});assert.equal((await session.json()).user.isOwner,false);
 r=await call('','/api/owner','POST',{});assert.equal(r.status,403);
 r=await call('owner','/api/orders','POST',{serviceId:'telegram-bot',requestId:crypto.randomUUID(),details:'Owner cannot create this order'});assert.equal(r.status,403,JSON.stringify(r));
 r=await call('alice','/api/owner/orders');assert.equal(r.status,403,JSON.stringify(r));
 r=await call('', '/api/owner/orders');assert.equal(r.status,401,JSON.stringify(r));
 const requestId=crypto.randomUUID();r=await call('alice','/api/orders','POST',{serviceId:'telegram-bot',requestId,customer:'Alice QA',contact:'alice@example.test',details:'Create a Telegram service catalog bot with owner notifications.',amount:1,paymentStatus:'Paid'});assert.equal(r.status,201,JSON.stringify(r));let o=r.data.order;assert.equal(o.amount,null);assert.equal(o.paymentStatus,'Unpaid');
 r=await call('bob','/api/orders/'+o.id);assert.equal(r.status,404,JSON.stringify(r));
 r=await call('owner','/api/owner/orders','POST',{id:o.id,version:o.version,action:'quote',amount:15000});assert.equal(r.status,200,JSON.stringify(r));o=r.data.order;
 r=await call('owner','/api/owner/orders','POST',{id:o.id,version:o.version,action:'done'});assert.equal(r.status,400,JSON.stringify(r));
 r=await call('owner','/api/owner/orders','POST',{id:o.id,version:o.version-1,action:'quote',amount:16000});assert.equal(r.status,409,JSON.stringify(r));
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);const receipt=new FormData();receipt.set('version',String(o.version));receipt.set('payerName','Alice QA');receipt.set('transactionId','QA-123456789');receipt.set('amount','15000');receipt.set('receipt',new File([png],'local-qa.png',{type:'image/png'}));
 r=await call('alice',`/api/orders/${o.id}/payment-proof`,'POST',receipt);assert.equal(r.status,201,JSON.stringify(r));o=r.data.order;assert.equal(o.paymentStatus,'Proof Submitted');let payment=o.payments[0];
 r=await call('bob',payment.proofPath);assert.equal(r.status,404,JSON.stringify(r));
 r=await call('alice','/api/owner/payments','POST',{paymentId:payment.id,version:o.version,action:'verify',checkedInKbzPay:true,amount:15000});assert.equal(r.status,403,JSON.stringify(r));
 r=await call('owner','/api/owner/payments','POST',{paymentId:payment.id,version:o.version,action:'verify',checkedInKbzPay:true,amount:100});assert.equal(r.status,400,JSON.stringify(r));
 r=await call('owner','/api/owner/payments','POST',{paymentId:payment.id,version:o.version,action:'verify',checkedInKbzPay:false,amount:15000});assert.equal(r.status,400,JSON.stringify(r));
 r=await call('owner','/api/owner/payments','POST',{paymentId:payment.id,version:o.version,action:'verify',checkedInKbzPay:true,amount:15000});assert.equal(r.status,200,JSON.stringify(r));o=r.data.order;assert.equal(o.paymentStatus,'Paid');
 r=await call('owner','/api/owner/payments','POST',{paymentId:payment.id,version:o.version-1,action:'verify',checkedInKbzPay:true,amount:15000});assert.equal(r.status,409,JSON.stringify(r));
 for(const action of ['approve','process','done']){r=await call('owner','/api/owner/orders','POST',{id:o.id,version:o.version,action,deliveryNote:'Local QA delivery'});assert.equal(r.status,200,JSON.stringify(r));o=r.data.order;}
 assert.equal(o.status,'Done');assert.equal(o.events.filter(e=>e.event==='payment_verified').length,1);
 r=await call('alice','/api/orders/'+o.id);assert.equal(r.data.order.status,'Done');assert.equal('internalNote'in r.data.order,false);assert.equal('events'in r.data.order,false);assert.equal(r.data.order.deliveryNote,'Local QA delivery');
 console.log('API integration passed: Telegram signature and cookie identity, forged header rejection, disabled public owner activation, customer/owner separation, cross-customer isolation, protected receipts, server price, quote, receipt upload, payment verification, stale update protection, Processing/Done, and customer-safe data.');
}finally{await mf.dispose();}
