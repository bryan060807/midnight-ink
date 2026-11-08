import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRecord, deleteRecord, getDatabase, photosDirectory } from '../src/lib/db';
import { exercises } from '../src/lib/curriculum';
import { flushPhotoDeletionQueue, readPhoto, removePhotos, savePhoto } from '../src/lib/uploads';
import { configureTestDatabase } from './fixtures/database';

let fixture:Awaited<ReturnType<typeof configureTestDatabase>>;
let directory:string;
let sessionId:string;
let image:Buffer;
const owner='local-demo';
const filename=(id:string)=>path.join(photosDirectory(),`${id}.jpg`);
const upload=()=>new File([new Uint8Array(image)],'untrusted-original-name.png',{type:'image/png'});

beforeEach(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'midnight-ink-photos-'));
  vi.stubEnv('MIDNIGHT_INK_DATA_DIR',directory);
  fixture=await configureTestDatabase();
  sessionId=String((await createRecord('PracticeSession',owner,{exerciseId:exercises[0].id,durationMinutes:5},fixture.db)).id);
  image=await sharp({create:{width:32,height:24,channels:3,background:'#ae6e55'}}).png().toBuffer();
});

afterEach(async()=>{
  vi.restoreAllMocks();
  if(fixture)await fixture.cleanup();
  if(directory)await rm(directory,{recursive:true,force:true});
  vi.unstubAllEnvs();
});

