import fs from 'node:fs';
import {prepareCloudflare,wrangler} from './prepare-cloudflare.mjs';
const source=prepareCloudflare();
const path='dist/server/wrangler.json';
if(!fs.existsSync(path))throw new Error('Run pnpm build before deploying.');
const output=JSON.parse(fs.readFileSync(path,'utf8'));
output.d1_databases=source.d1_databases;
fs.writeFileSync(path,JSON.stringify(output,null,2)+'\n');
wrangler(['deploy','--config',path]);
