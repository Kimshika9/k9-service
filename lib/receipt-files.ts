import {env} from 'cloudflare:workers';
import {ApiError} from './server';
export async function receiptFile(value:FormDataEntryValue|null,max=5*1024*1024){if(!(value instanceof File)||!value.size)throw new ApiError(400,'Choose a receipt image.');if(value.size>max)throw new ApiError(400,`Choose an image smaller than ${max/1024/1024} MB.`);const bytes=new Uint8Array(await value.arrayBuffer());let type='';if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)type='image/jpeg';else if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))type='image/png';else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')type='image/webp';if(!type)throw new ApiError(400,'Use a JPG, PNG or WebP image.');return {bytes,type};}
const chunkSize=512*1024;
const maxImageSize=5*1024*1024;
function storageDb(){if(!env.DB)throw new ApiError(503,'Receipt storage is not available yet.');return env.DB;}
export async function putImage(key:string,file:{bytes:Uint8Array;type:string}){
 if(!file.bytes.length||file.bytes.length>maxImageSize)throw new ApiError(400,'Choose an image smaller than 5 MB.');
 if(env.BUCKET){await env.BUCKET.put(key,file.bytes,{httpMetadata:{contentType:file.type}});return;}
 const db=storageDb();
 const statements=[db.prepare('INSERT INTO receipt_images (key,content_type,size,created_at) VALUES (?,?,?,?)').bind(key,file.type,file.bytes.length,new Date().toISOString())];
 for(let offset=0;offset<file.bytes.length;offset+=chunkSize){const chunk=file.bytes.slice(offset,offset+chunkSize);statements.push(db.prepare('INSERT INTO receipt_chunks (image_key,position,data) VALUES (?,?,?)').bind(key,offset/chunkSize,chunk.buffer));}
 // One transaction: no partially saved files if any chunk fails.
 await db.batch(statements);
}
export async function deleteImage(key:string){
 if(env.BUCKET)await env.BUCKET.delete(key);
 if(env.DB)await env.DB.prepare('DELETE FROM receipt_images WHERE key=?').bind(key).run();
}
export async function imageResponse(key:string){
 const object=env.BUCKET?await env.BUCKET.get(key):null;
 let body:BodyInit,type:string;
 if(object){body=object.body;type=object.httpMetadata?.contentType||'image/png';}
 else{
  const db=storageDb(),meta=await db.prepare('SELECT content_type,size FROM receipt_images WHERE key=?').bind(key).first<{content_type:string;size:number}>();
  if(!meta)throw new ApiError(404,'Image not found.');
  if(meta.size<=0||meta.size>maxImageSize)throw new ApiError(500,'Stored image is invalid.');
  const rows=await db.prepare('SELECT position,data FROM receipt_chunks WHERE image_key=? ORDER BY position').bind(key).all<{position:number;data:number[]|ArrayBuffer}>();
  const bytes=new Uint8Array(meta.size);let offset=0;
  for(let i=0;i<rows.results.length;i++){const row=rows.results[i],chunk=new Uint8Array(row.data);if(row.position!==i||offset+chunk.length>bytes.length)throw new ApiError(500,'Stored image is incomplete.');bytes.set(chunk,offset);offset+=chunk.length;}
  if(offset!==bytes.length)throw new ApiError(500,'Stored image is incomplete.');
  body=bytes.buffer;type=meta.content_type;
 }
 return new Response(body,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
