import {setTimeout as pause} from 'node:timers/promises';
import {createHash} from 'node:crypto';

// Never include provider bodies: they can contain bindings, SQL or receipt data.
export function cloudflare({token,accountId,request=fetch}) {
 if(!token?.trim()||!/^[a-f0-9]{32}$/i.test(accountId??''))throw new Error('Cloudflare repository secrets are missing or invalid.');
 return async function api(route,{method='GET',body,label='request',headers={}}={}) {
  let response,data;
  try {
   response=await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${route}`,{
    method,headers:{Authorization:`Bearer ${token.trim()}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},
    ...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
   data=await response.json();
  }catch{throw new Error(`Cloudflare ${label} could not be completed.`);}
  if(!response.ok||data.success!==true){
   const codes=(data.errors??[]).map(e=>Number(e.code)).filter(Number.isFinite).join(',');
   throw new Error(`Cloudflare ${label} failed: HTTP ${response.status}${codes?'; codes '+codes:''}.`);
  }
  return data.result;
 };
}
export async function exportDatabase(api,id,{wait=pause}={}) {
 let bookmark;
 for(let attempt=0;attempt<90;attempt++) {
  const result=await api(`d1/database/${id}/export`,{method:'POST',label:'private D1 export',body:{output_format:'polling',...(bookmark?{current_bookmark:bookmark}:{})}});
  if(result.status==='error')throw new Error('Private D1 export failed. Provider details were withheld.');
  if(result.status==='complete'){
   const signed=result.result?.signed_url;
   if(typeof signed!=='string'||new URL(signed).protocol!=='https:')throw new Error('Private D1 export returned no valid download.');
   return {url:signed,bookmark:result.at_bookmark};
  }
  bookmark=result.at_bookmark??bookmark;
  if(!bookmark)throw new Error('Private D1 export returned no polling bookmark.');
  await wait(1000);
 }
 throw new Error('Private D1 export timed out. Production was not migrated.');
}
export function requireIsolatedDatabase(production,backup) {
 if(!/^[a-f0-9-]{36}$/i.test(backup?.uuid??'')||backup.uuid===production||!/^k9-service-(backup|stage)-[0-9-]+$/.test(backup.name??''))
  throw new Error('Refusing to write to a database that is not an isolated release resource.');
 return backup.uuid;
}
export async function importIsolatedDatabase(api,production,database,bytes,{request=fetch,wait=pause}={}) {
 const id=requireIsolatedDatabase(production,database),etag=createHash('md5').update(bytes).digest('hex');
 let result=await api(`d1/database/${id}/import`,{method:'POST',label:'private backup import initialization',body:{action:'init',etag}});
 if(result.upload_url) {
  if(new URL(result.upload_url).protocol!=='https:')throw new Error('Private import upload URL is invalid.');
  let response;try{response=await request(result.upload_url,{method:'PUT',body:bytes,signal:AbortSignal.timeout(60000)});}catch{throw new Error('Private backup upload failed.');}
  if(!response.ok||response.headers.get('etag')?.replaceAll('"','')!==etag)throw new Error(`Private backup upload verification failed: HTTP ${response.status}.`);
  result=await api(`d1/database/${id}/import`,{method:'POST',label:'private backup ingestion',body:{action:'ingest',etag,filename:result.filename}});
 }
 for(let attempt=0;attempt<90;attempt++) {
  if(result.success===false||result.status==='error')throw new Error('Private backup ingestion failed; SQL and provider details withheld.');
  if(result.status==='complete')return;
  if(!result.at_bookmark)throw new Error('Private backup import returned no polling bookmark.');
  await wait(1000);
  result=await api(`d1/database/${id}/import`,{method:'POST',label:'private backup import polling',body:{action:'poll',current_bookmark:result.at_bookmark}});
 }
 throw new Error('Private backup import timed out.');
}
