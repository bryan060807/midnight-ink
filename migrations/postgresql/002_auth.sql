CREATE TABLE "OidcIdentity" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL UNIQUE REFERENCES "Profile"("id") ON DELETE CASCADE,
  "issuer" TEXT NOT NULL, "subject" TEXT NOT NULL CHECK (length("subject") BETWEEN 1 AND 255),
  "email" TEXT, "name" TEXT, "createdAt" BIGINT NOT NULL, "updatedAt" BIGINT NOT NULL,
  UNIQUE ("issuer", "subject")
);
CREATE TABLE "AppSession" (
  "tokenHash" TEXT PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "createdAt" BIGINT NOT NULL, "expiresAt" BIGINT NOT NULL CHECK ("expiresAt" > "createdAt"), "revokedAt" BIGINT
);
CREATE INDEX "AppSession_expiration" ON "AppSession"("expiresAt");
CREATE INDEX "AppSession_owner" ON "AppSession"("profileId");
CREATE TABLE "LoginTransaction" (
  "stateHash" TEXT PRIMARY KEY CHECK ("stateHash" ~ '^[a-f0-9]{64}$'),
  "browserHash" TEXT NOT NULL CHECK ("browserHash" ~ '^[a-f0-9]{64}$'),
  "nonce" TEXT NOT NULL, "pkceVerifier" TEXT NOT NULL, "returnTo" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL, "expiresAt" BIGINT NOT NULL CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "LoginTransaction_expiration" ON "LoginTransaction"("expiresAt");
-- Receipt history survives workspace clearing so the source cannot be claimed twice.
CREATE TABLE "DemoImportReceipt" (
  "sourceProfileId" TEXT PRIMARY KEY REFERENCES "Profile"("id"),
  "targetProfileId" TEXT NOT NULL REFERENCES "Profile"("id"),
  "createdAt" BIGINT NOT NULL, "details" JSONB NOT NULL
);
CREATE INDEX "DemoImportReceipt_target" ON "DemoImportReceipt"("targetProfileId");
