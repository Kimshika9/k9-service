// The cookie contains Telegram-signed initData, verified on every authenticated request.
// Its expiry never extends Telegram's one-hour auth_date window.
const cookieName='__Host-k9-telegram';
export function telegramCookie(request:Request){
 const values=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
 if(values.length!==1)return '';
 try{return decodeURIComponent(values[0].slice(cookieName.length+1))}catch{return ''}
}
export function rememberTelegram(response:Response,request:Request){
 const raw=request.headers.get('x-telegram-init-data');
 if(!raw)return response;
 const value=encodeURIComponent(raw);
 if(value.length>3500)return response;
 const authDate=Number(new URLSearchParams(raw).get('auth_date'));
 const maxAge=Math.max(0,Math.min(3600,Math.floor(authDate+3600-Date.now()/1000)));
 response.headers.append('Set-Cookie',`${cookieName}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`);
 return response;
}
export const clearTelegramCookie=()=>`${cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
