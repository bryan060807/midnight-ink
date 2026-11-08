# Deployment and authentication boundary

The complete operator runbook is [WINDOWS-FEDORA-DEPLOYMENT.md](WINDOWS-FEDORA-DEPLOYMENT.md), with PowerShell/Bash commands, PostgreSQL role/grant examples, Windows PM2 configuration, exact-source firewall requirements, nginx review, coordinated backup/restore, rollback and two-user acceptance.

Windows **AIBRY-DESKTOP** runs Midnight Ink's Next.js application under the existing PM2 mechanism and stores private normalized practice-photo files outside the checkout. Fedora **aibry-fedora-server** owns PostgreSQL/backups, AIBRY ID, nginx/Cloudflare ingress and recovery. The rejected Fedora application-container/Quadlet proposal is superseded; do not install the web runtime on Fedora.

No infrastructure deployment, provider registration/database edit, production database access, DNS/Cloudflare change, shared service restart or Windows PM2 operation is performed by this repository change. Midnight Ink uses a proposed dedicated `midnight_ink` database and `midnight_ink_app` runtime role; it does not share another application's data or use Supabase.

## Persistence and release boundary

`DATABASE_URL` is mandatory and server-only. Use verified TLS and a CA matching the real Fedora database hostname. The bounded asynchronous PostgreSQL pool never falls back to SQLite. Ordered PostgreSQL migrations and repeatable seed operations are separate explicit commands; startup never runs them. Use a migrator credential only for those commands, retaining lower runtime privileges afterward. Keep the original SQLite schema files solely for the deliberate [offline importer](SQLITE-POSTGRESQL-MIGRATION.md).

`MIDNIGHT_INK_DATA_DIR` contains private Windows photo files and PM2 logs, not the database. Production requires an absolute path outside the checkout plus an explicitly chosen `HOST`; the proposed port is 3031. Back up the PostgreSQL metadata and Windows photo snapshot together during a write freeze, verify restore in isolation, and preserve stable secrets through ordinary releases. Do not use a production reset, automatic down migration or SQLite fallback for recovery.

## Authentication and ingress gates

Production disables the local demo unconditionally. Missing/invalid auth configuration fails closed; complete configuration still requires an unexpired database-backed session for personal APIs. `npm run build`, successful database readiness and generated-key mock-OIDC login do not establish live authentication.

Verify real activation of the proposed public client `midnight-ink-public-web`, exact origin `https://midnight-ink.aibrylabs.com`, callback `/auth/aibry-id/callback`, stable random `SESSION_SECRET`, canonical issuer `https://id.aibrylabs.com`, token auth `none`, Authorization Code, PKCE S256 and scopes `openid profile email`. A merged provider-client source change is not evidence that production registration is active. The earlier source-inspection plan in [AIBRY-ID-ACCEPTANCE.md](AIBRY-ID-ACCEPTANCE.md) must be checked against the maintained provider revision before any separate provider action. Do not alter the provider database directly.

Allow verified-TLS outbound discovery/token/JWKS access. An earlier cloud discovery probe received proxy CONNECT 403; that does not establish current provider availability. Do not disable certificate verification to bypass a network-policy denial.

The trusted Fedora ingress must reject alternate authorities, set the upstream Host to the canonical configured authority, preserve the genuine browser Origin, and remove untrusted forwarding/identity assertions. Restrict Windows 3031 to the exact verified Fedora ingress source. Authenticated mutations require the exact configured Origin; the application ignores forwarded origin/identity claims. Redact callback queries, Cookie/Authorization headers, tokens and database URLs in every logging layer.

Login/callback handlers have a process-wide 120-request/minute backstop, not a per-user abuse control. Add ingress per-client controls only using independently verified connection identity. Complete real two-user login/isolation, logout, proxy/header checks, persistence/restart and coordinated restore acceptance before exposing a beta.

The optional one-time demo claim remains separately authorized; [DEMO-DATA-MIGRATION.md](DEMO-DATA-MIGRATION.md) explains its backup, empty-recipient and permanent-receipt requirements. Curriculum/safety review, accessibility testing, privacy notices, dependency review and operational monitoring remain release requirements. See [TESTING.md](TESTING.md) for executed checks and their limits.
