import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  initializeDatabase,
  getWorkspace,
  createRecord,
  completeLesson,
  seedDatabase,
  applyMigrations,
} from "../src/lib/db";
import {
  upsertIdentity,
  getIdentity,
  createSession,
  findSession,
  revokeSession,
  createLoginTransaction,
  consumeLoginTransaction,
  cleanupAuth,
} from "../src/lib/auth-store";
import { importDemoData } from "../src/lib/demo-import";
import { lessons, exercises } from "../src/lib/curriculum";
import { newDocument } from "../src/lib/design";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const authorization = "one-time-test-authorization-token-of-sufficient-length";
const issuer = "https://id.example.test";
let db: DatabaseSync;
const previousImportHash = process.env.DEMO_IMPORT_TOKEN_HASH;
beforeEach(() => {
  db = initializeDatabase(":memory:");
  process.env.DEMO_IMPORT_TOKEN_HASH = hash(authorization);
});
afterEach(() => {
  db.close();
  if (previousImportHash === undefined)
    delete process.env.DEMO_IMPORT_TOKEN_HASH;
  else process.env.DEMO_IMPORT_TOKEN_HASH = previousImportHash;
});
function identity(subject = "test-subject", email = "same@example.test") {
  return upsertIdentity({ issuer, subject, email, name: "Test Artist" }, db);
}

describe("verified identity persistence", () => {
  it("upgrades a real version-one database without rewriting or losing local data", () => {
    const oldDb = new DatabaseSync(":memory:");
    try {
      oldDb.exec(
        readFileSync(
          path.join(process.cwd(), "migrations/001_initial.sql"),
          "utf8",
        ),
      );
      oldDb
        .prepare("INSERT INTO SchemaMigration(version,appliedAt) VALUES(?,?)")
        .run(1, new Date().toISOString());
      oldDb
        .prepare(
          "INSERT INTO Profile(id,name,level,path,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
        )
        .run(
          "local-demo",
          "Existing learner",
          "beginner",
          "drawing",
          "before",
          "before",
        );
      oldDb
        .prepare(
          "INSERT INTO Equipment(id,profileId,kind,content,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
        )
        .run(
          "valuable-equipment",
          "local-demo",
          "machine",
          JSON.stringify({ name: "Existing pen", notes: "Keep my notes" }),
          "before",
          "before",
        );
      applyMigrations(oldDb);
      applyMigrations(oldDb);
      expect(
        oldDb
          .prepare("SELECT name,path FROM Profile WHERE id=?")
          .get("local-demo"),
      ).toMatchObject({ name: "Existing learner", path: "drawing" });
      expect(
        oldDb
          .prepare("SELECT content FROM Equipment WHERE id=?")
          .get("valuable-equipment")?.content,
      ).toContain("Keep my notes");
      expect(
        oldDb
          .prepare("SELECT version FROM SchemaMigration ORDER BY version")
          .all(),
      ).toHaveLength(2);
      expect(
        oldDb.prepare("SELECT COUNT(*) AS n FROM OidcIdentity").get()?.n,
      ).toBe(0);
    } finally {
      oldDb.close();
    }
  });
  it("uses immutable issuer+subject, not email, and never auto-assigns demo data", () => {
    const first = identity("one");
    const other = identity("two");
    expect(first.id).not.toBe(other.id);
    expect(first.id).not.toBe("local-demo");
    expect(getWorkspace(first.id, db).equipment).toHaveLength(0);
    expect(getWorkspace("local-demo", db).equipment).toHaveLength(3);
    const updated = upsertIdentity(
      {
        issuer,
        subject: "one",
        email: "new@example.test",
        name: "Changed provider name",
      },
      db,
    );
    expect(updated.id).toBe(first.id);
    expect(getIdentity(first.id, db)?.email).toBe("new@example.test");
    expect(updated.name).toBe("Test Artist");
    const anotherIssuer = upsertIdentity(
      { issuer: "https://other.example.test", subject: "one" },
      db,
    );
    expect(anotherIssuer.id).not.toBe(first.id);
  });
  it("persists hashed sessions across actual database reopen and revokes them", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "midnight-session-"));
    const filename = path.join(directory, "db.sqlite");
    let fileDb: DatabaseSync | undefined;
    try {
      fileDb = initializeDatabase(filename);
      const profile = upsertIdentity({ issuer, subject: "persistent" }, fileDb);
      createSession(
        profile.id,
        hash("opaque-session-secret"),
        Date.now() + 60_000,
        fileDb,
      );
      fileDb.close();
      fileDb = initializeDatabase(filename);
      expect(
        findSession(hash("opaque-session-secret"), fileDb)?.profileId,
      ).toBe(profile.id);
      expect(
        fileDb.prepare("SELECT tokenHash FROM AppSession").get()?.tokenHash,
      ).toBe(hash("opaque-session-secret"));
      revokeSession(hash("opaque-session-secret"), fileDb);
      expect(findSession(hash("opaque-session-secret"), fileDb)).toBeNull();
    } finally {
      fileDb?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects demo sessions and expires stored sessions without fallback", () => {
    expect(() =>
      createSession("local-demo", hash("demo-token"), Date.now() + 60_000, db),
    ).toThrow("authenticated identity");
    const profile = identity();
    const tokenHash = hash("expiring");
    createSession(profile.id, tokenHash, Date.now() + 60_000, db);
    db.prepare(
      "UPDATE AppSession SET createdAt=?,expiresAt=? WHERE tokenHash=?",
    ).run(Date.now() - 120_000, Date.now() - 60_000, tokenHash);
    expect(findSession(tokenHash, db)).toBeNull();
    cleanupAuth(db);
    expect(db.prepare("SELECT COUNT(*) AS n FROM AppSession").get()?.n).toBe(0);
  });
  it("consumes a login attempt once, requires its browser binding and expires it", () => {
    const txn = {
      stateHash: hash("state"),
      browserHash: hash("browser"),
      nonce: "random-nonce-at-least-16",
      pkceVerifier: "v".repeat(43),
      returnTo: "/practice",
      expiresAt: Date.now() + 60_000,
    };
    createLoginTransaction(txn, db);
    expect(
      consumeLoginTransaction(txn.stateHash, hash("wrong-browser"), db),
    ).toBeNull();
    expect(
      consumeLoginTransaction(txn.stateHash, txn.browserHash, db)?.returnTo,
    ).toBe("/practice");
    expect(
      consumeLoginTransaction(txn.stateHash, txn.browserHash, db),
    ).toBeNull();
    createLoginTransaction({ ...txn, stateHash: hash("expired") }, db);
    db.prepare(
      "UPDATE LoginTransaction SET createdAt=?,expiresAt=? WHERE stateHash=?",
    ).run(Date.now() - 120_000, Date.now() - 60_000, hash("expired"));
    expect(
      consumeLoginTransaction(hash("expired"), txn.browserHash, db),
    ).toBeNull();
  });
});

