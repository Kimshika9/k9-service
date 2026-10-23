import {json} from '../../../lib/server';
export async function POST(){return json({error:'Owner access is configured by OWNER_TELEGRAM_ID in Cloudflare. Public owner activation is disabled.'},403)}
