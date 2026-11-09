import packs from '../emoji/packs.json' with {type:'json'};
import roles from '../emoji/emoji_roles.json' with {type:'json'};
import catalog from '../emoji/emoji_catalog.json' with {type:'json'};
import savedRoles from '../emoji/emoji_ids.json' with {type:'json'};
import presentation from '../emoji/presentation.json' with {type:'json'};

export const htmlEscape = (value: unknown) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
type Pack = {key:string;name:string;purpose:string;default:string|null;fallback:string};
type Role = {pack:string;emoji:string|null;fallback?:string};
type Emoji = {key:string;pack:string;pack_name:string;fallback:string;custom_emoji_id:string};
export type SavedEmoji={id:string|null;fallback:string;pack:string};
export type RoleMap=Record<string,SavedEmoji>;
const missingRoles=new Set<string>();
export const catalogItems=catalog.emojis;
export const configuredRoles=roles;
export const defaultRoleIds:RoleMap=savedRoles;
export function emojiTools(packList:Pack[], roleMap:Record<string,Role>, items:Emoji[], overrides:RoleMap={}) {
 function resolve(role:string, purposePack?:string){
  const saved=overrides[role];
  const definition=roleMap[role];
  if(!definition&&!saved&&!missingRoles.has(role)){missingRoles.add(role);console.warn('K9 emoji: missing role',role);}
  const pack=packList.find(p=>p.key===(purposePack??saved?.pack??definition?.pack??'CATS'));
  if(!definition&&!saved)return {fallback:pack?.fallback??'🐱',id:undefined};
  if(saved?.pack===pack?.key)return {fallback:saved.fallback,id:saved.id&&/^\d+$/.test(saved.id)?saved.id:undefined};
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
export const emoji=emojiTools(packs,roles,catalog.emojis,savedRoles);
export const e=emoji.e;
export const presentationSettings=presentation;
type Button = {text:string;callback_data?:string;web_app?:{url:string};url?:string;style?:string;icon_custom_emoji_id?:string};
type Markup = {inline_keyboard?:Button[][];[key:string]:unknown};
export function decorateButtons(markup:unknown,custom=true,tools=emoji):unknown {
 if(!markup||typeof markup!=='object'||!Array.isArray((markup as Markup).inline_keyboard))return markup;
 const input=markup as Markup;
 return {...input,inline_keyboard:input.inline_keyboard!.map(row=>row.map(button=>{
  const action=button.callback_data?.split(':').at(-1)??'';
  const hostingAction=button.callback_data?.startsWith('h:')?button.callback_data.split(':')[1]:action;
  const style=(presentation.button_styles as Record<string,string>)[hostingAction]??presentation.default_button_style;
  const icon=typeof button.icon_custom_emoji_id==='string'&&/^\d+$/.test(button.icon_custom_emoji_id)?button.icon_custom_emoji_id:tools.resolve('order','WORK').id;
  const {icon_custom_emoji_id:unusedIcon,style:unusedStyle,...plain}=button;
  void unusedIcon;void unusedStyle;
  return custom?{...plain,style,...(presentation.button_icons&&icon?{icon_custom_emoji_id:icon}:{})}:plain;
 }))};
}

export function customEmojiEntity(message:{text?:string;entities?:{type:string;offset:number;length:number;custom_emoji_id?:string}[]}){
 const text=message.text??'';
 const entity=message.entities?.find(e=>e.type==='custom_emoji'&&typeof e.custom_emoji_id==='string'&&/^\d+$/.test(e.custom_emoji_id));
 if(!entity||!Number.isInteger(entity.offset)||!Number.isInteger(entity.length)||entity.offset<0||entity.length<1||entity.offset+entity.length>text.length)return null;
 // Telegram offsets and JavaScript slice both count UTF-16 code units.
 const fallback=text.slice(entity.offset,entity.offset+entity.length);
 const segments=[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(fallback)];
 if(segments.length!==1||!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(fallback))return null;
 return {id:entity.custom_emoji_id!,fallback};
}
