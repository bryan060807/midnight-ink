import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { restartPacket, quiescedRestart } = require('../scripts/release-pm2-rpc.cjs');

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

function transition() {
  const oldCwd=path.resolve('old-release'),newCwd=path.resolve('new-release');
  const current={name:'midnight-ink',pm_id:30,pid:123,pm2_env:{pm_cwd:oldCwd,status:'online'}};
  const stopped={...current,pid:0,pm2_env:{pm_cwd:oldCwd,status:'stopped'}};
  const app={name:'midnight-ink',pm_cwd:newCwd,pm_exec_path:path.join(newCwd,'scripts','server.mjs'),env:{PLACEHOLDER:'test-only'}};
  const order:string[]=[];
  const operations={
    stop:vi.fn(async()=>{order.push('stop');}),
    read:vi.fn(async()=>{order.push('read');return stopped;}),
    oldProcessAlive:vi.fn(async()=>false),
    portFree:vi.fn(async()=>true),
    waitQuiet:vi.fn(async()=>{order.push('quiet');}),
    start:vi.fn(async(packet:{id:number})=>{order.push(packet.id===30?'start':'foreign');}),
  };
  return {current,stopped,app,operations,order};
}

it('stops, checks quiescence twice across the quiet period, then starts only id 30',async()=>{
  const fixture=transition();
  await quiescedRestart(fixture.current,fixture.app,fixture.operations);
  expect(fixture.order).toEqual(['stop','read','quiet','read','start']);
  expect(fixture.operations.start).toHaveBeenCalledOnce();
  expect(fixture.operations.start.mock.calls[0][0]).toMatchObject({id:30,env:{current_conf:{pm_cwd:fixture.app.pm_cwd}}});
});

it.each(['occupied_port','old_process_alive','new_process_after_quiet','changed_cwd','stop_failure','wrong_id','invalid_destination'])(
  'never starts a duplicate or retries after %s',async scenario=>{
    const fixture=transition();
    if(scenario==='occupied_port')fixture.operations.portFree.mockResolvedValue(false);
    if(scenario==='old_process_alive')fixture.operations.oldProcessAlive.mockResolvedValue(true);
    if(scenario==='new_process_after_quiet')fixture.operations.read.mockResolvedValueOnce(fixture.stopped).mockResolvedValueOnce({...fixture.stopped,pid:456});
    if(scenario==='changed_cwd')fixture.operations.read.mockResolvedValue({...fixture.stopped,pm2_env:{...fixture.stopped.pm2_env,pm_cwd:path.resolve('foreign-release')}});
    if(scenario==='stop_failure')fixture.operations.stop.mockRejectedValue(new Error('test-only'));
    if(scenario==='wrong_id')fixture.current.pm_id=31;
    if(scenario==='invalid_destination')fixture.app.pm_exec_path=path.join(fixture.app.pm_cwd,'wrong.mjs');
    await expect(quiescedRestart(fixture.current,fixture.app,fixture.operations)).rejects.toThrow();
    expect(fixture.operations.start).not.toHaveBeenCalled();
    expect(fixture.operations.stop.mock.calls.length).toBeLessThanOrEqual(1);
  },
);
