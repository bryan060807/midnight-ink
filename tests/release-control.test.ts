import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { restartPacket } = require('../scripts/release-pm2-rpc.cjs');

it('pins the existing app id and carries actual PM2 cwd/script fields without changing environment values', () => {
  const cwd=path.resolve('disposable-release');
  const app={name:'midnight-ink',pm_cwd:cwd,pm_exec_path:path.join(cwd,'scripts','server.mjs'),exec_mode:'fork_mode',env:{ROOK_PROVIDER:'openai',PLACEHOLDER:'test-only'}};
  const packet=restartPacket(app);
  expect(packet.id).toBe(30);
  expect(packet.env.current_conf).toEqual(app);
  expect(packet.env.PLACEHOLDER).toBe('test-only');
  expect(app.env).toEqual({ROOK_PROVIDER:'openai',PLACEHOLDER:'test-only'});
});

it('refuses a foreign app or mismatched entrypoint', () => {
  const cwd=path.resolve('disposable-release');
  expect(()=>restartPacket({name:'other-app',pm_cwd:cwd,pm_exec_path:path.join(cwd,'scripts','server.mjs')})).toThrow();
  expect(()=>restartPacket({name:'midnight-ink',pm_cwd:cwd,pm_exec_path:path.join(cwd,'other.mjs')})).toThrow();
});

it('refuses a mutation without explicit approval before opening a manifest or contacting PM2', () => {
  const result=spawnSync(process.execPath,[path.resolve('scripts/release-pm2-rpc.cjs'),'nonexistent-package','deploy'],{encoding:'utf8',timeout:5000,windowsHide:true});
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('Existing-daemon PM2 operation failed; inspect before retrying.');
});
