# Windows application and Fedora PostgreSQL deployment

This is an operator runbook and a set of reviewable examples. No step in this document has been executed against AIBRY infrastructure by Codex. Verify every placeholder, installed service, address, permission, certificate and backup destination before running a command.

The authoritative layout is:

```text
Browser → Cloudflare HTTPS → Fedora nginx → Windows AIBRY-DESKTOP:3031
                                                 ├─ Next.js / PM2 midnight-ink
                                                 ├─ persistent practice-photo files
                                                 └─ verified TLS → Fedora PostgreSQL
Fedora aibry-fedora-server also owns AIBRY ID, database backups and infrastructure recovery.
```

Midnight Ink's Next.js runtime belongs on Windows. This runbook supersedes the rejected, unmerged proposal to host its application container on Fedora. Do not activate a Midnight Ink Podman or Quadlet web application; historical Git branches are left intact. PostgreSQL and AIBRY ID remain separate databases/services. Supabase is not involved.

## Values to verify first

Record the Windows checkout and persistent-data paths, its specific LAN interface, Fedora ingress source address as seen by Windows, Fedora PostgreSQL TLS hostname/port/CA, Windows source address as seen by PostgreSQL, existing PM2/resurrection mechanism, existing Fedora PostgreSQL administration access, and the approved nginx/Cloudflare configuration. Do not infer one service's address or credentials from another service. IPv4 examples require an exact verified `/32`; use an independently reviewed exact `/128` for IPv6.

The names `midnight_ink`, `midnight_ink_migrator` and `midnight_ink_app` are proposed dedicated identifiers. Check for collisions before creating them. The public origin `https://midnight-ink.aibrylabs.com`, public client `midnight-ink-public-web`, and its production registration/activation are unverified. A provider-client source merge does not establish a live registration.

Keep credentials in the operator's server-secret mechanism or a protected, ignored `.env.production.local`. Never prefix them with `NEXT_PUBLIC_`, print a connection URL, put passwords on a command line, or copy real configuration into a report. Limit access to the Windows runtime identity and approved administrators. The runtime needs read/write permission on its data directory and read access to the database CA; browsers need neither.

## Fedora: provision only the dedicated database

These are separately executed operator actions on the verified PostgreSQL server. Do not install or replace PostgreSQL, change another application's database, or guess an administration user/container. Locate the existing approved administration connection first. The commands below deliberately require operator-supplied libpq service and password-file paths:

```bash
read -r -p 'Verified administration libpq service name: ' pg_admin_service
read -r -p 'Protected PGSERVICEFILE path: ' pg_service_file
read -r -p 'Protected PGPASSFILE path: ' pg_password_file
export PGSERVICEFILE="$pg_service_file" PGPASSFILE="$pg_password_file"
psql "service=$pg_admin_service" --no-psqlrc --set=ON_ERROR_STOP=1 \
  --command='SELECT current_user, current_database(), version();'
```

Inspect existing roles/databases through that connection before reviewing and applying [provision-postgresql.sql.example](../deploy/fedora/provision-postgresql.sql.example). It intentionally fails if a proposed role/database already exists. Its interactive `\password` commands avoid credentials in shell history. The migrator owns this database and creates schema objects; the runtime role has CONNECT, schema USAGE, and application DML privileges, without CREATE, ownership, role administration or superuser powers. Migrations and seeds use the migrator credential only for that operation. Set password authentication to SCRAM through the existing operator process.

After the operator has reviewed a local copy of that file and verified the connection, the explicit provision command is:

```bash
read -r -p 'Absolute path to the reviewed provision SQL: ' ink_provision_sql
psql "service=$pg_admin_service" --no-psqlrc --set=ON_ERROR_STOP=1 --file="$ink_provision_sql"
```

After Windows has applied migrations/seeds, the operator applies the reviewed [runtime-grants.sql.example](../deploy/fedora/runtime-grants.sql.example) to this database only:

