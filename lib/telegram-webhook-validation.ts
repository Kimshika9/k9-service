import { utf8Bytes } from './telegram-widget-api.ts';
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const userId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const sender = (value: unknown) => record(value) && userId(value.id) && value.is_bot !== true;
export type WidgetQuery = {
 id: string; from: { id: number; language_code?: string }; chat?: { id: number; type: string };
 message_id?: number; chat_instance: string; type: { type: string }; data: string;
 inline_message_id?: string; widget_id?: string;
};
export function isWidgetQuery(value: unknown): value is WidgetQuery {
 if (!record(value)) return false;
 return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 256 && sender(value.from) &&
  typeof value.chat_instance === 'string' && value.chat_instance.length <= 256 && record(value.type) &&
  typeof value.type.type === 'string' && typeof value.data === 'string' && utf8Bytes(value.data) >= 1 && utf8Bytes(value.data) <= 64 &&
  value.data.isWellFormed() && !value.data.includes('\0');
}
export function validUpdate(value: unknown) {
 if (!record(value) || !Number.isSafeInteger(value.update_id) || Number(value.update_id) < 0) return false;
 // Telegram defines exactly one update payload. Reject ambiguous mixed payloads.
 if (Object.keys(value).filter(k => k !== 'update_id').length !== 1) return false;
 if ('widget_query' in value) return isWidgetQuery(value.widget_query);
 const callback = value.callback_query;
 if (callback !== undefined && (!record(callback) || typeof callback.id !== 'string' || !callback.id || callback.id.length > 256 || !sender(callback.from) ||
     (callback.data !== undefined && (typeof callback.data !== 'string' || !callback.data || !callback.data.isWellFormed() || callback.data.includes('\0') || utf8Bytes(callback.data) > 64)))) return false;
 const message = value.message ?? (record(callback) ? callback.message : undefined);
 if (!message) return true; // Unsupported updates, including inaccessible inline callbacks, are ignored.
 if (!record(message) || !record(message.chat) || !userId(message.message_id) || typeof message.chat.type !== 'string' ||
     message.text !== undefined && typeof message.text !== 'string') return false;
 const from = value.message ? message.from : record(callback) ? callback.from : undefined;
 if (!sender(from)) return false;
 if (message.chat.type === 'private' && (!userId(message.chat.id) || message.chat.id !== (from as Record<string, unknown>).id)) return false;
 return true;
}
export async function webhookBody(request: Request, maxBytes = 262144): Promise<unknown> {
 if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) throw new Error('Invalid webhook body');
 const reader = request.body?.getReader();
 if (!reader) throw new Error('Missing webhook body');
 const chunks: Uint8Array[] = []; let bytes = 0;
 try {
  for (;;) {
   const { value, done } = await reader.read();
   if (done) break;
   bytes += value.byteLength;
   if (bytes > maxBytes) { await reader.cancel(); throw new Error('Invalid webhook body'); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 const body = new Uint8Array(bytes); let offset = 0;
 for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
 return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
export async function within<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Widget deadline')), milliseconds); })]); }
 finally { clearTimeout(timer); }
}
