import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { modules, lessons, exercises, techniqueCards } from './curriculum';
import { ApiError } from './errors';
import { equipmentSchema, sessionSchema, designSchema, goalSchema } from './schemas';
import { DatabaseError, getDatabase, type Database, type Queryable } from './database';
export { getDatabase, createDatabase, closeDatabase, DatabaseError } from './database';
export type { Database, Queryable } from './database';

type Row = Record<string, unknown>;
export interface PracticePhotoSummary { id:string;sessionId:string;mimeType:string;width:number;height:number;size:number;createdAt:string;url:string }
export type ContentTable = 'Equipment'|'PracticeSession'|'DesignProject'|'Goal';
const contentTables = ['Equipment','PracticeSession','DesignProject','Goal'] as const;
const now = () => new Date().toISOString();

/** Files remain outside PostgreSQL; production must use a persistent directory outside the checkout. */
export function dataDirectory(): string {
  const configured = process.env.MIDNIGHT_INK_DATA_DIR;
  if (process.env.NODE_ENV === 'production') {
    if (!configured || !path.isAbsolute(configured)) throw new ApiError(503,'Production requires an absolute MIDNIGHT_INK_DATA_DIR outside the checkout.');
    const relative = path.relative(process.cwd(), path.resolve(configured));
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)))
      throw new ApiError(503,'MIDNIGHT_INK_DATA_DIR must be outside the checkout.');
  }
  return path.resolve(/* turbopackIgnore: true */ configured || path.join(process.cwd(), '.data'));
}
export const photosDirectory = () => path.join(dataDirectory(), 'photos');

/** Fixed identifiers shared with the operator-controlled import verifier. */
export const POSTGRES_TABLE_COLUMNS = {
  Profile: ['id','name','level','path','createdAt','updatedAt'],
  SeedMarker: ['name','appliedAt'],
  UserSettings: ['profileId','coachName','goalMinutes','updatedAt'],
  LearningModule: ['id','content'], Lesson: ['id','moduleId','content'], Exercise: ['id','content'],
  TechniqueCard: ['id','content'], ReferenceResource: ['id','techniqueCardId','content'],
  Equipment: ['id','profileId','kind','content','createdAt','updatedAt'],
  Cartridge: ['equipmentId','code','configuration'], Ink: ['equipmentId','purpose','expiresAt'],
  LessonProgress: ['id','profileId','lessonId','completedAt'],
  PracticeSession: ['id','profileId','exerciseId','content','createdAt','updatedAt'],
  PracticePhoto: ['id','profileId','sessionId','filename','mimeType','width','height','size','createdAt'],
  SkillAssessment: ['id','profileId','sessionId','content','updatedAt'],
  DesignProject: ['id','profileId','content','createdAt','updatedAt'],
  CoachingSession: ['id','profileId','content','createdAt'], Goal: ['id','profileId','content','createdAt','updatedAt'],
  OidcIdentity: ['id','profileId','issuer','subject','email','name','createdAt','updatedAt'],
  AppSession: ['tokenHash','profileId','createdAt','expiresAt','revokedAt'],
  LoginTransaction: ['stateHash','browserHash','nonce','pkceVerifier','returnTo','createdAt','expiresAt'],
  DemoImportReceipt: ['sourceProfileId','targetProfileId','createdAt','details'],
  PhotoDeletionQueue: ['filename','createdAt'],
  SchemaMigration: ['version','filename','checksum','appliedAt'],
} as const;
export const POSTGRES_DATA_TABLES = Object.keys(POSTGRES_TABLE_COLUMNS).filter(table => table !== 'SchemaMigration') as Exclude<keyof typeof POSTGRES_TABLE_COLUMNS, 'SchemaMigration'>[];

type Migration = { version:number;filename:string;checksum:string;sql:string };
export async function getPostgresMigrations(): Promise<Migration[]> {
  const directory = path.join(process.cwd(), 'migrations', 'postgresql');
  const filenames = (await readdir(directory)).filter(filename => /^\d+_[a-z0-9_]+\.sql$/.test(filename)).sort();
  const migrations = await Promise.all(filenames.map(async filename => {
    const sql = await readFile(path.join(directory, filename), 'utf8');
    return { version:Number(filename.split('_')[0]), filename, sql, checksum:createHash('sha256').update(sql).digest('hex') };
  }));
  if (!migrations.length || migrations.some((migration, index) => !Number.isSafeInteger(migration.version) || migration.version !== index + 1))
    throw new DatabaseError(undefined, 'PostgreSQL migration versions must be contiguous and unique.');
  return migrations;
}

