import { hostingJobs } from '../db/schema';
import { getDb } from '../db';
import { lt } from 'drizzle-orm';

export const uploadPrompt = 'K9 Hosting · Reply here with a .py, .js or .zip document (up to 20 MB).';
const day = 24 * 60 * 60 * 1000;

export function hostingEnabled(secret?: string) {
 return /^[A-Za-z0-9_-]{32,128}$/.test(secret ?? '');
}

export type HostingJob = { action: string } | {
 file: { id: string; name: string; size: number };
};

export function hostingJob(message: any, callback: any): HostingJob | undefined {
 if (/^\/hosting(?:@\w+)?(?:\s|$)/i.test(message?.text ?? '')) return { action: 'h:menu' };
 if (typeof callback?.data === 'string' && /^h:[a-z0-9:-]{1,60}$/.test(callback.data)) {
  return { action: callback.data };
 }
 const file = message?.document;
 const reply = message?.reply_to_message;
 if (file && reply?.from?.is_bot === true && reply.text === uploadPrompt) {
  return { file: { id: file.file_id, name: file.file_name, size: file.file_size } };
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
