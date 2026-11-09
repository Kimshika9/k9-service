import assert from 'node:assert/strict';
import {customEmojiEntity,emojiTools,defaultRoleIds,catalogItems,configuredRoles} from '../lib/emoji.ts';
import {presenter} from '../lib/telegram-presentation.ts';
import packs from '../emoji/packs.json' with {type:'json'};
const heart='5278611606756942667';
assert.deepEqual(customEmojiEntity({text:'😀 xx ❤️',entities:[{type:'custom_emoji',offset:6,length:2,custom_emoji_id:heart}]}),{id:heart,fallback:'❤️'});
assert.equal(customEmojiEntity({text:'❤️',entities:[{type:'custom_emoji',offset:-1,length:2,custom_emoji_id:heart}]}),null);
assert.equal(customEmojiEntity({text:'AB',entities:[{type:'custom_emoji',offset:0,length:2,custom_emoji_id:heart}]}),null);
for(const [role,value] of Object.entries(defaultRoleIds)){
 assert.equal(typeof value.id,'string');
 assert.ok(catalogItems.some(item=>item.custom_emoji_id===value.id&&item.pack===value.pack),role+' ID must come from its actual pack');
}
const tools=emojiTools(packs,configuredRoles,catalogItems,{...defaultRoleIds,order:{id:heart,fallback:'❤️',pack:'WORK'}});
const removed=emojiTools(packs,configuredRoles,catalogItems,{...defaultRoleIds,order:{id:null,fallback:'❤️',pack:'WORK'}});
assert.equal(removed.e('order'),'❤️','delete overrides the shipped default');
let calls=[];
const err=(message,code=400)=>Object.assign(new Error(message),{code});
let mode='rich';
const api=async(method,body)=>{
 calls.push({method,body});
 if(mode==='network')throw err('unreachable',503);
 if(mode==='forbidden')throw err('Forbidden',403);
 if(mode==='parse'&&JSON.stringify(body).includes('tg-emoji'))throw err("Bad Request: can't parse entities");
 if(mode==='rich-rejected'&&body.rich_message)throw err('Rich message rejected');
 return {message_id:7,...(body.rich_message?{rich_message:{blocks:[]}}:{})};
};
const send=presenter(api,tools);
await send.send('1','K9 SERVICE\n<User> & details',{inline_keyboard:[[{text:'Confirm',callback_data:'confirm'}]]});
assert.equal(calls[0].method,'sendRichMessage');
assert.match(calls[0].body.rich_message.html,/<h2><tg-emoji emoji-id="5278611606756942667">❤️<\/tg-emoji> K9 SERVICE<\/h2>/);
assert.match(calls[0].body.rich_message.html,/&lt;User&gt; &amp; details/);
assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,heart);
mode='rich-rejected';calls=[];
await send.edit('1',7,'Order\n<script>');
assert.equal(calls.at(-1).method,'editMessageText');assert.equal(calls.at(-1).body.parse_mode,'HTML');
assert.match(calls.at(-1).body.text,/&lt;script&gt;/);
mode='parse';calls=[];await send.send('1','Title');
assert.equal(calls.at(-1).method,'sendRichMessage');assert.doesNotMatch(calls.at(-1).body.rich_message.html,/<tg-emoji/);
for(const failure of ['network','forbidden']){
 mode=failure;calls=[];await assert.rejects(send.send('1','Title'));assert.equal(calls.length,1);
}
console.log('Emoji delivery: real pack IDs, UTF-16, deletion, rich heading, escaping, button icons, HTML edits, selective logged fallback and error propagation passed.');
