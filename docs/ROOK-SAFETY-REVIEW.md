# Rook safety-filter follow-up

The first combined release passed local validation and deployment health checks,
but live acceptance returned `safety_rejection`; the approved procedure restored
the original build. This category combined provider content filtering with local
text rejection. The provider answer was deliberately not retained, so its exact
rejected phrase is unknown. The reported question concerns loading ink into a
needle/cartridge, not a request for human-skin settings.

Local injected-response tests reproduced two definite filter defects: clear
prohibitions such as "Never reuse the cartridge" were treated as recommendations,
and explicit paper drawing dimensions were treated as needle settings. These
reproductions do not establish the precise contents of the live rejected answer.

The revised filter recognizes only explicit prohibitions in the same clause.
Conditional language such as unless/except/if/but remains conservatively rejected.
It checks every match, so a safe warning cannot mask a separate positive reuse
instruction. Common article/adjective forms of positive reuse are also rejected.

Numerical voltages remain blocked. Numerical lengths are allowed only for explicit
paper/sketchbook geometry in the same clause, with no needle, machine, depth,
skin or human context. Ink-loading/needle measurements remain blocked. The prompt
keeps ink-loading guidance conceptual, limited to synthetic practice and exact
manufacturer instructions; it does not invent immersion depth, machine settings,
sterility, model compatibility or human-skin technique.

The existing `safety_rejection` category now has one fixed, optional `reason`:
`provider_content_filter`, `numerical_setting`, `cartridge_reuse`,
`readiness_claim`, or `photo_safety_claim`. No question, response, account, model,
credential, header or private context is added to routine diagnostics. Refusal,
schema/reference checks, bounded body/deadline, server-owned metadata, account
isolation and offline fallback remain unchanged. No provider retries are added.

Regression fixtures cover the reported ink-loading question with clear safety
warnings, paper dimensions, positive reuse recommendations, conditional/double
instructions, numeric needle/ink-loading/machine settings and mixed human context.
They are injected fixtures, not live OpenAI evidence.

The studio browser test now waits for the initial workspace response and the
rendered learning-link target after a save. A persisted database value alone did
not prove that the browser refresh had completed, allowing a click on the old
learning path. No application or database timeout was increased.

The revised package is staged at
`C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined-r2`.
Its manifest pins the source and artifacts; `FINAL-RELEASE-REPORT.md` records exact
validation and deployment commands. The control helper now distinguishes the
operator checkout (`controlCwd`) from the current production cwd (`originalCwd`),
because production is currently running from the first package's rollback folder.
Existing manifests retain their original behavior. No daemon is launched by either
path. A new release switch requires separate explicit approval.

The independently observed PostgreSQL system-name lookup delay (about 4.05 seconds
of a 5-second connection budget) remains an infrastructure investigation, not a
resolved pool-exhaustion diagnosis. No database, DNS/TLS, credentials, authentication,
timeouts, pool sizes or live services were changed by this local follow-up.
