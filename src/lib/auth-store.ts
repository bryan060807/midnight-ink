import { randomUUID } from "node:crypto";
import { getDatabase, type Database, type Queryable } from "./db";
import { ApiError } from "./errors";

export interface IdentityInput {
  issuer: string;
  subject: string;
  email?: string;
  name?: string;
}
export interface IdentityRecord {
  id: string;
  profileId: string;
  issuer: string;
  subject: string;
  email: string | null;
  name: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface AuthProfile {
  id: string;
  name: string;
  level: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}
export interface StoredSession {
  tokenHash: string;
  profileId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}
export interface LoginTransactionInput {
  stateHash: string;
  browserHash: string;
  nonce: string;
  pkceVerifier: string;
  returnTo: string;
  expiresAt: number;
}
export interface StoredLoginTransaction extends LoginTransactionInput {
  createdAt: number;
}

const validHash = (value: string) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function requireHash(value: string) {
  if (!validHash(value))
    throw new ApiError(400, "Invalid authentication token.");
}
function boundedAttribute(
  value: string | undefined,
  limit: number,
): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : null;
}

/** Called only after a provider ID token has been cryptographically verified. */
export async function upsertIdentity(
  input: IdentityInput,
  db: Database = getDatabase(),
): Promise<AuthProfile> {
  if (
    typeof input.issuer !== "string" ||
    !input.issuer ||
    input.issuer.length > 2048 ||
    typeof input.subject !== "string" ||
    !input.subject ||
    input.subject.length > 255 ||
    input.subject.trim() !== input.subject
  )
    throw new ApiError(400, "Invalid verified identity.");
  const email = boundedAttribute(input.email, 320);
  const name = boundedAttribute(input.name, 200);
  return db.transaction(async (tx) => {
    // Serialize the first login for this exact verified identity. The lock is
    // transaction scoped, so no failed/parallel login can leave an orphan profile.
    // JSON encoding keeps otherwise ambiguous issuer/subject pairs distinct.
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [JSON.stringify(["midnight-ink:identity", input.issuer, input.subject])],
    );
    const stamp = Date.now();
    const existing = (
      await tx.query<{ profileId: string }>(
        'SELECT "profileId" FROM "OidcIdentity" WHERE "issuer"=$1 AND "subject"=$2',
        [input.issuer, input.subject],
      )
    ).rows[0];
    let profileId: string;
    if (existing) {
      profileId = existing.profileId;
      await tx.query(
        'UPDATE "OidcIdentity" SET "email"=$1,"name"=$2,"updatedAt"=$3 WHERE "issuer"=$4 AND "subject"=$5',
        [email, name, stamp, input.issuer, input.subject],
      );
    } else {
      profileId = randomUUID();
      const iso = new Date(stamp).toISOString();
      await tx.query(
        'INSERT INTO "Profile"("id","name","level","path","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6)',
        [
          profileId,
          name?.slice(0, 80) || "Artist",
          "beginner",
          "foundations",
          iso,
          iso,
        ],
      );
      await tx.query(
        'INSERT INTO "UserSettings"("profileId","coachName","goalMinutes","updatedAt") VALUES($1,$2,$3,$4)',
        [profileId, "Rook", 20, iso],
      );
      await tx.query(
        'INSERT INTO "OidcIdentity"("id","profileId","issuer","subject","email","name","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          profileId,
          input.issuer,
          input.subject,
          email,
          name,
          stamp,
          stamp,
        ],
      );
    }
    const profile = (
      await tx.query<AuthProfile>('SELECT * FROM "Profile" WHERE "id"=$1', [
        profileId,
      ])
    ).rows[0];
    if (!profile)
      throw new ApiError(404, "The authenticated workspace could not be found.");
    return profile;
  });
}

export async function getIdentity(
  profileId: string,
  db: Queryable = getDatabase(),
): Promise<IdentityRecord | null> {
  const result = await db.query<IdentityRecord>(
    'SELECT * FROM "OidcIdentity" WHERE "profileId"=$1',
    [profileId],
  );
  return result.rows[0] ?? null;
}

