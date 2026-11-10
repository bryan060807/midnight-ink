import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:net';
import { createDatabase, DatabaseError } from '../src/lib/database';
import { getWorkspace } from '../src/lib/db';
import { upsertIdentity } from '../src/lib/auth-store';
import { createTestDatabase, type TestDatabase } from './fixtures/database';

let fixture: TestDatabase;
beforeEach(async () => { fixture=await createTestDatabase(); });
afterEach(async () => { await fixture?.cleanup(); vi.unstubAllEnvs(); });

it('serves competing owners with one connection per load and drains the queue', async () => {
  vi.stubEnv('PG_POOL_MAX','1');
  const db=createDatabase(fixture.url,{schema:fixture.schema});
  try {
    const alice=await upsertIdentity({issuer:'https://issuer.example.test',subject:'alice'},db);
    const bob=await upsertIdentity({issuer:'https://issuer.example.test',subject:'bob'},db);
    const work=Array.from({length:24},(_,i)=>getWorkspace(i%2 ? alice.id : bob.id,db));
    const results=await Promise.all(work);
    results.forEach((row,i)=>expect(row.profile.id).toBe(i%2 ? alice.id : bob.id));
    expect(db.poolStats()).toMatchObject({total:1,active:0,idle:1,waiting:0,connecting:0});
  } finally { await db.end(); }
});

it('distinguishes pool waiting from connection establishment and recovers without enlarging the pool', async () => {
  vi.stubEnv('PG_POOL_MAX','1');
  const db=createDatabase(fixture.url,{schema:fixture.schema});
  const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
  let release!: () => void, acquired!: () => void;
  const ready=new Promise<void>(resolve=>{acquired=resolve;});
  const hold=new Promise<void>(resolve=>{release=resolve;});
  const transaction=db.transaction(async ()=>{acquired();await hold;});
  await ready;
  try {
    const waiting=db.query('SELECT 1');
    expect(db.poolStats()).toMatchObject({active:1,idle:0,waiting:1});
    await expect(waiting).rejects.toMatchObject({kind:'pool_timeout',retryable:true});
    const diagnostic=log.mock.calls.map(call=>JSON.parse(String(call[0]))).find(row=>row.kind==='pool_timeout');
    expect(diagnostic).toMatchObject({phase:'acquire',pool:{active:1,idle:0}});
    expect(diagnostic.elapsedMs).toBeGreaterThanOrEqual(4900);
  } finally { release(); await transaction; }
  try { expect((await db.query('SELECT 1 AS value')).rows[0].value).toBe(1); }
  finally { await db.end(); }
});

it('reports a stalled TCP/PostgreSQL handshake as connection timeout, not pool exhaustion', async () => {
  const sockets=new Set<import('node:net').Socket>();
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as import('node:net').AddressInfo).port;
  const db=createDatabase(`postgres://test@127.0.0.1:${port}/midnight_ink_test?sslmode=disable`);
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  try { await expect(db.query('SELECT 1')).rejects.toMatchObject({kind:'connect_timeout'}); }
  finally { await db.end(); for(const socket of sockets)socket.destroy(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

it('retains SQLSTATE, classifies server query timeout and releases failed transactions', async () => {
  const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await expect(fixture.db.query('SELECT * FROM nonexistent_private_table')).rejects.toMatchObject({kind:'sqlstate',code:'42P01',retryable:false});
  await expect(fixture.db.transaction(async tx=>{
    await tx.query("SET LOCAL statement_timeout='50ms'");
    await tx.query('SELECT pg_sleep(1)');
  })).rejects.toMatchObject({kind:'query_timeout',code:'57014'} satisfies Partial<DatabaseError>);
  expect((await fixture.db.query('SELECT 1 AS value')).rows[0].value).toBe(1);
  expect(fixture.db.poolStats()).toMatchObject({active:0,waiting:0});
  expect(JSON.stringify(log.mock.calls)).not.toContain('nonexistent_private_table');
  expect(JSON.stringify(log.mock.calls)).not.toContain(fixture.url);
});

it('distinguishes refused TCP connections from queued pool acquisition', async () => {
  const server=createServer();
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as import('node:net').AddressInfo).port;
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  const db=createDatabase(`postgres://test@127.0.0.1:${port}/midnight_ink_test?sslmode=disable`);
  const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try {
    await expect(db.query('SELECT 1')).rejects.toMatchObject({kind:'network',code:'ECONNREFUSED'});
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({phase:'acquire',kind:'network',code:'ECONNREFUSED'});
    expect(db.poolStats()).toMatchObject({active:0,waiting:0,total:0});
  } finally { await db.end(); }
});
