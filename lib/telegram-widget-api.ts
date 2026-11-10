import { deflateSync } from 'node:zlib';

export const TELEGRAM_UPDATES = ['message', 'callback_query', 'widget_query'] as const;
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
export function widgetText(value: unknown, max: number, allowEmpty = true): asserts value is string {
 if (typeof value !== 'string' || (!allowEmpty && !value) || value.includes('\0') ||
     !value.isWellFormed() || utf8Bytes(value) > max) throw new Error('Invalid Widget text size or encoding');
}
export function validateWidgetHtml(html: string) {
 widgetText(html, 32768, false);
 const compressed = deflateSync(new TextEncoder().encode(html), { level: 9 }).byteLength;
 if (compressed > 4096) throw new Error('Widget compressed HTML exceeds 4096 bytes');
 return { htmlBytes: utf8Bytes(html), compressedBytes: compressed };
}
export function widgetData(data: unknown) {
 const value = JSON.stringify(data);
 widgetText(value, 1024);
 return value;
}
export type WidgetMessage = { message_id: number; chat: { id: number; type: string }; widget?: { id?: string } };
export type WidgetSend = {
 chat_id: string; html: string; caption: string; chat_data?: string; public_data?: string;
 allow_queries?: boolean; width?: number; height?: number; reply_markup?: unknown;
 protect_content?: boolean;
};
type WidgetEdit = { chat_id: string; message_id: number; chat_data?: string; public_data?: string };
type Api = (method: string, payload: Record<string, unknown>, options?: { timeoutMs: number }) => Promise<unknown>;
// Private K9 views intentionally expose no shared/public-state creation methods.
// Add shared methods only with a reviewed public-data use case.
export function widgetApi(api: Api) {
 return {
  async sendWidget(payload: WidgetSend): Promise<WidgetMessage> {
   validateWidgetHtml(payload.html);
   widgetText(payload.caption, 4096, false);
   if ([...payload.caption].length > 1024) throw new Error('Widget caption exceeds 1024 characters');
   if (!/^[1-9]\d{0,15}$/.test(payload.chat_id)) throw new Error('K9 Widgets require a private chat');
   for (const value of [payload.chat_data, payload.public_data]) if (value !== undefined) widgetText(value, 1024);
   return await api('sendWidget', { ...payload, protect_content: true }, { timeoutMs: 3000 }) as WidgetMessage;
  },
  async answerWidgetQuery(id: string, data?: string) {
   widgetText(id, 256, false);
   if (data !== undefined) widgetText(data, 1024);
   return api('answerWidgetQuery', { widget_query_id: id, ...(data === undefined ? {} : { data }) }, { timeoutMs: 2500 });
  },
  async editMessageWidgetData(payload: WidgetEdit) {
   if (!/^[1-9]\d{0,15}$/.test(payload.chat_id) || !Number.isSafeInteger(payload.message_id) || payload.message_id < 1)
    throw new Error('Invalid private Widget message');
   if (payload.chat_data === undefined && payload.public_data === undefined) throw new Error('Widget state is required');
   for (const value of [payload.chat_data, payload.public_data]) if (value !== undefined) widgetText(value, 1024);
   return api('editMessageWidgetData', payload, { timeoutMs: 2500 });
  },
 };
}
