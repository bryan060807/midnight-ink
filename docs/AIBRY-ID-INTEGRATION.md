# AIBRY ID integration

Midnight Ink uses OpenID Connect Authorization Code with PKCE S256 and an application-owned opaque session. The canonical issuer is `https://id.aibrylabs.com`. A provider login is a separate identity system from the local development demo. This repository does not deploy the identity provider or register a client.

## Supported configuration

For an operator-approved HTTPS installation, set these server-side values:

```dotenv
AIBRY_ID_ISSUER=https://id.aibrylabs.com
AIBRY_ID_CLIENT_ID=midnight-ink-public-web
APP_ORIGIN=https://midnight-ink.aibrylabs.com
SESSION_SECRET=<operator-generated-random-secret-at-least-32-bytes>
LOCAL_DEMO_ENABLED=false
```

`midnight-ink-public-web` and `https://midnight-ink.aibrylabs.com` are proposals. Neither a registered client nor working DNS, routing, or TLS is established by these examples. The callback is derived exactly as `{APP_ORIGIN}/auth/aibry-id/callback`; do not add a wildcard, query, fragment, or trailing slash. No client secret is needed or accepted for the public-client PKCE contract.

Keep `SESSION_SECRET` stable across ordinary restarts and supply it through the host's server-side secret mechanism. It protects authentication-token digests. Rotating it invalidates existing sessions and outstanding login attempts. Do not prefix authentication configuration with `NEXT_PUBLIC_`, put values in browser storage, or commit secrets. Optional live Rook configuration is independent of authentication.

With no OIDC settings, the existing development demo remains usable on loopback when enabled. In production, missing or invalid critical settings fail closed; the login/configuration screen remains available. `LOCAL_DEMO_ENABLED=true` never enables a production demo fallback. An invalid or expired authenticated session must not silently switch the browser into the demo workspace.

For isolated test issuers only, `AIBRY_ID_ALLOW_HTTP_LOCALHOST=true` allows a non-production loopback HTTP issuer/application origin. It does not permit HTTP public hosts or disable TLS verification, and it cannot enable HTTP authentication in production. The normal CI tests use generated keys and an isolated mock issuer, never a paid service or real user credentials.

## Request and identity flow

- `GET /auth/aibry-id/login` starts a short-lived browser-bound login transaction and redirects to the discovered authorization endpoint.
- `GET /auth/aibry-id/callback` consumes that transaction, exchanges the code with the retained verifier, verifies the ID token against discovered JWKS, and creates a private profile/session.
- `GET /api/auth/session` reports the current account mode and safe profile/session metadata. It never returns an ID token, access token, session bearer token, PKCE verifier, or secret.
- `POST /auth/logout` revokes the local application session and clears its cookie. It does not claim to terminate the identity provider's own login session.
- `POST /auth/demo` is an explicitly enabled, loopback-only development action that revokes/clears a prior app session and returns to the independent demo workspace; it is unavailable in production.
- `POST /api/auth/import-demo` is a separately authorized, deliberate one-time demo-data claim; see [demo migration](DEMO-DATA-MIGRATION.md).

Identity is the unique pair `(issuer, subject)`, where `subject` is the verified nonempty OIDC `sub`. Email and display name are mutable attributes, not account-linking keys. Equal emails never merge two subjects. A new identity receives independent profile/settings rows and an empty personal workspace; global curriculum remains shared. Sample demo equipment is not automatically copied into every account.

Discovery is validated at runtime rather than trusting source-code endpoint paths. Supported authorization, token, and JWKS endpoints must remain on the issuer origin and use verified HTTPS, except for the explicitly enabled loopback mock. Redirecting discovery/token/JWKS responses are rejected; a future provider change to cross-origin endpoints needs a deliberate compatibility review. Authentication validates signature/algorithm, exact issuer, audience/authorized party, expiration, issued-at/not-before, nonce, state/browser binding, and PKCE. Untrusted callback errors become generic login errors. Return destinations are restricted to safe local paths; they cannot redirect to an external site or another authentication flow.

## Persistent sessions and ownership

