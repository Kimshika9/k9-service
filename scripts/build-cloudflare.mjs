import {spawnSync} from 'node:child_process';
import {prepareCloudflare} from './prepare-cloudflare.mjs';
// Cloudflare's Git builds can keep the default `wrangler deploy` command.
// Resolve D1 and apply migrations before Vite generates its deployment config.
if(process.env.WORKERS_CI==='1')prepareCloudflare();
const result=spawnSync(process.execPath,['node_modules/vinext/dist/cli.js','build'],{stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
