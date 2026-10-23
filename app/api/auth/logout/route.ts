import {clearTelegramCookie} from '../../../../lib/telegram-session';
import {sameOrigin,error} from '../../../../lib/server';
export async function POST(request:Request){try{sameOrigin(request);return new Response(null,{status:204,headers:{'Set-Cookie':clearTelegramCookie(),'Cache-Control':'no-store'}})}catch(e){return error(e)}}