```bash
read -r -p 'Absolute path to the reviewed runtime grants SQL: ' ink_grants_sql
psql "service=$pg_admin_service dbname=midnight_ink" --no-psqlrc \
  --set=ON_ERROR_STOP=1 --file="$ink_grants_sql"
```

After inspecting the connection result, roles/database collisions and the reviewed file contents, the operator can execute the provisioning file from a Fedora administration checkout or transferred copy:

```bash
read -r -p 'Absolute reviewed provision-postgresql.sql.example path: ' ink_provision_sql
test -f "$ink_provision_sql" || { echo 'Provisioning file not found.' >&2; exit 1; }
psql "service=$pg_admin_service" --no-psqlrc --set=ON_ERROR_STOP=1 --file="$ink_provision_sql"
```

After the Windows migrator has applied the migrations/import/seed, execute the reviewed runtime grants against **only** the dedicated database:

```bash
read -r -p 'Absolute reviewed runtime-grants.sql.example path: ' ink_grants_sql
test -f "$ink_grants_sql" || { echo 'Grants file not found.' >&2; exit 1; }
psql "service=$pg_admin_service dbname=midnight_ink" --no-psqlrc --set=ON_ERROR_STOP=1 --file="$ink_grants_sql"
```

These are separate operator steps, not instructions to change an existing shared database automatically. Do not execute the grants before the application tables exist.

Review the fragment in [pg_hba.conf.example](../deploy/fedora/pg_hba.conf.example). Allow TLS connections only to this database and its dedicated roles from the exact verified Windows source. Review earlier matching rules, PostgreSQL `listen_addresses`, certificates, existing firewall policy and NAT before changing anything. The certificate must validate for the hostname used in `DATABASE_URL`; supply its verified CA as `PGSSLROOTCERT` on Windows. Do not use `rejectUnauthorized=false`, `sslmode=no-verify`, or a global TLS bypass. Runtime connections default to verified TLS. Plaintext is reserved for explicitly configured loopback test/development databases.

For a Fedora firewalld installation, first inspect its actual active zone and existing rules. A source-specific rule can be prepared after substituting all three values:

```bash
read -r -p 'Verified firewalld zone: ' pg_firewall_zone
read -r -p 'Verified Windows source IPv4: ' pg_windows_source
read -r -p 'Verified PostgreSQL TCP port: ' pg_listen_port
firewall-cmd --get-active-zones
firewall-cmd --zone="$pg_firewall_zone" --list-all
```

After separately approving the effective policy, the operator may add the exact-source rule through their existing change process:

```bash
pg_rule="rule family=ipv4 source address=$pg_windows_source/32 port port=$pg_listen_port protocol=tcp accept"
sudo firewall-cmd --zone="$pg_firewall_zone" --permanent --add-rich-rule="$pg_rule"
sudo firewall-cmd --reload
```

A narrow rule does not cancel an existing broad allow. Verify effective reachability from allowed and disallowed sources. Reloading a shared firewall or PostgreSQL configuration is an infrastructure change requiring the operator's normal review; Codex does not execute it.

## Windows: checkout and persistent configuration

Use Node.js **24+**, npm, Git and PowerShell. Confirm the existing PM2 mechanism uses a compatible Node installation. Run commands inside the checkout, not its parent `projects` directory:

```powershell
$ErrorActionPreference = 'Stop'
$Checkout = Read-Host 'Absolute Midnight Ink checkout path'
if (-not [System.IO.Path]::IsPathRooted($Checkout)) { throw 'Use a verified absolute checkout path.' }
git clone https://github.com/bryan060807/midnight-ink.git $Checkout
if ($LASTEXITCODE -ne 0) { throw 'Clone failed; inspect an existing checkout separately.' }
Set-Location $Checkout
git fetch origin
git switch --track origin/feat/postgres-windows-fedora
node --version
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
if (-not (Test-Path .env.production.local)) {
    Copy-Item deploy/windows/production.env.example .env.production.local
} else {
    Write-Host 'Preserving the existing protected production configuration.'
}
```

