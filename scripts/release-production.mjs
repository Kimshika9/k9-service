import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as pause} from 'node:timers/promises';
import {cloudflare} from './release-cloudflare.mjs';
import {publicProbe,buildMetrics} from './release-public-probe.mjs';
import {inspectRelease} from './release-preflight.mjs';
import {assertProductionGate,preservedBindings,liveHealthy} from './release-production-policy.mjs';

const execute=promisify(execFile),directory=process.env.K9_RELEASE_REPORT_DIR;
let api,rollback,uploaded,deployed=false,report;
async function command(args,label) {
 try{return await execute(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{timeout:300000,maxBuffer:12*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});}
 catch(error){const codes=[...String(error.stderr??'').matchAll(/\[code: (\d+)\]/g)].map(m=>m[1]);throw new Error(`${label} failed${codes.length?'; Cloudflare codes '+codes.join(','):''}. Private command output withheld.`);}
}
async function traffic(id,message) {
 return api('workers/scripts/k9-service/deployments',{method:'POST',label:'Worker traffic deployment',body:{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}}});
}
try {
 if(!directory||process.env.K9_RELEASE_PRODUCTION!=='1')throw new Error('Production execution is not enabled for this workflow.');
 const credentials={token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID};
 api=cloudflare(credentials);
 const current=await inspectRelease(credentials);
 const backup=JSON.parse(await fs.readFile(path.join(directory,'backup.json'),'utf8'));
 const staging=JSON.parse(await fs.readFile(path.join(directory,'staging.json'),'utf8'));
 const preview=JSON.parse(await fs.readFile(path.join(directory,'private-preview.json'),'utf8'));
 assertProductionGate(backup,staging,current);
 rollback=current.productionVersions[0].id;
 async function previewCheck(route) {
  let response,data;try{response=await fetch(preview.host+route,{method:'POST',headers:{Authorization:`Bearer ${preview.key}`,'cf-workers-preview-token':preview.token},signal:AbortSignal.timeout(90000)});data=await response.json();}
  catch{throw new Error('Private live verification could not be reached.');}
  if(!response.ok){
   const reason=typeof data.error==='string'&&/^Telegram \w+ failed with code \d+\.$/.test(data.error)?' '+data.error:'';
   const stage=typeof data.stage==='string'&&/^[/a-z-]+$/.test(data.stage)?data.stage:'unknown';
   const detail=reason+' stage='+stage+'; type='+(data.errorType==='invalid-json'?'invalid-json':'upstream');
   throw new Error(`Private live verification ${route} returned HTTP ${response.status}.${detail}`);
  }
  return data;
 }
 const metrics=await buildMetrics();console.log(JSON.stringify({stage:'build-metrics',metrics}));
 const routing=await api('workers/scripts/k9-service/subdomain',{label:'public Worker routing inspection'});
 console.log(JSON.stringify({stage:'public-routing',workersDevEnabled:routing.enabled,versionUrlsEnabled:routing.previews_enabled}));
 const baseline={...await previewCheck('/verify-live'),...await publicProbe()};
 console.log(JSON.stringify({stage:'live-baseline',checks:baseline}));
 if(baseline.rootStatus!==200||baseline.healthStatus!==200||baseline.ownerStatus!==200)throw new Error('Existing production readiness must be reviewed before another deployment.');
 const settings=await api('workers/scripts/k9-service/settings',{label:'binding preservation inspection'});
 const configPath='dist/server/wrangler.json',config=JSON.parse(await fs.readFile(configPath,'utf8'));
 config.account_id=credentials.accountId;config.keep_vars=true;
 config.d1_databases=[{binding:'DB',database_name:current.databaseName,database_id:current.databaseId,migrations_dir:path.resolve('drizzle')}];
 config.unsafe={...config.unsafe,metadata:{...config.unsafe?.metadata,bindings:preservedBindings(settings,current.databaseId)}};
 await fs.writeFile(configPath,JSON.stringify(config),{mode:0o600});
 const uploadedResult=await command(['versions','upload','--config',configPath,'--message',`K9 API 10.4 ${process.env.GITHUB_SHA??'verified build'}`,'--tag','api104-verified'],'Worker candidate upload');
 uploaded=uploadedResult.stdout.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];
 if(!uploaded)throw new Error('The uploaded Worker version could not be identified; no traffic was changed.');
 const version=await api(`workers/scripts/k9-service/versions/${uploaded}`,{label:'candidate binding verification'});
 const bound=version.resources?.bindings;
 if(!Array.isArray(bound)||settings.bindings.some(before=>!bound.some(b=>b.name===before.name&&b.type===before.type))||
    !bound.some(b=>b.name==='DB'&&b.type==='d1'&&b.id===current.databaseId)||
    !bound.some(b=>b.name==='K9_WIDGETS_ENABLED'&&b.type==='plain_text'&&b.text==='0'))throw new Error('Candidate bindings do not preserve the production resources. No traffic was changed.');
 const history=await api(`d1/database/${current.databaseId}/query`,{method:'POST',label:'migration history inspection',body:{sql:'SELECT name FROM d1_migrations ORDER BY id'}});
 const applied=new Set(history[0]?.results?.map(r=>r.name));
 const migrations=(await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
 const pending=migrations.filter(name=>!applied.has(name));
 if(pending.some(name=>name!=='0004_nebulous_retro_girl.sql'))throw new Error('Unreviewed older production migrations are pending. Traffic was not changed.');
 if(pending.length) {
  const source=JSON.parse((await fs.readFile('wrangler.jsonc','utf8')).replace(/^\s*\/\/.*$/mg,''));
  source.account_id=credentials.accountId;source.d1_databases=config.d1_databases;
  await fs.writeFile('wrangler.jsonc',JSON.stringify(source),{mode:0o600});
  await command(['d1','migrations','apply','DB','--remote','--config','wrangler.jsonc'],'Additive Widget migration');
 }
 // No native database restore is performed on release failure; keep new rows.
 await api(`d1/database/${current.databaseId}/query`,{method:'POST',label:'Widget schema verification',body:{sql:'SELECT chat_id,message_id FROM telegram_widget_messages LIMIT 0; SELECT id,update_id FROM telegram_widget_queries LIMIT 0; SELECT owner_id,received_at FROM hosting_health LIMIT 0;'}});
 const beforeTraffic=await inspectRelease(credentials);
 if(JSON.stringify(beforeTraffic.productionVersions)!==JSON.stringify(current.productionVersions))throw new Error('Another deployment changed production during this release.');
 const startedAt=Math.floor(Date.now()/1000);
 await traffic(uploaded,`K9 API 10.4 verified compatibility release; rollback ${rollback}`);deployed=true;
 const connection=await previewCheck('/connect');
 if(!connection.urlMatches||!connection.subscriptionsReady)throw new Error('Telegram did not retain the required webhook subscriptions.');
 const observations=[];
 for(let attempt=0;attempt<3;attempt++) {
  if(attempt)await pause(5000);
  const observation={...await previewCheck('/verify-live'),...await publicProbe()};observations.push(observation);
  if(!liveHealthy(observation)||observation.lastErrorAt>=startedAt)throw new Error(`Live release verification failed: ${JSON.stringify(observation)}`);
 }
 const after=await inspectRelease(credentials);
 if(after.productionVersions.length!==1||after.productionVersions[0].id!==uploaded||after.productionVersions[0].percentage!==100)throw new Error('The new Worker is not serving 100% of production traffic.');
 report={stage:'production-compatibility-deployed',commit:process.env.GITHUB_SHA,worker:'k9-service',versionId:uploaded,rollbackVersionId:rollback,databaseId:current.databaseId,
  backupDatabaseName:backup.backupDatabaseName,migrationsApplied:pending,connection,observations,widgetsEnabled:false,widgetActivation:'pending real-client visual acceptance',hostingRuntimeChanged:false,buildMetrics:metrics,bindingsPreserved:settings.bindings.map(b=>({name:b.name,type:b.type}))};
 await fs.writeFile(path.join(directory,'deployment.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}catch(error){
 console.error(error instanceof Error?error.message:'Production compatibility release failed.');
 if(deployed&&rollback&&api) {
  try{await traffic(rollback,'Automatic rollback after K9 API 10.4 verification failure');console.error('Previous Worker version restored. Existing D1 rows and additive tables retained.');}
  catch{console.error('Automatic Worker rollback failed. Restore the recorded previous version from Cloudflare.');}
 }
 process.exitCode=1;
}finally{
 if(directory)await fs.rm(path.join(directory,'private-preview.json'),{force:true});
}