describe('PostgreSQL photo ownership, filesystem safety, and cleanup',()=>{
  it('stores normalized JPEG bytes privately under a generated filename',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    expect(photo).toMatchObject({sessionId,mimeType:'image/jpeg',width:32,height:24});
    expect(await readdir(photosDirectory())).toEqual([`${photo.id}.jpg`]);
    const result=await readPhoto(owner,photo.id);
    expect(result.mimeType).toBe('image/jpeg');
    const metadata=await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();
    if(process.platform!=='win32')expect((await stat(filename(photo.id))).mode&0o777).toBe(0o600);
  });

  it('rejects another owner before reading, writing, or deleting the photo',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    const stamp=new Date().toISOString();
    await fixture.db.query('INSERT INTO "Profile"(id,name,level,path,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$5)',['other-owner','Other','beginner','foundations',stamp]);
    await expect(readPhoto('other-owner',photo.id)).rejects.toMatchObject({status:404});
    await expect(savePhoto('other-owner',sessionId,upload())).rejects.toMatchObject({status:404});
    await expect(removePhotos('other-owner',undefined,photo.id)).rejects.toMatchObject({status:404});
    expect((await readPhoto(owner,photo.id)).buffer).toEqual(await readFile(filename(photo.id)));
  });

  it('serializes simultaneous uploads at the 200-photo owner limit',async()=>{
    await fixture.db.query(`INSERT INTO "PracticePhoto"(id,"profileId","sessionId",filename,"mimeType",width,height,size,"createdAt")
      SELECT 'existing-'||n,$1,$2,'00000000-0000-0000-0000-'||lpad(n::text,12,'0')||'.jpg','image/jpeg',1,1,1,$3
      FROM generate_series(1,199) AS n`,[owner,sessionId,new Date().toISOString()]);
    const attempts=await Promise.allSettled([savePhoto(owner,sessionId,upload()),savePhoto(owner,sessionId,upload())]);
    expect(attempts.filter(attempt=>attempt.status==='fulfilled')).toHaveLength(1);
    const rejected=attempts.find(attempt=>attempt.status==='rejected');
    expect(rejected?.status==='rejected'&&rejected.reason.status).toBe(413);
    expect(Number((await fixture.db.query('SELECT COUNT(*) AS n FROM "PracticePhoto" WHERE "profileId"=$1',[owner])).rows[0].n)).toBe(200);
    expect(await readdir(photosDirectory())).toHaveLength(1);
  });

  it('removes a written file if the upload transaction rolls back',async()=>{
    const db=getDatabase();
    const originalTransaction=db.transaction.bind(db);
    vi.spyOn(db,'transaction').mockImplementationOnce(operation=>originalTransaction(async tx=>{
      await operation(tx);
      throw new Error('Simulated failure before commit.');
    }));
    await expect(savePhoto(owner,sessionId,upload())).rejects.toThrow('Simulated failure before commit');
    expect((await fixture.db.query('SELECT id FROM "PracticePhoto"')).rows).toHaveLength(0);
    expect(await readdir(photosDirectory())).toEqual([]);
  });

  it('preserves committed bytes if the transaction acknowledgement is lost',async()=>{
    const db=getDatabase();
    const originalTransaction=db.transaction.bind(db);
    vi.spyOn(db,'transaction').mockImplementationOnce(async operation=>{
      await originalTransaction(operation);
      throw new Error('Simulated lost commit acknowledgement.');
    });
    const photo=await savePhoto(owner,sessionId,upload());
    expect((await readPhoto(owner,photo.id)).buffer.length).toBeGreaterThan(0);
    await fixture.db.query('INSERT INTO "PhotoDeletionQueue"(filename) VALUES($1)',[`${photo.id}.jpg`]);
    expect(await flushPhotoDeletionQueue(fixture.db)).toEqual({processed:1,deleted:1,failed:0});
    expect((await readPhoto(owner,photo.id)).buffer.length).toBeGreaterThan(0);
  });

  it('keeps files and rolls back the deletion queue when metadata deletion fails',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    await expect(fixture.db.transaction(async tx=>{
      await tx.query('DELETE FROM "PracticePhoto" WHERE id=$1',[photo.id]);
      throw new Error('Simulated deletion failure.');
    })).rejects.toThrow('Simulated deletion failure');
    expect((await fixture.db.query('SELECT filename FROM "PhotoDeletionQueue"')).rows).toHaveLength(0);
    expect((await readPhoto(owner,photo.id)).buffer.length).toBeGreaterThan(0);
  });

  it('durably queues cascade cleanup until the post-commit filesystem retry',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    await deleteRecord('PracticeSession',owner,sessionId,fixture.db);
    await expect(readPhoto(owner,photo.id)).rejects.toMatchObject({status:404});
    expect((await stat(filename(photo.id))).isFile()).toBe(true);
    expect((await fixture.db.query('SELECT filename FROM "PhotoDeletionQueue"')).rows).toEqual([{filename:`${photo.id}.jpg`}]);
    expect(await flushPhotoDeletionQueue(fixture.db)).toEqual({processed:1,deleted:1,failed:0});
    await expect(stat(filename(photo.id))).rejects.toMatchObject({code:'ENOENT'});
    expect((await fixture.db.query('SELECT filename FROM "PhotoDeletionQueue"')).rows).toHaveLength(0);
  });

  it('retains failed cleanup for a later retry instead of deleting unsafe filesystem entries',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    const target=filename(photo.id),held=path.join(directory,'temporarily-held.jpg');
    await fixture.db.query('DELETE FROM "PracticePhoto" WHERE id=$1',[photo.id]);
    await rename(target,held);
    await mkdir(target);
    expect(await flushPhotoDeletionQueue(fixture.db)).toEqual({processed:1,deleted:0,failed:1});
    expect((await fixture.db.query('SELECT filename FROM "PhotoDeletionQueue"')).rows).toHaveLength(1);
    await rm(target,{recursive:true});
    await rename(held,target);
    expect(await flushPhotoDeletionQueue(fixture.db)).toEqual({processed:1,deleted:1,failed:0});
  });

  it.skipIf(process.platform==='win32')('rejects file symlinks on reads and deletion cleanup',async()=>{
    const photo=await savePhoto(owner,sessionId,upload());
    const outside=path.join(directory,'private-outside-photo-root.txt');
    await writeFile(outside,'private file');
    await rm(filename(photo.id));
    await symlink(outside,filename(photo.id));
    await expect(readPhoto(owner,photo.id)).rejects.toMatchObject({status:400});
    await removePhotos(owner,undefined,photo.id);
    expect(await readFile(outside,'utf8')).toBe('private file');
    expect((await fixture.db.query('SELECT filename FROM "PhotoDeletionQueue"')).rows).toHaveLength(1);
  });

  it.skipIf(process.platform==='win32')('rejects a symlink photo directory before writing',async()=>{
    const outside=await mkdtemp(path.join(tmpdir(),'midnight-ink-external-'));
    try {
      await symlink(outside,photosDirectory(),'dir');
      await expect(savePhoto(owner,sessionId,upload())).rejects.toMatchObject({status:400});
      expect(await readdir(outside)).toEqual([]);
      expect((await fixture.db.query('SELECT id FROM "PracticePhoto"')).rows).toHaveLength(0);
    } finally { await rm(outside,{recursive:true,force:true}); }
  });
});
