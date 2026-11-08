-- PostgreSQL schema; the historical SQLite migrations remain unchanged.
-- Text identifiers preserve existing UUID-like IDs as well as local-demo/curriculum IDs.
CREATE TABLE "Profile" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "level" TEXT NOT NULL,
  "path" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE TABLE "SeedMarker" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL);
CREATE TABLE "UserSettings" (
  "profileId" TEXT PRIMARY KEY REFERENCES "Profile"("id") ON DELETE CASCADE,
  "coachName" TEXT NOT NULL, "goalMinutes" INTEGER NOT NULL CHECK ("goalMinutes" BETWEEN 5 AND 300),
  "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE TABLE "LearningModule" ("id" TEXT PRIMARY KEY, "content" JSONB NOT NULL);
CREATE TABLE "Lesson" ("id" TEXT PRIMARY KEY, "moduleId" TEXT NOT NULL REFERENCES "LearningModule"("id"), "content" JSONB NOT NULL);
CREATE INDEX "Lesson_module" ON "Lesson"("moduleId");
CREATE TABLE "Exercise" ("id" TEXT PRIMARY KEY, "content" JSONB NOT NULL);
CREATE TABLE "TechniqueCard" ("id" TEXT PRIMARY KEY, "content" JSONB NOT NULL);
CREATE TABLE "ReferenceResource" ("id" TEXT PRIMARY KEY, "techniqueCardId" TEXT REFERENCES "TechniqueCard"("id"), "content" JSONB NOT NULL);
CREATE TABLE "Equipment" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('machine','cartridge','ink')), "content" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Equipment_owner" ON "Equipment"("profileId");
CREATE TABLE "Cartridge" ("equipmentId" TEXT PRIMARY KEY REFERENCES "Equipment"("id") ON DELETE CASCADE, "code" TEXT NOT NULL, "configuration" TEXT NOT NULL);
CREATE TABLE "Ink" ("equipmentId" TEXT PRIMARY KEY REFERENCES "Equipment"("id") ON DELETE CASCADE, "purpose" TEXT NOT NULL, "expiresAt" TEXT NOT NULL);
CREATE TABLE "LessonProgress" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id"), "completedAt" TIMESTAMPTZ NOT NULL,
  UNIQUE ("profileId", "lessonId")
);
CREATE TABLE "PracticeSession" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "exerciseId" TEXT NOT NULL REFERENCES "Exercise"("id"), "content" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL,
  UNIQUE ("id", "profileId")
);
CREATE INDEX "PracticeSession_owner" ON "PracticeSession"("profileId");
CREATE TABLE "PracticePhoto" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL, "filename" TEXT UNIQUE NOT NULL, "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL CHECK ("width" > 0), "height" INTEGER NOT NULL CHECK ("height" > 0),
  "size" INTEGER NOT NULL CHECK ("size" > 0), "createdAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PracticePhoto_session_owner" FOREIGN KEY ("sessionId", "profileId")
    REFERENCES "PracticeSession"("id", "profileId") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX "PracticePhoto_owner" ON "PracticePhoto"("profileId", "sessionId");
CREATE TABLE "SkillAssessment" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "sessionId" TEXT UNIQUE NOT NULL, "content" JSONB NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SkillAssessment_session_owner" FOREIGN KEY ("sessionId", "profileId")
    REFERENCES "PracticeSession"("id", "profileId") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX "SkillAssessment_owner" ON "SkillAssessment"("profileId");
CREATE TABLE "DesignProject" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "content" JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DesignProject_owner" ON "DesignProject"("profileId");
CREATE TABLE "CoachingSession" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "content" JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CoachingSession_owner" ON "CoachingSession"("profileId");
CREATE TABLE "Goal" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "content" JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Goal_owner" ON "Goal"("profileId");
