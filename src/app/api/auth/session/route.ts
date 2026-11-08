import { DatabaseError } from "@/lib/database";
import { getRequestIdentity, ApiError } from "@/lib/auth";
import { getAuthConfig, assertTrustedHost } from "@/lib/auth-config";
import { getDatabase } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  let loginAvailable = false;
  let configurationValid = false;
  try {
    const config = getAuthConfig();
    if (config) {
      assertTrustedHost(request, config);
      loginAvailable = true;
      configurationValid = true;
    }
    const session = await getRequestIdentity(request);
    const db = getDatabase();
    const profile = (await db.query('SELECT "id","name","level","path","createdAt","updatedAt" FROM "Profile" WHERE "id"=$1',[session.profileId])).rows[0];
    if (!profile) throw new ApiError(401, "Sign in again.");
    const claimed = (await db.query('SELECT "sourceProfileId" FROM "DemoImportReceipt" WHERE "sourceProfileId"=$1',['local-demo'])).rows[0];
    return Response.json(
      {
        authenticated: session.mode === "authenticated",
        mode: session.mode,
        profile,
        identity: session.identity,
        expiresAt: session.expiresAt,
        loginAvailable,
        configurationValid,
        demoImportAvailable:
          session.mode === "authenticated" &&
          /^[a-f0-9]{64}$/i.test(process.env.DEMO_IMPORT_TOKEN_HASH || "") &&
          !claimed,
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    return Response.json(
      {
        authenticated: false,
        mode: "anonymous",
        profile: null,
        identity: null,
        expiresAt: null,
        loginAvailable,
        configurationValid,
        demoImportAvailable: false,
        error:
          error instanceof ApiError && error.status === 401
            ? "session_required"
            : "configuration",
      },
      {
        status: error instanceof DatabaseError ? 503 : error instanceof ApiError && error.status === 403 ? 403 : error instanceof ApiError && error.status === 503 ? 503 : 200,
        headers: { "Cache-Control": "no-store", Vary: "Cookie" },
      },
    );
  }
}
