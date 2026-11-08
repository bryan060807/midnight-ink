# Verification

Use Node.js 24+ and install the locked dependencies before running checks. No test needs an external account or paid API.

```bash
npm run db:migrate
npm run db:seed
npm run lint
npm test
npm run build
npm run test:e2e
```

`lint` combines ESLint and strict TypeScript checking. `build` compiles Next.js for production; it does not bypass the intentionally blocked production authentication boundary.

## Automated coverage

Vitest covers migrations/foreign keys, idempotent seeds and preserved edits/deletions, equipment CRUD/reopen, owner isolation, unique lesson completion, practice/assessment CRUD, relationship validation, design save/load and document limits, user-data deletion, loopback/demo/production restrictions, cross-origin changes, image signatures/size/decode/metadata stripping/path traversal, cartridge interpretation, curated retrieval, offline coaching, and deterministic provider failure/success handling.

Backend tests create isolated temporary databases and remove them afterward. They do not use an existing local learning workspace. Provider tests inject mock responses and never call the live service.

Playwright starts its own server on port **3100**, with `.data/e2e` storage, and refuses to reuse an existing server. Test setup deletes only this dedicated workspace. Browser flows cover first-run path selection, a lesson reflection/completion, equipment add/edit, practice logging and persistence, offline coaching, progress, real photo normalization/comparison/export/deletion, design template/undo/redo/mirror/save/reopen/SVG export, all nine routes at a 390-pixel viewport, mobile navigation, a 320-pixel overflow check, and request/deletion/worksheet protections.

The browser configuration uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when supplied, then `/usr/bin/chromium` when present, otherwise Playwright's bundled Chromium. On a fresh machine:

```bash
npx playwright install chromium
```

Linux CI can use `npx playwright install --with-deps chromium`. CI runs migrations, seed, lint, tests, build, and browser tests, uploading retained traces/reports after failures. Screenshots and HTML reports are local test artifacts, not deployment previews.

## Current execution evidence

Executed in the Linux cloud workspace with Node.js **24.22.1**, Next.js **16.4.5**, React **19.3.1**, TypeScript **6.0.3**, Vitest **5.1.0**, and Playwright **1.65.0**:

| Check | Result |
| --- | --- |
| `npm run db:migrate` | Passed; real migration and idempotent content initialization, 36 lessons |
| `npm run db:seed` | Passed; 36 lessons, repeatable without replacing user records |
| `npm run lint` | Passed; ESLint and strict TypeScript, no warnings |
| `npm test` | Passed; **69 tests across five files** |
| `npm run build` | Passed; Next.js production compilation completed cleanly |
| `npm run test:e2e` | Passed; **five Chromium tests**, 12.7 seconds in the final run |
| Production access probe | `npm start -- --port 3200` launched; `/api/health` and `/api/workspace` both returned the intended **503** authentication-not-configured response; test process stopped |
| Local development readiness | Development `/api/health` and `/api/workspace` returned **200**, with `coachProvider: offline` |

The first integrated browser pass found a same-origin comparison bug caused by Next.js's internal bind URL; the fix compares the validated local Host authority and is covered by a regression test. It also caught the missing worksheet route, which was connected to the original SVG generator and verified. A later interrupted browser run coincided with a development-server restart after a configuration edit; the final stable run completed all five tests with no retries.

Screenshots from the executed browser flow are saved at [desktop dashboard](screenshots/dashboard-desktop.png) and [mobile dashboard](screenshots/dashboard-mobile.png). The mobile test checks all nine routes at 390 pixels and the Settings screen at 320 pixels for horizontal overflow. Photo tests used generated images, verified JPEG normalization/metadata removal, displayed a real comparison, and confirmed deletion via subsequent 404 responses. Provider success/error tests used mocks only.

## Remaining verification boundaries

No paid OpenAI acceptance request, real AIBRY ID integration, Windows execution, production deployment, external expert curriculum review, or independent full accessibility audit has been performed. The local production-mode probe verified denial of access, not a deployable authenticated workflow. Linux/Windows startup instructions use the same Node scripts, but portability instructions are not a claim of Windows runtime testing.

These checks establish local development behavior; they do not establish deployment or environment publication.

Additional development-browser checks exercised pointer-based freehand drawing and rectangle creation, completed a real PNG download, and captured [Design Studio desktop](screenshots/design-desktop.png) and [mobile](screenshots/design-mobile.png) images without page errors or mobile overflow. An independent practice flow verified equipment and session editing across reloads, two deliberate photo uploads and comparison, then removed its own temporary records. Its [practice screenshot](screenshots/practice-desktop.png) records the labeled verification state. The default workspace was left with its three sample equipment entries and no test sessions/photos/designs.
