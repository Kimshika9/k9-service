import {runtime,json} from '../../../../lib/server';
export async function GET(){const username=runtime().BOT_USERNAME;if(!username||!/^\w{5,32}$/.test(username))return json({error:'The Telegram bot has not been configured yet. Set BOT_USERNAME in Cloudflare.'},503);return new Response(null,{status:302,headers:{Location:`https://t.me/${username}?start=app`,'Cache-Control':'no-store'}})}
