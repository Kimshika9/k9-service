import { timingSafeEqual } from 'node:crypto';
import { hostingEnabled } from '../../../../lib/hosting';
import { json, runtime } from '../../../../lib/server';

const leaseDuration = 10 * 60 * 1000;
const maxJobAge = 15 * 60 * 1000;

export async function POST(request: Request) {
 const env = runtime();
 const expected = env.K9_HOSTING_SECRET ?? '';
 const actual = request.headers.get('x-k9-hosting-secret') ?? '';
 if (!hostingEnabled(expected) || expected === env.TELEGRAM_WEBHOOK_SECRET || !hostingEnabled(actual) || actual.length !== expected.length
     || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
  return json({ error: 'Unauthorized' }, 401);
 }
 const db = env.DB;
 if (!db) return json({ error: 'Hosting queue unavailable' }, 503);

 let body;
 try {
  body = await request.json() as { op?: string; id?: number; lease?: string; ownerId?: string };
 } catch {
  return json({ error: 'Invalid hosting request' }, 400);
 }
 if (!body || typeof body !== 'object') return json({ error: 'Invalid hosting request' }, 400);
 if (!env.OWNER_TELEGRAM_ID || body.ownerId !== env.OWNER_TELEGRAM_ID) return json({ error: 'Owner mismatch' }, 409);

 try {
  if (body.op === 'check') {
   await db.prepare('SELECT id, payload, created_at, lease_until, lease FROM hosting_jobs LIMIT 0').run();
   return json({ ok: true });
  }
  if (body.op === 'claim') {
   const now = Date.now();
   const lease = crypto.randomUUID();
   // Only the oldest pending job can be leased. A second runner cannot overtake it.
   const row = await db.prepare(`UPDATE hosting_jobs SET lease = ?, lease_until = ?
    WHERE id = (SELECT id FROM hosting_jobs WHERE payload IS NOT NULL AND created_at >= ?
      AND json_extract(payload, '$.ownerId') = ? ORDER BY id LIMIT 1)
      AND lease_until <= ? RETURNING id, payload`)
    .bind(lease, now + leaseDuration, now - maxJobAge, body.ownerId, now)
    .first<{ id: number; payload: string }>();
   return json({ job: row ? { id: row.id, payload: JSON.parse(row.payload).job, lease } : null });
  }
  if (body.op === 'ack' && Number.isSafeInteger(body.id) && typeof body.lease === 'string') {
   await db.prepare(`UPDATE hosting_jobs SET payload = NULL, lease = NULL, lease_until = 0
     WHERE id = ? AND lease = ? AND json_extract(payload, '$.ownerId') = ?`)
    .bind(body.id, body.lease, body.ownerId).run();
   return json({ ok: true });
  }
  return json({ error: 'Invalid hosting request' }, 400);
 } catch {
  return json({ error: 'Hosting queue unavailable' }, 503);
 }
}
