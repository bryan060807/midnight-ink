# Workspace 503 investigation and guarded release

## Evidence boundary

Operator-supplied production evidence: one workspace 503 took 5.21 seconds;
the pool acquisition/connection timeout is 5 seconds; twelve health requests
succeeded; refreshing usually recovers. This points to a connection-related
deadline but **does not prove pool exhaustion**. A health request uses a different
workload and time window. Neither TCP nor TLS establishment is ruled out.

Verified source defect: a workspace previously launched nine concurrent reads
against a default maximum of five connections. Focus, visibility and interval
events started overlapping refreshes; version checks suppressed stale results
without cancelling the underlying requests. This amplifies pool demand. There
was no evidence identifying the original production exception: the wrapper
discarded driver messages and idle pool failures were silently ignored.

The production incident's precise root cause remains **NOT VERIFIED** until
the new diagnostics capture a failing request. Do not label successful isolated
tests or health probes as proof of the production cause or live-provider health.

## Change

- Workspace reads use one checkout, sequential queries and a read-only repeatable
  read transaction when supplied a Database. Existing Queryable transaction
  clients retain their caller's transaction. Every owner predicate is preserved.
- Component-local in-flight deduplication coalesces background events. Mutation
  refreshes replace older requests. Hidden/unmounted/expired sessions abort reads
  and invalidate results; private content stays gated during access validation.
- Only a 503 explicitly marked transient receives one jittered retry (250–499ms).
  Recovery restarts session validation before reading data. Permanent database,
  query timeout, permission and identity failures are not retried. Browser fetches
  have a 12-second bound each. No writes or transactions are automatically retried.
- No shared workspace cache, completed-result cache, stale-data fallback,
  credential/authentication change, migration, timeout increase or pool enlargement.
- Failed standalone queries discard their connection; network/query-timeout
  transactions discard instead of queuing rollback behind an uncertain query.

Browser aborts prevent stale publication and cancel browser transport; they do not
prove cancellation of already executing PostgreSQL work. Server queries retain
their existing statement/read deadlines. This is a concurrency-pressure fix,
not global admission control or a production throughput benchmark.

## Diagnostics

Structured `postgres_failure` events contain only phase, allowlisted kind/code,
retryability, elapsed milliseconds and numeric pool counters. SQL, parameters,
driver messages/stacks/causes, hosts, database names, URLs, user/profile identifiers,
cookies and credentials are excluded. Idle errors are also reported. Checkouts
taking at least 250ms emit `postgres_acquire_slow` and a pool snapshot.

`Database.poolStats()` returns total, active (checked out), idle, waiting and
connecting counts. Connecting is derived as total minus idle minus active;
it is an instantaneous process-local measurement, not server-wide session count.
Counters are not exposed on a public health endpoint. Slow/failure log snapshots
do not constitute a continuous time series or prove the queue's peak size.

| Kind | Meaning and next check |
| --- | --- |
| `pool_timeout` / acquire | Installed pg-pool queue deadline: inspect active/idle/waiting and long-held transactions. |
| `connect_timeout` / acquire | New connection deadline, including TCP/TLS/PostgreSQL startup. This does not isolate the precise handshake stage. |
| `network` | Allowlisted OS/DNS/TLS error, or terminated connection; phase separates acquisition/query/idle. Certificate failures are not retried. |
| `sqlstate` | Five-character PostgreSQL code; missing tables/configuration/permissions are not transient. |
| `query_timeout` | Server cancellation `57014` or client read timeout; no automatic retry. |
| `unknown` | Unrecognized driver failure; no automatic retry or unsafe raw-error logging. |

Pool wait and new-connection messages are matched internally against the installed
driver's fixed strings, never emitted. Rerun diagnostic tests after driver upgrades.
Use time-correlated safe application events plus operator-controlled PostgreSQL
and network evidence to establish the actual production cause; do not log credentials
or add identity-bearing request tracing to do so.

## Disposable validation

Use only an explicitly selected `TEST_DATABASE_URL` with `test` in the database
name; fixtures create/drop their own random schemas. No production URL fallback.

```powershell
npx vitest run tests/workspace-refresh.test.ts tests/workspace-postgres.test.ts
npm test
npm run lint
npm run build -- --webpack
npm run test:e2e
```

Run build/browser checks in a secret-free temporary source copy, excluding `.git`,
`.next`, `.data`, `.env*` and prior test artifacts, so validation cannot replace
the running production build. Share installed dependencies only; test app ports
3100/3101 and mock issuer 3211 must be free. The production build check explicitly
uses Next's webpack builder; it does not verify the default Turbopack builder.

New regression coverage: foreground event coalescing, invalidation/replacement,
bounded transient/permanent/cancelled recovery, classification/privacy, actual
pool queue deadline, stalled TCP/PostgreSQL startup, SQLSTATE/server timeout,
queue drainage, and 24 alternating-owner loads with PG_POOL_MAX=1. Browser coverage
injects a transient 503 under a focus burst and verifies auth revalidation and
rejection of mismatched workspace identity. Existing suites retain real database
owner isolation and generated-key mock-OIDC flows.