For an existing checkout, inspect `git status` first, select the approved release branch/commit and use `git pull --ff-only`; do not clone over existing data or discard local work. The feature branch is for review, not automatic production approval.

Edit `.env.production.local` with the verified values from [production.env.example](../deploy/windows/production.env.example). Its placeholders are deliberately unusable. `DATABASE_URL` uses the runtime role and a URL-encoded secret, verified PostgreSQL hostname/port, and `sslmode=verify-full`. `PGSSLROOTCERT` identifies a readable PEM CA file. Prefer forward slashes in Windows dotenv paths to avoid quoted backslash escapes. `PG_POOL_MAX` defaults to 5 and accepts 1–20. `DATABASE_SCHEMA` defaults to `public`; it is normally unset outside isolated tests.

Choose an absolute `MIDNIGHT_INK_DATA_DIR` **outside the checkout**, build and release directories. The application stores normalized images in its `photos` child directory and PM2 writes under `logs`. Protect the directory with Windows ACLs for the existing service identity and approved backup/admin identities; inspect inherited ACLs before granting access. Do not use the checkout's ignored `.data` as production storage. When migrating an installation, preserve its existing verified photo location and filenames rather than casually moving them during release.

Set `HOST` to the specific verified Windows LAN interface reached by Fedora. Production refuses an omitted host, wildcard `0.0.0.0`/`::`, or a data directory inside the checkout. Development defaults to `127.0.0.1`; `PORT` defaults to **3031** in both modes. A loopback production HOST is useful only for a deliberate local probe, not Fedora LAN ingress. `--port` and `--hostname` are available for isolated local checks.

The custom Node entrypoint loads Next's environment files, uses the normal production build, and supports Windows PM2 shutdown messages plus SIGINT/SIGTERM. It drains HTTP requests, closes Next and the shared PostgreSQL pools, with a bounded shutdown deadline. Before announcing PM2 readiness it probes its own listener using the canonical Host and requires healthy PostgreSQL/current schema plus valid access configuration; an unavailable database/schema fails startup safely. This local probe bypasses HTTP proxies, never contacts AIBRY ID, and does not establish a real login. It does not run migrations or seeds automatically. Do not combine this custom server with Next `output: 'standalone'` artifacts.

The production auth settings are:

```dotenv
AIBRY_ID_ISSUER=https://id.aibrylabs.com
AIBRY_ID_CLIENT_ID=midnight-ink-public-web
APP_ORIGIN=https://midnight-ink.aibrylabs.com
SESSION_SECRET=<stable-operator-generated-random-secret-at-least-32-bytes>
LOCAL_DEMO_ENABLED=false
AIBRY_ID_ALLOW_HTTP_LOCALHOST=false
```

Use the exact approved values, keep the session secret stable through routine restarts, and keep optional Rook credentials server-side. Production never permits local-demo fallback. Preserve the environment's required proxy/CA settings for verified outbound discovery, token and JWKS access; do not bypass trust failures.

## Windows: migrations, seeding and build

Back up first. Use a new, empty dedicated PostgreSQL database for first installation. For a legacy SQLite installation, follow [SQLITE-POSTGRESQL-MIGRATION.md](SQLITE-POSTGRESQL-MIGRATION.md): migrate the empty destination, import and verify the backed-up SQLite/photo data before ordinary seeding. Do not seed a destination that must pass the importer's empty-destination checks. Importing SQLite does not claim demo records or switch identity owners.

In PowerShell, temporarily supply the **migrator** URL to the command process without printing it. The protected production environment file retains the lower-privilege runtime URL:

```powershell
$env:NODE_ENV = 'production'
$MigratorSecret = Read-Host 'Dedicated migrator DATABASE_URL (masked)' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $MigratorSecret).Password
try {
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    # New installation only; existing SQLite migration follows its separate runbook first.
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Database seed failed.' }
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Variable MigratorSecret -ErrorAction SilentlyContinue
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
```

