import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const worker='k9-service';
export async function inspectRelease({token,accountId,request=fetch}) {
 if(!token?.trim())throw new Error('Missing repository secret: CLOUDFLARE_API_TOKEN');
 if(!/^[a-f0-9]{32}$/i.test(accountId??''))throw new Error('CLOUDFLARE_ACCOUNT_ID must be the 32-character Cloudflare account ID.');
 async function read(route,label){
  let response;try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${route}`,{method:'GET',headers:{Authorization:`Bearer ${token.trim()}`},signal:AbortSignal.timeout(20000)});}catch{throw new Error(`Cloudflare ${label} could not be reached.`);}
  let data;try{data=await response.json();}catch{throw new Error(`Cloudflare ${label} returned HTTP ${response.status} without JSON.`);}
  if(!response.ok||data.success!==true){const codes=(data.errors??[]).map(e=>Number(e.code)).filter(Number.isFinite).join(',');throw new Error(`Cloudflare ${label} failed: HTTP ${response.status}${codes?'; codes '+codes:''}.`);}
  return data.result;
 }
 const settings=await read(`workers/scripts/${worker}/settings`,'Worker access');
 const bindings=settings?.bindings;
 if(!Array.isArray(bindings))throw new Error('Worker settings have no binding list. No resources were changed.');
 const databases=bindings.filter(b=>b.type==='d1'&&b.name==='DB');
 if(databases.length!==1||!/^[a-f0-9-]{36}$/i.test(databases[0].id??''))throw new Error('The existing Worker must have exactly one valid DB binding. No database will be created automatically.');
 const databaseId=databases[0].id;
 const database=await read(`d1/database/${databaseId}`,'D1 access');
 if(database.name!=='k9-service-db')throw new Error('The live DB binding is not the expected k9-service-db. Review the binding before deployment.');
 const deployments=await read(`workers/scripts/${worker}/deployments`,'deployment history');
 const latest=(deployments.deployments??[]).slice().sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
 if(!latest?.versions?.length)throw new Error('The current production Worker version could not be identified.');
 const required=['BOT_TOKEN','OWNER_TELEGRAM_ID','TELEGRAM_WEBHOOK_SECRET'];
 const environment=Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 const report={stage:'read-only-preflight',worker,databaseName:database.name,databaseId,
  productionDeploymentId:latest.id,productionVersions:latest.versions.map(v=>({id:v.version_id,percentage:v.percentage})),
  requiredBindings:required.map(name=>({name,present:bindings.some(b=>b.name===name),storage:bindings.find(b=>b.name===name)?.type??'missing'})),
  widgetsEnabled:environment.K9_WIDGETS_ENABLED==='1',
  hostingConfigured:bindings.some(b=>b.name==='K9_HOSTING_SECRET'),
  siteOriginMatches:!environment.SITE_URL||environment.SITE_URL.replace(/\/$/,'')==='https://k9-service.kimshikano.workers.dev',
  databaseBackend:database.version??'unknown',databaseBytes:database.file_size??null,
  productionMutated:false};
 if(report.requiredBindings.some(b=>!b.present))throw new Error('The live Worker is missing required Telegram bindings. No production changes were made.');
 return report;
}
export async function main(){
 try{
  const report=await inspectRelease({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID});
  const directory=process.env.K9_RELEASE_REPORT_DIR||path.join(process.env.RUNNER_TEMP||'.wrangler','k9-release-report');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(directory,'preflight.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report,null,2));
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## K9 release preflight\n\nCloudflare Worker, existing DB binding and rollback versions verified.\n\nProduction was not modified. The report contains no credential values or customer rows.\n');
 }catch(error){console.error(error instanceof Error?error.message:'Release preflight failed.');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
