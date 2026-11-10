import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const site='https://k9-service.kimshikano.workers.dev';
export async function publicProbe(request=fetch) {
 async function get(route){try{return await request(site+route,{signal:AbortSignal.timeout(20000)});}catch{throw new Error('Public K9 readiness probe could not be reached.');}}
 const [root,health,unauthorized]=await Promise.all([get('/'),get('/api/health'),get('/api/owner/orders')]);
 const page=await root.text();
 const asset=page.match(/(?:src|href)="(\/_next\/static\/[^"?#]+\.js)(?:[?#][^"]*)?"/);
 const assetStatus=asset?(await get(asset[1])).status:null;
 let data;try{data=await health.json();}catch{data=null;}
 return {rootStatus:root.status,assetStatus,healthStatus:health.status,health:data,unauthorizedStatus:unauthorized.status};
}
export async function buildMetrics(root='dist') {
 const result={clientCodeFiles:0,clientCodeRawBytes:0,serverCodeFiles:0,serverCodeRawBytes:0,largestClientJs:null};
 for(const name of ['client','server']) {
  const directory=path.join(root,name);
  for(const file of (await fs.readdir(directory,{recursive:true})).filter(p=>/\.(?:m?js|css)$/.test(p))) {
   const content=await fs.readFile(path.join(directory,file));
   result[name+'CodeFiles']++;result[name+'CodeRawBytes']+=content.length;
   if(name==='client'&&file.endsWith('.js')&&(!result.largestClientJs||content.length>result.largestClientJs.rawBytes))
    result.largestClientJs={path:file,rawBytes:content.length,gzipBytes:gzipSync(content).length};
  }
 }
 return result;
}
