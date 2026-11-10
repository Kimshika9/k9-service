import { getDb } from '../db';
import { orders, widgetMessages, widgetQueries, hostingHealth } from '../db/schema';
import { and, eq, gt, or } from 'drizzle-orm';
import { runtime, catalog, json } from './server';
import { telegram, sendPresented } from './telegram';
import { normalizeStatus } from './catalog';
import { widgetApi, widgetData } from './telegram-widget-api';
import { widgetTemplate, widgetCaption, boundedText, type WidgetKind, type WidgetState } from './telegram-widget-ui';
import { widgetCopy, widgetLocale, type WidgetLocale } from './i18n/widgets';
import { type WidgetQuery } from './telegram-webhook-validation';
import {respondToWidget} from './telegram-widget-response';

type Reference = typeof widgetMessages.$inferSelect;
const api = widgetApi(telegram);
export const widgetsEnabled = () => runtime().K9_WIDGETS_ENABLED === '1';
const validKind = (value: string): value is WidgetKind => ['service', 'order', 'owner', 'hosting'].includes(value);
const code = (error: unknown) => (error as { code?: number })?.code;
function log(stage: string, error: unknown) {
 // Never log Telegram descriptions, request data, IDs, URLs or financial details.
 console.warn('K9 Widget:', stage, Number.isInteger(code(error)) ? code(error) : 'unavailable');
}
async function snapshot(ref: Reference): Promise<WidgetState> {
 const e = runtime(), db = getDb(), locale: WidgetLocale = ref.locale === 'my' ? 'my' : 'en', c = widgetCopy[locale];
 if (ref.userId !== ref.chatId || !validKind(ref.kind)) throw new Error('Invalid Widget reference');
 if (ref.kind === 'owner' || ref.kind === 'hosting') {
  if (ref.userId !== e.OWNER_TELEGRAM_ID) throw new Error('Owner access required');
 }
 if (ref.kind === 'order') {
  const o = await db.select().from(orders).where(eq(orders.id, ref.resourceId)).get();
  if (!o || o.customerKey !== 'tg:' + ref.userId || o.telegramChat !== ref.chatId) throw new Error('Order unavailable');
  const status = normalizeStatus(o.status);
  return { v: 1, r: o.version, name: boundedText(o.serviceName), reference: o.id.slice(0, 11).toUpperCase(), status: c.statuses[status] ?? boundedText(status) };
 }
 if (ref.kind === 'service') {
  const s = (await catalog()).find(s => s.id === ref.resourceId);
  if (!s) throw new Error('Service unavailable');
  return { v: 1, r: Date.now(), name: boundedText(s.name, 150), description: boundedText(s.description, 220), price: boundedText(s.price, 120) };
 }
 if (ref.kind === 'owner') {
  const row = await e.DB!.prepare(`SELECT
   SUM(CASE WHEN status IN ('New','Pending Payment') THEN 1 ELSE 0 END) AS fresh,
   SUM(CASE WHEN status IN ('Pending Review','Pending Approval') THEN 1 ELSE 0 END) AS review,
   SUM(CASE WHEN status IN ('Processing','In Progress') THEN 1 ELSE 0 END) AS processing,
   SUM(CASE WHEN status IN ('Delivered','Done','Completed') THEN 1 ELSE 0 END) AS done
   FROM orders WHERE customer_key NOT IN (?, 'web:local-dev-owner')`).bind('tg:' + ref.userId)
   .first<{ fresh: number; review: number; processing: number; done: number }>();
  return { v: 1, r: Date.now(), counts: [row?.fresh ?? 0, row?.review ?? 0, row?.processing ?? 0, row?.done ?? 0], note: c.readOnly };
 }
 const row = await db.select().from(hostingHealth).where(eq(hostingHealth.ownerId, ref.userId)).get();
 if (!row) return { v: 1, r: Date.now(), note: c.noHeartbeat };
 const fresh = Date.now() - row.receivedAt <= 120000 && row.receivedAt <= Date.now();
 return { v: 1, r: Date.now(), runtime: row.runtime, seen: new Date(row.receivedAt).toISOString().slice(0, 19).replace('T', ' '),
  projects: row.projects, ...(fresh ? { running: row.running, unknown: row.unknown } : {}), note: fresh ? c.healthy : c.stale };
}
function markup(ref: Reference) {
 const site = runtime().SITE_URL?.replace(/\/$/, ''), c = widgetCopy[ref.locale === 'my' ? 'my' : 'en'];
 const action = ref.kind === 'order' ? 'w:order:' + ref.resourceId : ref.kind === 'service' ? 'w:service:' + ref.resourceId : 'w:' + ref.kind;
 const rows: Record<string, unknown>[][] = [[{ text: c.refresh, callback_data: action }]];
 if (ref.kind === 'service') rows.push([{ text: c.choose, callback_data: 'pick:' + ref.resourceId }]);
 if (site) rows.push([{ text: ref.kind === 'owner' || ref.kind === 'hosting' ? c.dashboard : c.details,
  web_app: { url: site + (ref.kind === 'owner' || ref.kind === 'hosting' ? '/owner' : ref.kind === 'order' ? '/?track=' + encodeURIComponent(ref.resourceId) + '#orders' : '/?order=' + encodeURIComponent(ref.resourceId)) } }]);
 return { inline_keyboard: rows };
}
async function retire(ref: Reference) {
 await getDb().update(widgetMessages).set({ active: 0 }).where(and(eq(widgetMessages.chatId, ref.chatId), eq(widgetMessages.messageId, ref.messageId)));
}
async function edit(ref: Reference, state: WidgetState) {
 try {
  await api.editMessageWidgetData({ chat_id: ref.chatId, message_id: ref.messageId, chat_data: widgetData(state) });
 } catch (error) {
  if (!(code(error) === 400 && /not modified/i.test(String((error as Error).message)))) {
   if ([400, 404].includes(code(error) ?? 0) && /not found|invalid.*message|message.*invalid|no widget|widget.*missing|can't be edited|cannot be edited/i.test(String((error as Error).message))) await retire(ref);
   throw error;
  }
 }
 // The caption is the complete fallback on older clients; keep it current too.
 try { await telegram('editMessageCaption', { chat_id: ref.chatId, message_id: ref.messageId, caption: widgetCaption(ref.kind as WidgetKind, state, ref.locale === 'my' ? 'my' : 'en'), reply_markup: markup(ref) }, { timeoutMs: 2500 }); }
 catch (error) { if (!(code(error) === 400 && /not modified/i.test(String((error as Error).message)))) log('caption edit', error); }
}
export async function sendK9Widget(userId: string, kind: WidgetKind, resourceId = '', locale: WidgetLocale = 'en', replace = false) {
 if (!widgetsEnabled() || !/^[1-9]\d{0,15}$/.test(userId)) return;
 const now = Date.now(), ref: Reference = { chatId: userId, userId, messageId: 0, kind, resourceId, locale, templateVersion: 1, active: 1, createdAt: now, expiresAt: now + 90 * 86400000 };
 try {
  const existing = await getDb().select().from(widgetMessages).where(and(eq(widgetMessages.userId, userId), eq(widgetMessages.kind, kind), eq(widgetMessages.resourceId, resourceId), eq(widgetMessages.active, 1))).all();
  if (!replace && existing.some(r => r.expiresAt > now)) return;
  const state = await snapshot(ref), caption = widgetCaption(kind, state, locale), reply_markup = markup(ref);
  let sent;
  try { sent = await api.sendWidget({ chat_id: userId, html: widgetTemplate(kind, locale), caption, chat_data: widgetData(state), allow_queries: true, reply_markup }); }
  catch (error) {
   // Permanent Widget rejection can fall back safely. A timeout/5xx may have
   // delivered the message already; do not blindly resend on ambiguous errors.
   if ([400, 404].includes(code(error) ?? 0)) { await sendPresented(userId, caption, reply_markup); return; }
   throw error;
  }
  if (!Number.isSafeInteger(sent.message_id) || sent.message_id < 1) throw new Error('Invalid Widget response');
  ref.messageId = sent.message_id;
  await getDb().insert(widgetMessages).values(ref);
  for (const old of existing) await retire(old);
 } catch (error) { log('send', error); }
}
export async function sendOrderWidget(orderId: string, userId: string | null, locale: WidgetLocale = 'en') {
 if (userId) await sendK9Widget(userId, 'order', orderId, locale);
}
export async function syncOrderWidgets(order: typeof orders.$inferSelect) {
 if (!widgetsEnabled()) return;
 try {
  const refs = await getDb().select().from(widgetMessages).where(and(eq(widgetMessages.active, 1), gt(widgetMessages.expiresAt, Date.now()),or(eq(widgetMessages.kind,'owner'),and(eq(widgetMessages.kind,'order'),eq(widgetMessages.resourceId,order.id))))).all();
  await Promise.allSettled(refs.map(async ref => {
   try { await edit(ref, await snapshot(ref)); } catch (error) { log('order sync', error); }
  }));
 } catch (error) { log('order references', error); }
}
type Prepared = { message: string; ok: boolean; ref?: Reference; state?: WidgetState };
async function prepareQuery(updateId: number, query: WidgetQuery, locale: WidgetLocale): Promise<Prepared> {
 const c = widgetCopy[locale], db = runtime().DB!;
 const ref = await getDb().select().from(widgetMessages).where(and(eq(widgetMessages.chatId, String(query.chat!.id)), eq(widgetMessages.messageId, query.message_id!))).get();
 if (!ref || !ref.active || ref.expiresAt <= Date.now() || ref.templateVersion !== 1) return { ok: false, message: c.unavailable };
 if (ref.userId !== String(query.from.id) || ref.chatId !== String(query.from.id) ||
     ['owner', 'hosting'].includes(ref.kind) && ref.userId !== runtime().OWNER_TELEGRAM_ID) return { ok: false, message: c.denied };
 const now = Date.now();
 // One atomic D1 statement enforces both persistent replay and per-user rate
 // limits, including simultaneous queries on independent Worker isolates.
 const claim = db.prepare(`INSERT INTO telegram_widget_queries(id, update_id, user_id, created_at)
  SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM telegram_widget_queries WHERE user_id=? AND created_at>?) < 5
  AND NOT EXISTS(SELECT 1 FROM webhook_updates WHERE id=?)
  ON CONFLICT DO NOTHING RETURNING id`).bind(query.id, updateId, ref.userId, now, ref.userId, now - 5000, updateId);
 const remember = db.prepare(`INSERT INTO webhook_updates(id,created_at) SELECT ?,?
  WHERE EXISTS(SELECT 1 FROM telegram_widget_queries WHERE id=? AND update_id=?) ON CONFLICT DO NOTHING`)
  .bind(updateId,new Date(now).toISOString(),query.id,updateId);
 const [claimed] = await db.batch([claim,remember]);
 if (!claimed.results.length) {
  const duplicate = await getDb().select().from(widgetQueries).where(eq(widgetQueries.id, query.id)).get();
  return { ok: !!duplicate, message: duplicate ? c.duplicate : c.limited };
 }
 const state = await snapshot(ref);
 return { ok: true, message: c.updated, ref, state };
}
export async function handleWidgetQuery(updateId: number, query: WidgetQuery) {
 const locale = widgetLocale(query.from.language_code), c = widgetCopy[locale];
 const prepare = async ():Promise<Prepared> => {
 if (!widgetsEnabled()) return {ok:false,message:c.disabled};
 if (query.data === 'refresh' && query.type.type === 'data' && query.chat?.type === 'private' &&
          Number.isSafeInteger(query.chat.id) && query.chat.id === query.from.id && Number.isSafeInteger(query.message_id) && query.message_id! > 0 &&
          !query.inline_message_id && !query.widget_id) {
  return prepareQuery(updateId,query,locale);
 }
 return {ok:false,message:c.invalid};
 };
 await respondToWidget(prepare,data=>api.answerWidgetQuery(query.id,data),async prepared=>{
  if(prepared.ref&&prepared.state)await edit(prepared.ref,prepared.state);
 },c.unavailable,log);
 return json({ ok: true });
}
export async function widgetCommand(chat: string, isOwner: boolean, text: string, data: string, language?: string) {
 if (!widgetsEnabled()) return false;
 const locale = widgetLocale(language);
 if (data === 'w:owner' || text === '/widgets') {
  if (isOwner) await sendK9Widget(chat, 'owner', '', locale, true);
  return true;
 }
 if (data === 'w:hosting' || text === '/hostingstatus') {
  if (isOwner) await sendK9Widget(chat, 'hosting', '', locale, true);
  return true;
 }
 const match = /^w:(order|service):([a-zA-Z0-9-]{1,45})$/.exec(data);
 if (match) { await sendK9Widget(chat, match[1] as WidgetKind, match[2], locale, true); return true; }
 return false;
}