/** Call inside a transaction to hold this database/schema-specific lock until commit. */
export async function acquireMigrationLock(db: Queryable): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || COALESCE(current_schema(), current_setting('search_path')) || ':midnight-ink:migrations', 0))");
}

async function verifyMigrationLedger(db: Queryable, migrations: Migration[], requireComplete: boolean) {
  const applied = (await db.query<{version:number;filename:string;checksum:string}>('SELECT "version","filename","checksum" FROM "SchemaMigration" ORDER BY "version"')).rows;
  for (const [index, row] of applied.entries()) {
    const expected = migrations[index];
    if (!expected || row.version !== expected.version || row.filename !== expected.filename || row.checksum !== expected.checksum)
      throw new DatabaseError(undefined, 'PostgreSQL migration history does not match this application.');
  }
  if (requireComplete && applied.length !== migrations.length) throw new DatabaseError(undefined, 'PostgreSQL migrations are incomplete. Run db:migrate explicitly.');
  return applied.length;
}

export async function applyMigrations(db: Database): Promise<void> {
  const migrations = await getPostgresMigrations();
  await db.transaction(async tx => {
    // Lock before CREATE, including creation of the ledger itself.
    await acquireMigrationLock(tx);
    await tx.query('CREATE TABLE IF NOT EXISTS "SchemaMigration" ("version" INTEGER PRIMARY KEY, "filename" TEXT NOT NULL, "checksum" TEXT NOT NULL CHECK ("checksum" ~ \'^[a-f0-9]{64}$\'), "appliedAt" TIMESTAMPTZ NOT NULL)');
    const applied = await verifyMigrationLedger(tx, migrations, false);
    for (const migration of migrations.slice(applied)) {
      await tx.query(migration.sql);
      await tx.query('INSERT INTO "SchemaMigration" ("version","filename","checksum","appliedAt") VALUES ($1,$2,$3,$4)', [migration.version,migration.filename,migration.checksum,now()]);
    }
  });
}

/** Verify the bundled migration ledger and every mapped column before import/readiness. */
export async function verifyDatabaseSchema(db: Queryable): Promise<void> {
  await acquireMigrationLock(db);
  await verifyMigrationLedger(db, await getPostgresMigrations(), true);
  const columns = (await db.query<{table_name:string;column_name:string;data_type:string}>(
    'SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position',
    [Object.keys(POSTGRES_TABLE_COLUMNS)],
  )).rows;
  const authTables = new Set(['OidcIdentity','AppSession','LoginTransaction','DemoImportReceipt']);
  for (const [table, expected] of Object.entries(POSTGRES_TABLE_COLUMNS)) {
    const found = columns.filter(column => column.table_name === table);
    if (found.length !== expected.length || found.some((column, index) => column.column_name !== expected[index])) throw new DatabaseError(undefined, 'PostgreSQL schema columns do not match this application.');
    for (const column of found) {
      const name = column.column_name;
      const expectedType = ['content','details'].includes(name) ? 'jsonb'
        : authTables.has(table) && ['createdAt','updatedAt','expiresAt','revokedAt'].includes(name) ? 'bigint'
        : ['createdAt','updatedAt','appliedAt','completedAt'].includes(name) ? 'timestamp with time zone'
        : ['width','height','size','goalMinutes','version'].includes(name) ? 'integer' : 'text';
      if (column.data_type !== expectedType) throw new DatabaseError(undefined, 'PostgreSQL schema types do not match this application.');
    }
  }
  const constraints = (await db.query<{conname:string;condeferrable:boolean}>("SELECT c.conname,c.condeferrable FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=current_schema() AND c.contype='f' AND c.conname=ANY($1::text[])", [['PracticePhoto_session_owner','SkillAssessment_session_owner']])).rows;
  if (constraints.length !== 2 || constraints.some(constraint => !constraint.condeferrable)) throw new DatabaseError(undefined, 'PostgreSQL ownership constraints are incomplete.');
}

