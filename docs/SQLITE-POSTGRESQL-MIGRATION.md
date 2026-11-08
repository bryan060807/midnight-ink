# Operator-controlled SQLite to PostgreSQL migration

This is an offline, deliberate import for **Midnight Ink only**. The production web application uses PostgreSQL exclusively. `node:sqlite` remains only in this utility and its legacy test fixtures. Nothing here registers an identity client, modifies another application's database, starts Fedora-hosted Next.js, or deploys infrastructure.

The supported layout is the Windows Midnight Ink runtime and practice-photo directory, with its dedicated PostgreSQL database on Fedora. `midnight_ink` and `midnight_ink_app` are proposed application identifiers, not assertions that they have already been provisioned. Follow [Windows/Fedora deployment](WINDOWS-FEDORA-DEPLOYMENT.md) for separately executed provisioning, connection TLS, and firewall steps.

## Before importing

1. Verify which Windows PM2 process and checkout belong to Midnight Ink. Stop only that application and prevent all other writers. Do not change shared PM2 services or their saved process list.
2. Preserve the old application release, its environment configuration, a consistent SQLite backup, and the complete Windows practice-photo directory. Keep the same `SESSION_SECRET` if retaining existing hashed app sessions. Never put any of these secrets or user-data backups into Git.
3. Provision a **dedicated, empty** PostgreSQL database/schema. Verify the destination host, database, and role out of band. Configure `DATABASE_URL` privately; do not paste a password into a command or commit it. Use verified TLS for Windows-to-Fedora connections.
4. Run `npm ci` and `npm run db:migrate` for the new release against that destination. **Do not run `db:seed` before importing**: an occupied curriculum/seed table is intentionally rejected along with occupied user tables. Migrations do not import or claim demo records.
5. Set `MIDNIGHT_INK_DATA_DIR` to the actual existing Windows data directory. The importer receives its `photos` subdirectory, verifies every referenced file, and leaves all file names and bytes in place. Do not move photos into PostgreSQL. If an old install stored its data in a checkout, keep that checkout/data path preserved while planning any separate move to durable storage outside release artifacts; the import itself does not relocate files.

## Create the required backup separately

The import command **never creates a substitute backup**. Supply a distinct pre-existing regular file that is a current logical copy of the stopped source. SQLite WAL files mean raw byte equality or an ordinary copy of just the live main file is not adequate proof of a consistent backup.

Example PowerShell, after the application has stopped and the operator has supplied verified paths:

```powershell
$env:LEGACY_SQLITE_SOURCE = Read-Host 'Full path to stopped Midnight Ink SQLite source'
$env:LEGACY_SQLITE_BACKUP = Read-Host 'New backup file path in the verified backup location'
node --input-type=module -e 'import {DatabaseSync,backup} from "node:sqlite"; import {existsSync} from "node:fs"; if(existsSync(process.env.LEGACY_SQLITE_BACKUP)) throw new Error("Choose a new backup path; existing backups are not overwritten."); const db=new DatabaseSync(process.env.LEGACY_SQLITE_SOURCE,{readOnly:true}); try { await backup(db,process.env.LEGACY_SQLITE_BACKUP); } finally { db.close(); }'
```

The backup destination's parent directory must already exist and be operator-controlled. Back up photos separately while the app is stopped. Test that backups can be read and protect them as private user data.

## Execute the explicit import

Run from the Midnight Ink checkout, with `DATABASE_URL` securely configured for the verified empty PostgreSQL destination. PowerShell:

```powershell
$photoDirectory = Join-Path $env:MIDNIGHT_INK_DATA_DIR 'photos'
$reportPath = Read-Host 'New path for the redacted import report'
npm run db:import-sqlite -- --source "$env:LEGACY_SQLITE_SOURCE" --backup "$env:LEGACY_SQLITE_BACKUP" --photos-dir "$photoDirectory" --confirm APPLICATION_STOPPED_AND_EMPTY_DESTINATION --report "$reportPath"
if ($LASTEXITCODE -ne 0) { throw 'Import failed. Keep the old application stopped and inspect the redacted error.' }
```

The equivalent Bash invocation is useful for isolated verification; it is **not** a Fedora web-runtime installation instruction:

```bash
npm run db:import-sqlite -- \
  --source "$LEGACY_SQLITE_SOURCE" \
  --backup "$LEGACY_SQLITE_BACKUP" \
  --photos-dir "$MIDNIGHT_INK_DATA_DIR/photos" \
  --confirm APPLICATION_STOPPED_AND_EMPTY_DESTINATION \
  --report "$IMPORT_REPORT_PATH"
```