Opaque random session tokens stay only in host-only HttpOnly cookies. The database retains cryptographic digests and expiration/revocation metadata. Cookies use Path `/`, SameSite=Lax, explicit expiration, Secure under HTTPS, and production `__Host-` naming. Sessions have an eight-hour absolute lifetime; login transactions expire after ten minutes. They survive process restarts while the database and session secret remain intact. Expired authentication records are removed opportunistically when login transactions/sessions are created or consumed; no background cleanup service is required. Revoked session rows remain unusable and can remain until their expiry cleanup.

Every protected API resolves its owner server-side. Request bodies, query strings, and identity-like headers cannot select a profile. Equipment and cartridge/ink details, lessons, sessions, assessments, photos/downloads, designs, goals, coaching, settings, exports, and deletion remain scoped to that resolved owner. Photo access verifies the owning practice session as well as the photo owner. An account's records export/deletion does not operate on another account or the unclaimed demo.

## Trusted proxy and CSRF contract

`APP_ORIGIN` is the canonical public authority. Configure the reverse proxy to overwrite the upstream `Host` with that exact configured hostname and port. The application ignores client-supplied `Forwarded` and `X-Forwarded-*` identity/origin assertions; they are not authentication evidence. The upstream listener must not be exposed as an alternate public ingress.

Authenticated mutations require the exact configured browser Origin and reject cross-site requests. Provider callbacks are top-level cross-site GETs protected by the one-use browser transaction instead. Local demo requests retain loopback and same-origin protections. TLS termination and proxy header rewriting must be tested at the actual hosting boundary before production acceptance. Preserve the browser's genuine Origin header and do not manufacture a trusted Origin upstream. Callback responses use `Referrer-Policy: no-referrer` to keep codes/state out of referrers; ordinary application responses use `same-origin` so native same-origin forms retain a verifiable Origin. Strictly reject `Origin: null` for authenticated mutations. Redact callback query strings, Cookie/Authorization headers, and token-response bodies from access logs.

## Read-only provider inspection and remaining registration gate

The reference `bryan060807/aibry-auth` was inspected at commit `b5e4fd8229d0bf8992d537b4333d407ecdfd3527`. The maintained provider is `apps/server/src/oidc/provider.ts`, which configures `oidc-provider`, public code-only clients with token endpoint authentication `none`, required PKCE, and `openid profile email`. Its source routes are `/oauth/authorize`, `/oauth/token`, `/oauth/jwks`, and `/oauth/userinfo`; signing-key validation requires RS256 RSA keys. That provider revision maps its registered clients with `application_type: native`; the proposed client name ending in `public-web` does not prove a different provider registration mode. These are source observations, not live discovery results, and Midnight Ink still uses discovery.

The current private client administration API at `/api/admin/oidc/clients` validates new callbacks with `validatePrivateRedirectUri`, allowing exact loopback HTTP only. Public HTTPS client registration currently has dedicated Otis and TrackMaster seed/validator paths. The source contains no Midnight Ink registration path observed during this inspection. Adding the proposed public client therefore requires a separately reviewed provider change; do not insert a row into its production database or reuse another application's client ID.

A discovery probe to `https://id.aibrylabs.com/.well-known/openid-configuration` was blocked by this cloud workspace's outbound proxy with CONNECT HTTP 403. No live discovery metadata, client registration, authorization acceptance, or interactive real login was observed. An operator must allow the intended identity destination in their environment and perform the [acceptance checklist](AIBRY-ID-ACCEPTANCE.md).

Midnight Palette was inspected read-only at `08eef6664530d5b0ea8a1a2bb1a10cf8754da740`. No source in that checked-out revision established a reusable real OIDC integration. No reference application, provider database, identity registration, production service, or ingress configuration was changed.


## Local generated-key authentication checks

Run the full browser command after installing Chromium and stopping any other `next dev` process for the same checkout:

```bash
npm run test:e2e
```

It runs the existing studio suite and then `playwright.auth.config.ts` sequentially. To run only the isolated authentication browser flow:

```bash
npx playwright test --config playwright.auth.config.ts
```

The auth config starts the test-only issuer on `http://127.0.0.1:3211`, the app on `http://localhost:3101`, and a separate `.data/auth-e2e-*` SQLite/photo directory. Its fixed fixture session secret and Alice/Bob identities are test data only. The mock uses freshly generated signing keys, enforces code/PKCE exchange, and has no connection to real AIBRY ID accounts. `scripts/mock-oidc.ts` refuses production; do not expose its unauthenticated test identities outside loopback.
