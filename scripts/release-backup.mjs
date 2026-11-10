import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cloudflare,exportDatabase,requireIsolatedDatabase} from './release-cloudflare.mjs';
import {inspectRelease} from './release-preflight.mjs';

const execute=promisify(execFile);
async function command(file,args,label) {
 try{return await execute(file,args,{maxBuffer:8*1024*1024,timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});}
 catch{throw new Error(`${label} failed. Private command output was withheld.`);}
}
async function download(url,filename) {
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(60000)});}catch{throw new Error('Private export download failed.');}
 if(!response.ok)throw new Error(`Private export download returned HTTP ${response.status}.`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(!bytes.length||bytes.length>100*1024*1024)throw new Error('Private export size is invalid.');
 await fs.writeFile(filename,bytes,{mode:0o600});
}
try {
 const credentials={token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID};
 const api=cloudflare(credentials),preflight=await inspectRelease(credentials);
 const directory=process.env.K9_RELEASE_REPORT_DIR;
 if(!directory||!process.env.RUNNER_TEMP)throw new Error('Backup requires a private GitHub runner temporary directory.');
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const privateDirectory=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'k9-private-backup-'));
 let backup;
 try {
  const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
  const bookmark=await api(`d1/database/${preflight.databaseId}/time_travel/bookmark`,{label:'rollback bookmark'});
  backup=await api('d1/database',{method:'POST',label:'isolated backup creation',body:{name:`k9-service-backup-${stamp}`}});
  const backupId=requireIsolatedDatabase(preflight.databaseId,backup);
  console.log('Created a private backup database in the same Cloudflare account.');
  const first=await exportDatabase(api,preflight.databaseId);
  const original=path.join(privateDirectory,'production.sql');
  await download(first.url,original);
  const config=path.join(privateDirectory,'wrangler.json');
  await fs.writeFile(config,JSON.stringify({name:'k9-private-backup',account_id:credentials.accountId,d1_databases:[{binding:'DB',database_name:backup.name,database_id:backupId}]}),{mode:0o600});
  await command(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config',config,'--file',original,'--yes'],'Private backup import');
  const restoredExport=await exportDatabase(api,backupId);
  const restored=path.join(privateDirectory,'restored.sql');
  await download(restoredExport.url,restored);
  const verification=await command('python3',['scripts/release-verify-export.py',original,restored],'Private backup comparison');
  const verified=JSON.parse(verification.stdout);
  if(verified.restoreVerified!==true)throw new Error('Backup restore was not verified.');
  const report={...preflight,stage:'private-backup-verified',backupDatabaseId:backupId,backupDatabaseName:backup.name,backupCreatedAt:new Date().toISOString(),
   timeTravelBookmark:bookmark.bookmark??first.bookmark,restoreVerified:true,tablesVerified:verified.tablesVerified,productionMutated:false};
  await fs.writeFile(path.join(directory,'backup.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({stage:report.stage,backupDatabaseName:backup.name,restoreVerified:true,tablesVerified:verified.tablesVerified,productionMutated:false}));
 }finally{
  // Raw SQL is never sent to GitHub artifacts, logs or repository files.
  await fs.rm(privateDirectory,{recursive:true,force:true});
 }
}catch(error){console.error(error instanceof Error?error.message:'Private backup failed.');process.exitCode=1;}
