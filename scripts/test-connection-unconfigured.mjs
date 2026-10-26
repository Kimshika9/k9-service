import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{Miniflare}=require(require.resolve('miniflare',{paths:[path.dirname(require.resolve('wrangler/package.json'))]}));
const root=path.resolve('dist/server'),paths=(await fs.readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
for(const configured of [false,true]){
 const mf=new Miniflare({modules:paths.map(p=>({type:'ESModule',path:path.join(root,p)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:configured?{BOT_TOKEN:'12345:bad-local-test-token'}:{},outboundService:async()=>Response.json({ok:false,error_code:401,description:'Unauthorized'})});
 try{const r=await mf.dispatchFetch('https://localhost/api/auth/login');assert.equal(r.status,503);assert.ok(r.headers.get('content-type').includes('text/html'));const body=await r.text();assert.ok(body.includes('Let’s connect your bot.'));assert.ok(body.includes('Back to owner workspace'));assert.equal(body.includes('bad-local-test-token'),false);
 const health=await (await mf.dispatchFetch('https://localhost/api/connection/status')).json();assert.equal(health.tokenValid,false);assert.equal(health.ownerConfigured,false);assert.equal((await mf.dispatchFetch('https://localhost/api/connection/status',{method:'POST',body:'{}'})).status,401);
 }finally{await mf.dispose();}
}
console.log('Connection setup: missing/invalid token renders a helpful page, exposes no token and cannot grant owner access.');
