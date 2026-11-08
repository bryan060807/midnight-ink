/** Disposable browser-test database lifecycle. Never loads production DATABASE_URL. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDatabase } from '../tests/fixtures/database';

const fixture = await createTestDatabase();
const dataDirectory = await mkdtemp(path.join(tmpdir(), 'midnight-browser-'));
const metadataFile = process.env.MIDNIGHT_INK_TEST_FIXTURE_FILE;
if (metadataFile) await writeFile(metadataFile, JSON.stringify({schema:fixture.schema,dataDirectory}), {mode:0o600});
const child = spawn(process.execPath, ['scripts/server.mjs', '--dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: fixture.url,
    DATABASE_SCHEMA: fixture.schema,
    MIDNIGHT_INK_DATA_DIR: dataDirectory,
  },
});
let closing = false;
async function cleanup(code: number) {
  if (closing) return;
  closing = true;
  try { await fixture.cleanup(); }
  finally { await rm(dataDirectory, { recursive: true, force: true }); }
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { child.kill(signal); });
}
child.on('error', async () => { await cleanup(1); });
child.on('exit', async (code, signal) => { await cleanup(code ?? (signal ? 0 : 1)); });
