import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cloudflare,exportDatabase,requireIsolatedDatabase,importIsolatedDatabase} from './release-cloudflare.mjs';
import {inspectRelease} from './release-preflight.mjs';

const execute=promisify(execFile);
async function command(file,args,label) {
 try{return await execute(file,args,{maxBuffer:8*1024*1024,timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});}
 catch(error){const code=String(error.stderr??'').match(/\[(K9_BACKUP_[A-Z_]+|SQLITE_[A-Z_]+)\]/)?.[1];throw new Error(`${label} failed${code?' ['+code+']':''}. Private command output was withheld.`);}
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
  const first=await exportDatabase(api,preflight.databaseId);
  const original=path.join(privateDirectory,'production.sql');
  await download(first.url,original);
  const databases=await api('d1/database?per_page=100',{label:'private backup resource lookup'});
  const existing=databases.filter(d=>/^k9-service-backup-[0-9]+$/.test(d.name)).sort((a,b)=>b.name.localeCompare(a.name))[0];
  let importRequired=true;
  if(existing) {
   requireIsolatedDatabase(preflight.databaseId,existing);
   const tables=await api(`d1/database/${existing.uuid}/query`,{method:'POST',label:'backup state inspection',body:{sql:"SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"}});
   if(tables[0]?.results?.[0]?.n===0)backup=existing;
   else {
    const candidate=path.join(privateDirectory,'candidate.sql');
    await download((await exportDatabase(api,existing.uuid)).url,candidate);
    try{await command('python3',['scripts/release-verify-export.py',original,candidate],'Existing backup comparison');backup=existing;importRequired=false;}catch{ /* Preserve older backup; create a fresh private snapshot. */ }
   }
  }
  backup??=await api('d1/database',{method:'POST',label:'isolated backup creation',body:{name:`k9-service-backup-${stamp}`}});
  const backupId=requireIsolatedDatabase(preflight.databaseId,backup);
  if(importRequired){
   const importFile=path.join(privateDirectory,'importable.sql');
   const preparation=await command('python3',['scripts/release-chunk-export.py',original,importFile],'Private receipt export preparation');
   console.log(JSON.stringify(JSON.parse(preparation.stdout)));
   await importIsolatedDatabase(api,preflight.databaseId,backup,await fs.readFile(importFile));
  }
  const restoredExport=await exportDatabase(api,backupId);
  const restored=path.join(privateDirectory,'restored.sql');
  await download(restoredExport.url,restored);
  const verification=await command('python3',['scripts/release-verify-export.py',original,restored],'Private backup comparison');
  const verified=JSON.parse(verification.stdout);
  if(verified.restoreVerified!==true)throw new Error('Backup restore was not verified.');
  const report={...preflight,stage:'private-backup-verified',backupDatabaseId:backupId,backupDatabaseName:backup.name,backupCreatedAt:new Date().toISOString(),
   timeTravelBookmark:bookmark.bookmark??first.bookmark,restoreVerified:true,tablesVerified:verified.tablesVerified,productionMutated:false};
  await fs.writeFile(path.join(directory,'backup.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({stage:report.stage,backupDatabaseName:backup.name,restoreVerified:true,tablesVerified:verified.tablesVerified,reusedUnchangedBackup:!importRequired,productionMutated:false}));
 }finally{
  // Raw SQL is never sent to GitHub artifacts, logs or repository files.
  await fs.rm(privateDirectory,{recursive:true,force:true});
 }
}catch(error){console.error(error instanceof Error?error.message:'Private backup failed.');process.exitCode=1;}
