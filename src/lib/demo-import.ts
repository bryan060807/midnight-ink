import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ApiError } from "./errors";
import { getDatabase } from "./db";
import { getIdentity } from "./auth-store";

const sourceId = "local-demo";
const ownedTables = [
  "Equipment",
  "LessonProgress",
  "PracticeSession",
  "PracticePhoto",
  "SkillAssessment",
  "DesignProject",
  "CoachingSession",
  "Goal",
] as const;

function verifyAuthorization(authorization: string) {
  const expected = process.env.DEMO_IMPORT_TOKEN_HASH;
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected))
    throw new ApiError(503, "Demo import is not enabled by the operator.");
  if (
    typeof authorization !== "string" ||
    authorization.length < 32 ||
    authorization.length > 4096
  )
    throw new ApiError(403, "Demo import authorization was not accepted.");
  const actual = createHash("sha256").update(authorization, "utf8").digest();
  if (!timingSafeEqual(actual, Buffer.from(expected, "hex")))
    throw new ApiError(403, "Demo import authorization was not accepted.");
}

/**
 * Deliberate, separately authorized import. No login can invoke it implicitly.
 * File names do not change: photo bytes stay in the same private storage directory;
 * their owner and session owner move together within one SQLite transaction.
 */
export function importDemoData(
  targetProfileId: string,
  authorization: string,
  db: DatabaseSync = getDatabase(),
) {
  if (targetProfileId === sourceId || !getIdentity(targetProfileId, db))
    throw new ApiError(
      403,
      "Sign in with a verified identity before importing demo data.",
    );
  verifyAuthorization(authorization);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      db
        .prepare(
          "SELECT sourceProfileId FROM DemoImportReceipt WHERE sourceProfileId=?",
        )
        .get(sourceId)
    )
      throw new ApiError(409, "This demo workspace has already been imported.");
    const source = db.prepare("SELECT * FROM Profile WHERE id=?").get(sourceId);
    const target = db
      .prepare("SELECT * FROM Profile WHERE id=?")
      .get(targetProfileId);
    const sourceSettings = db
      .prepare("SELECT * FROM UserSettings WHERE profileId=?")
      .get(sourceId);
    const targetSettings = db
      .prepare("SELECT * FROM UserSettings WHERE profileId=?")
      .get(targetProfileId);
    if (!source || !target || !sourceSettings || !targetSettings)
      throw new ApiError(
        404,
        "The source or destination workspace could not be found.",
      );
    for (const table of ownedTables) {
      if (
        Number(
          db
            .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE profileId=?`)
            .get(targetProfileId)?.n,
        ) !== 0
      )
        throw new ApiError(
          409,
          "Import requires an empty authenticated workspace. Export or preserve existing work before using an operator-assisted migration.",
        );
    }
    // Defensive integrity check: dependent rows must belong to the same owner as
    // their parent before transfer. Foreign keys alone do not encode ownership.
    const invalidChild =
      db
        .prepare(
          "SELECT 1 FROM PracticePhoto p JOIN PracticeSession s ON s.id=p.sessionId WHERE (p.profileId=? OR s.profileId=?) AND p.profileId<>s.profileId LIMIT 1",
        )
        .get(sourceId, sourceId) ||
      db
        .prepare(
          "SELECT 1 FROM SkillAssessment a JOIN PracticeSession s ON s.id=a.sessionId WHERE (a.profileId=? OR s.profileId=?) AND a.profileId<>s.profileId LIMIT 1",
        )
        .get(sourceId, sourceId);
    if (invalidChild)
      throw new ApiError(
        409,
        "The demo workspace needs an operator integrity review before import.",
      );
    const counts: Record<string, number> = {};
    for (const table of ownedTables) {
      counts[table] = Number(
        db
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE profileId=?`)
          .get(sourceId)?.n ?? 0,
      );
      db.prepare(`UPDATE ${table} SET profileId=? WHERE profileId=?`).run(
        targetProfileId,
        sourceId,
      );
    }
    const iso = new Date().toISOString();
    db.prepare(
      "UPDATE Profile SET name=?,level=?,path=?,updatedAt=? WHERE id=?",
    ).run(
      String(source.name),
      String(source.level),
      String(source.path),
      iso,
      targetProfileId,
    );
    db.prepare(
      "UPDATE UserSettings SET coachName=?,goalMinutes=?,updatedAt=? WHERE profileId=?",
    ).run(
      String(sourceSettings.coachName),
      Number(sourceSettings.goalMinutes),
      iso,
      targetProfileId,
    );
    const details = {
      recordCounts: counts,
      previousTargetProfile: target,
      previousTargetSettings: targetSettings,
      sourceProfile: source,
      sourceSettings,
    };
    const createdAt = Date.now();
    db.prepare(
      "INSERT INTO DemoImportReceipt(sourceProfileId,targetProfileId,createdAt,details) VALUES(?,?,?,?)",
    ).run(sourceId, targetProfileId, createdAt, JSON.stringify(details));
    db.exec("COMMIT");
    return { ok: true, imported: counts, createdAt };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
