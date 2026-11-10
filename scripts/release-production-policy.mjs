export function assertProductionGate(backup,staging,current) {
 if(!backup?.restoreVerified||!staging?.widgetChecks?.privateOwnerWidgetSent||!staging.widgetChecks.widgetEditVerified||
    staging.checks?.healthStatus!==200||backup.databaseId!==current.databaseId||
    JSON.stringify(backup.productionVersions)!==JSON.stringify(current.productionVersions)||
    current.productionVersions.length!==1||current.productionVersions[0].percentage!==100)
  throw new Error('Production release gate failed: backup, staging or rollback identity is not verified.');
}
export function preservedBindings(settings,databaseId) {
 const list=settings.bindings;
 if(!Array.isArray(list)||list.filter(b=>b.name==='DB'&&b.type==='d1'&&b.id===databaseId).length!==1)
  throw new Error('Refusing to change the existing production DB binding.');
 if(list.some(b=>b.name.startsWith('K9_RELEASE_')))throw new Error('A test-only binding unexpectedly exists on production.');
 const bindings=list.filter(b=>b.name!=='K9_WIDGETS_ENABLED').map(b=>b.name==='DB'?{name:b.name,type:'d1',id:databaseId}:b.type==='assets'?{name:b.name,type:'assets'}:{name:b.name,type:'inherit'});
 // Enable only after isolated staging and the real private-chat API tests pass.
 bindings.push({name:'K9_WIDGETS_ENABLED',type:'plain_text',text:'1'});
 return bindings;
}
export function liveHealthy(checks) {
 return checks.rootStatus===200&&checks.assetStatus===200&&checks.healthStatus===200&&checks.health?.ready===true&&
  checks.ownerStatus===200&&checks.unauthorizedStatus===401&&checks.wrongSecretStatus===401&&
  checks.authenticatedMalformedStatus===200&&checks.hostingStatus===200&&checks.webhookUrlMatches===true&&checks.subscriptionsReady===true;
}
