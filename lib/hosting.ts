import { hostingJobs } from '../db/schema';
import { getDb } from '../db';
import { lt } from 'drizzle-orm';
import {record} from './telegram-webhook-validation';

export const uploadPrompt = 'K9 Hosting · Reply here with a .py, .js or .zip document (up to 20 MB).';
const day = 24 * 60 * 60 * 1000;

export function hostingEnabled(secret?: string) {
 return /^[A-Za-z0-9_-]{32,128}$/.test(secret ?? '');
}

export type HostingJob = { action: string } | {
 file: { id: string; name: string; size: number };
};

export function hostingJob(message: unknown, callback: unknown): HostingJob | undefined {
 if (record(message)&&typeof message.text==='string'&&/^\/hosting(?:@\w+)?(?:\s|$)/i.test(message.text)) return { action: 'h:menu' };
 if (record(callback)&&typeof callback.data === 'string' && /^h:[a-z0-9:-]{1,60}$/.test(callback.data)) {
  return { action: callback.data };
 }
 const file = record(message)?message.document:undefined;
 const reply = record(message)?message.reply_to_message:undefined;
 // Telegram may omit file_size. The hosting downloader still enforces its
 // byte limit; zero here means the size has not been supplied by Telegram.
 const size=record(file)&&file.file_size===undefined?0:record(file)?file.file_size:undefined;
 if (record(file)&&record(reply)&&record(reply.from)&&reply.from.is_bot === true && reply.text === uploadPrompt&&typeof file.file_id==='string'&&typeof file.file_name==='string'&&typeof size==='number'&&Number.isSafeInteger(size)&&size>=0) {
  return { file: { id: file.file_id, name: file.file_name, size } };
 }
}

export async function enqueueHosting(id: number, ownerId: string, job: HostingJob) {
 const now = Date.now();
 const db = getDb();
 await db.batch([
  db.delete(hostingJobs).where(lt(hostingJobs.createdAt, now - day)),
  db.insert(hostingJobs).values({ id, payload: JSON.stringify({ ownerId, job }), createdAt: now }).onConflictDoNothing(),
 ]);
}
