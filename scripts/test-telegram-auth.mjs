import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyTelegramInitData} from '../lib/telegram-auth.ts';
const token='12345:dummy-token-used-only-by-local-tests';
const now=1800000000;
function signed(extra={}){const p=new URLSearchParams({auth_date:String(now),query_id:'test-query',user:JSON.stringify({id:12345,first_name:'Test',username:'qa_user'}),...extra});const text=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(text).digest('hex'));return p.toString();}
assert.equal((await verifyTelegramInitData(signed(),token,now)).id,12345);
assert.equal(await verifyTelegramInitData(signed().replace('test-query','forged-query'),token,now),null);
assert.equal(await verifyTelegramInitData(signed(),token+'wrong',now),null);
assert.equal(await verifyTelegramInitData(signed({auth_date:String(now-3601)}),token,now),null);
assert.equal(await verifyTelegramInitData(signed({auth_date:String(now+31)}),token,now),null);
assert.equal(await verifyTelegramInitData(signed()+'&auth_date='+now,token,now),null);
assert.equal((await verifyTelegramInitData(signed({signature:'signature-included-in-hmac'}),token,now)).id,12345);
console.log('Telegram initData: valid identity, signature field, tampering, wrong token, expiry, future date and duplicate parameter checks passed.');
