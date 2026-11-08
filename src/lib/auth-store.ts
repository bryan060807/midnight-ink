import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
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

const validHash = (value: string) => /^[a-f0-9]{64}$/.test(value);
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
export function upsertIdentity(
  input: IdentityInput,
  db: DatabaseSync = getDatabase(),
): AuthProfile {
  if (
    !input.issuer ||
    input.issuer.length > 2048 ||
    !input.subject ||
    input.subject.length > 255 ||
    input.subject.trim() !== input.subject
  )
    throw new ApiError(400, "Invalid verified identity.");
  const stamp = Date.now();
  const email = boundedAttribute(input.email, 320);
  const name = boundedAttribute(input.name, 200);
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db
      .prepare(
        "SELECT profileId FROM OidcIdentity WHERE issuer=? AND subject=?",
      )
      .get(input.issuer, input.subject);
    let profileId: string;
    if (existing) {
      profileId = String(existing.profileId);
      db.prepare(
        "UPDATE OidcIdentity SET email=?,name=?,updatedAt=? WHERE issuer=? AND subject=?",
      ).run(email, name, stamp, input.issuer, input.subject);
    } else {
      profileId = randomUUID();
      const iso = new Date(stamp).toISOString();
      db.prepare(
        "INSERT INTO Profile(id,name,level,path,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
      ).run(
        profileId,
        name?.slice(0, 80) || "Artist",
        "beginner",
        "foundations",
        iso,
        iso,
      );
      db.prepare(
        "INSERT INTO UserSettings(profileId,coachName,goalMinutes,updatedAt) VALUES(?,?,?,?)",
      ).run(profileId, "Rook", 20, iso);
      db.prepare(
        "INSERT INTO OidcIdentity(id,profileId,issuer,subject,email,name,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        profileId,
        input.issuer,
        input.subject,
        email,
        name,
        stamp,
        stamp,
      );
    }
    const profile = db
      .prepare("SELECT * FROM Profile WHERE id=?")
      .get(profileId) as unknown as AuthProfile;
    db.exec("COMMIT");
    return profile;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getIdentity(
  profileId: string,
  db: DatabaseSync = getDatabase(),
): IdentityRecord | null {
  return (
    (db
      .prepare("SELECT * FROM OidcIdentity WHERE profileId=?")
      .get(profileId) as unknown as IdentityRecord | undefined) ?? null
  );
}

/** Only hashes of opaque, high-entropy browser tokens enter this table. */
export function createSession(
  profileId: string,
  tokenHash: string,
  expiresAt: number,
  db: DatabaseSync = getDatabase(),
): StoredSession {
  requireHash(tokenHash);
  const stamp = Date.now();
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= stamp ||
    expiresAt > stamp + 30 * 24 * 60 * 60 * 1000
  )
    throw new ApiError(400, "Invalid session expiration.");
  if (profileId === "local-demo" || !getIdentity(profileId, db))
    throw new ApiError(403, "An authenticated identity is required.");
  cleanupAuth(db);
  db.prepare(
    "INSERT INTO AppSession(tokenHash,profileId,createdAt,expiresAt,revokedAt) VALUES(?,?,?,?,NULL)",
  ).run(tokenHash, profileId, stamp, expiresAt);
  return { tokenHash, profileId, createdAt: stamp, expiresAt, revokedAt: null };
}

export function findSession(
  tokenHash: string,
  db: DatabaseSync = getDatabase(),
): StoredSession | null {
  if (!validHash(tokenHash)) return null;
  const row = db
    .prepare(
      "SELECT s.* FROM AppSession s JOIN OidcIdentity i ON i.profileId=s.profileId WHERE s.tokenHash=? AND s.expiresAt>? AND s.revokedAt IS NULL AND s.profileId<>?",
    )
    .get(tokenHash, Date.now(), "local-demo");
  return row ? (row as unknown as StoredSession) : null;
}

export function revokeSession(
  tokenHash: string,
  db: DatabaseSync = getDatabase(),
) {
  if (!validHash(tokenHash)) return;
  db.prepare(
    "UPDATE AppSession SET revokedAt=? WHERE tokenHash=? AND revokedAt IS NULL",
  ).run(Date.now(), tokenHash);
}

/** Cleanup is local and bounded by indexed expiry columns; never revives a session. */
export function cleanupAuth(db: DatabaseSync = getDatabase()) {
  const stamp = Date.now();
  db.prepare("DELETE FROM LoginTransaction WHERE expiresAt<=?").run(stamp);
  db.prepare("DELETE FROM AppSession WHERE expiresAt<=?").run(stamp);
}

export function createLoginTransaction(
  input: LoginTransactionInput,
  db: DatabaseSync = getDatabase(),
): StoredLoginTransaction {
  requireHash(input.stateHash);
  requireHash(input.browserHash);
  const stamp = Date.now();
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= stamp ||
    input.expiresAt > stamp + 15 * 60 * 1000 ||
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
  cleanupAuth(db);
  // Cap unexpired transactions to prevent an unauthenticated login-start flood
  // from growing the database indefinitely. Route-level rate limiting is additional.
  if (
    Number(db.prepare("SELECT COUNT(*) AS n FROM LoginTransaction").get()?.n) >=
    1000
  )
    throw new ApiError(429, "Please try signing in again shortly.");
  db.prepare(
    "INSERT INTO LoginTransaction(stateHash,browserHash,nonce,pkceVerifier,returnTo,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?)",
  ).run(
    input.stateHash,
    input.browserHash,
    input.nonce,
    input.pkceVerifier,
    input.returnTo,
    stamp,
    input.expiresAt,
  );
  return { ...input, createdAt: stamp };
}

/** The matching browser gets one exchange attempt; concurrent/replayed callbacks lose. */
export function consumeLoginTransaction(
  stateHash: string,
  browserHash: string,
  db: DatabaseSync = getDatabase(),
): StoredLoginTransaction | null {
  if (!validHash(stateHash) || !validHash(browserHash)) return null;
  cleanupAuth(db);
  const row = db
    .prepare(
      "DELETE FROM LoginTransaction WHERE stateHash=? AND browserHash=? AND expiresAt>? RETURNING *",
    )
    .get(stateHash, browserHash, Date.now());
  return row ? (row as unknown as StoredLoginTransaction) : null;
}
