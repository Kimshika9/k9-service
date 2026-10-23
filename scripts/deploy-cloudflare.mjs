import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/mg,'');
const config=JSON.parse(source);
const db=config.d1_databases?.find(d=>d.binding==='DB');
if(!db?.database_id||db.database_id==='00000000-0000-4000-8000-000000000000')throw new Error('Set your own D1 database_id in wrangler.jsonc before deploying.');
for(const args of [['d1','migrations','apply','DB','--remote','--config','wrangler.jsonc'],['deploy','--config','dist/server/wrangler.json']]){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
