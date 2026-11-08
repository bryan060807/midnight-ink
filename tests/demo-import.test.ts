import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { Database } from "../src/lib/database";
import { createTestDatabase, type TestDatabase } from "./fixtures/database";
import { createDatabase, getWorkspace, createRecord, completeLesson, seedDatabase, applyMigrations, } from "../src/lib/db";
import { upsertIdentity, getIdentity, createSession, findSession, revokeSession, createLoginTransaction, consumeLoginTransaction, cleanupAuth, } from "../src/lib/auth-store";
import { importDemoData } from "../src/lib/demo-import";
import { lessons, exercises } from "../src/lib/curriculum";
import { newDocument } from "../src/lib/design";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const authorization = "one-time-test-authorization-token-of-sufficient-length";
const issuer = "https://id.example.test";
let db: Database;
let fixture: TestDatabase;
const previousImportHash = process.env.DEMO_IMPORT_TOKEN_HASH;
beforeEach(async () => {
    fixture = await createTestDatabase();
    db = fixture.db;
    process.env.DEMO_IMPORT_TOKEN_HASH = hash(authorization);
});
afterEach(async () => {
    await fixture?.cleanup();
    if (previousImportHash === undefined)
        delete process.env.DEMO_IMPORT_TOKEN_HASH;
    else
        process.env.DEMO_IMPORT_TOKEN_HASH = previousImportHash;
});
async function identity(subject = "test-subject", email = "same@example.test") {
    return await upsertIdentity({ issuer, subject, email, name: "Test Artist" }, db);
}
describe("verified identity persistence", () => {
    it("reapplies PostgreSQL migrations without rewriting existing local records", async () => {
        await db.query('UPDATE "Profile" SET name=$1,path=$2 WHERE id=$3', ['Existing learner', 'drawing', 'local-demo']);
        const equipment = await createRecord('Equipment', 'local-demo', {kind:'machine', name:'Existing pen', notes:'Keep my notes'}, db);
        await applyMigrations(db);
        await applyMigrations(db);
        expect((await getWorkspace('local-demo', db)).profile).toMatchObject({name:'Existing learner', path:'drawing'});
        expect((await getWorkspace('local-demo', db)).equipment.find(row=>row.id===equipment.id)).toMatchObject({notes:'Keep my notes'});
        const versions = (await db.query('SELECT version FROM "SchemaMigration" ORDER BY version')).rows.map(row=>row.version);
        expect(versions.length).toBeGreaterThan(0);
        expect(new Set(versions).size).toBe(versions.length);
        expect((await db.query('SELECT count(*)::int AS n FROM "OidcIdentity"')).rows[0].n).toBe(0);
    });
    it("uses immutable issuer+subject, not email, and never auto-assigns demo data", async () => {
        const first = await identity("one");
        const other = await identity("two");
        expect(first.id).not.toBe(other.id);
        expect(first.id).not.toBe("local-demo");
        expect((await getWorkspace(first.id, db)).equipment).toHaveLength(0);
        expect((await getWorkspace("local-demo", db)).equipment).toHaveLength(3);
        const updated = await upsertIdentity({
            issuer,
            subject: "one",
            email: "new@example.test",
            name: "Changed provider name",
        }, db);
        expect(updated.id).toBe(first.id);
        expect((await getIdentity(first.id, db))?.email).toBe("new@example.test");
        expect(updated.name).toBe("Test Artist");
        const anotherIssuer = await upsertIdentity({ issuer: "https://other.example.test", subject: "one" }, db);
        expect(anotherIssuer.id).not.toBe(first.id);
    });
    it("persists hashed sessions across actual database reopen and revokes them", async () => {
        const profile = await upsertIdentity({ issuer, subject: "persistent" }, db);
        await createSession(profile.id, hash("opaque-session-secret"), Date.now()+60_000, db);
        await db.end();
        const reopened = createDatabase(fixture.url, {schema: fixture.schema});
        try {
            expect((await findSession(hash("opaque-session-secret"), reopened))?.profileId).toBe(profile.id);
            expect((await reopened.query('SELECT "tokenHash" FROM "AppSession"')).rows[0].tokenHash).toBe(hash("opaque-session-secret"));
            await revokeSession(hash("opaque-session-secret"), reopened);
            expect(await findSession(hash("opaque-session-secret"), reopened)).toBeNull();
        } finally { await reopened.end(); }
    });
    it("rejects demo sessions and expires stored sessions without fallback", async () => {
        await expect(createSession("local-demo", hash("demo-token"), Date.now() + 60000, db)).rejects.toThrow("authenticated identity");
        const profile = await identity();
        const tokenHash = hash("expiring");
        await createSession(profile.id, tokenHash, Date.now() + 60000, db);
        (await db.query("UPDATE \"AppSession\" SET \"createdAt\"=$1,\"expiresAt\"=$2 WHERE \"tokenHash\"=$3", [Date.now() - 120000, Date.now() - 60000, tokenHash]));
        expect(await findSession(tokenHash, db)).toBeNull();
        await cleanupAuth(db);
        expect((await db.query("SELECT COUNT(*)::int AS n FROM \"AppSession\"", [])).rows[0]?.n).toBe(0);
    });
    it("consumes a login attempt once, requires its browser binding and expires it", async () => {
        const txn = {
            stateHash: hash("state"),
            browserHash: hash("browser"),
            nonce: "random-nonce-at-least-16",
            pkceVerifier: "v".repeat(43),
            returnTo: "/practice",
            expiresAt: Date.now() + 60000,
        };
        await createLoginTransaction(txn, db);
        expect(await consumeLoginTransaction(txn.stateHash, hash("wrong-browser"), db)).toBeNull();
        expect((await consumeLoginTransaction(txn.stateHash, txn.browserHash, db))?.returnTo).toBe("/practice");
        expect(await consumeLoginTransaction(txn.stateHash, txn.browserHash, db)).toBeNull();
        await createLoginTransaction({ ...txn, stateHash: hash("expired") }, db);
        (await db.query("UPDATE \"LoginTransaction\" SET \"createdAt\"=$1,\"expiresAt\"=$2 WHERE \"stateHash\"=$3", [Date.now() - 120000, Date.now() - 60000, hash("expired")]));
        expect(await consumeLoginTransaction(hash("expired"), txn.browserHash, db)).toBeNull();
    });
});
describe("one-time deliberate demo import", () => {
    it("requires operator configuration, authorization, and a verified target", async () => {
        const profile = await identity();
        delete process.env.DEMO_IMPORT_TOKEN_HASH;
        await expect(importDemoData(profile.id, authorization, db)).rejects.toThrow("not enabled");
        process.env.DEMO_IMPORT_TOKEN_HASH = hash(authorization);
        await expect(importDemoData(profile.id, "incorrect-authorization-long-enough-to-pass-length", db)).rejects.toThrow("not accepted");
        await expect(importDemoData("local-demo", authorization, db)).rejects.toThrow("verified identity");
        expect((await getWorkspace("local-demo", db)).equipment).toHaveLength(3);
    });
    it("moves every owned record and parent relationship while preserving IDs and photo storage names", async () => {
        const target = await identity();
        const session = await createRecord("PracticeSession", "local-demo", {
            exerciseId: exercises[0].id,
            durationMinutes: 12,
            notes: "Valuable demo practice",
            assessment: {
                consistency: 2,
                smoothness: 3,
                coverage: 4,
                edgeControl: 3,
                surfaceDamage: 5,
                goals: "Repeat carefully",
            },
        }, db);
        await completeLesson("local-demo", lessons[0].id, db);
        const design = await createRecord("DesignProject", "local-demo", { name: "Demo drawing", document: newDocument() }, db);
        await createRecord("Goal", "local-demo", { title: "Keep the existing learning goal" }, db);
        (await db.query("INSERT INTO \"CoachingSession\"(id,\"profileId\",content,\"createdAt\") VALUES($1,$2,$3,$4)", ["coach-id",
            "local-demo",
            JSON.stringify({
                question: "My valuable question",
                response: { answer: "Saved coaching" },
            }),
            new Date().toISOString()]));
        (await db.query("INSERT INTO \"PracticePhoto\"(id,\"profileId\",\"sessionId\",filename,\"mimeType\",width,height,size,\"createdAt\") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["photo-id",
            "local-demo",
            String(session.id),
            "00000000-0000-4000-8000-000000000000.jpg",
            "image/jpeg",
            20,
            20,
            300,
            new Date().toISOString()]));
        (await db.query("UPDATE \"Profile\" SET name=$1,path=$2 WHERE id=$3", ["Demo workspace name",
            "linework",
            "local-demo"]));
        const result = await importDemoData(target.id, authorization, db);
        const imported = await getWorkspace(target.id, db), source = await getWorkspace("local-demo", db);
        expect(result.ok).toBe(true);
        expect(imported.equipment).toHaveLength(3);
        expect(imported.sessions[0].id).toBe(session.id);
        expect(imported.designs[0].id).toBe(design.id);
        expect(imported.lessonProgress).toHaveLength(1);
        expect(imported.goals).toHaveLength(1);
        expect(imported.coaching).toHaveLength(1);
        expect(imported.assessments).toHaveLength(1);
        expect(imported.photos[0].sessionId).toBe(session.id);
        expect((await db.query("SELECT filename,\"profileId\" FROM \"PracticePhoto\" WHERE id=$1", ["photo-id"])).rows[0]).toMatchObject({
            filename: "00000000-0000-4000-8000-000000000000.jpg",
            profileId: target.id,
        });
        expect(imported.profile.name).toBe("Demo workspace name");
        expect(source.profile.name).toBe("Demo workspace name");
        expect(source.equipment).toHaveLength(0);
        expect(source.sessions).toHaveLength(0);
        expect(source.photos).toHaveLength(0);
        await seedDatabase(db);
        expect((await getWorkspace("local-demo", db)).equipment).toHaveLength(0);
        await expect(importDemoData(target.id, authorization, db)).rejects.toThrow("already been imported");
        await expect(importDemoData((await identity("another")).id, authorization, db)).rejects.toThrow("already been imported");
    });
    it("refuses merging into nonempty targets without changing either workspace", async () => {
        const target = await identity();
        await createRecord("Goal", target.id, { title: "Existing valuable account goal" }, db);
        await expect(importDemoData(target.id, authorization, db)).rejects.toThrow("empty authenticated workspace");
        expect((await getWorkspace("local-demo", db)).equipment).toHaveLength(3);
        expect((await getWorkspace(target.id, db)).goals).toHaveLength(1);
        expect((await db.query("SELECT COUNT(*)::int AS n FROM \"DemoImportReceipt\"", [])).rows[0]?.n).toBe(0);
    });
    it("rolls back all moved records if a dependent write fails", async () => {
        const target = await identity();
        await createRecord("PracticeSession", "local-demo", { exerciseId: exercises[0].id, durationMinutes: 4 }, db);
        await db.query(`CREATE FUNCTION fail_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected transfer failure'; END $$`);
        await db.query(`CREATE TRIGGER fail_import BEFORE UPDATE OF "profileId" ON "PracticeSession" FOR EACH ROW EXECUTE FUNCTION fail_import()`);
        await expect(importDemoData(target.id, authorization, db)).rejects.toMatchObject({code:"P0001"});
        expect((await getWorkspace("local-demo", db)).equipment).toHaveLength(3);
        expect((await getWorkspace("local-demo", db)).sessions).toHaveLength(1);
        expect((await getWorkspace(target.id, db)).equipment).toHaveLength(0);
        expect((await db.query("SELECT COUNT(*)::int AS n FROM \"DemoImportReceipt\"", [])).rows[0]?.n).toBe(0);
    });
    it("does not allow cross-owner dependent writes at the database boundary", async () => {
        const first = await identity("first"), second = await identity("second");
        const session = await createRecord("PracticeSession", first.id, { exerciseId: exercises[0].id, durationMinutes: 3 }, db);
        await expect(db.query("INSERT INTO \"PracticePhoto\"(id,\"profileId\",\"sessionId\",filename,\"mimeType\",width,height,size,\"createdAt\") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["forbidden",
            second.id,
            String(session.id),
            "unique.jpg",
            "image/jpeg",
            10,
            10,
            1,
            new Date().toISOString()])).rejects.toMatchObject({code:"23503"});
        await expect(db.query("INSERT INTO \"SkillAssessment\"(id,\"profileId\",\"sessionId\",content,\"updatedAt\") VALUES($1,$2,$3,$4,$5)", ["forbidden-assessment",
            second.id,
            String(session.id),
            "{}",
            new Date().toISOString()])).rejects.toMatchObject({code:"23503"});
        (await db.query("INSERT INTO \"PracticePhoto\"(id,\"profileId\",\"sessionId\",filename,\"mimeType\",width,height,size,\"createdAt\") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", ["owned-photo",
            first.id,
            String(session.id),
            "owned.jpg",
            "image/jpeg",
            10,
            10,
            1,
            new Date().toISOString()]));
        await expect(db.query("UPDATE \"PracticePhoto\" SET \"profileId\"=$1 WHERE id=$2", [second.id, "owned-photo"])).rejects.toMatchObject({code:"23503"});
        (await db.query("INSERT INTO \"SkillAssessment\"(id,\"profileId\",\"sessionId\",content,\"updatedAt\") VALUES($1,$2,$3,$4,$5)", ["owned-assessment", first.id, String(session.id), "{}", new Date().toISOString()]));
        await expect(db.query("UPDATE \"SkillAssessment\" SET \"profileId\"=$1 WHERE id=$2", [second.id, "owned-assessment"])).rejects.toMatchObject({code:"23503"});
    });
});
