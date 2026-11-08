# Rook coaching

Rook is a text-based educational assistant for drawing and synthetic practice. Its name is editable in Settings. Useful offline instruction is the default, with optional OpenAI text coaching as an enhancement.

## Offline behavior

The server validates a question (2–2,000 characters), optional module context, and at most six bounded history entries. Retrieval ranks up to three original educational cards by question terms and related module references, excluding externally unreviewed sources. Offline responses give practical steps for linework, shading, design/stencils, equipment, or a simple next practice. They consider known inventory, recent exercise/difficulty, goals, and learning stage without treating user inventory as independently verified facts.

Requests involving photos explicitly state that Rook has not inspected the images. Requests for live-skin settings, sterility, disposable reuse, or professional readiness return the relevant safety boundary and a safe practice alternative. See [SAFETY.md](SAFETY.md).

The UI shows the response source and educational-card references. No provider key is required; offline mode makes no network calls.

## Optional OpenAI adapter

Configure `ROOK_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` (default `gpt-4.1-mini`) in server-side environment configuration. Restart the local server after changing it. Do not put keys in browser variables or source control. Network policy must permit `api.openai.com` for real calls; no access or paid account is assumed by this build.

The adapter calls OpenAI's HTTPS chat-completions endpoint with a current question and bounded educational context: stage/path, completion count, up to eight inventory summaries, three recent practice summaries, up to three goals, and retrieved card text. It deliberately excludes photos, raw private session notes, profile names, and earlier conversation history. The user must deliberately submit a question; no background analysis is performed.

Responses have a 12-second timeout, 1,100-token generation budget, 24 KB transport bound, and a strict answer/steps/reference schema. Reference IDs must occur in the supplied candidate set. Conservative output checks reject numerical skin-setting prescriptions, disposable reuse recommendations, invented competence/sterility claims, and malformed answers. There are no automatic retries. The API limits requests to ten per minute per workspace.

The app treats all user/provider text as untrusted subject matter. Structured output and filtering reduce risk but do not turn a language model into an equipment authority or certification system. Manufacturer-specific unknowns stay unknown.

Missing credentials, refusal/errors, timeout, oversized response, invalid JSON/schema, unknown reference IDs, or unsafe output produce an explicit curated offline fallback. No provider body or user question is written to routine logs. Coaching questions and shaped responses are retained in the local workspace history and included in records export/deletion.

## Image analysis boundary

This MVP does not send images to OpenAI and has no live image-analysis adapter. Practice photos are local records for learner self-assessment and comparison. A reference uploaded into the Design Studio is for drawing, not coach analysis. No generated answer claims to infer physical depth, exact machine settings, infection safety, or sterility from an image.

## Verification

Unit tests use deterministic mock `fetch` responses for provider success, failure, invalid structure, unknown IDs, unsafe content, and response-size limits. They also verify useful contextual offline guidance and omitted private context. No live provider acceptance test or paid call is claimed.

In a cloud workspace with restricted outbound networking, optional live coaching also needs HTTPS access to `api.openai.com`. Offline operation needs no such access. This build did not add a network rule, supply credentials, or make a paid live request.
