-- Identity is keyed by the verified issuer and immutable subject, never email.
CREATE TABLE OidcIdentity (
  id TEXT PRIMARY KEY,
  profileId TEXT NOT NULL UNIQUE REFERENCES Profile(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 255),
  email TEXT,
  name TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE(issuer, subject)
);
CREATE TABLE AppSession (
  tokenHash TEXT PRIMARY KEY CHECK(length(tokenHash) = 64),
  profileId TEXT NOT NULL REFERENCES Profile(id) ON DELETE CASCADE,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL CHECK(expiresAt > createdAt),
  revokedAt INTEGER
);
CREATE INDEX AppSession_expiration ON AppSession(expiresAt);
CREATE INDEX AppSession_owner ON AppSession(profileId);
CREATE TABLE LoginTransaction (
  stateHash TEXT PRIMARY KEY CHECK(length(stateHash) = 64),
  browserHash TEXT NOT NULL CHECK(length(browserHash) = 64),
  nonce TEXT NOT NULL,
  pkceVerifier TEXT NOT NULL,
  returnTo TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL CHECK(expiresAt > createdAt)
);
CREATE INDEX LoginTransaction_expiration ON LoginTransaction(expiresAt);
-- One demo source can be claimed once, even after the target clears its records.
-- Keep this receipt independent of identity/session deletion for replay prevention.
CREATE TABLE DemoImportReceipt (
  sourceProfileId TEXT PRIMARY KEY REFERENCES Profile(id),
  targetProfileId TEXT NOT NULL REFERENCES Profile(id),
  createdAt INTEGER NOT NULL,
  details TEXT NOT NULL CHECK(json_valid(details))
);
-- Match dependent ownership to its parent even for future repository callers.
CREATE TRIGGER PracticePhoto_owner_insert BEFORE INSERT ON PracticePhoto
WHEN NOT EXISTS (SELECT 1 FROM PracticeSession s WHERE s.id=NEW.sessionId AND s.profileId=NEW.profileId)
BEGIN SELECT RAISE(ABORT, 'Photo ownership must match its practice session'); END;
CREATE TRIGGER PracticePhoto_owner_update BEFORE UPDATE OF profileId,sessionId ON PracticePhoto
WHEN NOT EXISTS (SELECT 1 FROM PracticeSession s WHERE s.id=NEW.sessionId AND s.profileId=NEW.profileId)
BEGIN SELECT RAISE(ABORT, 'Photo ownership must match its practice session'); END;
CREATE TRIGGER SkillAssessment_owner_insert BEFORE INSERT ON SkillAssessment
WHEN NOT EXISTS (SELECT 1 FROM PracticeSession s WHERE s.id=NEW.sessionId AND s.profileId=NEW.profileId)
BEGIN SELECT RAISE(ABORT, 'Assessment ownership must match its practice session'); END;
CREATE TRIGGER SkillAssessment_owner_update BEFORE UPDATE OF profileId,sessionId ON SkillAssessment
WHEN NOT EXISTS (SELECT 1 FROM PracticeSession s WHERE s.id=NEW.sessionId AND s.profileId=NEW.profileId)
BEGIN SELECT RAISE(ABORT, 'Assessment ownership must match its practice session'); END;