export async function seedDatabase(db: Database): Promise<void> {
  await db.transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || current_schema() || ':midnight-ink:seed', 0))");
    const stamp = now();
    await tx.query('INSERT INTO "Profile" ("id","name","level","path","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("id") DO NOTHING', ['local-demo','Artist','beginner','foundations',stamp,stamp]);
    await tx.query('INSERT INTO "UserSettings" ("profileId","coachName","goalMinutes","updatedAt") VALUES ($1,$2,$3,$4) ON CONFLICT ("profileId") DO NOTHING', ['local-demo','Rook',20,stamp]);
    for (const item of modules) await tx.query('INSERT INTO "LearningModule" ("id","content") VALUES ($1,$2) ON CONFLICT ("id") DO UPDATE SET "content"=EXCLUDED."content"', [item.id,item]);
    for (const item of lessons) await tx.query('INSERT INTO "Lesson" ("id","moduleId","content") VALUES ($1,$2,$3) ON CONFLICT ("id") DO UPDATE SET "moduleId"=EXCLUDED."moduleId","content"=EXCLUDED."content"', [item.id,item.moduleId,item]);
    for (const item of exercises) await tx.query('INSERT INTO "Exercise" ("id","content") VALUES ($1,$2) ON CONFLICT ("id") DO UPDATE SET "content"=EXCLUDED."content"', [item.id,item]);
    for (const item of techniqueCards) {
      await tx.query('INSERT INTO "TechniqueCard" ("id","content") VALUES ($1,$2) ON CONFLICT ("id") DO UPDATE SET "content"=EXCLUDED."content"', [item.id,item]);
      await tx.query('INSERT INTO "ReferenceResource" ("id","techniqueCardId","content") VALUES ($1,$2,$3) ON CONFLICT ("id") DO UPDATE SET "techniqueCardId"=EXCLUDED."techniqueCardId","content"=EXCLUDED."content"', [item.id,item.id,item]);
    }
    const marker = await tx.query('INSERT INTO "SeedMarker" ("name","appliedAt") VALUES ($1,$2) ON CONFLICT ("name") DO NOTHING RETURNING "name"', ['sample-equipment-v1',stamp]);
    if (marker.rowCount) {
      const examples = [
        {kind:'machine',name:'Cordless rotary-style pen',manufacturer:'Unidentified',model:'Unknown',machineType:'Cordless rotary-style pen',stroke:'Unknown',power:'Battery; specifications unknown',notes:'Manufacturer-specific voltage guidance is unknown.'},
        {kind:'cartridge',name:'Aurora 1205M1',brand:'Aurora',code:'1205M1',configuration:'Five-point magnum; nominal 0.35 mm diameter',expiresAt:'2030-03',notes:'User-reported packaging marked EO sterile. Packaging and sterility have not been independently verified; do not infer sterile status from an image.'},
        {kind:'ink',name:'MATOENT assorted colors',brand:'MATOENT',purpose:'Practice only',notes:'5 ml bottles; suitability for human tattooing unverified. Use only for paper or synthetic practice.'},
      ];
      for (const example of examples) await insertContent(tx, 'Equipment', 'local-demo', equipmentSchema.parse({...example,provenance:'Sample user-provided information — not verified manufacturer specifications.'}));
    }
  });
}

function decode(row: Row): Row {
  const {content,...base} = row;
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  return {...(parsed && typeof parsed === 'object' ? parsed : {}),...base};
}
function assertContentTable(table: ContentTable): void {
  if (!(contentTables as readonly string[]).includes(table)) throw new ApiError(400,'Unknown record type.');
}
function transaction<T>(db: Database | Queryable, operation: (tx: Queryable) => Promise<T>): Promise<T> {
  return 'transaction' in db && typeof db.transaction === 'function' ? db.transaction(operation) : operation(db);
}

