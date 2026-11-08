# Architecture

## Application boundary

One Next.js App Router application serves the React interface and Node-runtime JSON/file endpoints. TypeScript uses strict checking. Tailwind and shared CSS form the dark studio interface; Lucide provides interface icons. PostgreSQL is required in every mode; a loopback development demo needs no external account or paid AI provider. Production runs the application under PM2 on Windows AIBRY-DESKTOP. Fedora aibry-fedora-server owns PostgreSQL/backups, AIBRY ID and nginx/Cloudflare ingress. [Deployment](WINDOWS-FEDORA-DEPLOYMENT.md) defines that boundary; no Fedora web application package is included.

The nine routes are Dashboard (`/`), Learn, Practice Studio, AI Coach, Design Studio, Equipment, Progress, Reference Library, and Settings. Desktop navigation and a compact mobile bottom bar reach the same screens.

## Domain and persistence

- `src/lib/curriculum.ts`: original modules, lessons, exercises, and attributed reference cards. Content stays available offline.
- `src/lib/database.ts`: typed asynchronous `pg` data access, bounded shared pools, client-scoped transactions, verified TLS, safe driver-error classification and graceful pool closure.
- `src/lib/db.ts`: awaited repository functions and explicit migration/seed operations. Parameterized queries and allowlisted table names keep SQL construction separate from UI requests.
- `migrations/postgresql/*.sql`: numbered PostgreSQL migrations, tracked by filename/checksum in `SchemaMigration` and serialized by an advisory lock. Original `migrations/001_initial.sql` and `002_auth.sql` remain unchanged as offline legacy-import references.
- `src/lib/schemas.ts`: Zod input validation for equipment, sessions, assessments, designs, profile/settings, and goals.
- `src/lib/uploads.ts`: supported signature detection, bounded decode/re-encode using Sharp, generated storage names, guarded file reads and deletion.
- `src/lib/coach.ts`: deterministic retrieval/offline teaching and a bounded optional provider adapter.
- `src/lib/design.ts`: a small versioned numeric drawing format and original flash studies; executable uploaded SVG is not a project format.

PostgreSQL preserves text IDs, foreign keys, composite owner/parent constraints and per-owner indexes. The schema includes profiles, settings, owned equipment, cartridge/ink details, curriculum entities, unique per-profile lesson progress, exercise-linked practice sessions, photos, assessments, designs, goals, coaching history and authentication records. Drawing/authored content and receipt details use JSONB. Ordinary timestamps use TIMESTAMPTZ; authentication times retain exact millisecond integers. Transactions acquire one client, then commit/rollback and release it reliably. A global registry keeps pools shared across Next route bundles and development reloads; the default pool maximum is five.

`DATABASE_URL` is server-only and mandatory. Invalid or unavailable PostgreSQL never selects a SQLite fallback. Runtime database access creates no schema or seed data. Operators run `db:migrate` and `db:seed` separately with a migrator role; the Windows runtime uses a dedicated role without schema CREATE. The [offline SQLite import](SQLITE-POSTGRESQL-MIGRATION.md) verifies a stopped source, its matching backup, the empty migrated destination, row mappings/counts and photo files before committing.

Photo bytes remain on Windows under `MIDNIGHT_INK_DATA_DIR/photos`. Production requires an absolute data directory outside the checkout; development defaults to `.data`. Normalization, generated filenames, path checks and per-session ownership remain enforced. A database trigger enqueues committed photo deletions in `PhotoDeletionQueue`; bounded retries remove files after metadata commits. Failed cleanup stays queued rather than losing its recovery record. A rare crash or ambiguous database outage during upload can leave private unreferenced bytes; reconcile only during controlled maintenance with a verified database/photo backup.

Content seeding updates the 36 bundled lessons and other educational resources by stable IDs. Profile/settings inserts use `ON CONFLICT DO NOTHING`. A seed marker ensures editable local-demo sample equipment is inserted only once, so deleting a sample does not recreate it on the next seed. Authenticated accounts receive independent empty workspaces, never automatically copied demo data. User-created records are never replaced by content seed. The application uses Node.js 24+ rather than Edge runtime; `node:sqlite` is limited to the offline legacy importer and its fixtures.

## Access and request handling

`src/lib/auth-config.ts` validates the canonical application origin/issuer and secret configuration, derives the exact callback, and implements trusted-host, same-origin, cookie, token-digest, and safe-return-path rules. `src/lib/oidc.ts` discovers the provider, binds one-use state/nonce/PKCE to the browser, validates JWTs with a maintained signature library, and establishes/revokes application sessions. `src/lib/auth-store.ts` owns persistent identity, transaction, and session records. `requireWorkspace` resolves the active owner server-side before any protected operation.

