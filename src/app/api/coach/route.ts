import { coach, coachRequestSchema, type CoachContext } from "@/lib/coach";
import { ApiError, requireWorkspace } from "@/lib/auth";
import { getWorkspace, saveCoaching } from "@/lib/db";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rateWindows = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 10;
const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request): Promise<Response> {
  try {
    const profileId = requireWorkspace(request);
    const now = Date.now();
    for (const [id, window] of rateWindows) if (now - window.startedAt >= WINDOW_MS) rateWindows.delete(id);
    const current = rateWindows.get(profileId) ?? { startedAt: now, count: 0 };
    if (current.count >= REQUEST_LIMIT) return Response.json({ error: "Rook is taking a short pause. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    current.count += 1;
    rateWindows.set(profileId, current);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Send a JSON question.");
    const text = await readBody(request);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new ApiError(400, "The question could not be read as JSON."); }
    const input = coachRequestSchema.parse(raw);
    const workspace = getWorkspace(profileId);
    const result = await coach(input, workspace as CoachContext);
    saveCoaching(profileId, { question: input.question, response: result });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Check your question and try again." }, { status: 400 });
    return Response.json({ error: "Your coaching request could not be saved. Try again." }, { status: 500 });
  }
}

async function readBody(request: Request): Promise<string> {
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_BODY_BYTES) throw new ApiError(413, "The question is too large.");
  if (!request.body) throw new ApiError(400, "A question is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) throw new ApiError(413, "The question is too large.");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks).toString("utf8");
}
