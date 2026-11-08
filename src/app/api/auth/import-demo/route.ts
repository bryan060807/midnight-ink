import { DatabaseError } from "@/lib/database";
import { getRequestIdentity, ApiError } from "@/lib/auth";
import { importDemoData } from "@/lib/demo-import";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const attempts = new Map<string, { count: number; startedAt: number }>();
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getRequestIdentity(request);
    if (session.mode !== "authenticated")
      throw new ApiError(401, "Sign in before importing authorized demo data.");
    const now = Date.now();
    for (const [id, value] of attempts)
      if (now - value.startedAt > 60_000) attempts.delete(id);
    const rate = attempts.get(session.profileId) || {
      count: 0,
      startedAt: now,
    };
    if (rate.count >= 5)
      return Response.json(
        { error: "Too many import attempts. Try again in a minute." },
        {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    attempts.set(session.profileId, { ...rate, count: rate.count + 1 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "Send a JSON import confirmation.");
    if (Number(request.headers.get("content-length") || "0") > 2048)
      throw new ApiError(413, "The import confirmation is too large.");
    if (!request.body)
      throw new ApiError(400, "An import confirmation is required.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 2048)
          throw new ApiError(413, "The import confirmation is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiError(400, "Invalid import confirmation.");
    }
    if (
      !input ||
      typeof input !== "object" ||
      !("confirm" in input) ||
      input.confirm !== "IMPORT DEMO DATA" ||
      !("authorization" in input) ||
      typeof input.authorization !== "string" ||
      Object.keys(input).some((k) => !["confirm", "authorization"].includes(k))
    )
      throw new ApiError(
        400,
        "Confirm this import with the separately issued authorization.",
      );
    const receipt = await importDemoData(session.profileId, input.authorization);
    return Response.json(
      { ok: true, receipt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "Demo data could not be imported. No automatic claim is performed.",
      },
      {
        status: error instanceof DatabaseError ? 503 : error instanceof ApiError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
