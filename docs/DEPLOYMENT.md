# Deployment and authentication boundary

No infrastructure deployment, OAuth registration, provider database edit, DNS/Cloudflare change, Fedora service change, or Windows PM2 operation is included. Midnight Ink remains independent of Midnight Palette and hosted databases.

## Build versus real-provider acceptance

`npm run build` compiles the application. A successful build or mocked OIDC login does not establish a real registered client, HTTPS ingress, or production authentication signoff. This implementation is intended to be ready for the separately authorized [AIBRY ID acceptance process](AIBRY-ID-ACCEPTANCE.md).

Production disables the local demo unconditionally. Without complete valid server-side authentication configuration, protected APIs fail closed and visitors can reach the login/configuration screen. With configuration present, protected APIs still require a valid unexpired server-side session; setting `LOCAL_DEMO_ENABLED=true` never supplies one. Do not change `NODE_ENV` to bypass this boundary on a deployed host.

## Required operator configuration

See [.env.example](../.env.example) and [AIBRY-ID-INTEGRATION.md](AIBRY-ID-INTEGRATION.md). The operator must supply a stable random `SESSION_SECRET`, exact approved `APP_ORIGIN`, unique registered `AIBRY_ID_CLIENT_ID`, and the canonical issuer. The proposed future origin is `https://midnight-ink.aibrylabs.com`, with exact callback `/auth/aibry-id/callback`; its hostname and registration are unverified.

The approved public client uses Authorization Code, required PKCE S256, `token_endpoint_auth_method=none`, and `openid profile email`. It needs no confidential client secret. The current inspected provider's public-HTTPS registration limitations and a separate reviewable change plan are documented in [AIBRY-ID-ACCEPTANCE.md](AIBRY-ID-ACCEPTANCE.md); do not bypass them with production SQL.

Allow verified-TLS outbound access to the configured issuer for discovery, token exchange, and JWKS. Live discovery from this cloud instance was blocked by its proxy with CONNECT 403. Do not disable TLS verification or infer remote provider status from that denial.

Login and callback handlers each have a process-wide 120-request/minute backstop. A caller can temporarily exhaust that shared allowance; it is not a per-user abuse control. Add per-client limits at the trusted ingress using its verified connection identity, without trusting arbitrary forwarded IP headers.

## Hosting checklist

Before exposing an installation:

1. Apply the approved client registration through its supported operator process and complete a real browser login with two test identities. Verify exact issuer, callback, audience, nonce/PKCE, persistent sessions, logout, and isolation. A mock test does not complete this step.
2. Establish the approved origin's DNS, HTTPS/TLS, routing, and trusted reverse proxy. Overwrite upstream `Host` with the canonical configured authority, do not trust client forwarding/identity headers, and prevent alternate direct public access to the upstream listener. Test exact Origin and CSRF enforcement through that proxy. Preserve genuine browser Origin headers rather than manufacturing a trusted value; redact callback query strings, Cookie/Authorization headers, and token response bodies from proxy/application logs.
3. Mount durable SQLite and normalized-photo storage. Back them up together, test restore, and define retention/deletion procedures. Use one application instance for SQLite unless a supported replication strategy is introduced.
4. Supply server secrets through the host's secret store. Keep the session secret stable through ordinary restarts. Rotating it invalidates existing application sessions and outstanding login attempts. Do not bundle secrets into browser code or Git.
5. Run migrations on a backed-up copy before rollout. Migration `002_auth.sql` adds identity/session/login-transaction/import-receipt tables without rewriting `001_initial.sql` or deleting existing demo records. Production `db:migrate`/`db:seed` require valid application authentication configuration; `db:reset` is always forbidden in production. Do not run the development reset command on a live installation.
6. Decide whether existing demo records should remain unclaimed. Only enable the separately authorized one-time claim verifier when its backup, recipient, and recovery procedure have been approved; see [demo migration](DEMO-DATA-MIGRATION.md).
7. Complete qualified curriculum/safety review, dependency/security review, accessibility testing, privacy notices, operational monitoring, and live acceptance evidence. Local logout revokes Midnight Ink's session; it does not claim to log the user out of AIBRY ID itself.

For multiple application replicas/writers, replace SQLite and local photo storage through the existing repository boundary with PostgreSQL/object storage. That hosting mode is not implemented by this change.

`MIDNIGHT_INK_DATA_DIR` controls local persistent files; `DATABASE_PATH` can override the database for isolated tools/tests. Keep database/photo backups consistent, protect their contents, and keep all local environment files, data, exports, and credentials out of Git.
