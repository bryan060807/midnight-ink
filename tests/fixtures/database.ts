import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { applyMigrations, closeDatabase, createDatabase, seedDatabase } from '../../src/lib/db';
import type { Database } from '../../src/lib/database';

/** Integration fixtures may provision only an explicitly selected disposable test database. */
export function testDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests. Point it at a disposable database named midnight_ink_test; production DATABASE_URL is never used as a fallback.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(?:^|_)test(?:_|$)/.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error('TEST_DATABASE_URL must select a disposable PostgreSQL database with test in its name (for example midnight_ink_test).');
  }
  return value;
}

export interface TestDatabase {
  db: Database;
  schema: string;
  url: string;
  cleanup(): Promise<void>;
}

export async function createTestDatabase(options: { seed?: boolean; migrate?: boolean } = {}): Promise<TestDatabase> {
  const url = testDatabaseUrl();
  const schema = `test_${process.pid}_${randomBytes(10).toString('hex')}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const db = createDatabase(url, { schema });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    if (options.migrate !== false) await applyMigrations(db);
    if (options.seed !== false && options.migrate !== false) await seedDatabase(db);
  } catch (error) {
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }
  let cleaned = false;
  return {
    db, schema, url,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await db.end();
      try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await admin.end(); }
    },
  };
}

/** Direct API/auth tests also use the application's singleton, isolated to this fixture schema. */
export async function configureTestDatabase(options: { seed?: boolean; migrate?: boolean } = {}) {
  await closeDatabase();
  const fixture = await createTestDatabase(options);
  const previousUrl = process.env.DATABASE_URL;
  const previousSchema = process.env.DATABASE_SCHEMA;
  process.env.DATABASE_URL = fixture.url;
  process.env.DATABASE_SCHEMA = fixture.schema;
  return {
    ...fixture,
    async cleanup() {
      await closeDatabase();
      await fixture.cleanup();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (previousSchema === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = previousSchema;
    },
  };
}
