// Never display an upstream HTML error page (or a token-bearing URL) in the UI.
export async function readApiResponse<T extends object=Record<string,unknown>>(response:Response):Promise<T> {
 let data:unknown;
 try { data=await response.json(); } catch { /* Cloudflare/Access errors can be HTML. */ }
 const object=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:null;
 if(response.ok&&object)return object as T;
 if(!response.ok&&typeof object?.error==='string')throw new Error(object.error);
 const ray=response.headers.get('cf-ray')||'';
 const trace=/^[a-zA-Z0-9-]{1,100}$/.test(ray)?` Ray ID: ${ray}.`:'';
 const message=response.status===403?'Access was refused. Check the Worker URL and Cloudflare Access/Security settings.':
 response.status===401?'Telegram sign-in is required. Reopen the Mini App from the bot.':
 response.status===429?'Too many requests. Please wait and retry.':
 response.status>=500?'The service is temporarily unavailable. Please retry.':
 'The server did not return the expected K9 API response. Check the deployed Worker URL.';
 throw new Error(`HTTP ${response.status}. ${message}${trace}`);
}