Migrations are ordered, transactional and serialized with a PostgreSQL advisory lock; seed is a separate repeatable command preserving stable curriculum IDs, user edits and deleted sample equipment. Normal application startup does neither. Never run `db:reset` on production. After migrations, apply/verify [runtime-grants.sql.example](../deploy/fedora/runtime-grants.sql.example), retaining only SELECT on migration/seed metadata and bundled curriculum for the runtime role. Keep the migrator credential out of PM2's environment.

## Windows: scoped firewall and PM2 launch

Review [firewall.ps1.example](../deploy/windows/firewall.ps1.example) in an elevated PowerShell. Its inbound TCP 3031 rule selects the verified local interface, verified Fedora ingress source, and actual trusted network profile. Check effective Windows firewall policy for pre-existing broader allows. Verify other LAN hosts cannot connect and Fedora can; do not open 3031 to the internet or forward it through a router.

Reuse the existing approved PM2 installation. If PM2 is absent, install it separately as the intended service user after reviewing the version:

```powershell
npm install --global pm2
```

Inspect the process list and port before starting. An existing `midnight-ink` must point to this approved checkout; if another process owns the port or name, investigate before changing it:

```powershell
pm2 list
Get-NetTCPConnection -LocalPort 3031 -State Listen -ErrorAction SilentlyContinue
pm2 startOrReload ecosystem.config.cjs --only midnight-ink --update-env
pm2 pid midnight-ink
pm2 logs midnight-ink --lines 30 --nostream
```

[ecosystem.config.cjs](../ecosystem.config.cjs) resolves its cwd from the file, launches Node directly rather than a Windows npm shim, and uses exactly one fork instance named `midnight-ink`. A repeated scoped `startOrReload` updates that process rather than intentionally creating another listener. All log paths are outside the checkout under the persistent data directory. Logs can still contain sensitive framework diagnostics: restrict ACLs, inspect redaction, and configure rotation/retention in the existing logging mechanism. Never collect callback query strings, cookies, Authorization headers, provider token bodies or connection URLs in diagnostics.

Do **not** run `pm2 startup` on Windows, `pm2 restart all`, `pm2 delete all`, or `pm2 save` as part of this runbook. The existing Windows resurrection mechanism and saved process list are managed separately. A subsequent boot/recovery check belongs to that mechanism's operator, without disturbing other applications. After a failed bind, inspect the existing listener; do not start a second copy on a different public port as a workaround.

## Fedora: nginx and Cloudflare integration

Review [nginx.conf.example](../deploy/fedora/nginx.conf.example) against the existing ingress. It is not a replacement for shared configuration. Substitute the verified Fedora bind/certificate/log paths and Windows upstream address. Preserve the existing approved Cloudflare tunnel or verified origin-TLS transport; no tunnel identifier, DNS record or Cloudflare mode is assumed here. If the real ingress uses an existing internal HTTP tunnel listener, adapt only its already-approved transport while retaining the same authority and header checks.

The upstream `Host` must be the literal `midnight-ink.aibrylabs.com`. Preserve the browser's genuine `Origin`; nginx normally passes it unchanged. Reject missing or alternate HTTP Host authorities (including unexpected ports) at ingress, discard untrusted Forwarded/X-Forwarded identity assertions, and prevent alternate direct public upstream access. The application derives identity only from a verified server-side session and ignores forwarded host/protocol/identity assertions. A proxy must never manufacture a trusted Origin to make a failing mutation pass. Use per-client auth abuse limits only where the actual ingress has independently verified client identity; the app's process-wide login/callback backstop is not a per-client rate limit.

