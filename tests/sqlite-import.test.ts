import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createTestDatabase, type TestDatabase } from "./fixtures/database";
import {
  IMPORT_CONFIRMATION,
  importSqliteToPostgres,
  LEGACY_IMPORT_TABLES,
  SqliteImportError,
} from "../src/lib/sqlite-import";
import type { Database, Queryable } from "../src/lib/database";
import type { QueryResultRow } from "pg";

let directory: string;
let fixture: TestDatabase;
const iso = "2026-01-02T03:04:05.123Z";
const authenticationTime = 1767323045123;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function legacy(version = 2) {
  const sourcePath = path.join(directory, `source-${randomUUID()}.sqlite`);
  const backupPath = path.join(directory, `backup-${randomUUID()}.sqlite`);
  const photosDirectory = path.join(directory, `photos-${randomUUID()}`);
  mkdirSync(photosDirectory);
  const db = new DatabaseSync(sourcePath);
  db.exec("PRAGMA journal_mode = WAL");
  for (const [index, name] of [
    "001_initial.sql",
    ...(version === 2 ? ["002_auth.sql"] : []),
  ].entries()) {
    db.exec(readFileSync(path.join(process.cwd(), "migrations", name), "utf8"));
    db.prepare("INSERT INTO SchemaMigration VALUES(?,?)").run(index + 1, iso);
  }
  for (const [id, name] of [
    ["local-demo", "Preserved demo artist"],
    ["profile-before-uuid", "AIBRY identity profile"],
  ]) {
    db.prepare("INSERT INTO Profile VALUES(?,?,?,?,?,?)").run(
      id,
      name,
      "beginner",
      "foundations",
      iso,
      iso,
    );
    db.prepare("INSERT INTO UserSettings VALUES(?,?,?,?)").run(
      id,
      "Rook",
      20,
      iso,
    );
  }
  db.prepare("INSERT INTO SeedMarker VALUES(?,?)").run(
    "sample-equipment-v1",
    iso,
  );
  db.prepare("INSERT INTO LearningModule VALUES(?,?)").run(
    "foundations",
    JSON.stringify({ id: "foundations", title: "Foundations" }),
  );
  db.prepare("INSERT INTO Lesson VALUES(?,?,?)").run(
    "machine-motion",
    "foundations",
    JSON.stringify({ id: "machine-motion" }),
  );
  db.prepare("INSERT INTO Exercise VALUES(?,?)").run(
    "straight-lines",
    JSON.stringify({ id: "straight-lines" }),
  );
  db.prepare("INSERT INTO TechniqueCard VALUES(?,?)").run(
    "card",
    JSON.stringify({ id: "card" }),
  );
  db.prepare("INSERT INTO ReferenceResource VALUES(?,?,?)").run(
    "resource",
    "card",
    JSON.stringify({ id: "resource" }),
  );
  db.prepare("INSERT INTO Equipment VALUES(?,?,?,?,?,?)").run(
    "legacy-equipment",
    "local-demo",
    "cartridge",
    JSON.stringify({
      kind: "cartridge",
      name: "Retained cartridge",
      code: "1205M1",
    }),
    iso,
    iso,
  );
  db.prepare("INSERT INTO Cartridge VALUES(?,?,?)").run(
    "legacy-equipment",
    "1205M1",
    "M1",
  );
  db.prepare("INSERT INTO Equipment VALUES(?,?,?,?,?,?)").run(
    "legacy-ink",
    "local-demo",
    "ink",
    JSON.stringify({ kind: "ink", name: "Practice-only ink" }),
    iso,
    iso,
  );
  db.prepare("INSERT INTO Ink VALUES(?,?,?)").run(
    "legacy-ink",
    "practice only",
    "2030-03",
  );
  db.prepare("INSERT INTO LessonProgress VALUES(?,?,?,?)").run(
    "progress",
    "local-demo",
    "machine-motion",
    iso,
  );
  db.prepare("INSERT INTO PracticeSession VALUES(?,?,?,?,?,?)").run(
    "practice-legacy",
    "local-demo",
    "straight-lines",
    JSON.stringify({
      exerciseId: "straight-lines",
      durationMinutes: 12.5,
      notes: "Private migration fixture note",
    }),
    iso,
    iso,
  );
  const photoId = randomUUID(),
    filename = `${photoId}.jpg`;
  const image = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#d8d8d8" },
  })
    .jpeg()
    .toBuffer();
  writeFileSync(path.join(photosDirectory, filename), image);
  db.prepare("INSERT INTO PracticePhoto VALUES(?,?,?,?,?,?,?,?,?)").run(
    photoId,
    "local-demo",
    "practice-legacy",
    filename,
    "image/jpeg",
    12,
    8,
    image.length,
    iso,
  );
  db.prepare("INSERT INTO SkillAssessment VALUES(?,?,?,?,?)").run(
    "assessment",
    "local-demo",
    "practice-legacy",
    JSON.stringify({ consistency: 3 }),
    iso,
  );
  db.prepare("INSERT INTO DesignProject VALUES(?,?,?,?,?)").run(
    "design-legacy",
    "local-demo",
    JSON.stringify({
      name: "Original practice design",
      document: { version: 1, elements: [] },
    }),
    iso,
    iso,
  );
  db.prepare("INSERT INTO CoachingSession VALUES(?,?,?,?)").run(
    "coach-legacy",
    "local-demo",
    JSON.stringify({
      question: "Private test question",
      response: { source: "offline" },
    }),
    iso,
  );
  db.prepare("INSERT INTO Goal VALUES(?,?,?,?,?)").run(
    "goal-legacy",
    "local-demo",
    JSON.stringify({ title: "Retain IDs and privacy", completed: false }),
    iso,
    iso,
  );
  if (version === 2) {
    db.prepare("INSERT INTO OidcIdentity VALUES(?,?,?,?,?,?,?,?)").run(
      "identity",
      "profile-before-uuid",
      "https://id.aibrylabs.com",
      "immutable-subject",
      "fixture@example.invalid",
      "AIBRY name",
      authenticationTime,
      authenticationTime,
    );
    db.prepare("INSERT INTO AppSession VALUES(?,?,?,?,?)").run(
      hash("opaque-session-never-exported"),
      "profile-before-uuid",
      authenticationTime,
      authenticationTime + 28_800_000,
      null,
    );
    db.prepare("INSERT INTO LoginTransaction VALUES(?,?,?,?,?,?,?)").run(
      hash("state"),
      hash("browser"),
      "nonce-private-test-value",
      "p".repeat(43),
      "/learn",
      authenticationTime,
      authenticationTime + 600_000,
    );
    db.prepare("INSERT INTO DemoImportReceipt VALUES(?,?,?,?)").run(
      "local-demo",
      "profile-before-uuid",
      authenticationTime,
      JSON.stringify({ recordCounts: { Equipment: 1 } }),
    );
  }
  await backup(db, backupPath);
  db.close();
  return { sourcePath, backupPath, photosDirectory, photoId, filename };
}
const options = (
  data: Awaited<ReturnType<typeof legacy>>,
  database: Database = fixture.db,
) => ({ ...data, confirmation: IMPORT_CONFIRMATION, database });
const rowCount = async (table: string) =>
  Number(
    (await fixture.db.query(`SELECT COUNT(*)::text AS n FROM "${table}"`))
      .rows[0].n,
  );

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "midnight-sqlite-import-"));
  fixture = await createTestDatabase({ seed: false });
});
afterEach(async () => {
  await fixture?.cleanup();
  rmSync(directory, { recursive: true, force: true });
});

