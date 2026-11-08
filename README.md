# Midnight Ink

**Learn the craft. Earn the confidence.** An AIBRY Labs tattoo-art learning studio for paper and synthetic practice skin.

Midnight Ink is an independently runnable learning application with PostgreSQL persistence. Structured lessons, practice records, equipment inventory, original worksheets, a small vector design editor, and useful Rook coaching work without a paid provider key. An explicit loopback development demo needs no external account. Learning records never establish readiness to tattoo people.

## Run locally

Install **Node.js 24 or newer**, npm, and access to a dedicated PostgreSQL database. Clone the repository and enter its directory before running Git/npm commands:

```bash
git clone https://github.com/bryan060807/midnight-ink.git
cd midnight-ink
npm ci
cp .env.example .env.local
```

Edit `.env.local` to supply a server-side `DATABASE_URL` and verified database CA when needed. Use a dedicated empty development database with migration privileges for initial setup; never use a live application/AIBRY ID database for tests. Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

On Windows PowerShell, replace `cp` with:

```powershell
Copy-Item .env.example .env.local
```

Open `http://localhost:3031` in your own browser. The explicitly labeled local demo workspace needs no login and accepts only loopback hostnames. Use a trusted local computer; do not expose this development workspace publicly. Development binds to IPv4 loopback by default. `HOST` and `PORT` are configurable; production requires an explicit verified interface.

`db:migrate` applies only ordered PostgreSQL schema migrations under an advisory lock. `db:seed` separately performs repeatable curriculum initialization, preserving user records, edited inventory, and deleted samples. Startup never migrates or seeds. PostgreSQL is required in every application mode; an unavailable database never falls back to SQLite.

## What you can do

- Choose a learning path, read substantive beginner lessons across six modules, answer a reflection, and persist lesson completion.
- Download original SVG practice worksheets; log timed or manually entered practice, equipment, settings, difficulty, notes, and self-assessed observations; edit or delete sessions.
- Deliberately upload PNG/JPEG/WebP practice photos, compare saved attempts, and remove photos with their associated records. Images are signature-checked and re-encoded without metadata, not analyzed by AI.
- Add, edit, and remove machines, cartridges, and practice inks. Decode common cartridge codes while keeping unknown specifications explicit.
- Ask configurable Rook for contextual offline coaching grounded in original educational cards. Optional live text coaching retains the offline fallback.
- Draw freehand, add geometry or original flash templates, erase strokes, undo/redo, mirror, preview high contrast, save/reopen projects, export PNG/vector SVG, and open a printable practice stencil layout.
- Review actual lesson/session/time totals, learning history, goals, and your latest self-assessment notes. Search the original reference library.
- Export learning records as JSON and deliberately delete workspace data in Settings.

The sample pen, Aurora 1205M1 cartridge, and MATOENT ink are editable user-reported examples, not independently verified manufacturer specifications. MATOENT is classified practice-only. SVG design export is available for vector-only projects; remove an attached raster reference first.

## Persistence and privacy

PostgreSQL stores all records, identities, sessions and photo metadata. Normalized photo bytes remain in the application's `MIDNIGHT_INK_DATA_DIR/photos` directory (development default `.data/photos`). The canonical installation runs Next.js under PM2 on **Windows AIBRY-DESKTOP**, with durable photo storage outside its checkout; **Fedora aibry-fedora-server** owns PostgreSQL/backups, AIBRY ID, and nginx/Cloudflare ingress. See the complete [Windows/Fedora runbook](docs/WINDOWS-FEDORA-DEPLOYMENT.md) for operator commands, configuration, firewalls and rollback.

Back up the PostgreSQL metadata and Windows photos as a coordinated set. `.env.local`, `.env.production.local`, data, build outputs, and test artifacts are ignored by Git. Existing SQLite installations use the deliberate, verified [offline import](docs/SQLITE-POSTGRESQL-MIGRATION.md); the application never reads their SQLite database at runtime.

