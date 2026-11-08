/** Operator-only legacy import. This module is never imported by the web runtime. */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { Database, Queryable } from "./database";
import { verifyDatabaseSchema } from "./db";

const columns = {
  Profile: ["id", "name", "level", "path", "createdAt", "updatedAt"],
  SeedMarker: ["name", "appliedAt"],
  UserSettings: ["profileId", "coachName", "goalMinutes", "updatedAt"],
  LearningModule: ["id", "content"],
  Lesson: ["id", "moduleId", "content"],
  Exercise: ["id", "content"],
  TechniqueCard: ["id", "content"],
  ReferenceResource: ["id", "techniqueCardId", "content"],
  Equipment: ["id", "profileId", "kind", "content", "createdAt", "updatedAt"],
  Cartridge: ["equipmentId", "code", "configuration"],
  Ink: ["equipmentId", "purpose", "expiresAt"],
  LessonProgress: ["id", "profileId", "lessonId", "completedAt"],
  PracticeSession: [
    "id",
    "profileId",
    "exerciseId",
    "content",
    "createdAt",
    "updatedAt",
  ],
  PracticePhoto: [
    "id",
    "profileId",
    "sessionId",
    "filename",
    "mimeType",
    "width",
    "height",
    "size",
    "createdAt",
  ],
  SkillAssessment: ["id", "profileId", "sessionId", "content", "updatedAt"],
  DesignProject: ["id", "profileId", "content", "createdAt", "updatedAt"],
  CoachingSession: ["id", "profileId", "content", "createdAt"],
  Goal: ["id", "profileId", "content", "createdAt", "updatedAt"],
  OidcIdentity: [
    "id",
    "profileId",
    "issuer",
    "subject",
    "email",
    "name",
    "createdAt",
    "updatedAt",
  ],
  AppSession: ["tokenHash", "profileId", "createdAt", "expiresAt", "revokedAt"],
  LoginTransaction: [
    "stateHash",
    "browserHash",
    "nonce",
    "pkceVerifier",
    "returnTo",
    "createdAt",
    "expiresAt",
  ],
  DemoImportReceipt: [
    "sourceProfileId",
    "targetProfileId",
    "createdAt",
    "details",
  ],
} as const;
export type LegacyTable = keyof typeof columns;
export const LEGACY_IMPORT_TABLES = Object.keys(columns) as LegacyTable[];
const authTables = new Set<LegacyTable>([
  "OidcIdentity",
  "AppSession",
  "LoginTransaction",
  "DemoImportReceipt",
]);
const jsonColumns = new Set(["content", "details"]);
const integerColumns = new Set([
  "goalMinutes",
  "width",
  "height",
  "size",
  "version",
]);
const authenticationTimes = new Set<LegacyTable>([
  "OidcIdentity",
  "AppSession",
  "LoginTransaction",
  "DemoImportReceipt",
]);
const isoColumns = new Set([
  "createdAt",
  "updatedAt",
  "completedAt",
  "appliedAt",
]);
const expectedTables = (version: number) =>
  [
    "SchemaMigration",
    ...LEGACY_IMPORT_TABLES.filter((t) => version === 2 || !authTables.has(t)),
  ].sort();
const quote = (identifier: string) => `"${identifier}"`; // Only constants from the explicit mappings reach here.
const IMPORT_CONFIRMATION = "APPLICATION_STOPPED_AND_EMPTY_DESTINATION";
export { IMPORT_CONFIRMATION };

type Row = Record<string, unknown>;
type Snapshot = {
  version: number;
  rows: Record<LegacyTable, Row[]>;
  counts: Record<LegacyTable, number>;
  digests: Record<LegacyTable, string>;
  schemaDigest: string;
};
export type ImportErrorCode =
  | "CONFIRMATION_REQUIRED"
  | "SOURCE_INVALID"
  | "BACKUP_REQUIRED"
  | "BACKUP_MISMATCH"
  | "SOURCE_CHANGED"
  | "PHOTO_INVALID"
  | "DESTINATION_NOT_READY"
  | "DESTINATION_OCCUPIED"
  | "IMPORT_FAILED";
