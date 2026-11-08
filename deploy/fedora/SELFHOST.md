# Midnight Ink on Fedora (proposed operator runbook)

**Status:** deployment artifacts only. No host changes, DNS changes, OAuth activation, or live acceptance have been performed by this PR. This is a private-app self-hosting plan, **not** a Supabase migration.

## Assumptions and gates

- Host: existing `aibry-fedora-server`, user `aibry`. Fedora owns durable storage and Cloudflare/nginx front door. This deployment is a deliberately reviewed exception to the usual Windows-PM2 app hosting model.
- Rootless Podman + user-systemd with Quadlet support. Check `podman --version`, `systemctl --user --version`, disk capacity and host port `3031` first. Do not overwrite an existing listener.
- Canonical application origin (proposed): `https://midnight-ink.aibrylabs.com`, with HTTPS on ingress, exact callback `/auth/aibry-id/callback`. The DNS and route are **not verified**.
- Provider: `https://id.aibrylabs.com`. Source for the dedicated opt-in provider client was merged into AIBRY-Auth, but that does **not** confirm the production provider has registered or loaded it. Registration and rollout are separate approvals.
- The application serves *nothing personal* without validated authentication; production never allows local-demo. Do not set `NODE_ENV=development` to make a public deployment run.
- Storage is a **single instance** of SQLite plus a photo directory. Do not run multiple replicas or share a SQLite database across containers/hosts.
- Before any existing-data deployment, back up the database, WAL/SHM sidecars, practice photos and existing auth config. Do not claim demo data without separate approval.

## Install preparation (manual, on Fedora as user aibry)

Use a new clean checkout pinned to the reviewed commit. Record the exact `git rev-parse HEAD`; do not replace a dirty checkout or deploy unrelated local work.

```bash
set -euo pipefail
mkdir -p "$HOME/projects" "$HOME/.config/midnight-ink" "$HOME/.local/share/midnight-ink" "$HOME/.config/containers/systemd"
chmod 700 "$HOME/.config/midnight-ink" "$HOME/.local/share/midnight-ink"
cd "$HOME/projects"
git clone https://github.com/bryan060807/midnight-ink.git
cd midnight-ink
git rev-parse HEAD
podman --version
ss -ltn | grep -E '(:3031[[:space:]]|:3031$)' && { echo 'Port 3031 already in use. STOP.'; exit 1; } || true
```

If the checkout already exists, stop instead of rerunning clone, inspect `git status`, and use a separate controlled update.

Generate a stable secret **on the host**, not in chat or Git:

```bash
cd "$HOME/projects/midnight-ink"
cp deploy/fedora/runtime.env.example "$HOME/.config/midnight-ink/runtime.env"
chmod 600 "$HOME/.config/midnight-ink/runtime.env"
python3 - <<'PY'
import secrets
print("Generate a secure secret locally and place it in SESSION_SECRET; minimum 32 random bytes.")
print("This output is sensitive; do not paste it into chat or Git:")
print(secrets.token_urlsafe(48))
PY
```

Set the generated value in the private `runtime.env`; do not leave the placeholder. Keep this value stable across restarts. Update the public origin and client ID only after verifying actual provider registration and hostname. Never enable the one-time demo import without a separate recovery plan.

## Build and initialize (manual)

```bash
set -euo pipefail
cd "$HOME/projects/midnight-ink"
podman build --pull=always -t localhost/midnight-ink:stable .
podman run --rm \
  --env-file "$HOME/.config/midnight-ink/runtime.env" \
  -v "$HOME/.local/share/midnight-ink:/app/.data:Z" \
  localhost/midnight-ink:stable npm run db:migrate
podman run --rm \
  --env-file "$HOME/.config/midnight-ink/runtime.env" \
  -v "$HOME/.local/share/midnight-ink:/app/.data:Z" \
  localhost/midnight-ink:stable npm run db:seed
cp deploy/fedora/midnight-ink.container.example "$HOME/.config/containers/systemd/midnight-ink.container"
systemctl --user daemon-reload
systemctl --user enable --now midnight-ink.service
systemctl --user status midnight-ink.service --no-pager
```

For boot persistence, inspect whether user lingering is already enabled. Do not change it or create global system services without operator review.

The rootless container publishes **only** `127.0.0.1:3031` on Fedora. A local probe:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: midnight-ink.aibrylabs.com' http://127.0.0.1:3031/login
```

A `200` on the login screen is not authentication acceptance; personal APIs must return an unauthenticated denial without session cookies. Inspect application logs without printing cookies, tokens, URL query strings or session secrets.

## Ingress and AIBRY ID gates

1. In the existing Fedora nginx/Cloudflare routing scheme, approve and configure `midnight-ink.aibrylabs.com` to reach Fedora `127.0.0.1:3031`. Only the trusted reverse proxy may reach the upstream.
2. The proxy **must overwrite** upstream `Host` with `midnight-ink.aibrylabs.com`; preserve the genuine browser `Origin`. Do not pass untrusted `Forwarded` or `X-Forwarded-Host` through as authority. Terminate and verify HTTPS. Redact callback codes/state and auth headers from access logs.
3. Verify AIBRY-Auth production actually includes and enables `midnight-ink-public-web` as a public client with auth method `none`, mandatory S256 PKCE, minimal scopes, and EXACT callback `https://midnight-ink.aibrylabs.com/auth/aibry-id/callback`. The merged provider source has `AIBRY_AUTH_OIDC_MIDNIGHT_INK_CLIENT_ENABLED` opt-in; source merge alone does not flip the runtime flag.
4. Confirm live discovery, JWKS and callback behavior; run real browser login/logout and two-account isolation as documented in `docs/AIBRY-ID-ACCEPTANCE.md`.
5. **Do not** make AIBRY ID production changes, Cloudflare/DNS changes, or restarts solely because this runbook exists. Obtain separate operator approval and use the established guarded change/rollback workflows.

### Data and backups

Durable storage is `~/.local/share/midnight-ink` on the Fedora host. It contains the SQLite database plus normalized photos. Do not run destructive `db:reset` against a production volume.

For a consistent **offline** backup, stop the app, archive the entire directory (including SQLite sidecars), then restart; verify archive readability and test restore on an isolated copy. Keep `runtime.env` separately in secured backup storage, not in a public archive. For updates, create a backup **before** migrations and build a version-tagged image so rollback can use the prior image. A downgrade is not guaranteed safe after a schema migration: restore the matching database/photos together when required.

### Rollback

If application activation fails before schema changes, stop the new user service and resume a previously pinned image. If migrations happened, use the verified pre-change data snapshot matching the previous image. Never point an older image at a newer schema without compatibility evidence. Do not roll back the shared AIBRY ID provider for an app-only failure.

### Unverified items

These remain unknown until host/operator checks: Podman/Quadlet availability, disk, port collision, real client registration, DNS/TLS/Cloudflare route, Node image pull, successful image build, actual migrations, start/health, and two real user logins. The bridge cannot currently install this new service automatically.
