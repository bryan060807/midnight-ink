# Architecture

## Application boundary

One Next.js App Router application serves the React interface and Node-runtime JSON/file endpoints. TypeScript uses strict checking. Tailwind and shared CSS form the dark studio interface; Lucide provides interface icons. No microservices, hosted database, account, or AI provider are required for local use.

The nine routes are Dashboard (`/`), Learn, Practice Studio, AI Coach, Design Studio, Equipment, Progress, Reference Library, and Settings. Desktop navigation and a compact mobile bottom bar reach the same screens.

## Domain and persistence

- `src/lib/curriculum.ts`: original modules, lessons, exercises, and attributed reference cards. Content stays available offline.
- `src/lib/db.ts`: typed repository functions over the Node.js 24 `node:sqlite` driver. Parameterized queries and allowlisted table names keep SQL construction separate from UI requests.
- `migrations/*.sql`: numbered, transactionally applied schema migrations, tracked in `SchemaMigration`.
- `src/lib/schemas.ts`: Zod input validation for equipment, sessions, assessments, designs, profile/settings, and goals.
- `src/lib/uploads.ts`: supported signature detection, bounded decode/re-encode using Sharp, generated storage names, guarded file reads and deletion.
- `src/lib/coach.ts`: deterministic retrieval/offline teaching and a bounded optional provider adapter.
- `src/lib/design.ts`: a small versioned numeric drawing format and original flash studies; executable uploaded SVG is not a project format.

SQLite uses foreign keys, WAL, and a bounded busy timeout. The default persistent root is `.data`; no application data is stored in source files. The schema includes profiles, settings, owned equipment, cartridge/ink detail relations, curriculum entities, unique per-profile lesson progress, exercise-linked practice sessions, photos, assessments, designs, goals, and coaching history. Owned tables have server-assigned IDs and timestamps. Drawing and authored content use validated JSON payloads where that keeps the MVP format manageable.

Content seeding updates bundled curriculum by stable IDs. Profile/settings inserts use `INSERT OR IGNORE`. A seed marker ensures editable sample equipment is inserted only once, so deleting a sample does not recreate it on the next launch. User-created records are never replaced by the content seed.

The repository API separates persistence from the interface. A PostgreSQL/object-storage implementation can replace this module while retaining domain validation and server-enforced ownership. That replacement is not implemented. `node:sqlite` requires Node.js 24+ and is not compatible with an Edge runtime.

## Access and request handling

`src/lib/auth-config.ts` validates the canonical application origin/issuer and secret configuration, derives the exact callback, and implements trusted-host, same-origin, cookie, token-digest, and safe-return-path rules. `src/lib/oidc.ts` discovers the provider, binds one-use state/nonce/PKCE to the browser, validates JWTs with a maintained signature library, and establishes/revokes application sessions. `src/lib/auth-store.ts` owns persistent identity, transaction, and session records. `requireWorkspace` resolves the active owner server-side before any protected operation.

Migration `002_auth.sql` adds immutable `(issuer,subject)` mapping to profiles, opaque-session digests with revocation/expiry, browser-bound login transactions, and a unique demo-import receipt. Mutable email/display name never join accounts. New identities receive their own profile/settings and no automatic demo inventory. Existing demo records remain intact. See [demo migration](DEMO-DATA-MIGRATION.md) for the separate explicit one-time claim.

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

The maintained AIBRY ID implementation was inspected read-only at `b5e4fd8229d0bf8992d537b4333d407ecdfd3527`. `apps/server/src/oidc/provider.ts`, `signing-keys.ts`, `client-validation.ts`, the OIDC repository, configuration, and admin routes establish a source contract for public code-only clients, required PKCE, RS256 signing, and exact callback validation. Its general client-create API currently allows private loopback callbacks, with special HTTPS seed/validator paths for existing named applications. No Midnight Ink registration was observed. The separate provider change plan is documentation only; no provider source/database/runtime was modified.

A request for live discovery at the canonical issuer was blocked by this cloud environment's outbound proxy with CONNECT HTTP 403. Runtime metadata and real client availability are unverified; the application discovers and validates metadata when used in an authorized network environment.
