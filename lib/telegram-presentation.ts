import {decorateButtons,htmlEscape,emoji,presentationSettings} from './emoji.ts';

type Message={message_id:number;rich_message?:unknown;[key:string]:unknown};
type Api=(method:string,payload:Record<string,unknown>)=>Promise<Message>;
export const stripCustomEmoji=(text:string)=>text.replace(/<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi,'$1');
const description=(err:unknown)=>err instanceof Error?err.message:'Telegram request failed';
const code=(err:unknown)=>(err as {code?:number})?.code;
const emojiError=(err:unknown)=>code(err)===400&&/custom.?emoji|parse.?entities|parsing.?entities|emoji.?id/i.test(description(err));
const richError=(err:unknown)=>[400,404].includes(code(err)??0)&&/rich|html|parse|entit|emoji|button|reply.?markup|method|not supported/i.test(description(err));
function log(stage:string,err:unknown){console.warn('K9 presentation fallback:',stage,description(err));}
export function presentationHtml(text:string,icon:string){
 const [title,...lines]=text.split('\n');
 return {rich:`<h2>${icon} ${htmlEscape(title)}</h2>`+lines.join('\n').split('\n\n').filter(Boolean).map(p=>`<p>${htmlEscape(p).replaceAll('\n','<br>')}</p>`).join(''),
  html:`${icon} <b>${htmlEscape(title)}</b>${lines.length?'\n'+htmlEscape(lines.join('\n')):''}`};
}
export function presenter(api:Api,tools=emoji){
 async function deliver(chat:string,text:string,markup:unknown,role:string,richHtml?:string,messageId?:number){
  const editing=messageId!==undefined;
  const fields={chat_id:chat,...(editing?{message_id:messageId}:{})};
  const content=presentationHtml(text,tools.e(role));
  // The emoji belongs in the title line, never in a separate paragraph.
  const rich=richHtml?`<p>${tools.e(role)} <b>K9 SERVICE</b></p>`+richHtml:content.rich;
  const marked=decorateButtons(markup,true,tools);
  if(presentationSettings.rich_messages){
   try{return await api(editing?'editMessageText':'sendRichMessage',{...fields,rich_message:{html:rich},reply_markup:marked});}
   catch(err){
    if(editing&&/message is not modified/i.test(description(err)))return {message_id:messageId!};
    if(!richError(err))throw err;
    log('rich HTML',err);
    if(emojiError(err)||/button|reply.?markup/i.test(description(err))){
     try{return await api(editing?'editMessageText':'sendRichMessage',{...fields,rich_message:{html:stripCustomEmoji(rich)},reply_markup:decorateButtons(markup,false,tools)});}
     catch(retry){if(!richError(retry))throw retry;log('rich HTML without custom emoji',retry);}
    }
   }
  }
  const method=editing?'editMessageText':'sendMessage';
  try{return await api(method,{...fields,text:content.html,parse_mode:'HTML',reply_markup:marked});}
  catch(err){
   if(editing&&/message is not modified/i.test(description(err)))return {message_id:messageId!};
   if(!emojiError(err)&&!(code(err)===400&&/button|reply.?markup/i.test(description(err))))throw err;
   log('HTML custom emoji',err);
   return api(method,{...fields,text:stripCustomEmoji(content.html),parse_mode:'HTML',reply_markup:decorateButtons(markup,false,tools)});
  }
 }
 return {
  send:(chat:string,text:string,markup?:unknown,role='order',richHtml?:string)=>deliver(chat,text,markup,role,richHtml),
  edit:(chat:string,messageId:number,text:string,markup?:unknown,role='order',richHtml?:string)=>deliver(chat,text,markup,role,richHtml,messageId),
 };
}