describe("operator-controlled SQLite to PostgreSQL conversion", () => {
  it("imports every logical table with exact IDs, timestamps, identity mappings and redacted verification", async () => {
    const data = await legacy();
    const before = hash(readFileSync(data.sourcePath).toString("base64"));
    const report = await importSqliteToPostgres(options(data));
    expect(report).toMatchObject({
      sourceSchemaVersion: 2,
      verifiedBackup: true,
      photoFilesVerified: 1,
      rowCountsVerified: true,
      contentVerified: true,
      sourceUnchanged: true,
    });
    for (const table of LEGACY_IMPORT_TABLES)
      expect(await rowCount(table)).toBe(report.tableCounts[table]);
    expect(
      (
        await fixture.db.query('SELECT * FROM "Profile" WHERE id=$1', [
          "profile-before-uuid",
        ])
      ).rows[0],
    ).toMatchObject({ id: "profile-before-uuid", createdAt: iso });
    expect(
      (await fixture.db.query('SELECT * FROM "OidcIdentity"')).rows[0],
    ).toMatchObject({
      subject: "immutable-subject",
      createdAt: authenticationTime,
    });
    expect(
      (await fixture.db.query('SELECT * FROM "AppSession"')).rows[0],
    ).toMatchObject({
      tokenHash: hash("opaque-session-never-exported"),
      expiresAt: authenticationTime + 28_800_000,
    });
    expect(
      (await fixture.db.query('SELECT * FROM "PracticePhoto"')).rows[0],
    ).toMatchObject({
      id: data.photoId,
      profileId: "local-demo",
      filename: data.filename,
    });
    expect(
      (await fixture.db.query('SELECT * FROM "DemoImportReceipt"')).rows[0],
    ).toMatchObject({
      sourceProfileId: "local-demo",
      targetProfileId: "profile-before-uuid",
    });
    expect(hash(readFileSync(data.sourcePath).toString("base64"))).toBe(before);
    const redacted = JSON.stringify(report);
    for (const secret of [
      "fixture@example.invalid",
      "immutable-subject",
      "Private test question",
      data.filename,
      hash("opaque-session-never-exported"),
      "nonce-private-test-value",
    ])
      expect(redacted).not.toContain(secret);
  });
  it("supports an authentic original-v1 database without creating authenticated ownership", async () => {
    const data = await legacy(1);
    await importSqliteToPostgres(options(data));
    expect(await rowCount("OidcIdentity")).toBe(0);
    expect(await rowCount("AppSession")).toBe(0);
    expect(await rowCount("DemoImportReceipt")).toBe(0);
    expect(
      (await fixture.db.query('SELECT "profileId" FROM "PracticeSession"'))
        .rows[0].profileId,
    ).toBe("local-demo");
  });
  it("does not require a nonexistent photo directory when no photos are referenced", async () => {
    const data = await legacy();
    const writer = new DatabaseSync(data.sourcePath);
    writer.exec("DELETE FROM PracticePhoto");
    rmSync(data.backupPath);
    await backup(writer, data.backupPath);
    writer.close();
    rmSync(data.photosDirectory, { recursive: true });
    const report = await importSqliteToPostgres(options(data));
    expect(report.photoFilesVerified).toBe(0);
    expect(await rowCount("PracticePhoto")).toBe(0);
  });
  it("requires a distinct pre-existing verified backup and deliberate offline/empty-target confirmation", async () => {
    const data = await legacy();
    await expect(
      importSqliteToPostgres({ ...options(data), confirmation: "" }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await expect(
      importSqliteToPostgres({
        ...options(data),
        backupPath: path.join(directory, "missing.sqlite"),
      }),
    ).rejects.toMatchObject({ code: "BACKUP_REQUIRED" });
    await expect(
      importSqliteToPostgres({ ...options(data), backupPath: data.sourcePath }),
    ).rejects.toMatchObject({ code: "BACKUP_REQUIRED" });
    expect(await rowCount("Profile")).toBe(0);
  });
  it("rejects a stale backup and an unexpected source schema without touching the destination", async () => {
    const data = await legacy();
    const source = new DatabaseSync(data.sourcePath);
    source
      .prepare("UPDATE Profile SET name=? WHERE id=?")
      .run("Changed after backup", "local-demo");
    source.close();
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "BACKUP_MISMATCH",
    });
    const data2 = await legacy();
    const altered = new DatabaseSync(data2.sourcePath);
    altered.exec("CREATE TABLE Unexpected(secret TEXT)");
    altered.close();
    await expect(importSqliteToPostgres(options(data2))).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
    expect(await rowCount("Profile")).toBe(0);
  });
  it("rejects ambiguous timestamps rather than applying the operator machine timezone", async () => {
    const data = await legacy();
    const writer = new DatabaseSync(data.sourcePath);
    writer
      .prepare("UPDATE Profile SET createdAt=? WHERE id=?")
      .run("2026-01-02T03:04:05", "local-demo");
    rmSync(data.backupPath);
    await backup(writer, data.backupPath);
    writer.close();
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
    expect(await rowCount("Profile")).toBe(0);
  });
  it("refuses occupied destinations instead of overwriting profiles or curriculum", async () => {
    const data = await legacy();
    await fixture.db.query(
      'INSERT INTO "LearningModule"(id,content) VALUES($1,$2::jsonb)',
      ["already-present", "{}"],
    );
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "DESTINATION_OCCUPIED",
    });
    expect(await rowCount("Profile")).toBe(0);
    expect(await rowCount("LearningModule")).toBe(1);
  });
  it("refuses pending deletion work and replayed imports", async () => {
    const data = await legacy();
    await fixture.db.query(
      'INSERT INTO "PhotoDeletionQueue"(filename) VALUES($1)',
      [randomUUID() + ".jpg"],
    );
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "DESTINATION_OCCUPIED",
    });
    await fixture.db.query('DELETE FROM "PhotoDeletionQueue"');
    await importSqliteToPostgres(options(data));
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "DESTINATION_OCCUPIED",
    });
  });
  it("rejects missing, forged, or changed photo files before importing records", async () => {
    const data = await legacy();
    writeFileSync(
      path.join(data.photosDirectory, data.filename),
      Buffer.from("not a jpeg"),
    );
    await expect(importSqliteToPostgres(options(data))).rejects.toMatchObject({
      code: "PHOTO_INVALID",
    });
    expect(await rowCount("Profile")).toBe(0);
  });
  it("rejects a destination without the complete verified PostgreSQL migration ledger", async () => {
    const data = await legacy();
    const raw = await createTestDatabase({ migrate: false });
    try {
      await expect(
        importSqliteToPostgres(options(data, raw.db)),
      ).rejects.toMatchObject({ code: "DESTINATION_NOT_READY" });
    } finally {
      await raw.cleanup();
    }
  });
  it("aborts and rolls back if a WAL-mode source changes during the PostgreSQL transaction", async () => {
    const data = await legacy();
    let changed = false;
    const changing: Database = {
      ...fixture.db,
      query: fixture.db.query.bind(fixture.db),
      end: fixture.db.end.bind(fixture.db),
      transaction: (fn) =>
        fixture.db.transaction((tx) => {
          const decorated: Queryable = {
            query: async <R extends QueryResultRow>(
              text: string,
              values?: unknown[],
            ) => {
              const result = await tx.query<R>(text, values);
              if (!changed && text.startsWith("INSERT INTO")) {
                changed = true;
                const writer = new DatabaseSync(data.sourcePath);
                writer
                  .prepare("UPDATE Profile SET name=? WHERE id=?")
                  .run("Concurrent writer", "local-demo");
                writer.close();
              }
              return result;
            },
          };
          return fn(decorated);
        }),
    };
    await expect(
      importSqliteToPostgres(options(data, changing)),
    ).rejects.toMatchObject({ code: "SOURCE_CHANGED" });
    expect(await rowCount("Profile")).toBe(0);
  });
  it("rolls back all destination records when a late insert fails and hides database details", async () => {
    const data = await legacy();
    const failing: Database = {
      ...fixture.db,
      query: fixture.db.query.bind(fixture.db),
      end: fixture.db.end.bind(fixture.db),
      transaction: (fn) =>
        fixture.db.transaction((tx) => {
          const decorated: Queryable = {
            query: async <R extends QueryResultRow>(
              text: string,
              values?: unknown[],
            ) => {
              if (text.startsWith('INSERT INTO "DemoImportReceipt"'))
                throw new Error(
                  "postgres://secret-password@example.invalid/private SQL value",
                );
              return tx.query<R>(text, values);
            },
          };
          return fn(decorated);
        }),
    };
    let failure: unknown;
    try {
      await importSqliteToPostgres(options(data, failing));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(SqliteImportError);
    expect(String(failure)).not.toContain("secret-password");
    for (const table of LEGACY_IMPORT_TABLES)
      expect(await rowCount(table)).toBe(0);
  });
});
