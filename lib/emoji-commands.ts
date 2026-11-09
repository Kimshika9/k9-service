import {getDb} from '../db';
import {botSessions} from '../db/schema';
import {eq} from 'drizzle-orm';
import packs from '../emoji/packs.json' with {type:'json'};
import {customEmojiEntity,loadEmojiRoles,saveEmojiRole} from './emoji-manager';
import {sendPresented,telegram} from './telegram';

type Incoming=Parameters<typeof customEmojiEntity>[0];
const commandPattern=/^\/(addemoji|emojis|delemoji|emojitest)(?:@\w+)?(?:\s|$)/i;
export async function emojiCommands(chat:string,isOwner:boolean,message:Incoming):Promise<boolean>{
 const text=message.text??'',isCommand=commandPattern.test(text);
 if(!isOwner){if(isCommand){await sendPresented(chat,'Owner access required.');return true;}return false;}
 const saved=await getDb().select().from(botSessions).where(eq(botSessions.chatId,chat)).get();
 let pending:{step:string;role:string;pack?:string}|undefined;
 try{pending=saved&&Date.now()-Date.parse(saved.updatedAt)<600000?JSON.parse(saved.data):undefined;}catch{}
 const clear=()=>getDb().delete(botSessions).where(eq(botSessions.chatId,chat));
 if(pending?.step==='emoji-add'&&/^\/cancel(?:@\w+)?$/.test(text)){
  await clear();await sendPresented(chat,'Emoji selection cancelled.');return true;
 }
 if(isCommand){
  const [raw,role,packArg]=text.trim().split(/\s+/),command=raw.split('@')[0].toLowerCase();
  const roles=await loadEmojiRoles();
  if(command==='/emojis'){
   const entries=Object.entries(roles).filter(([,value])=>value.id!==null);
   const lines=entries.map(([name,value])=>`${name} · ${value.pack}\nID: ${value.id}`);
   for(let i=0;i<lines.length;i+=12)await sendPresented(chat,'K9 EMOJI ROLES\n\n'+lines.slice(i,i+12).join('\n\n'));
   if(!entries.length)await sendPresented(chat,'No custom emoji roles saved. Use /addemoji welcome and send an emoji.');
   return true;
  }
  if(command==='/emojitest'){
   const entries=Object.entries(roles).filter(([,value])=>value.id!==null);
   // One role per message keeps every message within the 1–3 icon limit.
   for(const [name,value] of entries){
    const result=await sendPresented(chat,`K9 EMOJI TEST · ${name}\nPack: ${value.pack}\nCustom emoji in the title and a custom button icon.`,{inline_keyboard:[[{text:'Preview '+name,callback_data:'emoji:preview',style:'primary',icon_custom_emoji_id:value.id}]]},name);
    console.info('K9 emojitest:',name,result.rich_message?'rich':'HTML fallback');
   }
   if(!entries.length)await sendPresented(chat,'No saved emoji roles to test. Use /addemoji welcome first.');
   return true;
  }
  if(!role||!/^[a-z][a-z0-9_]{0,31}$/.test(role)){
   await sendPresented(chat,'Use /addemoji role [PACK] or /delemoji role. Example: /addemoji welcome CATS');return true;
  }
  if(command==='/delemoji'){
   if(!roles[role]){await sendPresented(chat,'That emoji role does not exist.');return true;}
   await saveEmojiRole(role,{...roles[role],id:null});await clear();
   await sendPresented(chat,`Removed custom emoji for ${role}. Its normal fallback remains available.`);return true;
  }
  const pack=packArg?.toUpperCase()??roles[role]?.pack;
  if(pack&&!packs.some(p=>p.key===pack)){await sendPresented(chat,'Choose a configured pack: '+packs.map(p=>p.key).join(', '));return true;}
  const data=JSON.stringify({step:'emoji-add',role,pack});
  await getDb().insert(botSessions).values({chatId:chat,data,updatedAt:new Date().toISOString()}).onConflictDoUpdate({target:botSessions.chatId,set:{data,updatedAt:new Date().toISOString()}});
  await sendPresented(chat,`SET EMOJI · ${role}\nSend one Premium emoji${pack?' from '+pack:''} within 10 minutes.\n/cancel to stop.`);return true;
 }
 if(pending?.step!=='emoji-add'||text.startsWith('/'))return false;
 const entity=customEmojiEntity(message);
 if(!entity){await sendPresented(chat,'Send a Premium emoji as a text message. A sticker, image or normal emoji has no custom emoji entity.');return true;}
 let stickers:{set_name?:string;custom_emoji_id?:string;emoji?:string}[];
 try{stickers=await telegram('getCustomEmojiStickers',{custom_emoji_ids:[entity.id]});}
 catch(err){if((err as {code?:number}).code!==400)throw err;console.warn('K9 emoji: Telegram rejected the supplied emoji entity');await sendPresented(chat,'Telegram could not read that custom emoji. Please send one from the configured pack again.');return true;}
 const sticker=stickers.find(s=>s.custom_emoji_id===entity.id);
 const pack=packs.find(p=>p.name===sticker?.set_name);
 if(!pack||pending.pack&&pending.pack!==pack.key){await sendPresented(chat,'That emoji belongs to a different pack. Send one from '+(pending.pack??'a pack in packs.json')+'.');return true;}
 await saveEmojiRole(pending.role,{...entity,pack:pack.key});await clear();
 await sendPresented(chat,`EMOJI SAVED · ${pending.role}\nPack: ${pack.key}\nUse /emojitest to check the message and button.`,undefined,pending.role);
 // IDs appear only in the explicit owner-only /emojis diagnostic.
 return true;
}
