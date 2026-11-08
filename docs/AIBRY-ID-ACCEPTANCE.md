# AIBRY ID real-provider acceptance

Local implementation/tests and production signoff are separate. A mock issuer can verify protocol handling and account isolation; it cannot prove that AIBRY ID registered this client or that the proposed hostname routes to Midnight Ink.

## Proposed registration for operator review

| Setting | Proposed value |
| --- | --- |
| Issuer | `https://id.aibrylabs.com` |
| Client ID | `midnight-ink-public-web` |
| Display name | Midnight Ink — AIBRY Labs |
| Client type | Public |
| Token endpoint authentication | `none` |
| Grant type | `authorization_code` only |
| Response type | `code` only |
| PKCE | Mandatory S256 |
| Scopes | `openid profile email` |
| Exact proposed callback | `https://midnight-ink.aibrylabs.com/auth/aibry-id/callback` |
| Wildcards | None |
| Client secret | None |
| Automatic consent/test approval | Disabled |
| Refresh/offline access | Not requested |
| Provider logout redirect | Not required; application logout is local revocation |

The hostname and client ID are proposed and unverified. The inspected provider currently constructs public clients with `application_type: native`; an operator must preserve or deliberately review that provider contract rather than infer `application_type: web` from this client ID. A development callback, if needed, must be separately registered as its exact loopback URI; it is not an alias for the HTTPS callback.

## Separate provider-registration plan

The inspected provider revision is `b5e4fd8229d0bf8992d537b4333d407ecdfd3527`. Its admin create endpoint currently permits only private loopback callbacks, while existing HTTPS exceptions use explicit application-specific validation/seeding. No automatic registration request is implemented here.

A separately authorized provider task should:

1. Add a Midnight Ink callback validator/allowlist for the exact approved HTTPS origin and `/auth/aibry-id/callback`. Require HTTPS, default approved port, no userinfo, query, fragment, wildcard, alternate hostname, extra path, or trailing slash. Do not broaden private-client validation globally.
2. Add an explicitly enabled Midnight Ink public-client seed or extend the approved admin workflow with the same exact callback constraints. Use the proposed unique client ID, public/none, code grant, required S256, and the minimal scopes above. Preserve existing registrations.
3. Add unit tests accepting only the exact approved callback, rejecting lookalike domains, HTTP public hosts, ports, suffix paths, encoded path variations, queries/fragments, and wildcards. Test idempotent registration and unchanged existing clients.
4. Add provider integration tests for client listing, required PKCE, exact redirect matching, invalid verifier rejection, single-use codes, audience/sub/nonce claims, and normal consent. Keep test-only auto-approval disabled for the real registration.
5. Review the patch, back up the provider through its supported operator process, register via the approved workflow, restart only if the provider contract requires refreshing clients, and verify discovery. This document grants no authorization to apply that change or alter production.

Do not copy another app's secret or client ID, change an issuer to `aibry.shop`, or bypass the provider validator through a direct production SQL insertion.

## Required real acceptance evidence

Record the deployed application commit, provider revision/configuration, exact origin/callback, test time, and pass/fail evidence without tokens or credentials:

- [ ] Discovery at the canonical issuer succeeds over verified TLS; metadata issuer is exact and advertises the required flow/capabilities.
- [ ] Operator confirms `midnight-ink-public-web` exists, is enabled, public/none, and has the exact approved callback.
- [ ] S256 is mandatory; wrong/missing verifier and a mismatched callback are rejected.
- [ ] Actual DNS, TLS, routing, trusted Host rewriting, and upstream access restrictions work for the approved application origin.
- [ ] A browser authorization request is accepted by AIBRY ID.
- [ ] A real test identity authenticates, returns through the callback, and receives a validated server-side application session.
- [ ] Profile/settings and saved practice data survive application restart without exposing the bearer token to JavaScript.
- [ ] Local logout revokes the session immediately; replaying its old cookie cannot read protected data. Provider SSO may still exist and is disclosed.
- [ ] A second distinct real identity receives an independent workspace, even if mutable display attributes match.
- [ ] Cross-account equipment/session/photo/design/coaching/settings/export/deletion attempts fail at the API boundary.
- [ ] Production has no anonymous or local-demo fallback, including forged identity headers and expired-cookie requests.
- [ ] Cross-origin mutation, forged forwarded headers, unsafe return destinations, stale/replayed callbacks, and invalid tokens fail without leaking internals.
- [ ] Existing demo records remain unclaimed unless the separately authorized one-time procedure is deliberately completed.

## Current status

Real-provider acceptance is **pending**. The live discovery attempt from this cloud workspace failed at its outbound proxy (CONNECT HTTP 403), so it established no provider availability or client-registration result. No real client was registered, no proposed hostname was configured, and no interactive login against a real AIBRY ID identity was performed. Normal CI uses isolated generated keys and mock identities only.
