# Deployment boundary

No infrastructure deployment is included. Midnight Ink is independently runnable on a local machine and does not depend on Midnight Palette, Garage services, Cloudflare, an OAuth registration, or a hosted database.

## Build versus production readiness

`npm run build` checks and compiles the Next.js application. A successful build does not enable production access. `NODE_ENV=production` disables the local demo workspace and protected requests return a configuration error. Setting `LOCAL_DEMO_ENABLED=true` does not bypass this restriction.

`npm run dev` is the supported private MVP workflow. Do not change `NODE_ENV` to bypass production checks on a deployed host.

## Future hosting checklist

Before deploying to any destination:

1. Implement and verify AIBRY ID or another real authentication adapter. Validate issuer, audience, signature, expiry, session lifecycle, and callback protections against actual registered configuration.
2. Map verified identity to a server-owned profile. Test strict ownership isolation for every read, write, upload, download, export, and deletion operation. Do not accept profile identity from a client request.
3. Establish HTTPS, trusted host/proxy handling, secure session cookies, CSRF controls, per-user rate limits, and request-body limits at the hosting boundary.
4. Mount durable storage for both SQLite and normalized images. Back them up together, test recovery, and define retention and deletion handling. Use one application instance for SQLite unless a supported replication strategy is introduced.
5. Configure server-side secrets in the chosen host's secret store. Never bundle provider keys into browser code or commit them to Git.
6. Run migrations before starting application traffic. Test migration and restore procedures on a copy of representative data.
7. Review curriculum and safety material with an appropriately qualified educator. Document the reviewer and date rather than implying an endorsement.
8. Complete dependency/security review, accessibility testing, privacy notices, operational monitoring, and real acceptance tests.

For multiple writers or multiple application replicas, replace the repository's SQLite implementation with PostgreSQL and object storage while preserving the domain and ownership contracts. This is a planned change, not an implemented deployment option.

## Configuration

See [.env.example](../.env.example). `MIDNIGHT_INK_DATA_DIR` controls local persistent files; `DATABASE_PATH` can override the database file for isolated tools/tests. Provider configuration is optional. Keep data files, local environment files, exported records, and keys outside version control.

No issuer, application registration, production credentials, or hosting destination has been invented or configured.
