import { ApiError } from "./errors";
import {
  getAuthConfig,
  getRequiredAuthConfig,
  sessionCookieName,
  readCookie,
  hashAuthToken,
  assertTrustedHost,
  assertSameOrigin,
  isLoopback,
  type AuthConfig,
} from "./auth-config";
import { findSession, getIdentity } from "./auth-store";
export { ApiError } from "./errors";

export type RequestIdentity = {
  mode: "demo" | "authenticated";
  profileId: string;
  expiresAt: number | null;
  identity: Awaited<ReturnType<typeof getIdentity>>;
};
function mutable(request: Request) {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method);
}
function demoRequestGuard(request: Request) {
  const url = new URL(request.url);
  const supplied = request.headers.get("host") || url.host;
  let host: URL;
  try {
    host = new URL(`${url.protocol}//${supplied}`);
    if (
      host.username ||
      host.password ||
      host.pathname !== "/" ||
      host.search ||
      host.hash
    )
      throw new Error();
  } catch {
    throw new ApiError(403, "Invalid host.");
  }
  if (!isLoopback(host.hostname))
    throw new ApiError(
      403,
      "The local demo workspace is available on localhost only.",
    );
  if (mutable(request)) {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiError(403, "Cross-site changes are not allowed.");
    const origin = request.headers.get("origin");
    if (origin && origin !== `${url.protocol}//${host.host}`)
      throw new ApiError(403, "Cross-origin changes are not allowed.");
  }
}
export async function getRequestIdentity(request?: Request): Promise<RequestIdentity> {
  const config = getAuthConfig();
  if (process.env.NODE_ENV === "production" && !config) getRequiredAuthConfig();
  const cookies = request?.headers.get("cookie") || "";
  // A failed/expired authenticated cookie never quietly becomes the demo owner.
  const hasSessionCookie = /(?:^|;\s*)(?:__Host-mi_session|mi_session)=/.test(
    cookies,
  );
  if (hasSessionCookie) {
    if (!request || !config)
      throw new ApiError(401, "Your session has expired. Sign in again.");
    assertTrustedHost(request, config);
    const token = readCookie(request, sessionCookieName(config));
    const session = token ? await findSession(hashAuthToken(token, config)) : null;
    if (!session)
      throw new ApiError(401, "Your session has expired. Sign in again.");
    if (mutable(request)) assertSameOrigin(request, config);
    const identity = await getIdentity(session.profileId);
    if (!identity || identity.issuer !== config.issuer)
      throw new ApiError(
        401,
        "Your session is no longer available. Sign in again.",
      );
    return {
      mode: "authenticated",
      profileId: session.profileId,
      expiresAt: session.expiresAt,
      identity,
    };
  }
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_DEMO_ENABLED !== "false"
  ) {
    if (request) demoRequestGuard(request);
    return {
      mode: "demo",
      profileId: "local-demo",
      expiresAt: null,
      identity: null,
    };
  }
  if (config && request) assertTrustedHost(request, config);
  if (!config && process.env.NODE_ENV !== "production" && !request)
    throw new ApiError(
      401,
      "Local demo workspace is disabled. Sign in to continue.",
    );
  throw new ApiError(401, "Sign in with AIBRY ID to open your workspace.");
}
export async function requireWorkspace(request?: Request): Promise<string> {
  return (await getRequestIdentity(request)).profileId;
}
export function getSessionTokenHash(
  request: Request,
  config: AuthConfig,
): string | null {
  const token = readCookie(request, sessionCookieName(config));
  return token ? hashAuthToken(token, config) : null;
}
