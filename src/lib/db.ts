import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { modules, lessons, exercises, techniqueCards } from './curriculum';
import { ApiError } from './auth';
import { equipmentSchema, sessionSchema, designSchema, goalSchema } from './schemas';

type Row = Record<string, unknown>;
type ContentTable = 'Equipment'|'PracticeSession'|'DesignProject'|'Goal';
const tables:ContentTable[] = ['Equipment','PracticeSession','DesignProject','Goal'];
let singleton:DatabaseSync|undefined;
export const dataDirectory = () => path.resolve(/* turbopackIgnore: true */ process.env.MIDNIGHT_INK_DATA_DIR || path.join(process.cwd(), '.data'));
export const photosDirectory = () => path.join(dataDirectory(),'photos');
const now = () => new Date().toISOString();

export function applyMigrations(db:DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS SchemaMigration(version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)');
  for (const filename of readdirSync(path.join(process.cwd(),'migrations')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort()) {
    const version = Number(filename.split('_')[0]);
    if (db.prepare('SELECT version FROM SchemaMigration WHERE version=?').get(version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(readFileSync(path.join(process.cwd(),'migrations',filename),'utf8')); db.prepare('INSERT INTO SchemaMigration(version,appliedAt) VALUES(?,?)').run(version,now()); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}

export function initializeDatabase(filename = process.env.DATABASE_PATH || path.join(dataDirectory(),'midnight-ink.sqlite')):DatabaseSync {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(/* turbopackIgnore: true */ filename)), {recursive:true,mode:0o700});
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL;');
  applyMigrations(db);
  seedDatabase(db);
  return db;
}

export function getDatabase():DatabaseSync {
  singleton ??= initializeDatabase();
  return singleton;
}

export function seedDatabase(db:DatabaseSync) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const stamp = now();
    db.prepare('INSERT OR IGNORE INTO Profile(id,name,level,path,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('local-demo','Artist','beginner','foundations',stamp,stamp);
    db.prepare('INSERT OR IGNORE INTO UserSettings(profileId,coachName,goalMinutes,updatedAt) VALUES(?,?,?,?)').run('local-demo','Rook',20,stamp);
    for (const item of modules) db.prepare('INSERT INTO LearningModule(id,content) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(item.id,JSON.stringify(item));
    for (const item of lessons) db.prepare('INSERT INTO Lesson(id,moduleId,content) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET moduleId=excluded.moduleId,content=excluded.content').run(item.id,item.moduleId,JSON.stringify(item));
    for (const item of exercises) db.prepare('INSERT INTO Exercise(id,content) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(item.id,JSON.stringify(item));
    for (const item of techniqueCards) {
      db.prepare('INSERT INTO TechniqueCard(id,content) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(item.id,JSON.stringify(item));
      db.prepare('INSERT INTO ReferenceResource(id,techniqueCardId,content) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(item.id,item.id,JSON.stringify(item));
    }
    if (!db.prepare('SELECT name FROM SeedMarker WHERE name=?').get('sample-equipment-v1')) {
      const examples = [
        {kind:'machine',name:'Cordless rotary-style pen',manufacturer:'Unidentified',model:'Unknown',machineType:'Cordless rotary-style pen',stroke:'Unknown',power:'Battery; specifications unknown',notes:'Manufacturer-specific voltage guidance is unknown.'},
        {kind:'cartridge',name:'Aurora 1205M1',brand:'Aurora',code:'1205M1',configuration:'Five-point magnum; nominal 0.35 mm diameter',expiresAt:'2030-03',notes:'User-reported packaging marked EO sterile. Packaging and sterility have not been independently verified; do not infer sterile status from an image.'},
        {kind:'ink',name:'MATOENT assorted colors',brand:'MATOENT',purpose:'Practice only',notes:'5 ml bottles; suitability for human tattooing unverified. Use only for paper or synthetic practice.'},
      ];
      for (const example of examples) insertContent(db,'Equipment','local-demo',equipmentSchema.parse({...example,provenance:'Sample user-provided information — not verified manufacturer specifications.'}));
      db.prepare('INSERT INTO SeedMarker(name,appliedAt) VALUES(?,?)').run('sample-equipment-v1',stamp);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function decode(row:Row) {
  const {content,...base} = row;
  return {...(typeof content==='string'?JSON.parse(content):{}),...base};
}

function insertContent(db:DatabaseSync,table:ContentTable,profileId:string,data:Row) {
  const id = randomUUID(), stamp = now();
  if (table==='Equipment') {
    db.prepare('INSERT INTO Equipment(id,profileId,kind,content,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(id,profileId,String(data.kind),JSON.stringify(data),stamp,stamp);
    syncEquipmentDetails(db,id,data);
  } else if (table==='PracticeSession') {
    db.prepare('INSERT INTO PracticeSession(id,profileId,exerciseId,content,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run(id,profileId,String(data.exerciseId),JSON.stringify(data),stamp,stamp);
    syncAssessment(db,profileId,id,data.assessment);
  } else db.prepare(`INSERT INTO ${table}(id,profileId,content,createdAt,updatedAt) VALUES(?,?,?,?,?)`).run(id,profileId,JSON.stringify(data),stamp,stamp);
  return getRecord(table,profileId,id,db);
}

function syncEquipmentDetails(db:DatabaseSync,id:string,data:Row) {
  db.prepare('DELETE FROM Cartridge WHERE equipmentId=?').run(id);
  db.prepare('DELETE FROM Ink WHERE equipmentId=?').run(id);
  if (data.kind==='cartridge') db.prepare('INSERT INTO Cartridge(equipmentId,code,configuration) VALUES(?,?,?)').run(id,String(data.code||''),String(data.configuration||''));
  if (data.kind==='ink') db.prepare('INSERT INTO Ink(equipmentId,purpose,expiresAt) VALUES(?,?,?)').run(id,String(data.purpose||''),String(data.expiresAt||''));
}

function syncAssessment(db:DatabaseSync,profileId:string,sessionId:string,assessment:unknown) {
  if (!assessment) return;
  db.prepare('INSERT INTO SkillAssessment(id,profileId,sessionId,content,updatedAt) VALUES(?,?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET content=excluded.content,updatedAt=excluded.updatedAt').run(randomUUID(),profileId,sessionId,JSON.stringify(assessment),now());
}

export function getRecord(table:ContentTable,profileId:string,id:string,db=getDatabase()) {
  if (!tables.includes(table)) throw new ApiError(400,'Unknown record type.');
  const row=db.prepare(`SELECT * FROM ${table} WHERE id=? AND profileId=?`).get(id,profileId) as Row|undefined;
  if (!row) throw new ApiError(404,'Record not found.');
  return decode(row);
}

export function createRecord(table:ContentTable,profileId:string,data:unknown,db=getDatabase()) {
  const schema=table==='Equipment'?equipmentSchema:table==='PracticeSession'?sessionSchema:table==='DesignProject'?designSchema:goalSchema;
  const parsed = schema.parse(data) as Row;
  validateRelationships(db,table,profileId,parsed);
  db.exec('BEGIN IMMEDIATE');
  try { const row=insertContent(db,table,profileId,parsed); db.exec('COMMIT'); return row; }
  catch(error) { db.exec('ROLLBACK'); throw error; }
}

function validateRelationships(db:DatabaseSync,table:ContentTable,profileId:string,data:Row) {
  if (table!=='PracticeSession') return;
  if (!db.prepare('SELECT id FROM Exercise WHERE id=?').get(String(data.exerciseId))) throw new ApiError(400,'Choose a valid exercise.');
  for (const id of (data.equipmentIds as string[]||[])) getRecord('Equipment',profileId,id,db);
}

export function updateRecord(table:ContentTable,profileId:string,id:string,patch:unknown,db=getDatabase()) {
  const existing=getRecord(table,profileId,id,db);
  const {profileId:_owner,id:_id,createdAt:_created,updatedAt:_updated,...content}=existing;
  void _owner; void _id; void _created; void _updated;
  const schema=table==='Equipment'?equipmentSchema:table==='PracticeSession'?sessionSchema:table==='DesignProject'?designSchema:goalSchema;
  const parsed=schema.parse({...content,...(patch as Row)}) as Row;
  validateRelationships(db,table,profileId,parsed);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (table==='Equipment') { db.prepare('UPDATE Equipment SET kind=?,content=?,updatedAt=? WHERE id=? AND profileId=?').run(String(parsed.kind),JSON.stringify(parsed),now(),id,profileId); syncEquipmentDetails(db,id,parsed); }
    else if (table==='PracticeSession') { db.prepare('UPDATE PracticeSession SET exerciseId=?,content=?,updatedAt=? WHERE id=? AND profileId=?').run(String(parsed.exerciseId),JSON.stringify(parsed),now(),id,profileId); syncAssessment(db,profileId,id,parsed.assessment); }
    else db.prepare(`UPDATE ${table} SET content=?,updatedAt=? WHERE id=? AND profileId=?`).run(JSON.stringify(parsed),now(),id,profileId);
    db.exec('COMMIT');
    return getRecord(table,profileId,id,db);
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}

export function deleteRecord(table:ContentTable,profileId:string,id:string,db=getDatabase()) {
  getRecord(table,profileId,id,db);
  // Photo files are removed by the API before deleting the session (DB rows cascade).
  db.prepare(`DELETE FROM ${table} WHERE id=? AND profileId=?`).run(id,profileId);
  return {ok:true};
}

export function completeLesson(profileId:string,lessonId:string,db=getDatabase()) {
  if (!db.prepare('SELECT id FROM Lesson WHERE id=?').get(lessonId)) throw new ApiError(404,'Lesson not found.');
  db.prepare('INSERT OR IGNORE INTO LessonProgress(id,profileId,lessonId,completedAt) VALUES(?,?,?,?)').run(randomUUID(),profileId,lessonId,now());
  return db.prepare('SELECT * FROM LessonProgress WHERE profileId=? AND lessonId=?').get(profileId,lessonId);
}

export function saveCoaching(profileId:string,input:{question:string,response:unknown},db=getDatabase()) {
  const id=randomUUID(),stamp=now();
  db.prepare('INSERT INTO CoachingSession(id,profileId,content,createdAt) VALUES(?,?,?,?)').run(id,profileId,JSON.stringify(input),stamp);
  return {id,...input,createdAt:stamp};
}

export function getWorkspace(profileId='local-demo',db=getDatabase()) {
  const profile=db.prepare('SELECT * FROM Profile WHERE id=?').get(profileId);
  if (!profile) throw new ApiError(404,'Workspace not found.');
  const contentRows=(table:string)=>db.prepare(`SELECT * FROM ${table} WHERE profileId=? ORDER BY createdAt DESC`).all(profileId).map(r=>decode(r as Row));
  const photos=db.prepare('SELECT id,sessionId,mimeType,width,height,size,createdAt FROM PracticePhoto WHERE profileId=? ORDER BY createdAt DESC').all(profileId).map(r=>({...r,url:`/api/photos/${r.id}`}));
  return {
    profile,settings:db.prepare('SELECT coachName,goalMinutes FROM UserSettings WHERE profileId=?').get(profileId),
    equipment:contentRows('Equipment'),lessonProgress:db.prepare('SELECT id,lessonId,completedAt FROM LessonProgress WHERE profileId=?').all(profileId),
    sessions:contentRows('PracticeSession'),photos,
    assessments:db.prepare('SELECT id,sessionId,content,updatedAt FROM SkillAssessment WHERE profileId=?').all(profileId).map(r=>decode(r as Row)),
    designs:contentRows('DesignProject'),goals:contentRows('Goal'),coaching:contentRows('CoachingSession'),
  };
}

export function deleteUserData(profileId:string,db=getDatabase()) {
  const stamp=now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of ['PracticePhoto','SkillAssessment','PracticeSession','Equipment','DesignProject','Goal','CoachingSession','LessonProgress']) db.prepare(`DELETE FROM ${table} WHERE profileId=?`).run(profileId);
    db.prepare('UPDATE Profile SET name=?,level=?,path=?,updatedAt=? WHERE id=?').run('Artist','beginner','foundations',stamp,profileId);
    db.prepare('UPDATE UserSettings SET coachName=?,goalMinutes=?,updatedAt=? WHERE profileId=?').run('Rook',20,stamp,profileId);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  // Reclaim old WAL frames after deliberate workspace deletion. Independent
  // filesystem snapshots and exports remain outside this operation's scope.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return {ok:true};
}
