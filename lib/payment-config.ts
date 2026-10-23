import {env} from 'cloudflare:workers';
import {getDb} from '../db';
import {settings} from '../db/schema';
import {eq} from 'drizzle-orm';
import type {PaymentConfig} from './catalog';
export type StoredPaymentConfig=PaymentConfig&{qrKey?:string};
export async function getPaymentConfig():Promise<StoredPaymentConfig>{const row=await getDb().select().from(settings).where(eq(settings.key,'kbzpay')).get();const e=env as Cloudflare.Env&{KBZPAY_ACCOUNT_NAME?:string;KBZPAY_PHONE?:string;KBZPAY_ENABLED?:string};return row?JSON.parse(row.value):{enabled:e.KBZPAY_ENABLED==='1'&&!!e.KBZPAY_ACCOUNT_NAME&&!!e.KBZPAY_PHONE,accountName:e.KBZPAY_ACCOUNT_NAME||'',phone:e.KBZPAY_PHONE||'',instructions:'Include your K9 order code in the transfer note. Submit the transaction ID and receipt after transferring.',hasQr:false};}
export function publicPaymentConfig(c:StoredPaymentConfig):PaymentConfig{return {enabled:c.enabled,accountName:c.enabled?c.accountName:'',phone:c.enabled?c.phone:'',instructions:c.enabled?c.instructions:'',hasQr:c.enabled&&!!c.qrKey,revision:c.revision};}
