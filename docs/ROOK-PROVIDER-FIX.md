# Rook provider fix and Windows release procedure

## Findings and evidence boundary

HTTP 200 proves transport success, not acceptance by Rook. Previously JSON mode
did not enforce the three-field answer contract, and every failure was silently
collapsed into the same fallback. The existing numerical-settings safety filter
also rejects harmless paper measurements such as `30 mm`. These are reproducible
failure paths, not a proven diagnosis of a particular production response.
No production response body was inspected or logged.

The request now uses strict `json_schema` structured output, generated from the
same Zod schema used for local validation. Application metadata remains server
owned. Refusals, content filtering and incomplete completions are rejected before
answer parsing. Reference allowlisting, safety filtering, bounded body reads and
offline fallback remain enforced. The prompt avoids measurements to reduce false
rejections without weakening the safety filter.

Official API guidance: https://developers.openai.com/api/docs/guides/structured-outputs

The deadline remains 12 seconds, covering headers and body. There is no measured
production latency evidence to justify increasing it; the server shutdown drain
deadline is 15 seconds. Measure timeout frequency before changing either budget.
There are no automatic retries or extra provider requests.

## Safe diagnostics

`rook_provider_fallback` logs only provider `openai`, a fixed category, and an
HTTP status for HTTP failures. Categories: `missing_key`, `http_failure`,
`timeout`, `network_failure`, `invalid_json`, `schema_violation`,
`invalid_references`, `safety_rejection`, `provider_refusal`,
`incomplete_response`, `empty_response`, `response_too_large`.

No error objects, response bodies, questions, credentials, identifiers, model
strings, headers or workspace context enter these diagnostics. User notices stay
generic. Health's provider field is configuration evidence, not a live inference
probe. Successful regression tests use injected HTTP fixtures, not live OpenAI.

## Minimal Windows PM2 procedure — approval required before execution

**Superseded for this combined release:** use [RELEASE-APPROVAL.md](RELEASE-APPROVAL.md)
and its pinned manifest/configs. The historical generic `startOrReload --update-env`
example below is not the approved release-switch command. The final combined
PostgreSQL validation supersedes the earlier missing-test-database result below.

1. Record the currently deployed release and preserve its built checkout as the
   rollback release. Inspect `pm2 list`, the known listener and `/api/health`.
   Verify the existing PM2 process name/cwd and protected environment source
   privately; do not dump `pm2 env`, `jlist`, environment files or credentials.
2. Stage the approved patch in a separate release checkout. Keep the production
   database URL, session/auth configuration, AIBRY ID registration, origin,
   host/port and absolute external `MIDNIGHT_INK_DATA_DIR` unchanged. Provision
   the same protected configuration through the existing operator mechanism;
   never put secret values in commands or source control. Confirm database and
   data-directory identity privately before switching releases.
3. In that staged checkout, run the following, stopping on any failure:

   ```powershell
   npm ci
   npm run lint
   npm test
   npm run build
   ```

   Tests must use their isolated test databases. Do not direct test configuration
   at production. Do not run migrations, seed, reset, imports or data cleanup.
   Building separately preserves the running release's `.next` artifacts.
4. After explicit deployment approval, in the approved release checkout and
   established operator environment, switch only this application:

   ```powershell
   pm2 startOrReload ecosystem.config.cjs --only midnight-ink --update-env
   pm2 list
   pm2 logs midnight-ink --lines 30 --nostream
   ```

   Inspect logs locally; do not copy unrelated framework diagnostics into chat.
   Do not restart all processes, delete PM2 processes, or run `pm2 save`.
5. Verify the known listener and local/public `/api/health`: status `ok`, current
   PostgreSQL schema and `coachProvider=openai`. In an authenticated browser,
   confirm existing workspace data and submit a benign paper-practice question.
   Verify the response has `source=openai`, valid references and the safety notice;
   confirm it saves and reopens. A health response or unauthenticated 401 alone
   does not prove this flow. If fallback occurs, inspect only its safe category.
6. If validation fails, switch back by running the same scoped `startOrReload`
   command from the preserved prior release with the same protected runtime
   configuration, then repeat health, login and data checks. This code-only
   release requires no database restore or migration rollback.

Production startup, authenticated OpenAI coaching, latency and release switching
remain unverified until the approved operator procedure is executed.

## Local validation (2026-11-09)

- `npm run lint`: passed (ESLint and TypeScript).
- `npm run test:unit`: 4 files, 78 tests passed, including coaching success,
  every categorized fallback, strict request schema and log privacy assertions.
  A restricted-runner Vite `spawn EPERM` was resolved by rerunning this check
  outside the restricted runner.
- `npm test`: 78 passed, 119 failed, 10 skipped; database suites require an
  explicitly configured disposable `TEST_DATABASE_URL`, which was absent.
  No production database was substituted. Database integration is NOT VERIFIED.
- `npm run build`: passed, including compilation, TypeScript and static pages.
- `git diff --check`: passed.

No production OpenAI request, runtime restart, authentication change, credential
change, migration or deployment was performed for this patch.
