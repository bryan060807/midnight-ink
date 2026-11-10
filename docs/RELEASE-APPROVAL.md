# Combined Rook and workspace release

This release combines strict OpenAI coaching output validation and private fallback
diagnostics with single-connection workspace reads, pool diagnostics, refresh
deduplication and one bounded transient read retry. No authentication, schema,
credential, timeout or pool-size changes are included.

The prepared package is outside the checkout:
`C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined`.
Its `release-manifest.json` pins the exact commit, original production build ID,
runtime executables, release/rollback inventories and PM2 target. The original
deployed source revision is not inferred from Git HEAD; the preserved live
production `.next` tree is the rollback authority. Build caches and development
artifacts are excluded from rollback; compiled server/static assets are retained.

`release` contains the committed source and separate production build; `rollback`
contains the original source baseline, actual production built assets and installed
dependencies. Both use the original `scripts/server.mjs`. Protected configuration
files retain their original bytes. The effective PM2 environment is additionally
preserved with Windows DPAPI under the staging account. The package ACL grants
access only to that account, SYSTEM and Administrators. Never commit this package,
print its protected configuration or use it as a test database fixture.

Final test/build results and source SHA are recorded in the package's nonsecret
`validation-results.json` and manifest after execution. Earlier fixture-only
evidence remains in `ROOK-PROVIDER-FIX.md` and `WORKSPACE-503.md`.

## Approval gate and exact commands

Run under the **same Windows account in Administrator PowerShell**. The helper
checks the existing daemon before invoking the verified PM2 CLI; it does not use
start, delete, save, kill, or operate on other applications. Configuration restart
updates only the existing uniquely named app 30. No `--update-env` is used:
the generated configs explicitly supply the protected baseline environment.

Read-only preflight (authorized during preparation):

```powershell
Set-Location -LiteralPath 'C:\Users\bryan\aibry\projects\midnight-ink'
.\scripts\Invoke-MidnightInkRelease.ps1 -PackageRoot 'C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined' -Action Validate
```

**Only after explicit approval of the manifest commit and paths:**

```powershell
.\scripts\Invoke-MidnightInkRelease.ps1 -PackageRoot 'C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined' -Action Deploy -ApproveProductionSwitch
```

The helper invokes the verified `C:\Program Files\nodejs\node.exe` with
`scripts\release-pm2-rpc.cjs <package> deploy --approved`, from the original cwd.
The client loads the pinned installed PM2 module at
`C:\Users\bryan\AppData\Roaming\npm\node_modules\pm2`, opens only its existing
RPC socket, verifies the unique app 30 again, then sends exactly one
`restartProcessId` packet with id 30. It bypasses PM2's constructor/start fallback;
socket failures cannot launch another daemon. The installed PM2 CLI config parser
strips internal cwd/script fields, so a generic config restart is unsuitable here.
The explicit packet carries `current_conf.pm_cwd`, `pm_exec_path` and interpreter,
retaining original readiness, shutdown, logs and restart settings. Protected
environment values remain in child-process memory; no raw PM2 responses are output.

The original checkout/build is left untouched. No database restore, migration,
seed, reset, identity-provider change or photo-data copy is involved. Existing
absolute external photo/log paths, origin, hostname, port, model, provider, session
configuration and credentials are preserved. This is an interrupting fork-mode
restart, not a zero-downtime deployment. Do not use a non-elevated retry or start
another daemon if access fails. No `pm2 save` means PM2's persisted reboot state
is intentionally unchanged; persistence reconciliation is a separate action.

## Post-switch acceptance

1. Confirm only app 30 changed PID/cwd, is online/ready, binds
   `192.168.1.82:3031`, and stays stable without increasing restart counts. Inspect
   only safe app metadata. Do not dump `pm2 env`, `jlist` or raw logs into reports.
2. Verify local health using the existing canonical Host and external health over
   the normal ingress. Require status ok, PostgreSQL schema current and OpenAI
   configured. Health also performs the existing photo-deletion queue cleanup;
   include this side effect in production switch approval. Missing auth or database
   readiness is a failure; unauthenticated 401 is not authenticated acceptance.
3. In two separately authenticated authorized browser sessions, verify existing
   records, separate owners, denied cross-owner access, logout/expiry handling,
   focus bursts and tab return. Do not export private contents into evidence.
   Record only success/failure totals and latency; do not saturate production.
4. Submit one benign paper-practice Rook question through the authenticated UI.
   Require `source=openai`, schema-valid answer, allowlisted references and safety
   notice, with saved/reopened coaching. This is a paid provider call and database
   write covered only by the later production acceptance approval. If fallback
   occurs, inspect only `rook_provider_fallback`'s fixed category/status.
5. Check privacy-safe `postgres_failure` and `postgres_acquire_slow` events, including
   active/idle/waiting counters. Do not provoke failures against production.
   A recurrence's classified acquisition/query phase establishes the next diagnostic
   path. The historical 5.21-second incident remains unclassified until observed;
   a quiet observation window is not proof of its original cause.

Rollback for failed readiness, authentication/isolation failure, Rook remaining
offline unexpectedly, increased 503s, unexpected pool failures or restart loops.
Stop after one failed switch/rollback and diagnose; do not retry restarts blindly.

```powershell
.\scripts\Invoke-MidnightInkRelease.ps1 -PackageRoot 'C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined' -Action Rollback -ApproveProductionSwitch
```

This invokes the same executable and scoped restart packet with `rollback.config.cjs`,
switching app 30 to `<package>\rollback`, preserving its environment and original
compiled build. Repeat readiness, listener, authenticated workspace and Rook
checks. Environment drift blocks the helper and requires inspection/re-staging;
it never overwrites a newer operator configuration to force a rollback.

## Verification limits

Disposable PostgreSQL and generated-key mock identity tests do not prove Fedora
connectivity/TLS, live AIBRY ID acceptance, live OpenAI acceptance or PM2 switching.
Production requests/restarts are intentionally deferred. Windows symlink-specific
photo tests remain skipped. The existing 12-second provider deadline and shutdown
budget remain unchanged. The provider schema requires a compatible standard model;
unsupported/fine-tuned configurations safely fall back and require separate review.