async function insertContent(db: Queryable, table: ContentTable, profileId: string, data: Row): Promise<Row> {
  assertContentTable(table);
  const id = randomUUID(), stamp = now();
  if (table === 'Equipment') {
    await db.query('INSERT INTO "Equipment" ("id","profileId","kind","content","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6)', [id,profileId,String(data.kind),data,stamp,stamp]);
    await syncEquipmentDetails(db,id,data);
  } else if (table === 'PracticeSession') {
    await db.query('INSERT INTO "PracticeSession" ("id","profileId","exerciseId","content","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6)', [id,profileId,String(data.exerciseId),data,stamp,stamp]);
    await syncAssessment(db,profileId,id,data.assessment);
  } else await db.query(`INSERT INTO "${table}" ("id","profileId","content","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5)`, [id,profileId,data,stamp,stamp]);
  return getRecord(table,profileId,id,db);
}
async function syncEquipmentDetails(db: Queryable, id: string, data: Row): Promise<void> {
  await db.query('DELETE FROM "Cartridge" WHERE "equipmentId"=$1', [id]);
  await db.query('DELETE FROM "Ink" WHERE "equipmentId"=$1', [id]);
  if (data.kind === 'cartridge') await db.query('INSERT INTO "Cartridge" ("equipmentId","code","configuration") VALUES ($1,$2,$3)', [id,String(data.code || ''),String(data.configuration || '')]);
  if (data.kind === 'ink') await db.query('INSERT INTO "Ink" ("equipmentId","purpose","expiresAt") VALUES ($1,$2,$3)', [id,String(data.purpose || ''),String(data.expiresAt || '')]);
}
async function syncAssessment(db: Queryable, profileId: string, sessionId: string, assessment: unknown): Promise<void> {
  if (!assessment) return;
  await db.query('INSERT INTO "SkillAssessment" ("id","profileId","sessionId","content","updatedAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("sessionId") DO UPDATE SET "content"=EXCLUDED."content","updatedAt"=EXCLUDED."updatedAt"', [randomUUID(),profileId,sessionId,assessment,now()]);
}
export async function getRecord(table: ContentTable, profileId: string, id: string, db: Queryable = getDatabase()): Promise<Row> {
  assertContentTable(table);
  const row = (await db.query(`SELECT * FROM "${table}" WHERE "id"=$1 AND "profileId"=$2`, [id,profileId])).rows[0];
  if (!row) throw new ApiError(404,'Record not found.');
  return decode(row);
}
async function validateRelationships(db: Queryable, table: ContentTable, profileId: string, data: Row): Promise<void> {
  if (table !== 'PracticeSession') return;
  if (!(await db.query('SELECT "id" FROM "Exercise" WHERE "id"=$1', [String(data.exerciseId)])).rowCount) throw new ApiError(400,'Choose a valid exercise.');
  for (const id of (data.equipmentIds as string[] || []))
    if (!(await db.query('SELECT "id" FROM "Equipment" WHERE "id"=$1 AND "profileId"=$2 FOR KEY SHARE', [id,profileId])).rowCount) throw new ApiError(404,'Record not found.');
}
export async function createRecord(table: ContentTable, profileId: string, data: unknown, db: Database | Queryable = getDatabase()): Promise<Row> {
  assertContentTable(table);
  const schema = table === 'Equipment' ? equipmentSchema : table === 'PracticeSession' ? sessionSchema : table === 'DesignProject' ? designSchema : goalSchema;
  const parsed = schema.parse(data) as Row;
  return transaction(db,async tx => {
    if (!(await tx.query('SELECT "id" FROM "Profile" WHERE "id"=$1 FOR SHARE', [profileId])).rowCount) throw new ApiError(404,'Workspace not found.');
    await validateRelationships(tx,table,profileId,parsed);
    return insertContent(tx,table,profileId,parsed);
  });
}
export async function updateRecord(table: ContentTable, profileId: string, id: string, patch: unknown, db: Database | Queryable = getDatabase()): Promise<Row> {
  assertContentTable(table);
  return transaction(db,async tx => {
    if (!(await tx.query('SELECT "id" FROM "Profile" WHERE "id"=$1 FOR SHARE', [profileId])).rowCount) throw new ApiError(404,'Record not found.');
    const row = (await tx.query(`SELECT * FROM "${table}" WHERE "id"=$1 AND "profileId"=$2 FOR UPDATE`, [id,profileId])).rows[0];
    if (!row) throw new ApiError(404,'Record not found.');
    const {profileId:_owner,id:_id,createdAt:_created,updatedAt:_updated,...content} = decode(row);
    void _owner; void _id; void _created; void _updated;
    const schema = table === 'Equipment' ? equipmentSchema : table === 'PracticeSession' ? sessionSchema : table === 'DesignProject' ? designSchema : goalSchema;
    const parsed = schema.parse({...content,...(patch as Row)}) as Row;
    await validateRelationships(tx,table,profileId,parsed);
    if (table === 'Equipment') {
      await tx.query('UPDATE "Equipment" SET "kind"=$1,"content"=$2,"updatedAt"=$3 WHERE "id"=$4 AND "profileId"=$5', [String(parsed.kind),parsed,now(),id,profileId]);
      await syncEquipmentDetails(tx,id,parsed);
    } else if (table === 'PracticeSession') {
      await tx.query('UPDATE "PracticeSession" SET "exerciseId"=$1,"content"=$2,"updatedAt"=$3 WHERE "id"=$4 AND "profileId"=$5', [String(parsed.exerciseId),parsed,now(),id,profileId]);
      await syncAssessment(tx,profileId,id,parsed.assessment);
    } else await tx.query(`UPDATE "${table}" SET "content"=$1,"updatedAt"=$2 WHERE "id"=$3 AND "profileId"=$4`, [parsed,now(),id,profileId]);
    return getRecord(table,profileId,id,tx);
  });
}
export async function deleteRecord(table: ContentTable, profileId: string, id: string, db: Queryable = getDatabase()) {
  assertContentTable(table);
  if (!(await db.query(`DELETE FROM "${table}" WHERE "id"=$1 AND "profileId"=$2 RETURNING "id"`, [id,profileId])).rowCount) throw new ApiError(404,'Record not found.');
  return {ok:true};
}
export async function completeLesson(profileId: string, lessonId: string, db: Queryable = getDatabase()) {
  if (!(await db.query('SELECT "id" FROM "Lesson" WHERE "id"=$1', [lessonId])).rowCount) throw new ApiError(404,'Lesson not found.');
  return (await db.query('INSERT INTO "LessonProgress" ("id","profileId","lessonId","completedAt") VALUES ($1,$2,$3,$4) ON CONFLICT ("profileId","lessonId") DO UPDATE SET "lessonId"=EXCLUDED."lessonId" RETURNING *', [randomUUID(),profileId,lessonId,now()])).rows[0];
}
export async function saveCoaching(profileId: string, input: {question:string;response:unknown}, db: Queryable = getDatabase()) {
  const id = randomUUID(), stamp = now();
  await db.query('INSERT INTO "CoachingSession" ("id","profileId","content","createdAt") VALUES ($1,$2,$3,$4)', [id,profileId,input,stamp]);
  return {id,...input,createdAt:stamp};
}
export async function getWorkspace(profileId: string, db: Queryable = getDatabase()) {
  const profile = (await db.query('SELECT * FROM "Profile" WHERE "id"=$1', [profileId])).rows[0];
  if (!profile) throw new ApiError(404,'Workspace not found.');
  const contentRows = async (table: ContentTable | 'CoachingSession') => {
    if (![...contentTables,'CoachingSession'].includes(table)) throw new ApiError(400,'Unknown record type.');
    return (await db.query(`SELECT * FROM "${table}" WHERE "profileId"=$1 ORDER BY "createdAt" DESC`, [profileId])).rows.map(decode);
  };
  const [settings,equipment,lessonProgress,sessions,photoRows,assessments,designs,goals,coaching] = await Promise.all([
    db.query('SELECT "coachName","goalMinutes" FROM "UserSettings" WHERE "profileId"=$1', [profileId]).then(result => result.rows[0]),
    contentRows('Equipment'), db.query('SELECT "id","lessonId","completedAt" FROM "LessonProgress" WHERE "profileId"=$1', [profileId]).then(result => result.rows),
    contentRows('PracticeSession'),
    db.query('SELECT p."id",p."sessionId",p."mimeType",p."width",p."height",p."size",p."createdAt" FROM "PracticePhoto" p JOIN "PracticeSession" s ON s."id"=p."sessionId" AND s."profileId"=p."profileId" WHERE p."profileId"=$1 ORDER BY p."createdAt" DESC', [profileId]).then(result => result.rows),
    db.query('SELECT a."id",a."sessionId",a."content",a."updatedAt" FROM "SkillAssessment" a JOIN "PracticeSession" s ON s."id"=a."sessionId" AND s."profileId"=a."profileId" WHERE a."profileId"=$1', [profileId]).then(result => result.rows.map(decode)),
    contentRows('DesignProject'),contentRows('Goal'),contentRows('CoachingSession'),
  ]);
  const photos = photoRows.map(row => ({...row,url:`/api/photos/${row.id}`} as unknown as PracticePhotoSummary));
  return {profile,settings,equipment,lessonProgress,sessions,photos,assessments,designs,goals,coaching};
}
export async function deleteUserData(profileId: string, db: Database | Queryable = getDatabase()) {
  await transaction(db,async tx => {
    if (!(await tx.query('SELECT "id" FROM "Profile" WHERE "id"=$1 FOR UPDATE', [profileId])).rowCount) throw new ApiError(404,'Workspace not found.');
    for (const table of ['PracticePhoto','SkillAssessment','PracticeSession','Equipment','DesignProject','Goal','CoachingSession','LessonProgress'] as const)
      await tx.query(`DELETE FROM "${table}" WHERE "profileId"=$1`, [profileId]);
    const stamp = now();
    await tx.query('UPDATE "Profile" SET "name"=$1,"level"=$2,"path"=$3,"updatedAt"=$4 WHERE "id"=$5', ['Artist','beginner','foundations',stamp,profileId]);
    await tx.query('UPDATE "UserSettings" SET "coachName"=$1,"goalMinutes"=$2,"updatedAt"=$3 WHERE "profileId"=$4', ['Rook',20,stamp,profileId]);
  });
  return {ok:true};
}
