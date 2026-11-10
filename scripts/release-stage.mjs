import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {cloudflare,requireIsolatedDatabase} from './release-cloudflare.mjs';
import {inspectRelease} from './release-preflight.mjs';
import {previewHandler} from './release-preview-worker.mjs';
import {widgetTemplate,widgetCaption} from '../lib/telegram-widget-ui.ts';

try {
 const credentials={token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID};
 const api=cloudflare(credentials),preflight=await inspectRelease(credentials);
 const directory=process.env.K9_RELEASE_REPORT_DIR;
 if(!directory)throw new Error('A private runner report directory is required.');
 const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
 const databases=await api('d1/database?per_page=100',{label:'staging resource lookup'});
 const existing=databases.filter(d=>/^k9-service-stage-[0-9]+$/.test(d.name)).sort((a,b)=>b.name.localeCompare(a.name))[0];
 let database,migrated=false;
 if(existing) {
  requireIsolatedDatabase(preflight.databaseId,existing);
  const tables=await api(`d1/database/${existing.uuid}/query`,{method:'POST',label:'staging schema inspection',body:{sql:"SELECT name FROM sqlite_master WHERE type='table'"}});
  const names=new Set(tables[0]?.results?.map(r=>r.name));
  if(['orders','payments','hosting_jobs','telegram_widget_messages','telegram_widget_queries','hosting_health'].every(n=>names.has(n))) {
   const rows=await api(`d1/database/${existing.uuid}/query`,{method:'POST',label:'staging isolation check',body:{sql:'SELECT COUNT(*) AS n FROM orders'}});
   if(rows[0]?.results?.[0]?.n!==0)throw new Error('The existing staging database contains orders; refusing to reuse it automatically.');
   database=existing;migrated=true;
  }
 }
 database??=await api('d1/database',{method:'POST',label:'isolated staging database creation',body:{name:`k9-service-stage-${stamp}`}});
 const stageId=requireIsolatedDatabase(preflight.databaseId,database);
 const migrations=(await fs.readdir('drizzle')).filter(p=>p.endsWith('.sql')).sort();
 for(const migration of migrated?[]:migrations) {
  const statements=(await fs.readFile(path.join('drizzle',migration),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  for(const sql of statements)await api(`d1/database/${stageId}/query`,{method:'POST',label:'staging schema migration',body:{sql}});
 }
 console.log('Applied all migrations to the isolated staging database; no customer rows copied.');
 const settings=await api('workers/scripts/k9-service/settings',{label:'existing Worker binding metadata'});
 const session=await api('workers/subdomain/edge-preview',{label:'private edge-preview session'});
 let sessionToken=session.token;
 if(session.exchange_url) {
  let exchange;try{exchange=await fetch(session.exchange_url,{signal:AbortSignal.timeout(20000)});}catch{throw new Error('Private edge-preview session exchange failed.');}
  // Match Wrangler: an unexpandable exchange falls back to the native token.
  if(exchange.ok){const expanded=await exchange.json();sessionToken=expanded.token??sessionToken;}
 }
 if(typeof sessionToken!=='string')throw new Error('No private edge-preview session token was returned.');
 const key=randomBytes(32).toString('hex');
 const bindings=settings.bindings.filter(b=>!['DB','K9_WIDGETS_ENABLED','K9_RELEASE_TEST_KEY','ASSETS'].includes(b.name)).map(b=>b.type==='secret_text'?{name:b.name,type:'inherit'}:b);
 bindings.push({name:'DB',type:'d1',id:stageId},{name:'K9_WIDGETS_ENABLED',type:'plain_text',text:'1'},{name:'K9_RELEASE_TEST_KEY',type:'plain_text',text:key});
 const state={v:1,r:1,name:'K9 Service Center',description:'Private staging verification',price:'—'};
 const widget={html:widgetTemplate('service','en'),caption:widgetCaption('service',state,'en'),chat_data:JSON.stringify(state)};
 const form=new FormData();
 form.set('metadata',JSON.stringify({main_module:'release-stage.js',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],bindings,keep_bindings:['secret_text','secret_key']}));
 form.set('release-stage.js',new Blob([`import app from './index.js';\nconst create=${previewHandler.toString()};\nexport default create(app,${JSON.stringify(widget)});`],{type:'application/javascript+module'}),'release-stage.js');
 const root=path.resolve('dist/server');
 for(const file of (await fs.readdir(root,{recursive:true})).filter(p=>/\.m?js$/.test(p)))
  form.set(file,new Blob([await fs.readFile(path.join(root,file))],{type:'application/javascript+module'}),file);
 form.set('wrangler-session-config',JSON.stringify({workers_dev:true}));
 const preview=await api('workers/scripts/k9-service/edge-preview',{method:'POST',label:'private staging Worker upload',body:form,headers:{'cf-preview-upload-config-token':sessionToken}});
 if(typeof preview.preview_token!=='string')throw new Error('No private staging preview token was returned.');
 const subdomain=await api('workers/subdomain',{label:'existing workers.dev subdomain'});
 async function check(route) {
  let response,data;
  try{response=await fetch(`https://k9-service.${subdomain.subdomain}.workers.dev${route}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'cf-workers-preview-token':preview.preview_token},signal:AbortSignal.timeout(45000)});data=await response.json();}
  catch{throw new Error('Private staging verification could not be reached.');}
  if(!response.ok)throw new Error(typeof data.error==='string'&&/^Telegram \w+ failed with code \d+\.$/.test(data.error)?data.error:`Private staging check returned HTTP ${response.status}.`);
  return data;
 }
 const checks=await check('/inspect');
 if(!checks.botVerified||!checks.originMatches||!checks.webhookUrlMatches||checks.healthStatus!==200||checks.ownerStatus!==200||checks.unauthorizedStatus!==401||checks.wrongSecretStatus!==401)
  throw new Error(`Staging readiness failed: ${JSON.stringify(checks)}`);
 const widgetChecks=await check('/widget-test');
 const after=await inspectRelease(credentials);
 if(JSON.stringify(after.productionVersions)!==JSON.stringify(preflight.productionVersions))throw new Error('Production version changed during staging; review before proceeding.');
 const report={stage:'isolated-staging-verified',stagingDatabaseId:stageId,stagingDatabaseName:database.name,checks,widgetChecks,productionMutated:false};
 // This credential stays only on this ephemeral runner, outside every artifact.
 await fs.writeFile(path.join(directory,'private-preview.json'),JSON.stringify({key,token:preview.preview_token,host:`https://k9-service.${subdomain.subdomain}.workers.dev`}),{mode:0o600});
 await fs.writeFile(path.join(directory,'staging.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error instanceof Error?error.message:'Isolated staging verification failed.');process.exitCode=1;}
