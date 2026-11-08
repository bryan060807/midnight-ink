# Persistence conversion assessment

Baseline: latest merged main `7930e2e` (AIBRY ID source integration included). The historical SQLite migrations remain immutable. This inventory records the synchronous baseline and its replacement boundaries; it does not establish production connectivity or provider acceptance.

## Synchronous dependencies and callers

| Baseline source | Affected operations | PostgreSQL boundary |
| --- | --- | --- |
| `src/lib/db.ts` | `DatabaseSync`, `prepare/get/all/run`, SQLite pragmas, implicit initialization; global seed, owned CRUD, lesson completion, coaching, workspace export, user-data deletion | Lazy bounded asynchronous `pg` pool; explicit migrations and seed; parameterized queries and transaction callbacks |
| `src/lib/auth-store.ts` | Identity lookup/upsert, session create/find/revoke/cleanup, browser transaction create/consume | Awaited operations; identity serialization, atomic `DELETE ... RETURNING`, persistent revocation |
| `src/lib/demo-import.ts` | `BEGIN IMMEDIATE` claim, empty target check, eight owned-table updates, profile/preferences copy, global receipt | Single-client transaction with claim/owner locks, deferred ownership foreign keys and unique receipt |
| `src/lib/uploads.ts` | Photo count/insert/read/delete plus local file writes and unlink | Awaited metadata queries, locked ownership checks, durable deletion queue for committed deletes; photo bytes stay on Windows |
| `src/lib/auth.ts`, `src/lib/oidc.ts` | Synchronous session resolution, transaction consumption, identity/session creation | Asynchronous authorization and OIDC callers; no Promise accepted as identity |
| App API routes, auth routes, protected page | `requireWorkspace`, direct profile/settings/health queries, exports and deletion | Await all authorization and persistence operations; never expose driver errors or connection URLs |
| `scripts/db.ts` | Both commands implicitly migrate+seed, local file reset | Separate PostgreSQL migrate/seed commands; no destructive reset |
| Database tests and Playwright fixtures | SQLite temporary files and direct synchronous SQL | Disposable PostgreSQL schemas in a dedicated test database; asynchronous assertions and concurrency tests |

`node:sqlite` is retained only in the offline import utility and its legacy fixtures. It is not a runtime backend or production fallback. Original migration files `migrations/001_initial.sql` and `002_auth.sql` are preserved for verified source inspection.

## Transaction boundaries and concurrency requirements

- Migrations: one PostgreSQL client and advisory lock across version/checksum inspection and transactional application. Seed is a separate repeatable command.
- Owned record creation/update: schema validation, owner/parent relationship checks, detail/assessment writes, and primary record mutation commit or roll back together.
- Identity upsert: issuer/subject serialization prevents duplicate profiles or orphan settings during simultaneous first logins.
- Sessions and browser attempts: hashed opaque tokens, indexed millisecond expirations, immediate awaited revocation, single-winner atomic consumption.
- Demo claim: separately authorized transfer, empty destination and source/receipt checks under locks, all relationships and recovery receipt in the same transaction. Login never performs a claim.
- Photo persistence: normalize and validate bytes, enforce owner/parent constraints, clean up failed inserts. Database cascades enqueue committed file deletion; asynchronous filesystem failures remain retryable without inventing a rollback of deleted bytes.
- Account/session deletion: transactionally delete only the authenticated owner's rows. Referenced photo cleanup is processed after commit and survives restart.
- SQLite import: read-only source plus verified pre-existing backup and photo manifest; inspect a migration-ready empty destination; import explicit mappings in one transaction and verify counts/content before commit. No production execution in this task.

The authoritative deployment is Windows Next.js/PM2 and Windows local photo files, with PostgreSQL, identity, backups, and trusted ingress on Fedora. An earlier Fedora web-runtime/Quadlet plan is superseded and is not part of this package.
