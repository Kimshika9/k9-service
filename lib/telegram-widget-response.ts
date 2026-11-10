import { widgetData } from './telegram-widget-api.ts';
import { within } from './telegram-webhook-validation.ts';

type Reply = { ok: boolean; message: string };
// Answer before editing: neither a slow database nor a failed/deleted message
// may spend Telegram's 15-second query budget on state or caption updates.
export async function respondToWidget<T extends Reply>(
 prepare: () => Promise<T>, answer: (data: string) => Promise<unknown>,
 apply: (prepared: T) => Promise<void>, unavailable: string,
 log: (stage: string, error: unknown) => void,
) {
 let prepared: T | undefined;
 try { prepared = await within(prepare(), 6000); }
 catch (error) { log('query preparation', error); }
 try {
  await within(answer(widgetData(prepared ? { ok: prepared.ok, message: prepared.message } : { ok: false, message: unavailable })), 2500);
 } catch (error) { log('query answer', error); return; }
 if (prepared) try { await apply(prepared); } catch (error) { log('query edit', error); }
}