/** Only hashes of opaque, high-entropy browser tokens enter this table. */
export async function createSession(
  profileId: string,
  tokenHash: string,
  expiresAt: number,
  db: Queryable = getDatabase(),
): Promise<StoredSession> {
  requireHash(tokenHash);
  const stamp = Date.now();
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= stamp ||
    expiresAt > stamp + 30 * 24 * 60 * 60 * 1000
  )
    throw new ApiError(400, "Invalid session expiration.");
  if (profileId === "local-demo")
    throw new ApiError(403, "An authenticated identity is required.");
  await cleanupAuth(db);
  // Verify the identity in the INSERT itself, rather than relying on a preceding
  // read that could become stale before a pooled connection executes the write.
  const session = (
    await db.query<StoredSession>(
      'INSERT INTO "AppSession"("tokenHash","profileId","createdAt","expiresAt","revokedAt") SELECT $1,i."profileId",$3,$4,NULL FROM "OidcIdentity" i WHERE i."profileId"=$2 RETURNING *',
      [tokenHash, profileId, stamp, expiresAt],
    )
  ).rows[0];
  if (!session) throw new ApiError(403, "An authenticated identity is required.");
  return session;
}

export async function findSession(
  tokenHash: string,
  db: Queryable = getDatabase(),
): Promise<StoredSession | null> {
  if (!validHash(tokenHash)) return null;
  const result = await db.query<StoredSession>(
    'SELECT s.* FROM "AppSession" s JOIN "OidcIdentity" i ON i."profileId"=s."profileId" WHERE s."tokenHash"=$1 AND s."expiresAt">$2 AND s."revokedAt" IS NULL AND s."profileId"<>$3',
    [tokenHash, Date.now(), "local-demo"],
  );
  return result.rows[0] ?? null;
}

export async function revokeSession(
  tokenHash: string,
  db: Queryable = getDatabase(),
): Promise<void> {
  if (!validHash(tokenHash)) return;
  await db.query(
    'UPDATE "AppSession" SET "revokedAt"=$1 WHERE "tokenHash"=$2 AND "revokedAt" IS NULL',
    [Date.now(), tokenHash],
  );
}

/** Cleanup uses indexed expiry columns and never revives a session. */
export async function cleanupAuth(db: Queryable = getDatabase()): Promise<void> {
  const stamp = Date.now();
  await db.query('DELETE FROM "LoginTransaction" WHERE "expiresAt"<=$1', [stamp]);
  await db.query('DELETE FROM "AppSession" WHERE "expiresAt"<=$1', [stamp]);
}

export async function createLoginTransaction(
  input: LoginTransactionInput,
  db: Database = getDatabase(),
): Promise<StoredLoginTransaction> {
  requireHash(input.stateHash);
  requireHash(input.browserHash);
  const stamp = Date.now();
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= stamp ||
    input.expiresAt > stamp + 15 * 60 * 1000 ||
    typeof input.pkceVerifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(input.pkceVerifier) ||
    typeof input.nonce !== "string" ||
    input.nonce.length < 16 ||
    input.nonce.length > 256 ||
    typeof input.returnTo !== "string" ||
    input.returnTo.length > 2000 ||
    !input.returnTo.startsWith("/") ||
    input.returnTo.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(input.returnTo)
  )
    throw new ApiError(400, "Invalid login transaction.");
  return db.transaction(async (tx) => {
    // Route-level rate limiting is additional. Serialize this database-wide cap
    // so simultaneous unauthenticated login starts cannot all pass its count.
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["midnight-ink:login-transaction-cap"],
    );
    await cleanupAuth(tx);
    const { rows } = await tx.query<{ n: number | string }>(
      'SELECT COUNT(*) AS n FROM "LoginTransaction"',
    );
    if (Number(rows[0].n) >= 1000)
      throw new ApiError(429, "Please try signing in again shortly.");
    await tx.query(
      'INSERT INTO "LoginTransaction"("stateHash","browserHash","nonce","pkceVerifier","returnTo","createdAt","expiresAt") VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        input.stateHash,
        input.browserHash,
        input.nonce,
        input.pkceVerifier,
        input.returnTo,
        stamp,
        input.expiresAt,
      ],
    );
    return { ...input, createdAt: stamp };
  });
}

/** The matching browser gets one exchange attempt; concurrent/replayed callbacks lose. */
export async function consumeLoginTransaction(
  stateHash: string,
  browserHash: string,
  db: Queryable = getDatabase(),
): Promise<StoredLoginTransaction | null> {
  if (!validHash(stateHash) || !validHash(browserHash)) return null;
  await cleanupAuth(db);
  const result = await db.query<StoredLoginTransaction>(
    'DELETE FROM "LoginTransaction" WHERE "stateHash"=$1 AND "browserHash"=$2 AND "expiresAt">$3 RETURNING *',
    [stateHash, browserHash, Date.now()],
  );
  return result.rows[0] ?? null;
}
