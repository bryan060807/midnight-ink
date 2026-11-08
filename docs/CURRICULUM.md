# Curriculum

Midnight Ink ships 36 original lessons, organized as six modules of six lessons each. Content lives in `src/lib/curriculum.ts`, with typed objectives, explanations, guided practice, equipment, common mistakes, a knowledge check and answer, and related reference-card IDs. Completion is tracked separately from content, so lessons remain available for revisiting.

| Module | Lessons | Scope |
| --- | --- | --- |
| Foundations | 6 | Machine motion, rotary/pen identification, power, cartridge anatomy and grouping conventions, controls, workspace planning, paper and synthetic materials |
| Drawing for Tattoos | 6 | Shape language, silhouette and contrast, line hierarchy, composition, actual-size tests, original motif development |
| Linework | 6 | Supported posture, straight and parallel lines, curves/S-curves, circles and corners, starts/stops, observation-based troubleshooting |
| Shading & Blackwork | 6 | Magnum conventions, bounded fills, discrete value scales, gradient planning, stippling, synthetic surface stopping decisions |
| Design & Stencils | 6 | Simplification, original flash, clean guides, mirroring, paper placement mockups, material-specific synthetic transfer studies |
| Professional Foundations | 6 | Bloodborne-pathogen awareness, cross-contamination, single-use sharps, ink uncertainty, ethics/privacy/consent, local requirements and mentorship |

## Exercises and worksheets

Eight complete exercises are available: straight lines, parallel lines, circles, S-curves, corners, solid fills, gradients, and simple stencil tracing. Each includes a time suggestion, a specific sequence, materials, and observation goals. Time suggestions are planning aids, not competency standards.

`src/lib/worksheets.ts` produces original A4 SVG worksheets with reusable vector guides, dated material/attempt fields, observation prompts, and a next-variable plan. Templates are app-authored; no uploaded user content is interpolated into the SVG. Print at 100% and check printer scaling. The generator rejects unknown exercise IDs.

The drawing pathway starts on paper. Powered synthetic studies are separate and require appropriate materials, known equipment instructions, fresh disposable supplies, and sharps planning. They are not instructions for live-skin work.

## Reference provenance

The library contains 25 original educational cards. Each records category, skill level, description, source URL, attribution, review status, last-reviewed metadata, lesson relations, equipment compatibility, and safety notes. Original content is attributed to Midnight Ink / AIBRY Labs. No third-party citations, endorsements, or reviewed dates are fabricated: source URLs and last-reviewed dates are null, and review status explicitly says that content is original guidance and has not been externally reviewed.

Before professional release, qualified educators should review instructional content and record an actual review date and scope. Jurisdiction-specific infection-control and licensing requirements must be verified through official local sources; this curriculum does not claim that every region follows one rule.

## Learning boundaries

Completion records study, not qualification. No lesson, worksheet, score, portfolio, or AI response establishes certification, licensing, biological safety, or readiness to tattoo a person. Photos cannot establish physical penetration, exact settings, sterile status, or professional competence. The curriculum does not provide universal human-skin depth or voltage presets.
