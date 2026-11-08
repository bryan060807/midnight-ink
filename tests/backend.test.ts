import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Database } from '../src/lib/database';
import { configureTestDatabase, type TestDatabase } from './fixtures/database';
import { applyMigrations, completeLesson, createRecord, deleteRecord, deleteUserData, getRecord, getWorkspace, createDatabase, saveCoaching, seedDatabase, updateRecord } from '../src/lib/db';
import { requireWorkspace } from '../src/lib/auth';
import { exercises, lessons, modules, techniqueCards } from '../src/lib/curriculum';
import { designSchema, equipmentSchema, sessionSchema } from '../src/lib/schemas';
import { MAX_IMAGE_BYTES, safePhotoPath, sniffImageType, validateImage } from '../src/lib/uploads';
import sharp from 'sharp';
import { newDocument, parseDesign } from '../src/lib/design';
let directory: string;
let fixture: TestDatabase;
let db: Database;
const owner = 'local-demo';
const assessment = { consistency: 2, smoothness: 3, coverage: 3, edgeControl: 2, surfaceDamage: 1, goals: 'Keep starts inside the target marks.' };
beforeEach(async () => {
    for (const name of ['AIBRY_ID_ISSUER', 'AIBRY_ID_CLIENT_ID', 'APP_ORIGIN', 'SESSION_SECRET'])
        vi.stubEnv(name, '');
    directory = mkdtempSync(path.join(tmpdir(), 'midnight-ink-test-'));
    vi.stubEnv('MIDNIGHT_INK_DATA_DIR', directory);
    fixture = await configureTestDatabase();
    db = fixture.db;
});
afterEach(async () => {
    if (db && fixture && db !== fixture.db) await db.end();
    await fixture?.cleanup();
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
});
describe('migrations and repeatable seed data', () => {
    it('creates the full schema, enforces foreign keys and records applied migrations once', async () => {
        await applyMigrations(db);
        expect((await db.query("SELECT version FROM \"SchemaMigration\" ORDER BY version", [])).rows.map(row => row.version)).toEqual([1, 2, 3]);
        const tables = (await db.query("SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()", [])).rows.map(row => row.name);
        for (const name of ['Profile', 'Equipment', 'Cartridge', 'Ink', 'LearningModule', 'Lesson', 'Exercise', 'LessonProgress', 'PracticeSession', 'PracticePhoto', 'SkillAssessment', 'DesignProject', 'TechniqueCard', 'ReferenceResource', 'CoachingSession', 'UserSettings'])
            expect(tables).toContain(name);
        await expect(db.query("INSERT INTO \"UserSettings\" VALUES($1,$2,$3,$4)", ['missing-owner', 'Rook', 20, new Date().toISOString()])).rejects.toThrow();
    });
    it('seeds complete learning pathways and does not duplicate content', async () => {
        await seedDatabase(db);
        await seedDatabase(db);
        expect(modules).toHaveLength(6);
        expect(lessons.length).toBeGreaterThanOrEqual(24);
        expect(exercises.length).toBeGreaterThanOrEqual(8);
        expect((await db.query("SELECT id FROM \"Lesson\"", [])).rows).toHaveLength(lessons.length);
        expect((await db.query("SELECT id FROM \"TechniqueCard\"", [])).rows).toHaveLength(techniqueCards.length);
        expect((await getWorkspace(owner, db)).equipment).toHaveLength(3);
        for (const lesson of lessons) {
            expect(lesson.objectives.length).toBeGreaterThan(0);
            expect(lesson.explanation.join(' ').length).toBeGreaterThan(120);
            expect(lesson.practice.length).toBeGreaterThan(0);
            expect(lesson.question.length).toBeGreaterThan(10);
            expect(lesson.referenceIds.every(id => techniqueCards.some(card => card.id === id))).toBe(true);
        }
    });
    it('preserves custom equipment, profile edits, and sample deletions when seeding again', async () => {
        const equipment = (await getWorkspace(owner, db)).equipment;
        const sampleId = String(equipment[0].id);
        await deleteRecord('Equipment', owner, sampleId, db);
        const custom = await createRecord('Equipment', owner, { kind: 'machine', name: 'My practice pen', notes: 'My notes remain.' }, db);
        (await db.query("UPDATE \"Profile\" SET name=$1 WHERE id=$2", ['Returning learner', owner]));
        await seedDatabase(db);
        expect((await getWorkspace(owner, db)).equipment).toHaveLength(3);
        expect((await getRecord('Equipment', owner, String(custom.id), db)).notes).toBe('My notes remain.');
        await expect(getRecord('Equipment', owner, sampleId, db)).rejects.toThrow('Record not found');
        expect((await getWorkspace(owner, db)).profile.name).toBe('Returning learner');
    });
});
describe('owned persistent records', () => {
    it('creates, edits, reopens and deletes equipment with cartridge detail rows', async () => {
        const created = await createRecord('Equipment', owner, { kind: 'cartridge', name: 'Practice cartridge', code: '1203RL', configuration: 'Round liner' }, db);
        const id = String(created.id);
        expect((await db.query("SELECT code FROM \"Cartridge\" WHERE \"equipmentId\"=$1", [id])).rows[0]?.code).toBe('1203RL');
        await updateRecord('Equipment', owner, id, { name: 'Updated cartridge', notes: 'Packaging details only.' }, db);
        await db.end();
        db = createDatabase(fixture.url, { schema: fixture.schema });
        expect(await getRecord('Equipment', owner, id, db)).toMatchObject({ name: 'Updated cartridge', notes: 'Packaging details only.' });
        await deleteRecord('Equipment', owner, id, db);
        await expect(getRecord('Equipment', owner, id, db)).rejects.toThrow('Record not found');
        expect((await db.query("SELECT \"equipmentId\" FROM \"Cartridge\" WHERE \"equipmentId\"=$1", [id])).rows[0]).toBeUndefined();
    });
    it('rejects undeclared owner injection and invalid equipment/session data', () => {
        expect(() => equipmentSchema.parse({ kind: 'machine', name: 'x', profileId: 'another-user' })).toThrow();
        expect(() => sessionSchema.parse({ exerciseId: exercises[0].id, durationMinutes: -1 })).toThrow();
        expect(() => sessionSchema.parse({ exerciseId: exercises[0].id, durationMinutes: 10, difficulty: 6 })).toThrow();
        expect(() => designSchema.parse({ name: '', document: {} })).toThrow();
    });
    it('does not permit another owner to read, update or delete a record', async () => {
        const created = await createRecord('Equipment', owner, { kind: 'machine', name: 'Private practice pen' }, db);
        const id = String(created.id);
        await expect(getRecord('Equipment', 'someone-else', id, db)).rejects.toThrow('Record not found');
        await expect(updateRecord('Equipment', 'someone-else', id, { name: 'Stolen' }, db)).rejects.toThrow('Record not found');
        await expect(deleteRecord('Equipment', 'someone-else', id, db)).rejects.toThrow('Record not found');
        expect((await getRecord('Equipment', owner, id, db)).name).toBe('Private practice pen');
    });
    it('persists lesson completion once and rejects nonexistent lessons', async () => {
        await completeLesson(owner, lessons[0].id, db);
        await completeLesson(owner, lessons[0].id, db);
        await db.end();
        db = createDatabase(fixture.url, { schema: fixture.schema });
        expect((await getWorkspace(owner, db)).lessonProgress).toHaveLength(1);
        expect((await getWorkspace(owner, db)).lessonProgress[0].lessonId).toBe(lessons[0].id);
        await expect(completeLesson(owner, 'does-not-exist', db)).rejects.toThrow('Lesson not found');
    });
    it('creates and edits a practice session and cascades associated assessments on deletion', async () => {
        const equipmentId = String((await getWorkspace(owner, db)).equipment[0].id);
        const created = await createRecord('PracticeSession', owner, { exerciseId: exercises[0].id, durationMinutes: 12, equipmentIds: [equipmentId], notes: 'Baseline attempt', assessment }, db);
        const id = String(created.id);
        expect((await getWorkspace(owner, db)).assessments).toHaveLength(1);
        await updateRecord('PracticeSession', owner, id, { durationMinutes: 18, notes: 'Updated notes', assessment: { ...assessment, consistency: 4 } }, db);
        expect(await getRecord('PracticeSession', owner, id, db)).toMatchObject({ durationMinutes: 18, notes: 'Updated notes', assessment: { consistency: 4 } });
        expect((await getWorkspace(owner, db)).assessments[0]).toMatchObject({ consistency: 4 });
        await deleteRecord('PracticeSession', owner, id, db);
        expect((await getWorkspace(owner, db)).sessions).toHaveLength(0);
        expect((await getWorkspace(owner, db)).assessments).toHaveLength(0);
    });
    it('enforces valid exercise and equipment relationships', async () => {
        await expect(createRecord('PracticeSession', owner, { exerciseId: 'unknown', durationMinutes: 5 }, db)).rejects.toThrow('valid exercise');
        await expect(createRecord('PracticeSession', owner, { exerciseId: exercises[0].id, durationMinutes: 5, equipmentIds: ['not-owned'] }, db)).rejects.toThrow('Record not found');
        expect((await getWorkspace(owner, db)).sessions).toHaveLength(0);
    });
    it('saves and reloads a vector document without executing its content', async () => {
        const document = { ...newDocument(), elements: [{ id: 'first-stroke', type: 'path' as const, points: [[10, 20], [30, 40]] as [
                        number,
                        number
                    ][], strokeWidth: 3 }], mirror: true };
        const created = await createRecord('DesignProject', owner, { name: 'First flash', document }, db);
        const id = String(created.id);
        await db.end();
        db = createDatabase(fixture.url, { schema: fixture.schema });
        expect((await getRecord('DesignProject', owner, id, db)).document).toEqual(document);
        await updateRecord('DesignProject', owner, id, { name: 'Revised flash' }, db);
        expect((await getRecord('DesignProject', owner, id, db)).name).toBe('Revised flash');
        await deleteRecord('DesignProject', owner, id, db);
        expect((await getWorkspace(owner, db)).designs).toHaveLength(0);
    });
    it('deletes personal records while retaining curriculum and not restoring sample inventory', async () => {
        const stamp = new Date().toISOString();
        (await db.query("INSERT INTO \"Profile\"(id,name,level,path,\"createdAt\",\"updatedAt\") VALUES($1,$2,$3,$4,$5,$6)", ['other', 'Other', 'beginner', 'foundations', stamp, stamp]));
        const otherEquipment = await createRecord('Equipment', 'other', { kind: 'machine', name: 'Other owner pen' }, db);
        await createRecord('PracticeSession', owner, { exerciseId: exercises[0].id, durationMinutes: 8, assessment }, db);
        await createRecord('DesignProject', owner, { name: 'Delete me', document: newDocument() }, db);
        await createRecord('Goal', owner, { title: 'Delete this goal' }, db);
        await completeLesson(owner, lessons[0].id, db);
        await saveCoaching(owner, { question: 'How can I practise lines?', response: { source: 'offline' } }, db);
        await deleteUserData(owner, db);
        await seedDatabase(db);
        const workspace = await getWorkspace(owner, db);
        for (const key of ['equipment', 'sessions', 'photos', 'assessments', 'designs', 'goals', 'coaching', 'lessonProgress'] as const)
            expect(workspace[key]).toHaveLength(0);
        expect(workspace.profile.name).toBe('Artist');
        expect((await db.query("SELECT id FROM \"Lesson\"", [])).rows).toHaveLength(lessons.length);
        expect((await getRecord('Equipment', 'other', String(otherEquipment.id), db)).name).toBe('Other owner pen');
    });
});
describe('vector document boundary', () => {
    it('rejects executable content, nonfinite geometry and unbounded drawings', () => {
        expect(parseDesign('<svg onload="alert(1)"></svg>')).toBeNull();
        expect(parseDesign({ ...newDocument(), elements: [{ id: 'x', type: 'path', points: [[Infinity, 0]], strokeWidth: 3 }] })).toBeNull();
        expect(parseDesign({ ...newDocument(), reference: { dataUrl: 'https://evil.example/photo.svg', width: 100, height: 100 } })).toBeNull();
        expect(parseDesign({ ...newDocument(), elements: new Array(3001).fill({ id: 'x', type: 'path', points: [], strokeWidth: 3 }) })).toBeNull();
    });
});
describe('local workspace access boundary', () => {
    it('allows a loopback development request including IPv6', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(await requireWorkspace(new Request('http://localhost:3000/api/workspace'))).toBe(owner);
        expect(await requireWorkspace(new Request('http://127.0.0.1:3000/api/workspace'))).toBe(owner);
        expect(await requireWorkspace(new Request('http://[::1]:3000/api/workspace', { headers: { host: '[::1]:3000' } }))).toBe(owner);
    });
    it('fails closed in production even if the demo flag is enabled', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('LOCAL_DEMO_ENABLED', 'true');
        await expect(requireWorkspace(new Request('http://localhost/api/workspace'))).rejects.toThrow('Production authentication');
    });
    it('honors explicitly disabled demo mode and rejects remote hosts', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('LOCAL_DEMO_ENABLED', 'false');
        await expect(requireWorkspace()).rejects.toThrow('disabled');
        vi.stubEnv('LOCAL_DEMO_ENABLED', 'true');
        await expect(requireWorkspace(new Request('http://example.com/api/workspace'))).rejects.toThrow('localhost only');
    });
    it('rejects both cross-origin and cross-site mutations', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        await expect(requireWorkspace(new Request('http://localhost:3000/api/equipment', { method: 'POST', headers: { origin: 'https://evil.example' } }))).rejects.toThrow('Cross-origin');
        await expect(requireWorkspace(new Request('http://localhost:3000/api/equipment', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }))).rejects.toThrow('Cross-site');
        expect(await requireWorkspace(new Request('http://localhost:3000/api/equipment', { method: 'POST', headers: { origin: 'http://localhost:3000' } }))).toBe(owner);
    });
    it('compares browser origin to validated Host when Next exposes an internal bind URL', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(await requireWorkspace(new Request('http://0.0.0.0:3100/api/profile', { method: 'PATCH', headers: { host: 'localhost:3100', origin: 'http://localhost:3100' } }))).toBe(owner);
        await expect(requireWorkspace(new Request('http://0.0.0.0:3100/api/profile', { method: 'PATCH', headers: { host: 'localhost:3100', origin: 'http://localhost:9999' } }))).rejects.toThrow('Cross-origin');
        await expect(requireWorkspace(new Request('http://0.0.0.0:3100/api/profile', { method: 'PATCH', headers: { host: 'evil.example:3100', origin: 'http://evil.example:3100' } }))).rejects.toThrow('localhost only');
    });
});
describe('image validation and storage paths', () => {
    it('decodes supported content, normalizes orientation, and strips metadata', async () => {
        const source = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#dddddd' } })
            .withMetadata({ orientation: 6 }).png().toBuffer();
        expect(sniffImageType(source)).toBe('image/png');
        expect((await sharp(source).metadata()).exif).toBeDefined();
        const normalized = await validateImage(source, 'image/png');
        const metadata = await sharp(normalized.buffer).metadata();
        expect(normalized.mimeType).toBe('image/jpeg');
        expect(normalized.width).toBe(32);
        expect(normalized.height).toBe(48);
        expect(metadata.exif).toBeUndefined();
        expect(metadata.xmp).toBeUndefined();
    });
    it('rejects forged MIME types, SVG/HTML payloads, empty and excessive files', async () => {
        const source = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer();
        await expect(validateImage(source, 'image/jpeg')).rejects.toThrow('matching content type');
        await expect(validateImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png')).rejects.toThrow('actual PNG');
        await expect(validateImage(Buffer.from('<html>payload</html>'), 'image/png')).rejects.toThrow();
        await expect(validateImage(new Uint8Array())).rejects.toThrow('nonempty');
        await expect(validateImage(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png')).rejects.toThrow('5 MB');
    });
    it('rejects signature-only files that cannot be decoded', async () => {
        const fake = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(sniffImageType(fake)).toBe('image/png');
        await expect(validateImage(fake, 'image/png')).rejects.toThrow('decoded safely');
    });
    it('prevents path traversal and uses only server-shaped photo names', () => {
        vi.stubEnv('MIDNIGHT_INK_DATA_DIR', directory);
        const safe = safePhotoPath('12345678-1234-1234-1234-123456789012.jpg');
        expect(path.dirname(safe)).toBe(path.join(directory, 'photos'));
        for (const value of ['../outside.jpg', '/tmp/outside.jpg', '..\\outside.jpg', 'image.svg', '123.jpg', 'a'.repeat(36) + '.jpg/../secret'])
            expect(() => safePhotoPath(value)).toThrow('Invalid photo path');
    });
});
