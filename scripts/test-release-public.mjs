import assert from 'node:assert/strict';
import {publicProbe} from './release-public-probe.mjs';
const paths=[];
const good=await publicProbe(async(url)=>{const p=new URL(url).pathname;paths.push(p);return p==='/'?new Response('<script src="/_next/static/fixture.js"></script>'):p==='/api/health'?Response.json({ready:true}):new Response(null,{status:p==='/api/owner/orders'?401:200});});
assert.equal(good.rootStatus,200);assert.equal(good.assetStatus,200);assert.equal(good.unauthorizedStatus,401);assert.equal(good.health.ready,true);
assert.ok(paths.includes('/_next/static/fixture.js'));
const blocked=await publicProbe(async()=>new Response('Private provider response is never printed',{status:403}));
assert.equal(blocked.rootStatus,403);assert.equal(blocked.health,null);assert.doesNotMatch(JSON.stringify(blocked),/Private provider/);
console.log('Public release probes: real website/assets/health/auth paths, blocked/invalid-JSON responses and body redaction passed.');
