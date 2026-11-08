import packs from '../emoji/packs.json' with {type:'json'};
import roles from '../emoji/emoji_roles.json' with {type:'json'};
import catalog from '../emoji/emoji_ids.json' with {type:'json'};
import presentation from '../emoji/presentation.json' with {type:'json'};

export const htmlEscape = (value: unknown) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
type Pack = {key:string;name:string;purpose:string;default:string|null;fallback:string};
type Role = {pack:string;emoji:string|null;fallback?:string};
type Emoji = {key:string;pack:string;pack_name:string;fallback:string;custom_emoji_id:string};
export function emojiTools(packList:Pack[], roleMap:Record<string,Role>, items:Emoji[]) {
 function resolve(role:string, purposePack?:string){
  const definition=roleMap[role];
  const pack=packList.find(p=>p.key===(purposePack??definition?.pack??'CATS'));
  const fallback=(definition?.pack===pack?.key?definition?.fallback:undefined)??pack?.fallback??'🐱';
  const key=definition?.pack===pack?.key?definition?.emoji:null;
  const item=items.find(i=>i.key===(key??pack?.default)&&i.pack===pack?.key&&i.pack_name===pack?.name&&/^\d+$/.test(i.custom_emoji_id));
  return {fallback:item?.fallback||fallback,id:item?.custom_emoji_id};
 }
 return {resolve,e:(role:string,purposePack?:string,custom=true)=>{
  const item=resolve(role,purposePack);
  return custom&&item.id?`<tg-emoji emoji-id="${item.id}">${htmlEscape(item.fallback)}</tg-emoji>`:htmlEscape(item.fallback);
 }};
}
export const emoji=emojiTools(packs,roles,catalog.emojis);
export const e=emoji.e;
export const presentationSettings=presentation;
type Button = {text:string;callback_data?:string;web_app?:{url:string};url?:string;style?:string;icon_custom_emoji_id?:string};
type Markup = {inline_keyboard?:Button[][];[key:string]:unknown};
export function decorateButtons(markup:unknown,custom=true):unknown {
 if(!markup||typeof markup!=='object'||!Array.isArray((markup as Markup).inline_keyboard))return markup;
 const input=markup as Markup;
 return {...input,inline_keyboard:input.inline_keyboard!.map(row=>row.map(button=>{
  const action=button.callback_data?.split(':').at(-1)??'';
  const hostingAction=button.callback_data?.startsWith('h:')?button.callback_data.split(':')[1]:action;
  const style=(presentation.button_styles as Record<string,string>)[hostingAction]??presentation.default_button_style;
  const icon=emoji.resolve('order','WORK').id;
  const {icon_custom_emoji_id:unusedIcon,style:unusedStyle,...plain}=button;
  void unusedIcon;void unusedStyle;
  return custom?{...plain,style,...(presentation.button_icons&&icon?{icon_custom_emoji_id:icon}:{})}:plain;
 }))};
}
