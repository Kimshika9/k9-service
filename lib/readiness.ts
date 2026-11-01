export type ReadinessEnv={BOT_TOKEN?:string;OWNER_TELEGRAM_ID?:string;TELEGRAM_WEBHOOK_SECRET?:string;SITE_URL?:string};
export function configurationChecks(e:ReadinessEnv){
 let site=false;
 try{const u=new URL(e.SITE_URL||'');site=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{}
 return {
  botToken:/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(e.BOT_TOKEN||''),
  owner:/^[1-9]\d{0,15}$/.test(e.OWNER_TELEGRAM_ID||''),
  webhookSecret:/^[A-Za-z0-9_-]{32,256}$/.test(e.TELEGRAM_WEBHOOK_SECRET||''),
  siteUrl:site,
 };
}
export function expectedWebhook(site:string|undefined){return site?.replace(/\/$/,'')+'/api/telegram/webhook';}
