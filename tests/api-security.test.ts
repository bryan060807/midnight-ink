import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, POST, PATCH, DELETE } from '../src/app/api/[...path]/route';
import { configureTestDatabase, type TestDatabase } from './fixtures/database';
import { closeDatabase, createRecord, getDatabase } from '../src/lib/db';
import { exercises } from '../src/lib/curriculum';
let directory: string;
let fixture: TestDatabase;
const handlers = { GET, POST, PATCH, DELETE };
async function call(method: keyof typeof handlers, resource: string, input?: unknown, headers: Record<string, string> = {}) {
    const request = new Request(`http://0.0.0.0:3100/api/${resource}`, {
        method,
        headers: { host: 'localhost:3100', ...(input === undefined ? {} : { 'content-type': 'application/json' }), ...(method === 'GET' ? {} : { origin: 'http://localhost:3100' }), ...headers },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    return handlers[method](request, { params: Promise.resolve({ path: resource.split('/') }) });
}
beforeAll(async () => {
    for (const name of ['AIBRY_ID_ISSUER', 'AIBRY_ID_CLIENT_ID', 'APP_ORIGIN', 'SESSION_SECRET'])
        vi.stubEnv(name, '');
    directory = mkdtempSync(path.join(tmpdir(), 'midnight-api-test-'));
    vi.stubEnv('MIDNIGHT_INK_DATA_DIR', directory);
    fixture = await configureTestDatabase();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOCAL_DEMO_ENABLED', 'true');
    vi.stubEnv('ROOK_PROVIDER', 'offline');
    vi.stubEnv('OPENAI_API_KEY', '');
});
afterAll(async () => {
    await fixture?.cleanup();
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
});
describe('API security and provider disclosure', () => {
    it('reports only a selected and configured provider without exposing its key', async () => {
        vi.stubEnv('ROOK_PROVIDER', 'openai');
        expect((await (await call('GET', 'health')).json()).coachProvider).toBe('offline');
        vi.stubEnv('OPENAI_API_KEY', 'private-test-placeholder');
        const response = await call('GET', 'health');
        const text = await response.text();
        expect(JSON.parse(text).coachProvider).toBe('openai');
        expect(text).not.toContain('private-test-placeholder');
        vi.stubEnv('ROOK_PROVIDER', 'offline');
        expect((await (await call('GET', 'health')).json()).coachProvider).toBe('offline');
    });
    it('reports PostgreSQL readiness only after explicit migrations', async()=> {
        const response=await call('GET','health');
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({status:'ok',database:'postgresql',schema:'current'});
    });
    it('returns an unavailable response when PostgreSQL cannot be reached without leaking credentials', async()=> {
        const unavailable=new URL(fixture.url);
        unavailable.port='1';
        await closeDatabase();
        process.env.DATABASE_URL=unavailable.toString();
        try {
            const response=await call('GET','health');
            expect(response.status).toBe(503);
            const body=await response.text();
            expect(body).not.toContain(unavailable.toString());
            if(unavailable.password) expect(body).not.toContain(unavailable.password);
        } finally {
            await closeDatabase();
            process.env.DATABASE_URL=fixture.url;
        }
    });
    it('serves only authored worksheet IDs as downloadable vector artwork', async () => {
        const response = await call('GET', `worksheets/${exercises[0].id}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('image/svg+xml');
        expect(response.headers.get('content-disposition')).toContain('attachment');
        expect(await response.text()).toContain('<svg');
        expect((await call('GET', 'worksheets/not-a-real-exercise')).status).toBe(404);
    });
    it('never accepts a client-selected owner or exposes another owner through API writes', async () => {
        const db = getDatabase(), stamp = new Date().toISOString();
        (await db.query("INSERT INTO \"Profile\"(id,name,level,path,\"createdAt\",\"updatedAt\") VALUES($1,$2,$3,$4,$5,$6)", ['other-owner', 'Other', 'beginner', 'foundations', stamp, stamp]));
        const other = await createRecord('Equipment', 'other-owner', { kind: 'machine', name: 'Other owned machine' });
        expect((await call('PATCH', `equipment/${other.id}`, { name: 'Stolen' })).status).toBe(404);
        expect((await call('DELETE', `equipment/${other.id}`)).status).toBe(404);
        expect((await call('POST', 'equipment', { kind: 'machine', name: 'Injected owner', profileId: 'other-owner' })).status).toBe(400);
        const workspace = await (await call('GET', 'workspace')).json();
        expect(workspace.equipment.some((item: {
            id: string;
        }) => item.id === other.id)).toBe(false);
    });
    it('rejects actual oversized JSON bytes even without a Content-Length header', async () => {
        const request = new Request('http://0.0.0.0:3100/api/equipment', { method: 'POST', headers: { host: 'localhost:3100', origin: 'http://localhost:3100', 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'machine', name: 'Large', notes: 'x'.repeat(70000) }) });
        expect(request.headers.has('content-length')).toBe(false);
        const response = await POST(request, { params: Promise.resolve({ path: ['equipment'] }) });
        expect(response.status).toBe(413);
        expect((await call('POST', 'designs', { name: 'Unsafe', document: { version: 1, content: '<script>alert(1)</script>' } })).status).toBe(400);
    });
    it('requires deliberate confirmation before deleting workspace data', async () => {
        const created = await (await call('POST', 'equipment', { kind: 'machine', name: 'Keep until confirmed' })).json();
        expect((await call('DELETE', 'data', { confirm: 'not confirmed' })).status).toBe(400);
        const workspace = await (await call('GET', 'workspace')).json();
        expect(workspace.equipment.some((item: {
            id: string;
        }) => item.id === created.id)).toBe(true);
    });
    it('fails closed for all production workspace access and health readiness', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        try {
            expect((await call('GET', 'workspace')).status).toBe(503);
            expect((await call('POST', 'equipment', { kind: 'machine', name: 'Blocked' })).status).toBe(503);
            const health = await call('GET', 'health');
            expect(health.status).toBe(503);
            expect((await health.json()).status).toBe('blocked');
        }
        finally {
            vi.stubEnv('NODE_ENV', 'test');
        }
    });
});