The example access log uses `$uri` without query strings; callback codes/state must not enter access/error logs. Review inherited logging and Cloudflare observability too. The example disables vhost request error logs until an approved redaction mechanism is available. Separately validate the reviewed configuration with `sudo nginx -t` before any operator-approved shared reload. Do not activate the example automatically.

## AIBRY ID registration and health

Use the maintained provider's supported, approved registration process. Verify the real issuer discovery/JWKS, client `midnight-ink-public-web`, public-client token auth `none`, Authorization Code, required PKCE S256, scopes `openid profile email`, and exact callback `https://midnight-ink.aibrylabs.com/auth/aibry-id/callback`. Do not reuse another client, edit the provider's production database, or add wildcard callbacks. The provider's merged client source does not prove production activation. [AIBRY-ID-ACCEPTANCE.md](AIBRY-ID-ACCEPTANCE.md) retains the earlier source-inspection evidence and live acceptance requirements; inspect the current provider revision before applying any older provider change plan.

From the Windows runtime identity, verify database TLS and reachability without printing the URL. From Fedora's actual ingress connection, probe the application with its canonical Host:

```bash
read -r -p 'Verified Windows application IPv4: ' ink_windows_host
curl --fail --silent --show-error \
  --header 'Host: midnight-ink.aibrylabs.com' \
  "http://$ink_windows_host:3031/api/health"
curl --fail --silent --show-error https://midnight-ink.aibrylabs.com/api/health
```

Check the documented response/HTTP status and configured access boundary; do not loosen authentication to make a probe pass. A missing database/schema or invalid auth configuration must return unavailable, never SQLite or anonymous fallback. A generic successful health response alone does not prove a real provider login, per-user access, photo storage, or correct proxy filtering. Keep detailed database/TLS diagnostics private.

## Coordinated backups and restore

PostgreSQL holds all metadata; Windows holds the photo binaries. A dump without the corresponding photo snapshot is incomplete. Define retention, encryption, backup ACLs and recovery ownership before exposing user data.

1. Enter an operator-controlled maintenance window that prevents all application writes, including uploads/deletions and background cleanup. Review `photoCleanup` from health and pending `PhotoDeletionQueue` rows; resolve cleanup failures or preserve their database/file state in the matched snapshot. Stop only `midnight-ink` if needed; do not stop shared PM2 services. Keep the approved release identifier, schema versions and timestamp in a redacted backup manifest.
2. On Windows, snapshot/copy the complete persistent photo directory using the approved backup mechanism. Preserve filenames, compute SHA-256 hashes, and verify every `PracticePhoto.filename` resolves inside that directory. Include any pending file-deletion state consistently. A rare crash or ambiguous commit during a database outage can leave private unreferenced files: reconcile against verified metadata during maintenance, never blindly delete while the database is unavailable. Do not treat a records JSON export as a binary photo backup.
3. On Fedora, create a matching dedicated-database dump using an approved read-capable backup role and a protected libpq service/password file. [pg_service.conf.example](../deploy/fedora/pg_service.conf.example) shows the non-secret connection fields. For example, after filling the verified local paths and service configuration:

   ```bash
   read -r -p 'Protected PGSERVICEFILE path: ' pg_service_file
   read -r -p 'Protected PGPASSFILE path: ' pg_password_file
   read -r -p 'Approved absolute backup directory: ' ink_backup_directory
   export PGSERVICEFILE="$pg_service_file" PGPASSFILE="$pg_password_file"
   umask 077
   mkdir -p "$ink_backup_directory"
   pg_dump --dbname='service=midnight_ink_backup' --format=custom \
     --file="$ink_backup_directory/midnight_ink.pgdump"
   pg_restore --list "$ink_backup_directory/midnight_ink.pgdump" > "$ink_backup_directory/contents.txt"
   sha256sum "$ink_backup_directory/midnight_ink.pgdump" > "$ink_backup_directory/SHA256SUMS"
   ```

