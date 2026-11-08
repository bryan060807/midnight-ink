import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ApiError } from './auth';
import { getDatabase, getRecord, photosDirectory } from './db';

export const MAX_IMAGE_BYTES=5*1024*1024;
export function sniffImageType(bytes:Uint8Array):'image/png'|'image/jpeg'|'image/webp'|null {
  const b=Buffer.from(bytes);
  if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}

/** Decode and re-encode every image. Original metadata and filenames are discarded. */
export async function validateImage(bytes:Uint8Array,mimeType?:string) {
  if(bytes.byteLength===0||bytes.byteLength>MAX_IMAGE_BYTES)throw new ApiError(413,'Choose a nonempty image smaller than 5 MB.');
  const detected=sniffImageType(bytes);
  if(!detected||mimeType&&mimeType!==detected)throw new ApiError(400,'Only actual PNG, JPEG, or WebP images with a matching content type are accepted.');
  try {
    const image=sharp(Buffer.from(bytes),{limitInputPixels:20_000_000,animated:false,failOn:'warning'});
    const metadata=await image.metadata();
    if(!metadata.width||!metadata.height||(metadata.pages??1)>1)throw new Error('Invalid dimensions or animated image.');
    const {data,info}=await image.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer({resolveWithObject:true});
    return {buffer:data,mimeType:'image/jpeg',width:info.width,height:info.height,size:data.length};
  }catch{throw new ApiError(400,'This image could not be decoded safely. Try a standard still PNG, JPEG, or WebP image.');}
}

export function safePhotoPath(filename:string) {
  if(!/^[a-f0-9-]{36}\.jpg$/.test(filename))throw new ApiError(400,'Invalid photo path.');
  const root=photosDirectory();
  const target=path.resolve(root,filename);
  if(path.dirname(target)!==root)throw new ApiError(400,'Invalid photo path.');
  return target;
}

export async function savePhoto(profileId:string,sessionId:string,file:File) {
  const db=getDatabase();
  getRecord('PracticeSession',profileId,sessionId,db);
  const count=db.prepare('SELECT COUNT(*) AS n FROM PracticePhoto WHERE profileId=?').get(profileId)?.n;
  if(Number(count)>=200)throw new ApiError(413,'This local workspace supports 200 practice photos. Export and remove older work before adding more.');
  if(file.size>MAX_IMAGE_BYTES)throw new ApiError(413,'Choose an image smaller than 5 MB.');
  const normalized=await validateImage(new Uint8Array(await file.arrayBuffer()),file.type);
  const id=randomUUID(),filename=`${id}.jpg`,createdAt=new Date().toISOString();
  mkdirSync(photosDirectory(),{recursive:true,mode:0o700});
  writeFileSync(safePhotoPath(filename),normalized.buffer,{mode:0o600,flag:'wx'});
  try {db.prepare('INSERT INTO PracticePhoto(id,profileId,sessionId,filename,mimeType,width,height,size,createdAt) VALUES(?,?,?,?,?,?,?,?,?)').run(id,profileId,sessionId,filename,normalized.mimeType,normalized.width,normalized.height,normalized.size,createdAt);}
  catch(error){unlinkSync(safePhotoPath(filename));throw error;}
  return {id,sessionId,mimeType:normalized.mimeType,width:normalized.width,height:normalized.height,size:normalized.size,createdAt,url:`/api/photos/${id}`};
}

export function readPhoto(profileId:string,id:string) {
  const row=getDatabase().prepare('SELECT filename,mimeType FROM PracticePhoto WHERE profileId=? AND id=?').get(profileId,id);
  if(!row)throw new ApiError(404,'Photo not found.');
  try{return {buffer:readFileSync(safePhotoPath(String(row.filename))),mimeType:String(row.mimeType)};}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(404,'Photo file not found.');}
}

export function removePhotos(profileId:string,sessionId?:string,id?:string) {
  const db=getDatabase();
  const where=`profileId=?${sessionId?' AND sessionId=?':''}${id?' AND id=?':''}`;
  const args=[profileId,...(sessionId?[sessionId]:[]),...(id?[id]:[])];
  const rows=db.prepare(`SELECT id,filename FROM PracticePhoto WHERE ${where}`).all(...args);
  if(id&&!rows.length)throw new ApiError(404,'Photo not found.');
  for(const row of rows){
    try{unlinkSync(safePhotoPath(String(row.filename)));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    db.prepare('DELETE FROM PracticePhoto WHERE profileId=? AND id=?').run(profileId,String(row.id));
  }
}
