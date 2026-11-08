# Roadmap and limits

The MVP prioritizes local structured learning, deliberate practice records, equipment education, offline coaching, and a focused design editor.

## Next milestone: authenticated private beta

The next useful milestone is operator acceptance for a reviewed single-instance beta. PostgreSQL persistence, the OIDC identity/session adapter, offline SQLite import, Windows PM2 configuration and the [Windows/Fedora runbook](WINDOWS-FEDORA-DEPLOYMENT.md) are implemented. Actual Windows execution, production client activation, HTTPS ingress/trusted-proxy checks, interactive login with two real identities, a coordinated database/photo restore, qualified curriculum review, and accessibility testing with actual learners remain.

## Deliberately outside the MVP

- Professional certification, live-skin competency scoring, or machine-setting prescriptions.
- Automatic photo diagnosis or paid image-analysis requests. The current workflow uses the learner's own observations and image comparison.
- Provider client registration, actual AIBRY ID acceptance, and production hosting. The implemented OIDC flow is locally testable with a mock issuer; production has no demo fallback and still requires valid configuration, a registered client, and live signoff.
- Advanced illustration, pressure-sensitive brushes, collaborative editing, photorealistic image generation, or an external asset marketplace.
- Hosted object storage, multi-instance scaling, mobile native applications, and cross-installation account synchronization. PostgreSQL metadata persistence is implemented; Windows-local photo storage and one PM2 instance remain the initial deployment model.
- External source endorsements or claimed expert review without a documented review.

## Possible later improvements

Add better import/export interoperability, richer vector editing, mentor-reviewed assignments, versioned learning paths, and opt-in bounded image observations only after an explicit consent and privacy design. Preserve the offline learning workflow throughout.
