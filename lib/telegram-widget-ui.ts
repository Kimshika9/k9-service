import { widgetCopy, type WidgetLocale } from './i18n/widgets/index.ts';
import { validateWidgetHtml, widgetData, utf8Bytes } from './telegram-widget-api.ts';

export type WidgetKind = 'service' | 'order' | 'owner' | 'hosting';
export type WidgetState = {
 v: 1; r: number; name?: string; reference?: string; status?: string; description?: string; price?: string;
 counts?: [number, number, number, number]; runtime?: string; seen?: string;
 projects?: number; running?: number; unknown?: number; note?: string;
};
export function boundedText(text: string, max = 180) {
 let value = '';
 for (const character of text.toWellFormed().replaceAll('\0', '')) {
  if (utf8Bytes(value + character) > max) break;
  value += character;
 }
 return value;
}
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function widgetRows(kind: WidgetKind, locale: WidgetLocale): [string, string][] {
 const c = widgetCopy[locale];
 if (kind === 'order') return [['name', c.name], ['reference', c.reference], ['status', c.status]];
 if (kind === 'service') return [['name', c.name], ['description', c.description], ['price', c.price]];
 if (kind === 'owner') return c.counts.map((label, i) => ['count' + i, label]);
 return [['runtime', c.runtime], ['seen', c.seen], ['projects', c.projects], ['running', c.running], ['unknown', c.unknown]];
}
export function widgetCaption(kind: WidgetKind, state: WidgetState, locale: WidgetLocale) {
 const c = widgetCopy[locale];
 const values: Record<string, unknown> = { ...state };
 state.counts?.forEach((n, i) => { values['count' + i] = n; });
 return [c.brand + ' · ' + c[kind], ...widgetRows(kind, locale).map(([key, label]) => `${label}: ${values[key] ?? c.unknown}`), state.note].filter(Boolean).join('\n');
}
export function widgetTemplate(kind: WidgetKind, locale: WidgetLocale) {
 const c = widgetCopy[locale];
 const rows = widgetRows(kind, locale);
 // Tokens copied from globals.css / orbit/tokens.css. No network, font or library.
 const html = `<html lang="${locale}"><body><style>
body{background:#08070c;color:#f3f0fc;font-family:system-ui,sans-serif;font-size:${locale === 'my' ? 18 : 17}px;line-height:1.8;margin:12px}
h3{color:#d9c9ff;margin:0 0 12px;font-size:20px}p{margin:6px 0;color:#c4bdd8}
section{border-bottom:1px solid #a78bfa37;padding:5px 0}small{display:block;color:#c4bdd8;font-size:14px}strong{display:block;overflow-wrap:anywhere;font-weight:500}
button{min-height:48px;width:100%;margin-top:12px;padding:8px 12px;background:#a78bfa;color:#0b0818;border:0;border-radius:10px;font-size:17px}
button:disabled{background:#100e18;color:#c4bdd8}button:focus-visible{outline:2px solid #c4b5fd}
#feedback{font-size:14px;color:var(--tg-theme-hint-color,#c4bdd8)}
</style><h3>${escape(c[kind])}</h3>${rows.map(([key, label]) => `<section><small>${escape(label)}</small><strong id="${key}"></strong></section>`).join('')}
<p id="note"></p><button id="refresh">${escape(c.refresh)}</button><p id="feedback"></p>
<script>(function(){var W=window.TelegramWidget;if(!W)return;var keys=${JSON.stringify(rows.map(([key]) => key))},revision=-1;
function text(id,value){document.getElementById(id).textContent=String(value==null?'':value)}
function render(){var s;try{s=JSON.parse(W.chatData||'{}')}catch(e){return}if(s.v!==1||s.r<revision)return;revision=s.r;
keys.forEach(function(k){var value=k.indexOf('count')===0?(s.counts||[])[Number(k.slice(5))]:s[k];text(k,value==null?${JSON.stringify(c.unknown)}:value)});text('note',s.note);text('feedback',${JSON.stringify(c.updated)})}
var b=document.getElementById('refresh');b.addEventListener('click',function(){b.disabled=true;text('feedback',${JSON.stringify(c.refreshing)});W.request('refresh').then(function(a){var r;try{r=JSON.parse(a.result||'{}')}catch(e){r={}}text('feedback',r.message||${JSON.stringify(c.updated)});b.disabled=false},function(){text('feedback',${JSON.stringify(c.unavailable)});b.disabled=false})});
W.onEvent('chatDataChanged',render);render();W.ready()})();</script></body></html>`;
 validateWidgetHtml(html);
 return html;
}
export function validateWidgetState(state: WidgetState) { return widgetData(state); }
