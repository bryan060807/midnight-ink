-- A durable outbox coordinates PostgreSQL cascades with files stored on Windows.
CREATE TABLE "PhotoDeletionQueue" (
  "filename" TEXT PRIMARY KEY, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION "queueDeletedPracticePhoto"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  INSERT INTO "PhotoDeletionQueue" ("filename") VALUES (OLD."filename") ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "PracticePhoto_queue_delete" BEFORE DELETE ON "PracticePhoto"
  FOR EACH ROW EXECUTE FUNCTION "queueDeletedPracticePhoto"();
