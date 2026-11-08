import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './errors';
import { getDatabase, getRecord, photosDirectory } from './db';
import type { Database, Queryable } from './database';

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
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/.test(filename))throw new ApiError(400,'Invalid photo path.');
  const root=photosDirectory();
  const target=path.resolve(root,filename);
  if(path.dirname(target)!==root)throw new ApiError(400,'Invalid photo path.');
  return target;
}

const samePath=(left:string,right:string)=>process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';

/** Private storage must not traverse symlinks or Windows directory junctions. */
async function verifiedPhotoDirectory(create:boolean) {
  const root=photosDirectory();
  const parsed=path.parse(root);
  let directory=parsed.root;
  for(const component of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    directory=path.join(directory,component);
    if(create) {
      try { await mkdir(directory,{mode:0o700}); }
      catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error; }
    }
    const info=await lstat(directory);
    if(info.isSymbolicLink()||!info.isDirectory())throw new ApiError(400,'Invalid photo storage directory.');
  }
  if(!samePath(await realpath(root),root))throw new ApiError(400,'Invalid photo storage directory.');
  return root;
}

async function lockOwner(db:Queryable,profileId:string) {
  if(!(await db.query('SELECT id FROM "Profile" WHERE id=$1 FOR UPDATE',[profileId])).rows.length)throw new ApiError(404,'Record not found.');
}

async function lockSession(db:Queryable,profileId:string,sessionId:string) {
  if(!(await db.query('SELECT id FROM "PracticeSession" WHERE id=$1 AND "profileId"=$2 FOR SHARE',[sessionId,profileId])).rows.length)throw new ApiError(404,'Record not found.');
}

export async function savePhoto(profileId:string,sessionId:string,file:File) {
  const db=getDatabase();
  await getRecord('PracticeSession',profileId,sessionId,db);
  if(file.size>MAX_IMAGE_BYTES)throw new ApiError(413,'Choose an image smaller than 5 MB.');
  const normalized=await validateImage(new Uint8Array(await file.arrayBuffer()),file.type);
  const id=randomUUID(),filename=`${id}.jpg`,createdAt=new Date().toISOString();
  let created=false;
  try {
    await db.transaction(async tx=>{
      // Serializes the per-owner photo cap and account deletion, while the
      // session lock prevents its removal between ownership validation/insert.
      await lockOwner(tx,profileId);
      await lockSession(tx,profileId,sessionId);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`midnight-ink-photo:${filename}`]);
      const count=(await tx.query('SELECT COUNT(*) AS n FROM "PracticePhoto" WHERE "profileId"=$1',[profileId])).rows[0].n;
      if(Number(count)>=200)throw new ApiError(413,'This local workspace supports 200 practice photos. Export and remove older work before adding more.');
      await verifiedPhotoDirectory(true);
      const handle=await open(safePhotoPath(filename),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
      created=true;
      try { await handle.writeFile(normalized.buffer); }
      finally { await handle.close(); }
      await tx.query('INSERT INTO "PracticePhoto"(id,"profileId","sessionId",filename,"mimeType",width,height,size,"createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,profileId,sessionId,filename,normalized.mimeType,normalized.width,normalized.height,normalized.size,createdAt]);
    });
  } catch(error) {
    if(created) {
      let persisted:boolean;
      try {
        persisted=await db.transaction(async tx=>{
          // A lost COMMIT acknowledgement is ambiguous. Wait for the original
          // owner lock to finish, then inspect metadata using a fresh snapshot.
          await tx.query('SELECT id FROM "Profile" WHERE id=$1 FOR UPDATE',[profileId]);
          return (await tx.query('SELECT id FROM "PracticePhoto" WHERE id=$1 AND "profileId"=$2 AND filename=$3',[id,profileId,filename])).rows.length>0;
        });
      } catch {
        // Never destroy possibly committed bytes while PostgreSQL is down.
        // If it reconnects, the outbox can safely reconcile this filename.
        try { await db.query('INSERT INTO "PhotoDeletionQueue"(filename) VALUES($1) ON CONFLICT(filename) DO NOTHING',[filename]); } catch { /* Preserve the private file for operator reconciliation. */ }
        throw error;
      }
      if(persisted)return {id,sessionId,mimeType:normalized.mimeType,width:normalized.width,height:normalized.height,size:normalized.size,createdAt,url:`/api/photos/${id}`};
      try { await verifiedPhotoDirectory(false); await unlink(safePhotoPath(filename)); }
      catch(cleanupError) {
        if(!missing(cleanupError)) {
          // A failed upload has no metadata row to trigger the deletion outbox.
          // Retain a durable retry if an antivirus/file lock prevents cleanup.
          try { await db.query('INSERT INTO "PhotoDeletionQueue"(filename) VALUES($1) ON CONFLICT(filename) DO NOTHING',[filename]); }
          catch(queueError) { throw new AggregateError([error,cleanupError,queueError],'Photo upload and cleanup failed.'); }
        }
      }
    }
    throw error;
  }
  return {id,sessionId,mimeType:normalized.mimeType,width:normalized.width,height:normalized.height,size:normalized.size,createdAt,url:`/api/photos/${id}`};
}