Records export contains structured data and photo metadata/URLs, not a bundled archive of image files. Save your photo files separately before deleting data. Saved designs include their drawing document and any embedded normalized reference. Deletion cannot remove independent exports or backups.

There is no supported destructive production reset. Use isolated disposable databases for automated checks. Settings' deliberate data deletion removes only the authenticated workspace's personal records without restoring deleted samples. A durable PostgreSQL file-deletion queue retries private photo cleanup after committed metadata deletion.

## Optional live Rook

Offline mode is the default. To enable optional server-side text coaching, set locally in `.env.local` and restart the development server:

```dotenv
ROOK_PROVIDER=openai
OPENAI_API_KEY=your-local-server-side-key
OPENAI_MODEL=gpt-4.1-mini
```

Never commit a real key or prefix it with `NEXT_PUBLIC_`. Live coaching sends the current question and a bounded learning/equipment context after the user asks; no practice photos, private session notes, or earlier conversation history are sent. The interface labels live versus offline answers. Missing keys, provider errors, timeouts, unsafe content, or malformed responses fall back to curated offline guidance. Automated tests use mocked responses and make no paid calls. See [AI coaching](docs/AI-COACH.md).

## Verification

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Supply `TEST_DATABASE_URL` for a disposable PostgreSQL database with permission to create isolated test schemas before persistence/browser checks. Never point it at a real installation. `npm run test:e2e` runs the studio suite and authentication suite sequentially, using app ports **3100**/**3101**, an isolated generated-key mock issuer on **3211**, per-run PostgreSQL schemas, and separate photo directories. They never reuse the ordinary development server. See [TESTING.md](docs/TESTING.md) for exact prerequisites and executed evidence. If Chromium is not installed, run `npx playwright install chromium` first; Linux may also need `npx playwright install --with-deps chromium`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing compatible browser.

`GET /api/health` checks PostgreSQL/schema availability and reports safe provider/access readiness without exposing a URL or credentials. Build/test outcomes are recorded in [TESTING.md](docs/TESTING.md); generated-key mock authentication requires no real provider account or paid key.

Browser captures: [desktop dashboard](docs/screenshots/dashboard-desktop.png) · [mobile dashboard](docs/screenshots/dashboard-mobile.png).

## AIBRY ID and hosting status

The application includes OIDC Authorization Code + PKCE login, persistent revocable server-side sessions, per-subject private workspaces, logout, and a separately authorized one-time demo-data claim. Keep the optional auth block in `.env.example` commented for ordinary local demo use. To test authenticated-only access, supply the complete server-side auth configuration and set `LOCAL_DEMO_ENABLED=false`.

For a real installation, the operator must verify production registration/activation of public client `midnight-ink-public-web`, approve the exact `{APP_ORIGIN}/auth/aibry-id/callback`, provide a stable random `SESSION_SECRET`, and validate canonical `https://id.aibrylabs.com` discovery. A merged provider-client source change does not establish live activation. The proposed hostname `https://midnight-ink.aibrylabs.com` is not assumed to exist. No client secret is used. See [integration](docs/AIBRY-ID-INTEGRATION.md), [real acceptance](docs/AIBRY-ID-ACCEPTANCE.md), and [demo data migration](docs/DEMO-DATA-MIGRATION.md).

Production always disables local-demo fallback. Missing critical auth configuration fails closed; configured protected requests require a verified application session. A successful production build is not a completed real-provider login. Live discovery was blocked by this cloud workspace's proxy, and no actual client registration or interactive real AIBRY ID login was performed.

This repository change prepares deployment; it deploys nothing. No Midnight Palette runtime, AIBRY provider service/database, production PostgreSQL database, Cloudflare setting, Fedora/Windows service, or OAuth registration was changed.

See [architecture](docs/ARCHITECTURE.md), [curriculum](docs/CURRICULUM.md), [safety and privacy](docs/SAFETY.md), [deployment blockers](docs/DEPLOYMENT.md), and [roadmap](docs/ROADMAP.md).
