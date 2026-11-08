import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, requireWorkspace } from '../../../lib/auth';
import { getDatabase, getWorkspace, createRecord, updateRecord, deleteRecord, completeLesson, deleteUserData } from '../../../lib/db';
import { profileSchema, settingsSchema } from '../../../lib/schemas';
import { readPhoto, removePhotos, savePhoto, validateImage } from '../../../lib/uploads';
import { parseDesign } from '../../../lib/design';
import { worksheetSvg } from '../../../lib/worksheets';
import { exercises } from '../../../lib/curriculum';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

async function limitedBytes(request:Request,limit:number) {
  const length=Number(request.headers.get('content-length')||0);
  if(length>limit)throw new ApiError(413,'Request is too large.');
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new ApiError(413,'Request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

async function body(request:Request,limit=64*1024) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Send application/json.');
  try{return JSON.parse(new TextDecoder().decode(await limitedBytes(request,limit)));}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'Invalid JSON request.');}
}

async function designBody(request:Request) {
  const input=await body(request,8*1024*1024);
  if(input?.document) {
    const document=parseDesign(input.document);
    if(!document)throw new ApiError(400,'Unsupported drawing document.');
    if(document.reference) {
      const [header,base64]=document.reference.dataUrl.split(',');
      const mime=header.slice(5).split(';')[0];
      const normalized=await validateImage(Buffer.from(base64,'base64'),mime);
      document.reference={dataUrl:`data:image/jpeg;base64,${normalized.buffer.toString('base64')}`,width:normalized.width,height:normalized.height};
    }
    input.document=document;
  }
  return input;
}

async function handle(request:Request,context:{params:Promise<{path:string[]}>}) {
  try {
    const {path:segments}=await context.params;
    const [resource,id,action]=segments;
    if(resource==='health'&&request.method==='GET') {
      if(process.env.NODE_ENV==='production')return json({status:'blocked',database:'not checked',authentication:'not configured; local demo disabled in production'},503);
      const coachProvider=process.env.ROOK_PROVIDER==='openai'&&process.env.OPENAI_API_KEY?'openai':'offline';
      const db=getDatabase();db.prepare('SELECT 1').get();return json({status:'ok',database:'sqlite',mode:'local-demo',coachProvider,ai:coachProvider==='openai'?'optional provider configured':'offline'});
    }
    const profileId=requireWorkspace(request);
    const db=getDatabase();
    if(resource==='worksheets'&&id&&request.method==='GET') {
      if(!exercises.some(exercise=>exercise.id===id))throw new ApiError(404,'Worksheet not found.');
      return new NextResponse(worksheetSvg(id),{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Content-Disposition':`attachment; filename="midnight-ink-${id}.svg"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(resource==='workspace'&&request.method==='GET')return json(getWorkspace(profileId));
    if(resource==='export'&&request.method==='GET')return NextResponse.json({formatVersion:1,exportedAt:new Date().toISOString(),...getWorkspace(profileId)},{headers:{'Content-Disposition':'attachment; filename="midnight-ink-records.json"','Cache-Control':'no-store'}});
    if(resource==='data'&&request.method==='DELETE'){
      const input=await body(request);if(input?.confirm!=='DELETE')throw new ApiError(400,'Confirm deletion with DELETE.');
      removePhotos(profileId);return json(deleteUserData(profileId));
    }
    if(resource==='profile'&&request.method==='PATCH') {
      const patch=profileSchema.parse(await body(request));
      const current=db.prepare('SELECT * FROM Profile WHERE id=?').get(profileId)!;
      db.prepare('UPDATE Profile SET name=?,level=?,path=?,updatedAt=? WHERE id=?').run(patch.name??String(current.name),patch.level??String(current.level),patch.path??String(current.path),new Date().toISOString(),profileId);
      return json(db.prepare('SELECT * FROM Profile WHERE id=?').get(profileId));
    }
    if(resource==='settings'&&request.method==='PATCH') {
      const patch=settingsSchema.parse(await body(request));
      const current=db.prepare('SELECT * FROM UserSettings WHERE profileId=?').get(profileId)!;
      db.prepare('UPDATE UserSettings SET coachName=?,goalMinutes=?,updatedAt=? WHERE profileId=?').run(patch.coachName??String(current.coachName),patch.goalMinutes??Number(current.goalMinutes),new Date().toISOString(),profileId);
      return json(db.prepare('SELECT coachName,goalMinutes FROM UserSettings WHERE profileId=?').get(profileId));
    }
    if(resource==='lessons'&&id&&action==='complete'&&request.method==='POST')return json(completeLesson(profileId,id));
    if(resource==='photos') {
      if(id&&request.method==='GET'){const photo=readPhoto(profileId,id);return new NextResponse(new Uint8Array(photo.buffer),{headers:{'Content-Type':photo.mimeType,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
      if(id&&request.method==='DELETE'){removePhotos(profileId,undefined,id);return json({ok:true});}
      if(!id&&request.method==='POST') {
        const type=request.headers.get('content-type')||'';
        if(!type.startsWith('multipart/form-data'))throw new ApiError(415,'Send multipart form data.');
        const bytes=await limitedBytes(request,6*1024*1024);
        let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new ApiError(400,'Invalid upload form.');}
        const file=form.get('file'),sessionId=form.get('sessionId');
        if(!(file instanceof File)||typeof sessionId!=='string'||sessionId.length>100)throw new ApiError(400,'Choose an image and a saved practice session.');
        return json(await savePhoto(profileId,sessionId,file),201);
      }
    }
    const tableMap:Record<string,'Equipment'|'PracticeSession'|'DesignProject'|'Goal'|undefined>={equipment:'Equipment',sessions:'PracticeSession',designs:'DesignProject',goals:'Goal'};
    const table=tableMap[resource];
    if(table){
      if(request.method==='POST'&&!id)return json(createRecord(table,profileId,table==='DesignProject'?await designBody(request):await body(request)),201);
      if(request.method==='PATCH'&&id)return json(updateRecord(table,profileId,id,table==='DesignProject'?await designBody(request):await body(request)));
      if(request.method==='DELETE'&&id){if(table==='PracticeSession')removePhotos(profileId,id);return json(deleteRecord(table,profileId,id));}
    }
    throw new ApiError(404,'Endpoint not found.');
  }catch(error){
    if(error instanceof ApiError)return json({error:error.message},error.status);
    if(error instanceof ZodError)return json({error:'Please check the entered fields.',fields:error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message}))},400);
    return json({error:'The operation could not be completed. Refresh the workspace to check the saved state, then try again.'},500);
  }
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
export const DELETE=handle;
