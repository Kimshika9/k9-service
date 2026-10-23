import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
export function wrangler(args,{capture=false}={}){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:capture?['ignore','pipe','inherit']:'inherit',encoding:'utf8'});
 if(result.error)throw result.error;if(result.status!==0)throw new Error(`Cloudflare command failed: ${args.slice(0,2).join(' ')} (exit ${result.status})`);
 return result.stdout||'';
}
export function prepareCloudflare({run=wrangler,read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s)}={}){
 const config=JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/mg,''));
 const db=config.d1_databases?.find(d=>d.binding==='DB');if(!db?.database_name)throw new Error('Configure the DB binding and database_name in wrangler.jsonc.');
 if(!db.database_id||db.database_id==='00000000-0000-4000-8000-000000000000'){
  const list=()=>JSON.parse(run(['d1','list','--json'],{capture:true}));
  const find=items=>items.find(d=>d.name===db.database_name);
  let found=find(list());
  if(!found){run(['d1','create',db.database_name,'--config','wrangler.jsonc','--update-config=false']);found=find(list());}
  if(!found?.uuid)throw new Error(`Cloudflare did not return an ID for ${db.database_name}. Check D1 permissions.`);
  db.database_id=found.uuid;
  write('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
 }
 run(['d1','migrations','apply','DB','--remote','--config','wrangler.jsonc']);
 return config;
}
