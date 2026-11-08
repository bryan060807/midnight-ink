import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { applyMigrations, createDatabase, createRecord, getWorkspace, seedDatabase, verifyDatabaseSchema } from '../src/lib/db';
import { createLoginTransaction, createSession, consumeLoginTransaction, findSession, upsertIdentity } from '../src/lib/auth-store';
import { importDemoData } from '../src/lib/demo-import';
import { lessons } from '../src/lib/curriculum';
import { createTestDatabase, type TestDatabase } from './fixtures/database';

const issuer = 'https://id.example.test';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let fixture: TestDatabase;
beforeEach(async () => { fixture = await createTestDatabase({migrate:false}); });
afterEach(async () => { await fixture?.cleanup(); });

async function seeded() {
  await applyMigrations(fixture.db);
  await seedDatabase(fixture.db);
  return fixture.db;
}

describe('PostgreSQL transactions and competing application workers', () => {
  it('never creates application tables implicitly when opening a pool', async () => {
    expect((await fixture.db.query("SELECT to_regclass('\"Profile\"') AS table_name")).rows[0].table_name).toBeNull();
    const second = createDatabase(fixture.url, {schema:fixture.schema});
    try { expect((await second.query("SELECT to_regclass('\"SchemaMigration\"') AS ledger")).rows[0].ledger).toBeNull(); }
    finally { await second.end(); }
  });

  it('serializes simultaneous migrators and records each ordered migration once', async () => {
    await Promise.all(Array.from({length:8}, () => applyMigrations(fixture.db)));
    expect((await fixture.db.query('SELECT version FROM "SchemaMigration" ORDER BY version')).rows.map(row=>row.version)).toEqual([1,2,3]);
    expect((await fixture.db.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname=current_schema() AND tablename=$1', ['Profile'])).rows[0].n).toBe(1);
  });

  it('rejects altered migration history instead of treating it as current', async () => {
    await applyMigrations(fixture.db);
    await fixture.db.query('UPDATE "SchemaMigration" SET checksum=$1 WHERE version=$2', ['0'.repeat(64),1]);
    await expect(applyMigrations(fixture.db)).rejects.toThrow('migration history');
    await expect(verifyDatabaseSchema(fixture.db)).rejects.toThrow('migration history');
  });

  it('fails readiness when an ownership constraint is absent from an otherwise current schema', async () => {
    await applyMigrations(fixture.db);
    await verifyDatabaseSchema(fixture.db);
    await fixture.db.query('ALTER TABLE "PracticePhoto" DROP CONSTRAINT "PracticePhoto_session_owner"');
    await expect(verifyDatabaseSchema(fixture.db)).rejects.toThrow('ownership constraints');
  });

  it('rejects unsafe schema names before any SQL can execute', () => {
    expect(()=>createDatabase(fixture.url,{schema:'public; DROP SCHEMA public CASCADE'})).toThrow('DATABASE_SCHEMA');
  });

  it('seeds simultaneous workers without duplicating curriculum or demo inventory', async () => {
    await applyMigrations(fixture.db);
    await Promise.all(Array.from({length:8}, () => seedDatabase(fixture.db)));
    expect((await fixture.db.query('SELECT count(*)::int AS n FROM "Lesson"')).rows[0].n).toBe(lessons.length);
    expect((await getWorkspace('local-demo',fixture.db)).equipment).toHaveLength(3);
    expect((await fixture.db.query('SELECT count(*)::int AS n FROM "UserSettings" WHERE "profileId"=$1', ['local-demo'])).rows[0].n).toBe(1);
  });

  it('maps twenty simultaneous first logins to one identity and one profile', async () => {
    const db=await seeded();
    const profiles=await Promise.all(Array.from({length:20},()=>upsertIdentity({issuer,subject:'same-verified-subject',email:'mutable@example.test'},db)));
    expect(new Set(profiles.map(row=>row.id)).size).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM "OidcIdentity"')).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM "Profile" WHERE id<>$1', ['local-demo'])).rows[0].n).toBe(1);
    expect((await getWorkspace(profiles[0].id,db)).equipment).toHaveLength(0);
  });

  it('creates independent concurrent sessions with precise millisecond expiry values', async () => {
    const db=await seeded();
    const owner=await upsertIdentity({issuer,subject:'sessions'},db);
    const expiry=Date.now()+3_600_123;
    const tokens=Array.from({length:20},()=>hash(randomBytes(32).toString('hex')));
    await Promise.all(tokens.map(token=>createSession(owner.id,token,expiry,db)));
    const sessions=await Promise.all(tokens.map(token=>findSession(token,db)));
    expect(sessions).toHaveLength(20);
    expect(sessions.every(row=>row?.profileId===owner.id)).toBe(true);
    const rows=(await db.query('SELECT "expiresAt" FROM "AppSession"')).rows;
    expect(rows).toHaveLength(20);
    expect(rows.every(row=>row.expiresAt===expiry)).toBe(true);
  });

  it('allows exactly one callback to consume a browser-bound login transaction', async () => {
    const db=await seeded();
    const stateHash=hash('single-state'), browserHash=hash('single-browser');
    await createLoginTransaction({stateHash,browserHash,nonce:'a'.repeat(32),pkceVerifier:'v'.repeat(43),returnTo:'/learn',expiresAt:Date.now()+60_000},db);
    const results=await Promise.all(Array.from({length:20},()=>consumeLoginTransaction(stateHash,browserHash,db)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)?.returnTo).toBe('/learn');
    expect((await db.query('SELECT count(*)::int AS n FROM "LoginTransaction"')).rows[0].n).toBe(0);
  });

  it('rolls back every write in a transaction when its callback fails', async () => {
    const db=await seeded();
    const before=(await db.query('SELECT name FROM "Profile" WHERE id=$1',['local-demo'])).rows[0].name;
    await expect(db.transaction(async tx=>{
      await tx.query('UPDATE "Profile" SET name=$1 WHERE id=$2',['Must roll back','local-demo']);
      await tx.query('INSERT INTO "Goal" (id,"profileId",content,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$4)',['rollback-goal','local-demo',{title:'Must roll back'},new Date().toISOString()]);
      throw new Error('intentional transaction failure');
    })).rejects.toThrow();
    expect((await db.query('SELECT name FROM "Profile" WHERE id=$1',['local-demo'])).rows[0].name).toBe(before);
    expect((await db.query('SELECT id FROM "Goal" WHERE id=$1',['rollback-goal'])).rows).toHaveLength(0);
  });

  it('preserves saved JSON and session access across an application pool restart', async () => {
    const db=await seeded();
    const owner=await upsertIdentity({issuer,subject:'restart'},db);
    const token=hash('restart-session');
    await createSession(owner.id,token,Date.now()+60_000,db);
    const equipment=await createRecord('Equipment',owner.id,{kind:'machine',name:'Persistent pen',notes:'Saved before restart'},db);
    await db.end();
    const reopened=createDatabase(fixture.url,{schema:fixture.schema});
    try {
      expect((await findSession(token,reopened))?.profileId).toBe(owner.id);
      expect((await getWorkspace(owner.id,reopened)).equipment).toContainEqual(expect.objectContaining({id:equipment.id,name:'Persistent pen',notes:'Saved before restart'}));
    } finally { await reopened.end(); }
  });

  it('fails a disconnected query without exposing connection credentials', async () => {
    const unavailable=new URL(fixture.url);
    unavailable.port='1';
    const db=createDatabase(unavailable.toString(),{schema:fixture.schema});
    try {
      const error=await db.query('SELECT 1').catch(error=>error as Error);
      expect(error).toBeInstanceOf(Error);
      if(unavailable.password) expect(String(error)).not.toContain(unavailable.password);
      expect(String(error)).not.toContain(unavailable.toString());
    } finally { await db.end(); }
  });

  it('allows one globally authorized demo claim when two targets compete', async () => {
    const db=await seeded();
    const first=await upsertIdentity({issuer,subject:'first-claimant'},db);
    const second=await upsertIdentity({issuer,subject:'second-claimant'},db);
    const authorization='isolated-concurrent-demo-claim-authorization';
    const previous=process.env.DEMO_IMPORT_TOKEN_HASH;
    process.env.DEMO_IMPORT_TOKEN_HASH=hash(authorization);
    try {
      const results=await Promise.allSettled([importDemoData(first.id,authorization,db),importDemoData(second.id,authorization,db)]);
      expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
      expect((await db.query('SELECT count(*)::int AS n FROM "DemoImportReceipt"')).rows[0].n).toBe(1);
      expect((await getWorkspace('local-demo',db)).equipment).toHaveLength(0);
      const inventories=await Promise.all([getWorkspace(first.id,db),getWorkspace(second.id,db)]);
      expect(inventories.map(row=>row.equipment.length).sort()).toEqual([0,3]);
    } finally {
      if(previous===undefined)delete process.env.DEMO_IMPORT_TOKEN_HASH;
      else process.env.DEMO_IMPORT_TOKEN_HASH=previous;
    }
  });
});
