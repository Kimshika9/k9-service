export type ReadinessEnv={BOT_TOKEN?:string;OWNER_TELEGRAM_ID?:string;TELEGRAM_WEBHOOK_SECRET?:string;SITE_URL?:string};
export function publicOrigin(value?:string){
 try{
  const input=value?.trim();
  if(!input?.startsWith('https://'))return undefined;
  const url=new URL(input);
  if(url.href===url.origin+'/'&&!url.username&&!url.password)return url.origin;
 }catch{}
}
export function configurationChecks(e:ReadinessEnv){
 return {
  botToken:/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(e.BOT_TOKEN||''),
  owner:/^[1-9]\d{0,15}$/.test(e.OWNER_TELEGRAM_ID||''),
  webhookSecret:/^[A-Za-z0-9_-]{32,256}$/.test(e.TELEGRAM_WEBHOOK_SECRET||''),
  siteUrl:!!publicOrigin(e.SITE_URL),
 };
}
export function expectedWebhook(site:string|undefined){return site?.replace(/\/$/,'')+'/api/telegram/webhook';}
