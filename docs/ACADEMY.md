# Midnight Ink Academy: practical lab integration (working implementation)

Date: 2026-11-19. Status: source written on Windows via Garage Admin bridge; **tests and production build not yet executed**.

## What was added
- `src/lib/academy-labs.ts`: six original field labs with equipment, five staged actions/checkpoints, review prompts, and safe practice boundaries.
- `src/components/academy.tsx`: guided interface, checkboxes (temporary per mounting), navigation, print links, Practice Studio links, reflective submission through the existing authenticated lesson-completion API.
- `src/components/studio-app.tsx`: Academy appears above the existing six-module curriculum inside the authenticated Learn route. Existing lessons retained.
- `src/components/practice-studio.tsx`: recognizes an allowlisted `?exercise=` query parameter and selects the corresponding exercise.
- `tests/academy.test.ts`: six-lab content integrity, seeded lesson/exercise links and generated SVG assertions.

## Existing systems reused
- `POST /api/lessons/:id/complete` -> LessonProgress (profile-bound, PostgreSQL).
- `GET /api/worksheets/:id` -> original A4 SVG worksheets (authenticated).
- Practice Studio's sessions, subjective assessments, per-user photos, and note history.
- Rook and existing curriculum are preserved; no new claims of automated image diagnosis.

## Deliberate limits
- Lab checkmarks and unsubmitted reflections exist only in component state. They are not durable stage progress.
- Lab completion is currently represented by an existing mapped curriculum lesson ID. If that lesson was completed earlier, Academy reports its linked lesson complete. Do **not** call these independently audited lab completions.
- No database schema migration is introduced in this slice.
- No new custom capstone worksheet is introduced; it uses the existing stencil-tracing worksheet and exercise.
- Practice Studio opens in a separate tab to preserve unsaved lab stage state. The original tab must remain open.
- Human-skin tattooing, universal machine settings, infection-control qualification, and certified competency are outside this educational feature.

## Verification gate (Windows operator)
```powershell
Set-Location 'C:\Users\bryan\aibry\projects\midnight-ink'
git status --short
npm run lint
npx vitest run tests/academy.test.ts
npm test
npm run build
git diff --check
```
Do not run the obsolete release helper (PM2 ID 30 vs actual 29). Do not run `db:reset`, production seeding, or any production migration for this work.

## Human acceptance
1. Log in normally, open `/learn`, confirm Academy above existing lessons.
2. Select all six labs; confirm stage, note, and worksheet links.
3. In linework lab, open matching exercise; confirm `/practice?exercise=straight-lines` selects the correct exercise.
4. Record a disposable test practice session or use an isolated test profile; verify persistence after authenticated workspace refresh.
5. Confirm the Academy completion button requires all five checkboxes and a reflection, then verify completion after refresh.
6. Test logout and denied access to authenticated worksheet/progress endpoints; ensure no cross-account history leakage.
7. Confirm original curriculum, design studio, equipment, and practice history still work.

## Next phase
Introduce dedicated owner-bound Academy progress with per-stage timestamps, real session association and server-validated completion. Add original reference-based printable templates and carefully bounded opt-in Rook suggestions after user-uploaded samples. This is future scope, not represented as complete.
