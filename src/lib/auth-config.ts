import { createHmac } from "node:crypto";
import { ApiError } from "./errors";

export const CANONICAL_ISSUER = "https://id.aibrylabs.com";
export type AuthConfig = {
  issuer: string;
  clientId: string;
  appOrigin: string;
  callbackUri: string;
  sessionSecret: string;
  secureCookies: boolean;
  sessionTtlMs: number;
  transactionTtlMs: number;
  allowHttpLocalhost: boolean;
};
export const isLoopback = (hostname: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);

/** No secrets or configuration are sent to clients. No forwarded header is trusted. */
export function getAuthConfig(): AuthConfig | null {
  const clientId = process.env.AIBRY_ID_CLIENT_ID?.trim() || "";
  const appOrigin = process.env.APP_ORIGIN?.trim() || "";
  const sessionSecret = process.env.SESSION_SECRET || "";
  const issuer = process.env.AIBRY_ID_ISSUER?.trim() || CANONICAL_ISSUER;
  if (!clientId && !appOrigin && !sessionSecret && issuer === CANONICAL_ISSUER)
    return null;
  if (
    !clientId ||
    !appOrigin ||
    Buffer.byteLength(sessionSecret) < 32 ||
    clientId.length > 200 ||
    !/^[A-Za-z0-9._-]+$/.test(clientId)
  )
    throw new ApiError(
      503,
      "Authentication configuration is incomplete or invalid.",
    );
  const production = process.env.NODE_ENV === "production";
  const allowHttpLocalhost =
    !production && process.env.AIBRY_ID_ALLOW_HTTP_LOCALHOST === "true";
  let app: URL, provider: URL;
  try {
    app = new URL(appOrigin);
    provider = new URL(issuer);
  } catch {
    throw new ApiError(
      503,
      "Authentication configuration contains an invalid URL.",
    );
  }
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== "/" ||
    !["http:", "https:"].includes(app.protocol)
  )
    throw new ApiError(
      503,
      "APP_ORIGIN must be an exact origin without a path.",
    );
  if (app.protocol !== "https:" && (production || !isLoopback(app.hostname)))
    throw new ApiError(
      503,
      "APP_ORIGIN requires HTTPS outside local development.",
    );
  if (
    provider.username ||
    provider.password ||
    provider.search ||
    provider.hash ||
    provider.pathname !== "/" ||
    (issuer !== CANONICAL_ISSUER &&
      !(
        allowHttpLocalhost &&
        provider.protocol === "http:" &&
        isLoopback(provider.hostname)
      ))
  )
    throw new ApiError(
      503,
      "AIBRY ID issuer must be canonical, or an explicitly enabled local development mock.",
    );
  return {
    issuer,
    clientId,
    appOrigin: app.origin,
    callbackUri: `${app.origin}/auth/aibry-id/callback`,
    sessionSecret,
    secureCookies: app.protocol === "https:",
    sessionTtlMs: 8 * 60 * 60 * 1000,
    transactionTtlMs: 10 * 60 * 1000,
    allowHttpLocalhost,
  };
}
export function getRequiredAuthConfig(): AuthConfig {
  const config = getAuthConfig();
  if (!config)
    throw new ApiError(
      503,
      process.env.NODE_ENV === "production"
        ? "Production authentication is not configured."
        : "AIBRY ID authentication is not configured.",
    );
  return config;
}
export function sessionCookieName(config: AuthConfig) {
  return config.secureCookies ? "__Host-mi_session" : "mi_session";
}
export function transactionCookieName(config: AuthConfig) {
  return config.secureCookies ? "__Host-mi_login" : "mi_login";
}
export function hashAuthToken(value: string, config: AuthConfig) {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}
export function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("cookie") || "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null;
}
export function assertTrustedHost(request: Request, config: AuthConfig) {
  const expected = new URL(config.appOrigin).host;
  const supplied = request.headers.get("host") || new URL(request.url).host;
  if (supplied.toLowerCase() !== expected.toLowerCase())
    throw new ApiError(403, "The request host is not allowed.");
  // HTTPS may terminate at a trusted reverse proxy. It MUST overwrite Host with
  // the configured public authority. Forwarded / X-Forwarded-* never set trust.
}
export function assertSameOrigin(request: Request, config: AuthConfig) {
  assertTrustedHost(request, config);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Cross-site changes are not allowed.");
  if (request.headers.get("origin") !== config.appOrigin)
    throw new ApiError(403, "Cross-origin changes are not allowed.");
}
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2000 ||
    !value.startsWith("/") ||
    /[\\\u0000-\u0020\u007f]/.test(value) ||
    value.startsWith("//")
  )
    return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (
    /^\/\/|[\\\u0000-\u0020\u007f]/.test(decoded) ||
    decoded.startsWith("/auth") ||
    decoded.startsWith("/api") ||
    decoded.startsWith("/login")
  )
    return "/";
  try {
    const url = new URL(value, "https://studio.invalid");
    return url.origin === "https://studio.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