### Executed evidence, 2026-11-09

| Check | Result |
| --- | --- |
| ESLint and TypeScript | Passed after final classifier change. |
| Full Vitest suite | 222 passed, 2 skipped, 15 files; 177.90 seconds. Skips are existing Windows symlink-specific photo checks. |
| Optimized production build | Passed with Next 16.4.5 and webpack in the isolated source snapshot. |
| Full studio browser suite | 5 passed in the self-contained fixture, including persistence, photos, design and mobile layouts. |
| Authenticated browser suite | 3 passed in the self-contained fixture, including the added focus/recovery/identity regression; combined browser exit 0. |

The initial disk-backed PostgreSQL run was interrupted after observing multi-second
data-file sync waits; the full passing suite used an owned PostgreSQL 16-alpine
container with a RAM-backed data directory. This tests SQL/concurrency behavior,
not power-loss durability or production storage performance. Initial browser runs
encountered an occupied port, missing bundled browser, and external dependency
junction/build-cache failures. The self-contained rerun used copied dependencies,
installed Chrome in fresh contexts, webpack and loopback ports 43100/43101/43211.
No production environment files were loaded. Mock issuer/provider evidence is
not real AIBRY ID acceptance. Pre-existing coach edits were preserved and included
in validation; they require separate release review.
The passing browser run logged a Next development stream-write error during
navigation; all assertions passed. It is not evidence of a production database
failure, and default Turbopack/production-browser execution remains unverified.

## Guarded Windows PM2 deployment — approval required

For the combined Rook/workspace release, [RELEASE-APPROVAL.md](RELEASE-APPROVAL.md)
supersedes the generic staging procedure below. Rook changes are now in scope;
the final package manifest pins both fixes and preserves the original built assets.

**Do not execute this section without explicit approval.** No production Postgres,
authentication, secrets, Fedora service, ingress or schema changes are required.
Only the Windows `midnight-ink` PM2 runtime is in scope. Do not restart shared apps.

1. Record the reviewed source revision plus hashes/diff of included uncommitted
   changes; exclude unrelated existing coach edits unless separately reviewed.
   Build and validate that exact release in a sibling staging directory using
   protected operator configuration. The validation snapshot from this investigation
   includes the pre-existing coach changes and is not itself an approved artifact.
2. Inspect current PM2 status through an already-running daemon. Record only app
   name/id, status, PID, restart count, interpreter version, cwd and script path;
   never dump `pm2 env`, `jlist`, or environment files into evidence. Revalidate
   listener, internal health, external reachability and authenticated workspace
   access. Record numeric latency/failure counts without saving response bodies.
   Inspect existing redacted logs and stop if the baseline is unhealthy.
   The existing health handler also flushes the photo deletion queue: its GET is
   not strictly read-only. Do not invoke it against production under a read-only
   investigation; include that existing cleanup behavior in deployment approval.
3. Preserve the exact current release/build, dependency lockfile, PM2 entrypoint
   and protected environment placement. Identify the rollback release and verify
   that its files are readable. Do not copy secrets into source or reports. Retain
   data/photo paths and session secrets unchanged. No database rollback is needed.
4. Review the exact release switch and rollback commands against verified cwd/script
   paths. Obtain approval for those commands and the interruption window. A fork
   instance restart interrupts requests; `wait_ready` does not make it zero downtime.
5. Switch only the approved runtime release and restart only `midnight-ink`, without
   `--update-env`, migrations, reseeding, reset or unrelated PM2 operations. Avoid
   running `next build` over the live `.next` directory. Preserve normal shutdown
   handling and the existing bounded PM2 restart policy.
6. Verify ready/online state, restart stability, expected listener, internal/external
   health and authenticated workspace load. Check two separate authorized accounts
   for isolation and logout/expiry behavior. Run a modest agreed focus/tab-return
   sample, observe numeric latency/failure totals and the safe pool diagnostics;
   do not run synthetic saturation against production PostgreSQL.
7. Roll back immediately for failed readiness/authentication/isolation, increased
   503s, unexplained pool failures, or a restart loop: restore the preserved runtime
   release/entrypoint and restart only this app once. Repeat the same health and
   authenticated checks; stop and diagnose if rollback is not healthy. Do not
   repeatedly restart or change Postgres/pool/TLS settings to mask failures.

Read-only inspection on 2026-11-09 found PM2 app `midnight-ink`, id 30, PID 18640,
status online, six cumulative restarts, cwd
`C:\Users\bryan\aibry\projects\midnight-ink`, script `scripts\server.mjs`, and
listener `192.168.1.82:3031`. This is a dated process/listener observation, not
authenticated health or proof of restart timing. No restart or production health
request was performed. Revalidate these values before deployment. The current
release/rollback artifact, live database counters and authenticated baseline remain
unverified. Approval must name the exact release/rollback paths and reviewed
revision; the checkout contains unrelated pre-existing coach changes.