export async function readPhoto(profileId:string,id:string) {
  const row=(await getDatabase().query('SELECT p.filename,p."mimeType" FROM "PracticePhoto" p JOIN "PracticeSession" s ON s.id=p."sessionId" AND s."profileId"=p."profileId" WHERE p."profileId"=$1 AND p.id=$2',[profileId,id])).rows[0];
  if(!row)throw new ApiError(404,'Photo not found.');
  try {
    await verifiedPhotoDirectory(false);
    const filename=safePhotoPath(String(row.filename));
    const before=await lstat(filename);
    if(before.isSymbolicLink()||!before.isFile()||!samePath(await realpath(filename),filename))throw new ApiError(400,'Invalid photo path.');
    const handle=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const actual=await handle.stat();
      const current=await lstat(filename);
      if(!actual.isFile()||current.isSymbolicLink()||actual.dev!==current.dev||actual.ino!==current.ino||!samePath(await realpath(filename),filename))throw new ApiError(400,'Invalid photo path.');
      return {buffer:await handle.readFile(),mimeType:String(row.mimeType)};
    } finally { await handle.close(); }
  }
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(404,'Photo file not found.');}
}

/**
 * The database trigger commits a deletion queue with every metadata deletion,
 * including cascades. Files are removed only after that transaction commits.
 * Transient Windows file locks leave a retryable queue row, never a false claim
 * that a PostgreSQL rollback can restore an already deleted file.
 */
export async function flushPhotoDeletionQueue(db:Database=getDatabase(),limit=50) {
  const boundedLimit=Number.isInteger(limit)?Math.max(1,Math.min(limit,200)):50;
  const rows=(await db.query('SELECT filename FROM "PhotoDeletionQueue" ORDER BY "createdAt",filename LIMIT $1',[boundedLimit])).rows;
  const result={processed:rows.length,deleted:0,failed:0};
  for(const row of rows) {
    const filename=String(row.filename);
    const removed=await db.transaction(async tx=>{
      // Serialize with an upload whose COMMIT may still be in flight. The next
      // statement gets a fresh snapshot after that upload has ended.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`midnight-ink-photo:${filename}`]);
      // A live metadata reference wins; discard only its stale retry entry.
      if(!(await tx.query('SELECT id FROM "PracticePhoto" WHERE filename=$1',[filename])).rows.length) {
        try {
          const target=safePhotoPath(filename);
          await verifiedPhotoDirectory(false);
          const info=await lstat(target);
          if(info.isSymbolicLink()||!info.isFile())throw new ApiError(400,'Invalid photo path.');
          await unlink(target);
        } catch(error) {
          if(!missing(error))return false;
        }
      }
      await tx.query('DELETE FROM "PhotoDeletionQueue" WHERE filename=$1',[filename]);
      return true;
    });
    if(removed)result.deleted++;else result.failed++;
  }
  return result;
}

export async function removePhotos(profileId:string,sessionId?:string,id?:string) {
  const db=getDatabase();
  await db.transaction(async tx=>{
    await lockOwner(tx,profileId);
    if(sessionId)await lockSession(tx,profileId,sessionId);
    const args:unknown[]=[profileId];
    const conditions=['p."profileId"=$1'];
    if(sessionId) { args.push(sessionId); conditions.push(`p."sessionId"=$${args.length}`); }
    if(id) { args.push(id); conditions.push(`p.id=$${args.length}`); }
    const rows=(await tx.query(`SELECT p.id FROM "PracticePhoto" p JOIN "PracticeSession" s ON s.id=p."sessionId" AND s."profileId"=p."profileId" WHERE ${conditions.join(' AND ')} FOR UPDATE OF p FOR SHARE OF s`,args)).rows;
    if(id&&!rows.length)throw new ApiError(404,'Photo not found.');
    for(const row of rows)await tx.query('DELETE FROM "PracticePhoto" WHERE id=$1 AND "profileId"=$2',[row.id,profileId]);
  });
  // Metadata deletion is already committed; a cleanup connection failure must
  // not turn that successful deletion into an apparent transaction failure.
  try { await flushPhotoDeletionQueue(db,200); } catch { /* Durable retry remains queued. */ }
}
