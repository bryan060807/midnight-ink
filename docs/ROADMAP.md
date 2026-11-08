# Roadmap and limits

The MVP prioritizes local structured learning, deliberate practice records, equipment education, offline coaching, and a focused design editor.

## Next milestone: authenticated private beta

The next useful milestone is real-provider acceptance for a reviewed single-instance beta. The OIDC identity/session adapter and automated per-user isolation verification are implemented; operator registration, actual HTTPS ingress/trusted-proxy checks, interactive login with two real test identities, verified backup/restore procedures, qualified curriculum review, and accessibility testing with actual learners remain.

## Deliberately outside the MVP

- Professional certification, live-skin competency scoring, or machine-setting prescriptions.
- Automatic photo diagnosis or paid image-analysis requests. The current workflow uses the learner's own observations and image comparison.
- Provider client registration, actual AIBRY ID acceptance, and production hosting. The implemented OIDC flow is locally testable with a mock issuer; production has no demo fallback and still requires valid configuration, a registered client, and live signoff.
- Advanced illustration, pressure-sensitive brushes, collaborative editing, photorealistic image generation, or an external asset marketplace.
- PostgreSQL, hosted object storage, multi-instance scaling, mobile native applications, and remote account synchronization.
- External source endorsements or claimed expert review without a documented review.

## Possible later improvements

Add better import/export interoperability, richer vector editing, mentor-reviewed assignments, versioned learning paths, and opt-in bounded image observations only after an explicit consent and privacy design. Preserve the offline learning workflow throughout.
