import assert from 'node:assert/strict';
import {prepareCloudflare} from './prepare-cloudflare.mjs';
for(const mode of ['existing','create','configured']){
 let config={d1_databases:[{binding:'DB',database_name:'k9-service-db',database_id:mode==='configured'?'real-id':'00000000-0000-4000-8000-000000000000'}]},created=false,migrated=false,lists=0;
 prepareCloudflare({read:()=>JSON.stringify(config),write:(_p,s)=>config=JSON.parse(s),run:args=>{if(args[1]==='list'){lists++;return JSON.stringify(mode==='existing'||created?[{name:'k9-service-db',uuid:'real-id'}]:[])}if(args[1]==='create'){assert.equal(mode,'create');created=true;return ''}if(args[1]==='migrations'){assert.equal(config.d1_databases[0].database_id,'real-id');migrated=true;return ''}throw new Error('Unexpected Cloudflare command')}});
 assert.equal(config.d1_databases[0].database_id,'real-id');assert.equal(migrated,true);assert.equal(created,mode==='create');assert.equal(lists,mode==='configured'?0:mode==='create'?2:1);
}
console.log('Cloudflare setup: existing D1 reuse, first-time creation, explicit binding and migration ordering passed.');
