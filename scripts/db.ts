import nextEnv from '@next/env';
import { applyMigrations, closeDatabase, getDatabase, seedDatabase, verifyDatabaseSchema } from '../src/lib/db';
import { getRequiredAuthConfig } from '../src/lib/auth-config';

nextEnv.loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const command = process.argv[2];
  if (process.argv.some(argument => argument === 'reset' || argument === '--reset'))
    throw new Error('Database reset is not supported. Use an isolated disposable database for development.');
  if (!['migrate','seed'].includes(command) || process.argv.length !== 3)
    throw new Error('Usage: npm run db:migrate OR npm run db:seed.');
  if (process.env.NODE_ENV === 'production') getRequiredAuthConfig();
  const database = getDatabase();
  if (command === 'migrate') {
    await applyMigrations(database);
    console.log('PostgreSQL migrations complete. Seeding is a separate command.');
  } else {
    await database.transaction(verifyDatabaseSchema);
    await seedDatabase(database);
    const count = (await database.query<{n:number}>('SELECT COUNT(*)::integer AS n FROM "Lesson"')).rows[0].n;
    console.log(`Repeatable PostgreSQL curriculum seed complete. Lessons: ${count}.`);
  }
}

try { await main(); }
catch (error) {
  const safe = error instanceof Error && [
    'Database reset is not supported. Use an isolated disposable database for development.',
    'Usage: npm run db:migrate OR npm run db:seed.',
    'DATABASE_URL is required.',
  ].includes(error.message);
  console.error(safe ? error.message : 'Database command failed. Check PostgreSQL connectivity, configuration, and migration readiness.');
  process.exitCode = 1;
} finally {
  try { await closeDatabase(); }
  catch { console.error('Database shutdown failed.'); process.exitCode = 1; }
}
