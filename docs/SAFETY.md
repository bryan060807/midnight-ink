# Safety and privacy

Midnight Ink teaches drawing and deliberate practice on paper and synthetic practice skin. Lesson completion, practice time, self-assessment, and Rook responses are learning records. They are not qualifications, licensing, infection-control certification, or permission to tattoo another person.

## Practice boundaries

- Work involving human skin requires appropriate supervised professional training, infection control, and applicable local licensing. Ask a qualified mentor and the relevant licensing authority about your pathway.
- Never reuse disposable cartridges. A photograph cannot establish sterility, needle penetration depth, biological safety, or correct machine settings.
- No universal voltage or needle-depth preset is supplied. Consult verified documentation for the actual equipment and use appropriate supervision.
- Treat uncertain inks as practice only. The editable sample MATOENT entry has no verified suitability for human tattooing. Sample Aurora packaging information is user-reported, not independent manufacturer verification.
- Keep sharps in an appropriate sharps container and follow local disposal requirements. Keep contaminated and clean areas separate. Learning summaries do not replace bloodborne-pathogen training.

The curriculum covers cross-contamination, disposable supplies, ink uncertainty, sharps disposal, professional ethics, and mentorship. Professional Foundations is educational material, not a certification course.

## Photo feedback

Practice images are saved only after an explicit upload. The MVP offers self-assessment and side-by-side comparison; it does not manufacture visual observations. Ratings belong to the learner. High-contrast designs and stencil exports remain artwork for practice and review, not professionally approved tattoo stencils.

## Workspace privacy model

The optional local development demo has no password. It is intended for one person on a trusted local machine and is restricted to loopback requests. Do not expose it through a public tunnel, shared network, or unauthenticated reverse proxy. Authenticated profiles are separate private workspaces mapped to verified issuer/subject identities; signing in never claims existing demo data automatically.

Practice photos are normalized server-side before storage, with a bounded upload size and supported image signatures. Metadata is removed by image re-encoding. File names and database ownership are assigned by the server; supplied paths are not used as storage locations. Photo downloads pass through the workspace access check.

Settings provides a records export and deliberate user-data deletion. Export files contain personal notes and learning history: store them accordingly. Deleting records does not erase independent exports, machine backups, or operating-system snapshots.

## Optional provider privacy

Offline Rook stays local. If an operator configures OpenAI and the learner sends a coaching question, bounded question text and relevant learning context are sent to that provider. Practice photos are not sent to the provider in this MVP. Do not put secrets or unnecessary personal information in coaching questions. See [AI-COACH.md](AI-COACH.md) for the actual provider boundary.

OIDC login and persistent revocable application sessions are implemented, with ownership enforced server-side for personal records and photo parents. Production never falls back to local-demo access. Real-provider registration, an interactive AIBRY ID browser login, actual trusted-proxy acceptance, and two-real-identity isolation remain production signoff gates. See [AIBRY ID acceptance](AIBRY-ID-ACCEPTANCE.md). The separately authorized demo-import receipt retains recovery preferences and a one-time claim marker; operators must account for that retention during any future full account-deletion policy.