export class SqliteImportError extends Error {
  constructor(
    public code: ImportErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export interface SqliteImportOptions {
  sourcePath: string;
  backupPath: string;
  photosDirectory: string;
  confirmation: string;
  database: Database;
}
export interface SqliteImportReport {
  formatVersion: 1;
  sourceSchemaVersion: number;
  verifiedBackup: true;
  photoFilesVerified: number;
  tableCounts: Record<LegacyTable, number>;
  rowCountsVerified: true;
  contentVerified: true;
  sourceUnchanged: true;
  completedAt: string;
}

function fail(code: ImportErrorCode, message: string): never {
  throw new SqliteImportError(code, message);
}
function regularFile(filename: string, code: ImportErrorCode) {
  try {
    const info = lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error();
    return { real: realpathSync(filename), info };
  } catch {
    return fail(
      code,
      code === "BACKUP_REQUIRED"
        ? "Provide a pre-existing regular SQLite backup file."
        : "The SQLite source must be an existing regular file.",
    );
  }
}
function fileVersion(filename: string) {
  try {
    const s = statSync(filename, { bigint: true });
    return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function diskVersion(filename: string) {
  let wal: string | null = null;
  try {
    if (statSync(`${filename}-wal`, { bigint: true }).size > 32n)
      wal = fileVersion(`${filename}-wal`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // SQLite may create an empty WAL/SHM coordination sidecar for a read-only
  // connection. An empty/header-only WAL contains no application data.
  return [fileVersion(filename), wal];
}
function unchanged(filename: string, expected: ReturnType<typeof diskVersion>) {
  return JSON.stringify(diskVersion(filename)) === JSON.stringify(expected);
}
function ddl(value: unknown) {
  return String(value)
    .replace(/\bIF NOT EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .trim()
    .toLowerCase();
}
function schemaRows(db: DatabaseSync) {
  return db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all()
    .map((row) => ({
      type: String(row.type),
      name: String(row.name),
      table: String(row.tbl_name),
      sql: ddl(row.sql),
    }));
}
function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    )
      fail(
        "SOURCE_INVALID",
        "A numeric value cannot be preserved safely by this application.",
      );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Row)[k])}`)
      .join(",")}}`;
  return fail(
    "SOURCE_INVALID",
    "A legacy record contains an unsupported value.",
  );
}
function normalizedRow(table: LegacyTable, row: Row): Row {
  const normalized: Row = {};
  for (const col of columns[table]) {
    let value = row[col];
    if (typeof value === "bigint") {
      if (
        value > BigInt(Number.MAX_SAFE_INTEGER) ||
        value < BigInt(Number.MIN_SAFE_INTEGER)
      )
        fail(
          "SOURCE_INVALID",
          "A legacy integer cannot be represented safely by this application.",
        );
      value = Number(value);
    }
    if (value === null) {
      normalized[col] = null;
      continue;
    }
    if (jsonColumns.has(col)) {
      try {
        value = typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        fail("SOURCE_INVALID", "A legacy JSON record could not be decoded.");
      }
      canonical(value);
    } else if (isoColumns.has(col) && !authenticationTimes.has(table)) {
      if (
        !(value instanceof Date) &&
        (typeof value !== "string" ||
          !z.iso.datetime({ offset: true }).safeParse(value).success ||
          /\.\d{4,}/.test(value))
      ) {
        fail(
          "SOURCE_INVALID",
          "A legacy timestamp is ambiguous or exceeds supported millisecond precision.",
        );
      }
      const date = value instanceof Date ? value : new Date(String(value));
      if (!Number.isFinite(date.getTime()))
        fail("SOURCE_INVALID", "A legacy timestamp could not be preserved.");
      value = date.toISOString();
    } else if (
      integerColumns.has(col) ||
      (authenticationTimes.has(table) &&
        ["createdAt", "updatedAt", "expiresAt", "revokedAt"].includes(col))
    ) {
      value = typeof value === "string" ? Number(value) : value;
      if (typeof value !== "number" || !Number.isSafeInteger(value))
        fail("SOURCE_INVALID", "A legacy integer could not be preserved.");
    } else if (typeof value !== "string")
      fail("SOURCE_INVALID", "A legacy column has an unsupported type.");
    normalized[col] = value;
  }
  return normalized;
}
function digestRows(table: LegacyTable, rows: Row[]) {
  const hash = createHash("sha256");
  for (const value of rows
    .map((row) => canonical(normalizedRow(table, row)))
    .sort())
    hash.update(value).update("\n");
  return hash.digest("hex");
}
function readSnapshot(db: DatabaseSync): Snapshot {
  let versions: number[];
  try {
    versions = db
      .prepare("SELECT version FROM SchemaMigration ORDER BY version")
      .all()
      .map((row) => Number(row.version));
  } catch {
    return fail(
      "SOURCE_INVALID",
      "The source does not contain a supported Midnight Ink migration ledger.",
    );
  }
  if (
    JSON.stringify(versions) !== "[1]" &&
    JSON.stringify(versions) !== "[1,2]"
  )
    fail(
      "SOURCE_INVALID",
      "Only completed Midnight Ink SQLite schema versions 1 and 2 are supported.",
    );
  const version = versions.length;
  const reference = new DatabaseSync(":memory:");
  let schemaDigest: string;
  try {
    for (const filename of [
      "001_initial.sql",
      ...(version === 2 ? ["002_auth.sql"] : []),
    ])
      reference.exec(
        readFileSync(path.join(process.cwd(), "migrations", filename), "utf8"),
      );
    const actual = schemaRows(db),
      expected = schemaRows(reference);
    if (canonical(actual) !== canonical(expected))
      fail(
        "SOURCE_INVALID",
        "The source schema differs from the supported original SQLite migrations.",
      );
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    if (JSON.stringify(tables) !== JSON.stringify(expectedTables(version)))
      fail(
        "SOURCE_INVALID",
        "The source contains unexpected or missing tables.",
      );
    schemaDigest = createHash("sha256").update(canonical(actual)).digest("hex");
  } finally {
    reference.close();
  }
  if (
    db
      .prepare("PRAGMA integrity_check")
      .all()
      .some((row) => Object.values(row)[0] !== "ok") ||
    db.prepare("PRAGMA foreign_key_check").all().length
  )
    fail(
      "SOURCE_INVALID",
      "The SQLite source failed integrity or foreign-key checks.",
    );
  const rows = {} as Record<LegacyTable, Row[]>,
    counts = {} as Record<LegacyTable, number>,
    digests = {} as Record<LegacyTable, string>;
  for (const table of LEGACY_IMPORT_TABLES) {
    if (version === 1 && authTables.has(table)) rows[table] = [];
    else {
      const statement = db.prepare(
        `SELECT ${columns[table].map(quote).join(",")} FROM ${quote(table)}`,
      );
      statement.setReadBigInts(true);
      rows[table] = statement.all();
    }
    for (const row of rows[table]) normalizedRow(table, row);
    counts[table] = rows[table].length;
    digests[table] = digestRows(table, rows[table]);
  }
  for (const child of ["PracticePhoto", "SkillAssessment"] as const) {
    if (
      db
        .prepare(
          `SELECT 1 FROM ${quote(child)} c JOIN PracticeSession s ON s.id=c.sessionId WHERE c.profileId<>s.profileId LIMIT 1`,
        )
        .get()
    )
      fail(
        "SOURCE_INVALID",
        "A dependent legacy record does not match its parent owner.",
      );
  }
  return { version, rows, counts, digests, schemaDigest };
}
async function verifyPhotos(snapshot: Snapshot, directory: string) {
  if (snapshot.rows.PracticePhoto.length === 0)
    return new Map<string, string>();
  let root: string;
  try {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
    root = realpathSync(directory);
  } catch {
    return fail(
      "PHOTO_INVALID",
      "Provide the existing regular directory containing the normalized practice photos.",
    );
  }
  const fingerprints = new Map<string, string>();
  for (const row of snapshot.rows.PracticePhoto) {
    if (
      typeof row.filename !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/.test(
        row.filename,
      ) ||
      row.mimeType !== "image/jpeg"
    )
      fail(
        "PHOTO_INVALID",
        "A referenced photo has an unsupported filename or MIME type.",
      );
    const filename = path.join(root, row.filename);
    try {
      const stat = lstatSync(filename);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        path.dirname(realpathSync(filename)) !== root ||
        stat.size !== Number(row.size) ||
        stat.size > 5 * 1024 * 1024
      )
        throw new Error();
      const bytes = readFileSync(filename);
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
        throw new Error();
      const metadata = await sharp(bytes, {
        limitInputPixels: 20_000_000,
        failOn: "warning",
      }).metadata();
      if (
        metadata.format !== "jpeg" ||
        metadata.width !== Number(row.width) ||
        metadata.height !== Number(row.height) ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error();
      await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" })
        .raw()
        .toBuffer();
      fingerprints.set(
        filename,
        createHash("sha256").update(bytes).digest("hex"),
      );
    } catch {
      fail(
        "PHOTO_INVALID",
        "A referenced practice photo is missing, unsafe, or does not match its recorded metadata.",
      );
    }
  }
  return fingerprints;
}
async function destinationEmpty(tx: Queryable) {
  const tables = (
    await tx.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows
    .map((row) => row.table_name)
    .sort();
  if (
    JSON.stringify(tables) !==
    JSON.stringify(
      ["SchemaMigration", "PhotoDeletionQueue", ...LEGACY_IMPORT_TABLES].sort(),
    )
  )
    fail(
      "DESTINATION_NOT_READY",
      "The destination must contain exactly the migrated Midnight Ink PostgreSQL schema.",
    );
  // Exclusive table locks serialize the empty-target check and import with any
  // application writers as well as other importer processes.
  await tx.query(
    `LOCK TABLE ${[...LEGACY_IMPORT_TABLES, "PhotoDeletionQueue"].map(quote).join(",")} IN ACCESS EXCLUSIVE MODE`,
  );
  if (
    (
      await tx.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "PhotoDeletionQueue"',
      )
    ).rows[0].count !== "0"
  )
    fail(
      "DESTINATION_OCCUPIED",
      "The destination has pending photo-deletion work. Nothing was overwritten.",
    );
  for (const table of LEGACY_IMPORT_TABLES) {
    const row = (
      await tx.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${quote(table)}`,
      )
    ).rows[0];
    if (row.count !== "0")
      fail(
        "DESTINATION_OCCUPIED",
        "The PostgreSQL destination contains records. Nothing was overwritten. Use a new empty application database/schema.",
      );
    const actual = (
      await tx.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position",
        [table],
      )
    ).rows.map((row) => row.column_name);
    if (JSON.stringify(actual) !== JSON.stringify(columns[table]))
      fail(
        "DESTINATION_NOT_READY",
        "A destination table does not match the expected explicit column mapping.",
      );
  }
}

/** No schema creation, seeding, external-account call, or filesystem move occurs. */
export async function importSqliteToPostgres(
  options: SqliteImportOptions,
): Promise<SqliteImportReport> {
  if (options.confirmation !== IMPORT_CONFIRMATION)
    fail(
      "CONFIRMATION_REQUIRED",
      `Confirm ${IMPORT_CONFIRMATION} only after stopping application writes and preparing an empty destination.`,
    );
  const source = regularFile(options.sourcePath, "SOURCE_INVALID");
  const backup = regularFile(options.backupPath, "BACKUP_REQUIRED");
  if (
    source.real === backup.real ||
    (source.info.dev === backup.info.dev && source.info.ino === backup.info.ino)
  )
    fail(
      "BACKUP_REQUIRED",
      "The backup must be a distinct pre-existing file, not the live source or a hard link.",
    );
  const sourceVersion = diskVersion(source.real),
    backupVersion = diskVersion(backup.real);
  let sourceDb: DatabaseSync | undefined, backupDb: DatabaseSync | undefined;
  try {
    sourceDb = new DatabaseSync(source.real, { readOnly: true });
    backupDb = new DatabaseSync(backup.real, { readOnly: true });
    for (const db of [sourceDb, backupDb]) {
      db.exec(
        "PRAGMA query_only=ON; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; BEGIN",
      );
    }
    const snapshot = readSnapshot(sourceDb),
      verifiedBackup = readSnapshot(backupDb);
    if (
      snapshot.version !== verifiedBackup.version ||
      snapshot.schemaDigest !== verifiedBackup.schemaDigest ||
      canonical(snapshot.digests) !== canonical(verifiedBackup.digests) ||
      canonical(
        sourceDb
          .prepare("SELECT * FROM SchemaMigration ORDER BY version")
          .all(),
      ) !==
        canonical(
          backupDb
            .prepare("SELECT * FROM SchemaMigration ORDER BY version")
            .all(),
        )
    )
      fail(
        "BACKUP_MISMATCH",
        "The supplied backup is not a verified logical copy of this stopped SQLite source. Create and verify a current consistent backup before import.",
      );
    const photos = await verifyPhotos(snapshot, options.photosDirectory);
    await options.database.transaction(async (tx) => {
      try {
        await verifyDatabaseSchema(tx);
      } catch {
        fail(
          "DESTINATION_NOT_READY",
          "Apply the bundled PostgreSQL migrations to an empty destination before importing.",
        );
      }
      await destinationEmpty(tx);
      for (const table of LEGACY_IMPORT_TABLES) {
        for (const row of snapshot.rows[table]) {
          const values = columns[table].map((col) => {
            const normalized = normalizedRow(table, row)[col];
            return jsonColumns.has(col)
              ? JSON.stringify(normalized)
              : normalized;
          });
          const parameters = columns[table].map(
            (col, index) =>
              `$${index + 1}${jsonColumns.has(col) ? "::jsonb" : ""}`,
          );
          await tx.query(
            `INSERT INTO ${quote(table)} (${columns[table].map(quote).join(",")}) VALUES (${parameters.join(",")})`,
            values,
          );
        }
      }
      await tx.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const table of LEGACY_IMPORT_TABLES) {
        const result = await tx.query(
          `SELECT ${columns[table].map(quote).join(",")} FROM ${quote(table)}`,
        );
        if (
          result.rows.length !== snapshot.counts[table] ||
          digestRows(table, result.rows) !== snapshot.digests[table]
        )
          fail(
            "IMPORT_FAILED",
            "A destination row-count or content verification failed; the import was rolled back.",
          );
      }
      if (
        !unchanged(source.real, sourceVersion) ||
        !unchanged(backup.real, backupVersion)
      )
        fail(
          "SOURCE_CHANGED",
          "The SQLite source or backup changed during import. Stop writers and use a fresh verified backup.",
        );
      for (const [filename, fingerprint] of photos)
        if (
          createHash("sha256").update(readFileSync(filename)).digest("hex") !==
          fingerprint
        )
          fail(
            "SOURCE_CHANGED",
            "A practice photo changed during import. Stop all writers and retry from the verified backup.",
          );
    });
    return {
      formatVersion: 1,
      sourceSchemaVersion: snapshot.version,
      verifiedBackup: true,
      photoFilesVerified: photos.size,
      tableCounts: snapshot.counts,
      rowCountsVerified: true,
      contentVerified: true,
      sourceUnchanged: true,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof SqliteImportError) throw error;
    return fail(
      "IMPORT_FAILED",
      "The legacy import could not complete. The PostgreSQL transaction was rolled back; no credentials or record contents are included in this report.",
    );
  } finally {
    for (const db of [sourceDb, backupDb])
      if (db) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        db.close();
      }
  }
}