There is no `--force`, merge, overwrite, reset, or automatic demo claim option. A report path must be new and writable; the command reserves it before importing instead of discovering an occupied path after commit. Without `--report`, success JSON is printed to the console. Reports contain table counts and verification outcomes, not connection URLs, IDs, photo names, emails, tokens, notes, or provider-response bodies.

## What is checked and preserved

- The source and backup are distinct regular files, opened read-only inside SQLite read snapshots. Their logical schemas must match the unmodified original SQLite migration 001, or migrations 001 and 002, with exactly the expected table/index/trigger definitions and ordered version ledger.
- Full SQLite integrity and foreign-key checks run. Unknown/missing/altered tables, unsafe record types, unsupported version ledgers, mismatched child ownership, and stale backups fail before destination writes. Source and backup schema/data fingerprints must match; a hard link to the live source is not a backup.
- PostgreSQL's migration ledger/checksums and explicit column mappings are verified. The importer uses the migration advisory lock and exclusive locks on application data tables. Every destination data table must be empty, including the internal photo-deletion queue. Existing records are never truncated or overwritten.
- Explicit mappings preserve all 22 legacy logical tables: profiles/settings, curriculum/resources, equipment/cartridge/ink rows, lesson progress, practice sessions/photos/assessments, designs, coaching, goals, identities, hashed application sessions, temporary login transactions, demo receipts, and the seed marker. The source SQLite schema ledger is checked but **not copied over** PostgreSQL's independent migration ledger. The new PostgreSQL photo-deletion queue starts empty.
- Existing string IDs are retained, including IDs that are not UUIDs. ISO timestamps retain their instant to millisecond precision; authentication timestamps remain safe integer epoch milliseconds. JSON content is checked and compared after PostgreSQL JSONB normalization. Integer values outside this application's safe numeric range are rejected rather than silently rounded.
- Every referenced photo must use the generated UUID `.jpg` filename, remain within the supplied directory without symlinks, match its recorded byte size and dimensions, and decode as a genuine still JPEG. Its bytes are fingerprinted before import and checked again before commit. A source with no photo records does not need an existing photo directory.
- The import is one PostgreSQL transaction. All row counts and normalized content fingerprints are compared before commit; source/backup file and WAL identities are checked again for concurrent changes. A failed insert, changed source/photo, or failed constraint/content verification rolls the destination transaction back.

No raw session bearer token exists in the legacy database. Hashed session tokens are preserved without printing them. Temporary login transactions include short-lived PKCE/nonce material and are transferred only through the database connection, never into a JSON export/report. Keep the application secret stable and make the offline cutover short if preserving sessions is desired; expired records remain expired. Rotating the secret intentionally invalidates retained sessions and outstanding attempts.

Unclaimed `local-demo` data remains owned by `local-demo`. Existing `DemoImportReceipt` history remains intact so PostgreSQL conversion cannot enable a second demo claim. This database conversion is independent of the separately authorized [demo-data ownership claim](DEMO-DATA-MIGRATION.md).

## Verification and recovery

A successful report has `rowCountsVerified`, `contentVerified`, `sourceUnchanged`, and `verifiedBackup` set to true, with counts for every mapped table and a verified photo count. Archive the report beside the private backup and record the application commit without secret values. After import, optional `npm run db:seed` may refresh bundled original curriculum; its seed marker preserves prior sample deletion and never assigns demo data to an authenticated account.

Before opening traffic, take a PostgreSQL backup coordinated with the same Windows photo snapshot and perform the deployment guide's health, login/logout, restart, and two-user isolation acceptance checks. A successful local mock login is not real AIBRY ID production acceptance.

If import fails, keep the application stopped, preserve the redacted error, and confirm the PostgreSQL transaction left domain tables empty. The source SQLite file and photo bytes are never modified or deleted by the importer. Correct the prerequisite and retry only against an explicitly verified empty target. A successful import cannot be replayed into its occupied target.

If a later rollout check fails, stop only Midnight Ink. Preserve the PostgreSQL state and current photo directory before any recovery. To resume the old release, restore its verified SQLite backup and matching Windows photo snapshot, restore its previous private configuration, and restart that old release only after verifying the SQLite path and app process. PostgreSQL is not automatically reverse-migrated into SQLite. Writes accepted after cutover require an operator reconciliation plan; do not discard them or restore an older snapshot blindly. Never drop another application's database or reset a shared PostgreSQL cluster.

This utility is tested only against disposable PostgreSQL databases and generated SQLite fixtures in Codex Cloud. It has not been run against a real production database or actual Windows user files.
