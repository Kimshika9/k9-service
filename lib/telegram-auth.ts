export type TelegramIdentity = { id:number; first_name?:string; last_name?:string; username?:string };
async function hmac(key:Uint8Array,text:string){return new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',new Uint8Array(key).buffer,{name:'HMAC',hash:'SHA-256'},false,['sign']),new TextEncoder().encode(text)));}
export async function verifyTelegramInitData(raw:string,token:string,now=Date.now()/1000):Promise<TelegramIdentity|null>{
 if(raw.length>16384||!token)return null;
 const p=new URLSearchParams(raw),hash=p.get('hash')||'';
 if(!/^[a-f0-9]{64}$/.test(hash)||new Set([...p.keys()]).size!==[...p.keys()].length)return null;
 const authDate=Number(p.get('auth_date'));if(!Number.isFinite(authDate)||authDate<=0||now-authDate>3600||authDate-now>30)return null;
 p.delete('hash');
 const data=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac(new TextEncoder().encode('WebAppData'),token);
 const actual=[...await hmac(secret,data)].map(n=>n.toString(16).padStart(2,'0')).join('');
 let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^hash.charCodeAt(i);if(diff)return null;
 try{const u=JSON.parse(p.get('user')||'{}');if(!Number.isSafeInteger(u.id)||u.id<=0)return null;return {id:u.id,first_name:typeof u.first_name==='string'?u.first_name.slice(0,100):'',last_name:typeof u.last_name==='string'?u.last_name.slice(0,100):'',username:typeof u.username==='string'?u.username.slice(0,32):undefined};}catch{return null;}
}
