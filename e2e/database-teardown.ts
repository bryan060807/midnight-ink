import type { FullConfig } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import { testDatabaseUrl } from '../tests/fixtures/database';

/** A web-server process group may be terminated before its own async cleanup finishes. */
export default async function teardown(config: FullConfig) {
  const metadataFile = config.metadata.databaseFixtureFile;
  if (typeof metadataFile !== 'string' || path.dirname(metadataFile) !== tmpdir()) throw new Error('Invalid browser fixture metadata location.');
  let metadata: {schema:string;dataDirectory:string};
  try { metadata=JSON.parse(await readFile(metadataFile,'utf8')); }
  catch(error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return; throw error; }
  if (!/^test_\d+_[a-f0-9]{20}$/.test(metadata.schema) || path.dirname(metadata.dataDirectory)!==tmpdir() || !path.basename(metadata.dataDirectory).startsWith('midnight-browser-')) {
    throw new Error('Invalid isolated browser fixture metadata.');
  }
  const admin = new Pool({connectionString:testDatabaseUrl(), max:1});
  try { await admin.query(`DROP SCHEMA IF EXISTS "${metadata.schema}" CASCADE`); }
  finally { await admin.end(); }
  await rm(metadata.dataDirectory,{recursive:true,force:true});
  await rm(metadataFile,{force:true});
}
