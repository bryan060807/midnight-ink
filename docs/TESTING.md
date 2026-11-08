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

`lint` combines ESLint and strict TypeScript checking. `build` compiles Next.js for production; it does not establish a registered real client or bypass authentication/configuration checks.

## Automated coverage

Vitest covers migrations/foreign keys, idempotent seeds and preserved edits/deletions, equipment CRUD/reopen, owner isolation, unique lesson completion, practice/assessment CRUD, relationship validation, design save/load and document limits, user-data deletion, loopback/demo/production restrictions, cross-origin changes, image signatures/size/decode/metadata stripping/path traversal, cartridge interpretation, curated retrieval, offline coaching, and deterministic provider failure/success handling.

Backend tests create isolated temporary databases and remove them afterward. They do not use an existing local learning workspace. Provider tests inject mock responses and never call the live service.

The first Playwright suite starts its own server on port **3100**, with fresh `.data/studio-e2e-*` storage, and refuses to reuse an existing server. `npm run test:e2e` then runs the separate authentication config sequentially: app port **3101**, generated-key mock issuer **3211**, and a per-run `.data/auth-e2e-*` store. Stop other Next.js development servers for this checkout to avoid its development lock. Test setup deletes only this dedicated workspace. Browser flows cover first-run path selection, a lesson reflection/completion, equipment add/edit, practice logging and persistence, offline coaching, progress, real photo normalization/comparison/export/deletion, design template/undo/redo/mirror/save/reopen/SVG export, all nine routes at a 390-pixel viewport, mobile navigation, a 320-pixel overflow check, and request/deletion/worksheet protections.

The browser configuration uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when supplied, then `/usr/bin/chromium` when present, otherwise Playwright's bundled Chromium. On a fresh machine:

```bash
npx playwright install chromium
```

Linux CI can use `npx playwright install --with-deps chromium`. CI runs migrations, seed, lint, tests, build, and browser tests, uploading retained traces/reports after failures. Screenshots and HTML reports are local test artifacts, not deployment previews.

## Previous MVP execution evidence

The original MVP at `3da5def` was executed in the Linux cloud workspace with Node.js **24.22.1**, Next.js **16.4.5**, React **19.3.1**, TypeScript **6.0.3**, Vitest **5.1.0**, and Playwright **1.65.0**:

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

No paid OpenAI acceptance request, interactive login against a real registered AIBRY ID client, Windows execution, production deployment, external expert curriculum review, or independent full accessibility audit has been performed. The local production-mode probe verified denial of access, not a deployable authenticated workflow. Linux/Windows startup instructions use the same Node scripts, but portability instructions are not a claim of Windows runtime testing.

These checks establish local development behavior; they do not establish deployment or environment publication.

Additional development-browser checks exercised pointer-based freehand drawing and rectangle creation, completed a real PNG download, and captured [Design Studio desktop](screenshots/design-desktop.png) and [mobile](screenshots/design-mobile.png) images without page errors or mobile overflow. An independent practice flow verified equipment and session editing across reloads, two deliberate photo uploads and comparison, then removed its own temporary records. Its [practice screenshot](screenshots/practice-desktop.png) records the labeled verification state. The default workspace was left with its three sample equipment entries and no test sessions/photos/designs.


## Authentication integration verification

Run only the authenticated browser flow with `npx playwright test --config playwright.auth.config.ts`; it launches and stops its own loopback issuer/application with test-only identities/configuration. The previous MVP results above are historical evidence. Authentication tests use generated keys and an isolated mocked OIDC issuer; they do not make real account login requests during ordinary CI.

Final integration validation executed in this workspace:

| Command or check | Result |
| --- | --- |
| `npm ci` | Passed with the updated lockfile |
| `npm run lint` | Passed; ESLint and strict TypeScript |
| `npm test` | **138 passed across nine files**, including original MVP tests |
| `npm run build` | Passed; production compilation includes login/callback/logout/session/import routes |
| `npm run test:e2e` | **7 passed**: five studio flows (16.6 s), then two mocked-auth flows (11.4 s) |
| `npm run db:migrate` / `npm run db:seed` | Passed; versions 1 and 2 applied, 36 lessons; existing demo profile and three equipment samples preserved |
| Production without auth configuration | Login screen HTTP 200; personal workspace API and health HTTP 503; session metadata anonymous with null profile; protected design browser visit returned to login with its local destination preserved |

Before applying migration 002 to the existing local cloud database, a consistent SQLite backup was saved to ignored `.data/backups/pre-aibry-id-auth.sqlite`. After migration the original demo remained unclaimed, with zero sessions or import receipts. Isolated tests separately verify authorized transfer, one-use rejection, and rollback; no real demo claim was performed.

The demo browser harness now uses a fresh per-run `.data/studio-e2e-*` directory and explicitly clears inherited authentication settings. An earlier run against a reused fixture suffered repeated development reloads; the final isolated run passed all original workflows. The normal existing-data development dashboard was also opened successfully during diagnosis. Authentication browser tests use their own `.data/auth-e2e-*` directory and generated-key issuer. Neither suite uses the normal learning database.

Production login screenshots: [desktop](screenshots/aibry-id-login-desktop.png) and [mobile](screenshots/aibry-id-login-mobile.png). These show the intentionally unconfigured production state; they are not evidence of a real provider login. Mobile width was 390 pixels without horizontal overflow. A production browser visit to `/design?study=first` returned to `/login` with the same safe local return destination and no private canvas rendered.

Coverage includes valid code/PKCE exchange, absent/wrong/replayed state and browser binding, stale attempts, nonce/signature/issuer/audience/algorithm/time/subject failures, callback errors, persistent opaque sessions, logout revocation, anonymous/production-demo rejection, unsafe return destinations, forged forwarded origins, cross-account equipment/session/photo/design/coaching/settings/export/deletion, and removal of private rendered content after an invalidated session. The actual local browser flow authenticated Alice and Bob against the mock issuer, used separate HttpOnly cookies and workspaces, checked cross-user 404/export isolation, and confirmed logout revoked only the appropriate account. These are mock identities; they are not real AIBRY ID production accounts.

The browser checks caught an ordinary form Origin issue under global `no-referrer`; the final policy uses `same-origin` for the application and `no-referrer` only for auth callback responses, preserving strict rejection of null/cross-site mutation origins. The final combined browser run completed successfully with these strict checks retained.

Live discovery at the canonical AIBRY ID issuer was attempted from this cloud workspace and blocked by the outbound proxy with CONNECT HTTP 403. This is a network-policy gate, not evidence that the provider is unavailable or a client is registered. See [real-provider acceptance](AIBRY-ID-ACCEPTANCE.md) for the outstanding operator steps.

## Dependency audit at handoff

`npm audit --omit=dev` reported **zero** known production dependency vulnerabilities. The full `npm audit` reported eight moderate entries propagating from one development lint-toolchain advisory: [`GHSA-g3hv-75wg-m249`](https://github.com/advisories/GHSA-g3hv-75wg-m249), glob-pattern denial of service in transitive `minimatch` below 11.0.1, reached through TypeScript ESLint / `eslint-config-next`. This development dependency chain was inherited from the MVP; it is not the new OIDC/Jose runtime dependency. An upstream-compatible tooling update remains outstanding. No unsafe major-version override or blanket audit fix was applied as part of authentication work. Audit results are point-in-time package metadata, not production signoff.
