import {getDb} from '../db';
import {settings} from '../db/schema';
import {like} from 'drizzle-orm';
import packs from '../emoji/packs.json' with {type:'json'};
import defaults from '../emoji/emoji_ids.json' with {type:'json'};
import {emojiTools, type SavedEmoji, type RoleMap, catalogItems, configuredRoles} from './emoji';

const prefix='telegram.emoji.';
export async function loadEmojiRoles():Promise<RoleMap>{
 const roles:RoleMap={...defaults};
 for(const row of await getDb().select().from(settings).where(like(settings.key,prefix+'%')).all()){
  try{const value=JSON.parse(row.value) as SavedEmoji;if(value&&typeof value.pack==='string'&&typeof value.fallback==='string'&&(value.id===null||typeof value.id==='string'&&/^\d+$/.test(value.id)))roles[row.key.slice(prefix.length)]=value;}catch{console.warn('K9 emoji: ignored invalid saved role');}
 }
 return roles;
}
export async function loadEmoji(){return emojiTools(packs,configuredRoles,catalogItems,await loadEmojiRoles());}
export async function saveEmojiRole(role:string,value:SavedEmoji){
 if(!/^[a-z][a-z0-9_]{0,31}$/.test(role)||!packs.some(p=>p.key===value.pack)||value.id!==null&&!/^\d+$/.test(value.id))throw new Error('Invalid emoji role');
 const key=prefix+role,data=JSON.stringify(value);
 await getDb().insert(settings).values({key,value:data}).onConflictDoUpdate({target:settings.key,set:{value:data}});
}
export {customEmojiEntity} from './emoji';
