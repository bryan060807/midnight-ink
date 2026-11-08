import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";
import { getDatabase, type Database } from "./db";
import { getIdentity, type AuthProfile } from "./auth-store";

const sourceId = "local-demo";
// SQL identifiers come only from this fixed server-owned list.
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

interface SettingsRow {
  profileId: string;
  coachName: string;
  goalMinutes: number;
  updatedAt: string;
}

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
 * IDs and photo filenames stay unchanged; parents and children transfer in one
 * PostgreSQL transaction. Source profile/settings and recovery receipt remain.
 */
export async function importDemoData(
  targetProfileId: string,
  authorization: string,
  db: Database = getDatabase(),
) {
  if (targetProfileId === sourceId || !(await getIdentity(targetProfileId, db)))
    throw new ApiError(
      403,
      "Sign in with a verified identity before importing demo data.",
    );
  verifyAuthorization(authorization);
  return db.transaction(async (tx) => {
    // One global claim, including concurrent imports into different accounts.
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["midnight-ink:demo-import:local-demo"],
    );
    const receipt = await tx.query(
      'SELECT "sourceProfileId" FROM "DemoImportReceipt" WHERE "sourceProfileId"=$1',
      [sourceId],
    );
    if (receipt.rows.length)
      throw new ApiError(409, "This demo workspace has already been imported.");

    // Lock in stable order. Profile FK checks make concurrent owned-record
    // inserts wait here, keeping the empty-target check and transfer atomic.
    const profiles = (
      await tx.query<AuthProfile>(
        'SELECT * FROM "Profile" WHERE "id"=ANY($1::text[]) ORDER BY "id" FOR UPDATE',
        [[sourceId, targetProfileId]],
      )
    ).rows;
    const source = profiles.find((row) => row.id === sourceId);
    const target = profiles.find((row) => row.id === targetProfileId);
    const settings = (
      await tx.query<SettingsRow>(
        'SELECT * FROM "UserSettings" WHERE "profileId"=ANY($1::text[]) ORDER BY "profileId" FOR UPDATE',
        [[sourceId, targetProfileId]],
      )
    ).rows;
    const sourceSettings = settings.find((row) => row.profileId === sourceId);
    const targetSettings = settings.find(
      (row) => row.profileId === targetProfileId,
    );
    if (!source || !target || !sourceSettings || !targetSettings)
      throw new ApiError(
        404,
        "The source or destination workspace could not be found.",
      );
    if (!(await getIdentity(targetProfileId, tx)))
      throw new ApiError(
        403,
        "Sign in with a verified identity before importing demo data.",
      );
    for (const table of ownedTables) {
      const existing = await tx.query(
        `SELECT 1 FROM "${table}" WHERE "profileId"=$1 LIMIT 1`,
        [targetProfileId],
      );
      if (existing.rows.length)
        throw new ApiError(
          409,
          "Import requires an empty authenticated workspace. Export or preserve existing work before using an operator-assisted migration.",
        );
    }
    // Defensive review for installations imported from a historical schema.
    // The current composite foreign keys also enforce this invariant at commit.
    const invalidPhoto = await tx.query(
      'SELECT 1 FROM "PracticePhoto" p JOIN "PracticeSession" s ON s."id"=p."sessionId" WHERE (p."profileId"=$1 OR s."profileId"=$1) AND p."profileId"<>s."profileId" LIMIT 1',
      [sourceId],
    );
    const invalidAssessment = await tx.query(
      'SELECT 1 FROM "SkillAssessment" a JOIN "PracticeSession" s ON s."id"=a."sessionId" WHERE (a."profileId"=$1 OR s."profileId"=$1) AND a."profileId"<>s."profileId" LIMIT 1',
      [sourceId],
    );
    if (invalidPhoto.rows.length || invalidAssessment.rows.length)
      throw new ApiError(
        409,
        "The demo workspace needs an operator integrity review before import.",
      );

    // The composite parent/owner constraints are deferred only until this
    // transaction commits, so parent and children can move without breaking IDs.
    await tx.query("SET CONSTRAINTS ALL DEFERRED");
    const counts: Record<string, number> = {};
    for (const table of ownedTables) {
      const result = await tx.query(
        `UPDATE "${table}" SET "profileId"=$1 WHERE "profileId"=$2`,
        [targetProfileId, sourceId],
      );
      counts[table] = result.rowCount ?? 0;
    }
    const iso = new Date().toISOString();
    await tx.query(
      'UPDATE "Profile" SET "name"=$1,"level"=$2,"path"=$3,"updatedAt"=$4 WHERE "id"=$5',
      [source.name, source.level, source.path, iso, targetProfileId],
    );
    await tx.query(
      'UPDATE "UserSettings" SET "coachName"=$1,"goalMinutes"=$2,"updatedAt"=$3 WHERE "profileId"=$4',
      [sourceSettings.coachName, sourceSettings.goalMinutes, iso, targetProfileId],
    );
    const details = {
      recordCounts: counts,
      previousTargetProfile: target,
      previousTargetSettings: targetSettings,
      sourceProfile: source,
      sourceSettings,
    };
    const createdAt = Date.now();
    await tx.query(
      'INSERT INTO "DemoImportReceipt"("sourceProfileId","targetProfileId","createdAt","details") VALUES($1,$2,$3,$4::jsonb)',
      [sourceId, targetProfileId, createdAt, JSON.stringify(details)],
    );
    return { ok: true, imported: counts, createdAt };
  });
}