4. Verify dump/snapshot completion and hashes, row counts, representative metadata/file pairs and protected storage. Record both components in the same manifest before resuming writes. A failed component means the backup set is incomplete.
5. Restore into a separately provisioned empty recovery database and an isolated Windows photo directory first. Use a verified recovery libpq service with appropriate restore privileges; inspect the dump before `pg_restore --dbname='service=<VERIFIED_RECOVERY_SERVICE>' --exit-on-error <VERIFIED_DUMP_PATH>`. Reapply least-privilege grants, verify schema/counts/hashes/ownership, then test login, persistence and isolation against that recovery environment. Do not point a recovery test at the live provider/app database.
6. For actual recovery, preserve the failed state, stop application writes, restore the matched database/photo pair using the approved recovery plan, then validate before reopening ingress. A database restore can revive old sessions/receipts; revoke sessions/rotate `SESSION_SECRET` as appropriate. Review any deliberate one-time demo claim and its permanent receipt. Restoring one account into an active multi-user database can discard other users' newer work and needs a specific plan.

Do not embed passwords in `pg_dump`/`psql` argv, dump a different service's database, run destructive restore cleanup against a live database, or silently switch back to SQLite when PostgreSQL fails.

## Release rollback

Keep the last known-good application commit/build and its compatible PostgreSQL schema recorded with the backup set. Back up before migration, rehearse migrations against a copy, build before touching the running process, and scope any maintenance to `midnight-ink`.

If only the release is faulty and its predecessor supports the current PostgreSQL schema, restore that approved release, install its locked dependencies/build, retain the stable secrets/photo directory, and run the same scoped PM2 `startOrReload`. If schema/data recovery is required, use the matched database/photo restore process above during a write freeze. There are no automatic down migrations or production resets. The old SQLite application is not a safe fallback against a now-changing PostgreSQL installation. Recheck health, login, isolation and persistence before reopening traffic.

## Two-user production acceptance

Use two authorized real AIBRY ID test identities in independent browser profiles. Save redacted evidence and HTTP statuses; never save bearer cookies, codes or token bodies.

| Check | Required result |
| --- | --- |
| HTTPS and identity | Both users complete the exact registered code/PKCE flow; issuer/audience/nonce/state and JWKS verification remain enabled. Cookies are host-only HttpOnly Secure; application session values are hashed in PostgreSQL. |
| Separate workspaces | Each new identity begins with its own empty records. Equal mutable email attributes cannot link subjects. Unclaimed demo data stays unclaimed. |
| Every owned resource | User A creates equipment, progress, sessions/photos, assessments, a design, a goal, coaching and settings. User B cannot read, modify, download, export or delete A's records by replaying IDs or supplying a profile ID. Repeat in the other direction. |
| Proxy/CSRF | Genuine same-origin mutations succeed. Cross-site/null Origin, alternate Host and spoofed Forwarded/X-Forwarded/identity headers cannot authorize a request. Disallowed direct network sources cannot reach Windows 3031 or PostgreSQL. |
| Logout and concurrency | Logout immediately revokes that app session without affecting the other user. A consumed callback cannot be replayed; simultaneous first logins do not create duplicate issuer/subject profiles. |
| Restart and storage | Scoped PM2 restart retains records, photo bytes, session validity and configuration; only one listener/process exists. The separately managed Windows resurrection mechanism restores the same scoped service after its approved reboot test. |
| Failure and recovery | A staged database outage fails safely with no URL/details leakage or fallback. Restore a matching dump/photo snapshot in isolation, verify hashes/rows and both users' isolation, then record the recovery procedure. |
| Local demo/import | Production cannot enable demo fallback. Any demo claim requires the separate authorization verifier, empty recipient, explicit confirmation and one-time receipt. No migration claims data automatically. |

Automated Linux/PostgreSQL/mock-OIDC evidence is recorded in [TESTING.md](TESTING.md). Actual Windows PM2 execution, production registration/login, real firewall/ingress behavior and a coordinated operator restore remain separate acceptance checks until performed and recorded.