PostgreSQL migration `002_auth.sql` preserves immutable `(issuer,subject)` mapping to profiles, opaque-session digests with revocation/expiry, browser-bound login transactions, and a unique demo-import receipt. Login-transaction consumption is atomic, and concurrent first logins serialize identity creation so a single issuer/subject cannot receive duplicate profiles. Mutable email/display name never join accounts. New identities receive their own profile/settings and no automatic demo inventory. Existing demo records remain intact. See [demo migration](DEMO-DATA-MIGRATION.md) for the separate explicit one-time claim.

Protected requests require an unexpired database-backed session, except for explicitly enabled loopback-only development demo access. Production has no anonymous/demo fallback, and malformed or expired authenticated cookies do not silently reveal a demo workspace. The login/configuration screen and authentication entry/callback routes are public; personal data is not. The UI validates session status before requesting workspace data and clears expired account state.

Every record operation scopes owned data by the resolved `profileId`; client JSON, query parameters, and identity-like headers cannot select another owner. Child resources such as photos additionally verify their owning practice session. Authenticated mutations enforce the exact configured browser Origin and reject cross-site requests. The canonical `APP_ORIGIN` is authoritative; forwarded host/protocol/identity headers are not trusted. A reverse proxy must overwrite upstream Host with that exact approved authority and prevent direct public upstream access.

The API handles workspace CRUD, lesson completion, uploads, export/deletion, and health. Responses avoid caching private data. Upload bytes and JSON are bounded, malformed requests receive actionable validation errors, and raw user text, images, tokens, and provider response bodies are not logged. Login transactions and sessions have explicit lifetimes and cleanup; logout revokes the database session and clears its HttpOnly cookie. No provider bearer token is exposed to JavaScript or retained as a reusable application credential.

Read [AIBRY-ID-INTEGRATION.md](AIBRY-ID-INTEGRATION.md) for the exact supported protocol/configuration and [AIBRY-ID-ACCEPTANCE.md](AIBRY-ID-ACCEPTANCE.md) for operator registration/live-login gates. Source inspection or local mock acceptance does not establish a working real registration or production deployment.

## Creative tools and coaching

The Design Studio edits 800×800 vector geometry with bounded paths/shapes. References are deliberate raster uploads; the server validates and normalizes them before persistence. Exported SVG is assembled from validated numeric geometry. Raster references prevent a claim of vector-only export. PNG and print exports remain practice artwork.

Rook retrieves original educational cards before answering. Offline coaching derives a useful next exercise from the learner's question and bounded workspace context. Live responses are schema-checked, restricted to retrieved reference IDs, and rejected if they include disallowed safety claims. A failure returns explicit offline fallback rather than dropping the learning workflow. See [AI-COACH.md](AI-COACH.md).

## Midnight Palette reference inspection

The source at `bryan060807/midnight-palette` was inspected read-only at main commit `08eef6664530d5b0ea8a1a2bb1a10cf8754da740` and branch `feat/fedora-storage-profiles-20261003` commit `46a4c6a7f9a0c9caf0daca1f8ddf99d80794c717`.

Reviewed files were `docs/DIBBY.md`, `server/dibby.mjs`, `server/dibby-mcp.mjs`, `server/provider.mjs`, and `public/dibby.js`. These relevant files had no differences between the inspected refs. Observed patterns included deterministic compatible-card retrieval, explicit curated fallback, bounded structured provider output with candidate-ID validation, idempotent SQLite seeding, safe text rendering, and an explicit loopback developer boundary. The read-only MCP interface was studied as an architectural reference; Midnight Ink does not expose an MCP server.

Those source observations informed the independent implementation. They do not establish current deployment state, live identity readiness, or external-resource review. No reference application files, credentials, production data, or services were changed or copied into Midnight Ink.

## AIBRY ID reference inspection

The maintained AIBRY ID implementation was inspected read-only at `b5e4fd8229d0bf8992d537b4333d407ecdfd3527` during the earlier authentication work. `apps/server/src/oidc/provider.ts`, `signing-keys.ts`, `client-validation.ts`, the OIDC repository, configuration, and admin routes established the source contract for public code-only clients, required PKCE, RS256 signing, and exact callback validation. At that revision, the general client-create API allowed private loopback callbacks, with special HTTPS seed/validator paths for existing named applications; no Midnight Ink registration was observed then. The user reports the provider-client source change is now merged, but current production registration/activation has not been independently verified. This PostgreSQL change does not edit the provider repository, database or runtime.

A request for live discovery at the canonical issuer was blocked by this cloud environment's outbound proxy with CONNECT HTTP 403. Runtime metadata and real client availability are unverified; the application discovers and validates metadata when used in an authorized network environment.