describe("one-time deliberate demo import", () => {
  it("requires operator configuration, authorization, and a verified target", () => {
    const profile = identity();
    delete process.env.DEMO_IMPORT_TOKEN_HASH;
    expect(() => importDemoData(profile.id, authorization, db)).toThrow(
      "not enabled",
    );
    process.env.DEMO_IMPORT_TOKEN_HASH = hash(authorization);
    expect(() =>
      importDemoData(
        profile.id,
        "incorrect-authorization-long-enough-to-pass-length",
        db,
      ),
    ).toThrow("not accepted");
    expect(() => importDemoData("local-demo", authorization, db)).toThrow(
      "verified identity",
    );
    expect(getWorkspace("local-demo", db).equipment).toHaveLength(3);
  });
  it("moves every owned record and parent relationship while preserving IDs and photo storage names", () => {
    const target = identity();
    const session = createRecord(
      "PracticeSession",
      "local-demo",
      {
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
      },
      db,
    );
    completeLesson("local-demo", lessons[0].id, db);
    const design = createRecord(
      "DesignProject",
      "local-demo",
      { name: "Demo drawing", document: newDocument() },
      db,
    );
    createRecord(
      "Goal",
      "local-demo",
      { title: "Keep the existing learning goal" },
      db,
    );
    db.prepare(
      "INSERT INTO CoachingSession(id,profileId,content,createdAt) VALUES(?,?,?,?)",
    ).run(
      "coach-id",
      "local-demo",
      JSON.stringify({
        question: "My valuable question",
        response: { answer: "Saved coaching" },
      }),
      new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO PracticePhoto(id,profileId,sessionId,filename,mimeType,width,height,size,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      "photo-id",
      "local-demo",
      String(session.id),
      "00000000-0000-4000-8000-000000000000.jpg",
      "image/jpeg",
      20,
      20,
      300,
      new Date().toISOString(),
    );
    db.prepare("UPDATE Profile SET name=?,path=? WHERE id=?").run(
      "Demo workspace name",
      "linework",
      "local-demo",
    );
    const result = importDemoData(target.id, authorization, db);
    const imported = getWorkspace(target.id, db),
      source = getWorkspace("local-demo", db);
    expect(result.ok).toBe(true);
    expect(imported.equipment).toHaveLength(3);
    expect(imported.sessions[0].id).toBe(session.id);
    expect(imported.designs[0].id).toBe(design.id);
    expect(imported.lessonProgress).toHaveLength(1);
    expect(imported.goals).toHaveLength(1);
    expect(imported.coaching).toHaveLength(1);
    expect(imported.assessments).toHaveLength(1);
    expect(imported.photos[0].sessionId).toBe(session.id);
    expect(
      db
        .prepare("SELECT filename,profileId FROM PracticePhoto WHERE id=?")
        .get("photo-id"),
    ).toMatchObject({
      filename: "00000000-0000-4000-8000-000000000000.jpg",
      profileId: target.id,
    });
    expect(imported.profile.name).toBe("Demo workspace name");
    expect(source.profile.name).toBe("Demo workspace name");
    expect(source.equipment).toHaveLength(0);
    expect(source.sessions).toHaveLength(0);
    expect(source.photos).toHaveLength(0);
    seedDatabase(db);
    expect(getWorkspace("local-demo", db).equipment).toHaveLength(0);
    expect(() => importDemoData(target.id, authorization, db)).toThrow(
      "already been imported",
    );
    expect(() =>
      importDemoData(identity("another").id, authorization, db),
    ).toThrow("already been imported");
  });
  it("refuses merging into nonempty targets without changing either workspace", () => {
    const target = identity();
    createRecord(
      "Goal",
      target.id,
      { title: "Existing valuable account goal" },
      db,
    );
    expect(() => importDemoData(target.id, authorization, db)).toThrow(
      "empty authenticated workspace",
    );
    expect(getWorkspace("local-demo", db).equipment).toHaveLength(3);
    expect(getWorkspace(target.id, db).goals).toHaveLength(1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM DemoImportReceipt").get()?.n,
    ).toBe(0);
  });
  it("rolls back all moved records if a dependent write fails", () => {
    const target = identity();
    createRecord(
      "PracticeSession",
      "local-demo",
      { exerciseId: exercises[0].id, durationMinutes: 4 },
      db,
    );
    db.exec(
      "CREATE TRIGGER FailImport BEFORE UPDATE OF profileId ON PracticeSession BEGIN SELECT RAISE(ABORT, 'injected transfer failure'); END",
    );
    expect(() => importDemoData(target.id, authorization, db)).toThrow(
      "injected transfer failure",
    );
    expect(getWorkspace("local-demo", db).equipment).toHaveLength(3);
    expect(getWorkspace("local-demo", db).sessions).toHaveLength(1);
    expect(getWorkspace(target.id, db).equipment).toHaveLength(0);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM DemoImportReceipt").get()?.n,
    ).toBe(0);
  });
  it("does not allow cross-owner dependent writes at the database boundary", () => {
    const first = identity("first"),
      second = identity("second");
    const session = createRecord(
      "PracticeSession",
      first.id,
      { exerciseId: exercises[0].id, durationMinutes: 3 },
      db,
    );
    expect(() =>
      db
        .prepare(
          "INSERT INTO PracticePhoto(id,profileId,sessionId,filename,mimeType,width,height,size,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          "forbidden",
          second.id,
          String(session.id),
          "unique.jpg",
          "image/jpeg",
          10,
          10,
          1,
          new Date().toISOString(),
        ),
    ).toThrow("ownership");
    expect(() =>
      db
        .prepare(
          "INSERT INTO SkillAssessment(id,profileId,sessionId,content,updatedAt) VALUES(?,?,?,?,?)",
        )
        .run(
          "forbidden-assessment",
          second.id,
          String(session.id),
          "{}",
          "now",
        ),
    ).toThrow("ownership");
    db.prepare(
      "INSERT INTO PracticePhoto(id,profileId,sessionId,filename,mimeType,width,height,size,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      "owned-photo",
      first.id,
      String(session.id),
      "owned.jpg",
      "image/jpeg",
      10,
      10,
      1,
      new Date().toISOString(),
    );
    expect(() =>
      db
        .prepare("UPDATE PracticePhoto SET profileId=? WHERE id=?")
        .run(second.id, "owned-photo"),
    ).toThrow("ownership");
    db.prepare(
      "INSERT INTO SkillAssessment(id,profileId,sessionId,content,updatedAt) VALUES(?,?,?,?,?)",
    ).run("owned-assessment", first.id, String(session.id), "{}", "now");
    expect(() =>
      db
        .prepare("UPDATE SkillAssessment SET profileId=? WHERE id=?")
        .run(second.id, "owned-assessment"),
    ).toThrow("ownership");
  });
});
