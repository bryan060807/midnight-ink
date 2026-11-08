# Midnight Ink

**Learn the craft. Earn the confidence.** An AIBRY Labs tattoo-art learning studio for paper and synthetic practice skin.

Midnight Ink is an independently runnable local MVP. Structured lessons, practice records, equipment inventory, original worksheets, a small vector design editor, and useful Rook coaching work without a provider key or external account. Learning records never establish readiness to tattoo people.

## Run locally

Install **Node.js 24 or newer** and npm. From the repository root:

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

On Windows PowerShell, replace `cp` with:

```powershell
Copy-Item .env.example .env.local
```

Open `http://localhost:3000` in your own browser. The explicitly labeled local demo workspace needs no login and accepts only loopback hostnames. Use a trusted local computer; do not expose this development workspace publicly. The supplied startup commands bind to IPv4 loopback, and protected API requests require `localhost`, `127.0.0.1`, or IPv6 loopback.

For a fresh clone with the checked-in lockfile, `npm ci` gives a frozen dependency install. Both database commands apply outstanding migrations and perform an idempotent content seed. Startup also initializes a missing database. Re-running setup preserves user records, edited inventory, and deleted sample inventory.

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

The default SQLite database is `.data/midnight-ink.sqlite`; normalized photos are in `.data/photos`. Keep this directory to preserve your workspace. `MIDNIGHT_INK_DATA_DIR` changes the directory, and `DATABASE_PATH` optionally selects a different database file. Keep database and photo backups together. `.env.local`, data, build outputs, and test artifacts are ignored by Git.

Records export contains structured data and photo metadata/URLs, not a bundled archive of image files. Save your photo files separately before deleting data. Saved designs include their drawing document and any embedded normalized reference. Deletion cannot remove independent exports or backups.

Reset only the default **development** workspace, after making any backup you need:

```bash
npm run db:reset -- --confirm-local-reset
```

The reset refuses production and custom data paths. It deletes default local data and recreates seeded content. Settings' data deletion instead removes personal records without restoring deleted sample inventory.

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

`npm run test:e2e` runs the original studio suite and the authentication suite sequentially, avoiding Next.js development-server lock conflicts. The studio suite uses port **3100** with `.data/e2e`; the auth suite uses app port **3101**, an isolated generated-key mock issuer on **3211**, and a per-run `.data/auth-e2e-*` directory. They never reuse the ordinary development server. Stop any other `next dev` process for this checkout before running browser tests. If Chromium is not installed, run `npx playwright install chromium` first; Linux may also need `npx playwright install --with-deps chromium`. The config uses `/usr/bin/chromium` when present, otherwise Playwright's bundled browser. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing compatible browser.

`GET /api/health` checks local database availability and reports the current workspace/provider mode. Build and test outcomes from this implementation are recorded in [TESTING.md](docs/TESTING.md); CI runs validation without a provider key.

Browser captures: [desktop dashboard](docs/screenshots/dashboard-desktop.png) · [mobile dashboard](docs/screenshots/dashboard-mobile.png).

## AIBRY ID and hosting status

The application includes OIDC Authorization Code + PKCE login, persistent revocable server-side sessions, per-subject private workspaces, logout, and a separately authorized one-time demo-data claim. Keep the optional auth block in `.env.example` commented for ordinary local demo use. To test authenticated-only access, supply the complete server-side auth configuration and set `LOCAL_DEMO_ENABLED=false`.

For a real installation, the operator must register the proposed public client `midnight-ink-public-web`, approve the exact `{APP_ORIGIN}/auth/aibry-id/callback`, provide a stable random `SESSION_SECRET`, and validate the canonical `https://id.aibrylabs.com` discovery/registration. The proposed future hostname `https://midnight-ink.aibrylabs.com` is not assumed to exist. No client secret is used. See [integration](docs/AIBRY-ID-INTEGRATION.md), [real acceptance](docs/AIBRY-ID-ACCEPTANCE.md), and [demo data migration](docs/DEMO-DATA-MIGRATION.md).

Production always disables local-demo fallback. Missing critical auth configuration fails closed; configured protected requests require a verified application session. A successful production build is not a completed real-provider login. Live discovery was blocked by this cloud workspace's proxy, and no actual client registration or interactive real AIBRY ID login was performed.

This change deploys nothing. No Midnight Palette runtime, AIBRY provider service/database, Cloudflare setting, Fedora/Windows service, or OAuth registration was changed.

See [architecture](docs/ARCHITECTURE.md), [curriculum](docs/CURRICULUM.md), [safety and privacy](docs/SAFETY.md), [deployment blockers](docs/DEPLOYMENT.md), and [roadmap](docs/ROADMAP.md).
