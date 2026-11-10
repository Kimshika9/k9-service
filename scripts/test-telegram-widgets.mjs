import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mock} from 'node:test';
import vm from 'node:vm';
import {widgetApi,validateWidgetHtml,widgetData,utf8Bytes,TELEGRAM_UPDATES} from '../lib/telegram-widget-api.ts';
import {widgetTemplate,widgetCaption,boundedText} from '../lib/telegram-widget-ui.ts';
import {widgetCopy} from '../lib/i18n/widgets/index.ts';
import {isWidgetQuery,validUpdate,webhookBody} from '../lib/telegram-webhook-validation.ts';
import {respondToWidget} from '../lib/telegram-widget-response.ts';

assert.deepEqual(TELEGRAM_UPDATES,['message','callback_query','widget_query']);
assert.equal(validateWidgetHtml('a'.repeat(32768)).htmlBytes,32768);
for(const html of ['', 'a'.repeat(32769), 'က'.repeat(10923), '\0', '\ud800',randomBytes(17000).toString('base64')])assert.throws(()=>validateWidgetHtml(html));
assert.throws(()=>widgetData({text:'က'.repeat(400)}));
assert.equal(JSON.parse(widgetData({text:'\0'})).text,'\0'); // JSON escapes the raw NUL safely.
assert.ok(utf8Bytes(boundedText('မြန်မာ'.repeat(100),100))<=100);
for(const locale of ['en','my'])for(const kind of ['service','order','owner','hosting']){
 const html=widgetTemplate(kind,locale),size=validateWidgetHtml(html);
 assert.ok(size.compressedBytes<4096);
 assert.doesNotMatch(html,/<(?:input|textarea|select|iframe|object|embed|img|link)\b|\b(?:fetch|XMLHttpRequest|WebSocket|innerHTML|eval)\s*\(|https?:\/\//i);
 assert.match(html,/min-height:48px/);
 assert.match(html,/--tg-theme-hint-color/);
 const c=widgetCopy[locale],state={v:1,r:3,name:'<script>malicious()</script>',reference:'K9-12345678',status:c.statuses.Processing,counts:[1,2,3,4]};
 const nodes=new Map(),events=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,addEventListener:(event,fn)=>events.set(id+':'+event,fn)});return nodes.get(id);};
 const W={chatData:widgetData(state),onEvent:(event,fn)=>events.set(event,fn),ready(){},request(data){requests.push(data);return Promise.resolve({result:widgetData({ok:true,message:c.updated})});}};
 vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1],{window:{TelegramWidget:W},document:{getElementById:node}});
 if(kind==='order'||kind==='service')assert.equal(node('name').textContent,state.name,'customer data must only become literal text nodes');
 assert.ok(widgetCaption(kind,state,locale).includes(c[kind]));
 events.get('refresh:click')();await Promise.resolve();assert.deepEqual(requests,['refresh']);assert.equal(node('refresh').disabled,false);
 W.chatData=widgetData({...state,r:4,status:'new'});events.get('chatDataChanged')();
 W.chatData=widgetData({...state,r:2,status:'old'});events.get('chatDataChanged')();
 if(kind==='order')assert.equal(node('status').textContent,'new','an older state must not replace a newer one');
 console.log(`${locale}/${kind}: HTML ${size.htmlBytes} B, zlib ${size.compressedBytes} B`);
}
const calls=[];const api=widgetApi(async(method,payload,options)=>{calls.push({method,payload,options});return {message_id:10};});
await api.sendWidget({chat_id:'12345',html:'<p>Ready</p>',caption:'Order saved',chat_data:widgetData({v:1})});
await api.answerWidgetQuery('query',widgetData({ok:true}));
await api.editMessageWidgetData({chat_id:'12345',message_id:10,chat_data:''});
assert.deepEqual(calls.map(c=>c.method),['sendWidget','answerWidgetQuery','editMessageWidgetData']);
assert.equal(calls[0].payload.protect_content,true);
assert.equal(calls[0].payload.is_shared,undefined);
assert.equal(calls[1].options.timeoutMs,2500);
await assert.rejects(()=>api.sendWidget({chat_id:'-123',html:'<p>x</p>',caption:'x'}));
await assert.rejects(()=>api.editMessageWidgetData({chat_id:'123',message_id:0,chat_data:'{}'}));
const q={id:'q',from:{id:12345,is_bot:false},chat:{id:12345,type:'private'},message_id:10,chat_instance:'chat',type:{type:'data'},data:'refresh'};
assert.ok(isWidgetQuery(q));assert.ok(validUpdate({update_id:10,widget_query:q}));
for(const bad of [{...q,data:'က'.repeat(22)},{...q,from:{id:'123'}},{...q,type:'data'},{...q,data:''}])assert.equal(isWidgetQuery(bad),false);
assert.equal(validUpdate({update_id:10,widget_query:q,message:{}}),false);
assert.equal(validUpdate({update_id:-1,widget_query:q}),false);
assert.equal(validUpdate({update_id:1,message:{message_id:1,from:{id:1},chat:{id:2,type:'private'}}}),false);
assert.equal(validUpdate({update_id:1,message:{message_id:1,from:{id:1},chat:{id:1,type:'private'},text:42}}),false);
assert.equal(validUpdate({update_id:1,callback_query:{id:'',from:{id:1}}}),false);
const validMessage={message_id:1,from:{id:1,first_name:'Synthetic'},chat:{id:1,type:'private'},text:'❤️',entities:[{type:'custom_emoji',offset:0,length:2,custom_emoji_id:'123'}]};
assert.equal(validUpdate({update_id:1,message:validMessage}),true);
for(const patch of [{from:{id:1,language_code:{invalid:true}}},{entities:{}},{entities:[null]},{entities:[{type:'custom_emoji',offset:'0',length:2}]}])assert.equal(validUpdate({update_id:1,message:{...validMessage,...patch}}),false,'malformed sender/entity fields cannot reach message handlers');
await assert.rejects(()=>webhookBody(new Request('https://localhost',{method:'POST',body:'a'.repeat(100)}),50));
assert.deepEqual(await webhookBody(new Request('https://localhost',{method:'POST',body:'{"update_id":1}'})),{update_id:1});

// Advance the same real production deadlines without sleeping for seconds.
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
mock.timers.enable({apis:['setTimeout','Date']});
try{
 const events=[];
 const pending=respondToWidget(()=>new Promise(()=>{}),async data=>{events.push({at:Date.now(),data:JSON.parse(data)});},async()=>events.push('edited'),'unavailable',()=>{});
 mock.timers.tick(6001);await flush();await pending;
 assert.equal(events.length,1);assert.equal(events[0].data.ok,false);assert.ok(events[0].at<15000);
 const ordered=[];await respondToWidget(async()=>({ok:true,message:'updated'}),async()=>ordered.push('answered'),async()=>{ordered.push('edit');throw new Error('deleted');},'unavailable',stage=>ordered.push(stage));
 assert.deepEqual(ordered,['answered','edit','query edit']);
 let applied=false;const failure=respondToWidget(async()=>({ok:true,message:'updated'}),()=>new Promise(()=>{}),async()=>{applied=true;},'unavailable',()=>{});
 await flush();mock.timers.tick(2501);await flush();await failure;assert.equal(applied,false);
}finally{mock.timers.reset();}
console.log('Widgets: byte/compression limits, sandbox-safe DOM rendering, localization, stale revisions, typed methods, validation, bounded deadlines and answer-before-edit passed.');
