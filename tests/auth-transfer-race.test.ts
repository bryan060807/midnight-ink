import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";
import { createRecord, getWorkspace, updateRecord } from "../src/lib/db";
import type { Database, Queryable } from "../src/lib/database";
import { upsertIdentity } from "../src/lib/auth-store";
import { importDemoData } from "../src/lib/demo-import";
import { exercises } from "../src/lib/curriculum";
import { createTestDatabase, type TestDatabase } from "./fixtures/database";

let fixture: TestDatabase;
beforeEach(async () => { fixture = await createTestDatabase(); });
afterEach(async () => { await fixture?.cleanup(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Coordinate real PostgreSQL transactions without replacing their SQL or locks. */
function observeTransactions(
  database: Database,
  onStart: (pid: number) => void,
  afterQuery: (sql: string) => Promise<void> = async () => {},
): Database {
  return {
    ...database,
    transaction<T>(operation: (tx: Queryable) => Promise<T>): Promise<T> {
      return database.transaction(async (tx) => {
        const pid = (await tx.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        onStart(pid);
        return operation({
          async query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> {
            const result = await tx.query<R>(sql, values);
            await afterQuery(sql);
            return result;
          },
        });
      });
    },
  };
}

it("finishes a pending demo assessment update before transferring its session and owner", async () => {
  const db = fixture.db;
  const target = await upsertIdentity({ issuer: "https://id.example.test", subject: "transfer-race" }, db);
  const session = await createRecord("PracticeSession", "local-demo", {
    exerciseId: exercises[0].id,
    durationMinutes: 5,
    notes: "Before update",
  }, db);
  const sessionLocked = deferred<void>();
  const releaseUpdater = deferred<void>();
  const importBackend = deferred<number>();
  const updaterDb = observeTransactions(db, () => {}, async (sql) => {
    if (sql.includes('FROM "PracticeSession"') && sql.includes("FOR UPDATE")) {
      sessionLocked.resolve();
      await releaseUpdater.promise;
    }
  });
  const importerDb = observeTransactions(db, (pid) => { importBackend.resolve(pid); });
  const authorization = "isolated-session-update-demo-transfer-authorization";
  const previous = process.env.DEMO_IMPORT_TOKEN_HASH;
  process.env.DEMO_IMPORT_TOKEN_HASH = createHash("sha256").update(authorization).digest("hex");
  let operations: Promise<unknown>[] = [];
  try {
    const update = updateRecord("PracticeSession", "local-demo", String(session.id), {
      notes: "Assessment saved before transfer",
      assessment: { consistency: 3, smoothness: 3, coverage: 3, edgeControl: 3, surfaceDamage: 3, goals: "Keep this assessment" },
    }, updaterDb);
    operations = [update];
    await sessionLocked.promise;
    const transfer = importDemoData(target.id, authorization, importerDb);
    operations.push(transfer);
    const pid = await importBackend.promise;
    // The importer must be waiting on the updater's transaction before the
    // updater inserts its first assessment and checks the owner's foreign key.
    await vi.waitFor(async () => {
      const activity = (await db.query<{ wait_event_type: string | null }>(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid],
      )).rows[0];
      expect(activity?.wait_event_type).toBe("Lock");
    }, { timeout: 3000, interval: 10 });
    releaseUpdater.resolve();
    const results = await Promise.allSettled(operations);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const workspace = await getWorkspace(target.id, db);
    expect(workspace.sessions).toContainEqual(expect.objectContaining({ id: session.id, notes: "Assessment saved before transfer" }));
    expect(workspace.assessments).toContainEqual(expect.objectContaining({ sessionId: session.id, goals: "Keep this assessment" }));
    expect((await getWorkspace("local-demo", db)).sessions).toHaveLength(0);
  } finally {
    releaseUpdater.resolve();
    await Promise.allSettled(operations);
    if (previous === undefined) delete process.env.DEMO_IMPORT_TOKEN_HASH;
    else process.env.DEMO_IMPORT_TOKEN_HASH = previous;
  }
});
