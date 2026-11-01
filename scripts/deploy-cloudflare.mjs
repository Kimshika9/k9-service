import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {prepareCloudflare,wrangler} from './prepare-cloudflare.mjs';
export function deployCloudflare({exists=fs.existsSync,read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s),prepare=prepareCloudflare,run=wrangler}={}){
 const path='dist/server/wrangler.json';
 // Check the artifact before creating databases or applying remote migrations.
 if(!exists(path))throw new Error('Run pnpm build before deploying.');
 const output=JSON.parse(read(path));
 if(!output.main)throw new Error('The Worker build configuration has no entry point. Run pnpm build again.');
 const source=prepare();
 output.d1_databases=source.d1_databases;
 write(path,JSON.stringify(output,null,2)+'\n');
 run(['deploy','--config',path]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)deployCloudflare();
