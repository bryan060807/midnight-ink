import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthConfig,
  getRequiredAuthConfig,
  assertSameOrigin,
  assertTrustedHost,
  hashAuthToken,
  readCookie,
  safeReturnTo,
  sessionCookieName,
  transactionCookieName,
  type AuthConfig,
} from "./auth-config";
import {
  cleanupAuth,
  consumeLoginTransaction,
  createLoginTransaction,
  createSession,
  revokeSession,
  upsertIdentity,
} from "./auth-store";

export interface OidcOptions {
  fetch?: typeof fetch;
}
export type LoginAttempt = {
  nonce: string;
  pkceVerifier: string;
  returnTo: string;
  expiresAt: number;
};
const allowedAlgorithms = ["RS256", "ES256"] as const;
const metadataSchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  response_types_supported: z.array(z.string()),
  response_modes_supported: z.array(z.string()).optional(),
  grant_types_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()),
  code_challenge_methods_supported: z.array(z.string()),
  id_token_signing_alg_values_supported: z.array(z.string()),
  authorization_response_iss_parameter_supported: z.boolean().optional(),
});
export type OidcMetadata = z.infer<typeof metadataSchema>;
const metadataCache = new Map<
  string,
  { expires: number; value: OidcMetadata }
>();
const jwksCache = new Map<string, { expires: number; value: JSONWebKeySet }>();
const windows = new Map<string, { start: number; count: number }>();
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 100_000;
const CACHE_MS = 5 * 60_000;

/** Resets process-local discovery/rate caches; no persistent login/session state. */
export function resetOidcCaches() {
  metadataCache.clear();
  jwksCache.clear();
  windows.clear();
}
const opaque = () => randomBytes(32).toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest();
function sameSecret(a: string, b: string) {
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function throttle(kind: string) {
  const now = Date.now(),
    current = windows.get(kind);
  const window =
    !current || now - current.start >= 60_000
      ? { start: now, count: 0 }
      : current;
  if (++window.count > 120) throw new Error("rate_limited");
  windows.set(kind, window);
}
function capCache<T>(cache: Map<string, T>) {
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
}
function validateEndpoint(endpoint: string, config: AuthConfig) {
  const url = new URL(endpoint),
    issuer = new URL(config.issuer);
  if (url.origin !== issuer.origin || url.username || url.password || url.hash)
    throw new Error("invalid_endpoint");
  if (
    url.protocol !== "https:" &&
    !(
      config.allowHttpLocalhost &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("invalid_endpoint");
  return url.href;
}
async function jsonResponse(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  if (
    !response.ok ||
    !/^application\/(?:[a-z0-9._-]+\+)?json(?:\s*;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    !response.body
  )
    throw new Error("provider_response");
  if (Number(response.headers.get("content-length") || 0) > maxBytes)
    throw new Error("provider_response");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error("provider_response");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function getJson(url: string, options: OidcOptions) {
  const response = await (options.fetch ?? fetch)(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return jsonResponse(response);
}
export async function discoverOidc(
  config: AuthConfig,
  options: OidcOptions = {},
): Promise<OidcMetadata> {
  const cached = metadataCache.get(config.issuer);
  if (cached && cached.expires > Date.now()) return cached.value;
  const metadata = metadataSchema.parse(
    await getJson(`${config.issuer}/.well-known/openid-configuration`, options),
  );
  if (
    metadata.issuer !== config.issuer ||
    !metadata.response_types_supported.includes("code") ||
    (metadata.grant_types_supported &&
      !metadata.grant_types_supported.includes("authorization_code")) ||
    (metadata.response_modes_supported &&
      !metadata.response_modes_supported.includes("query")) ||
    !metadata.token_endpoint_auth_methods_supported.includes("none") ||
    !metadata.code_challenge_methods_supported.includes("S256") ||
    !metadata.id_token_signing_alg_values_supported.some((alg) =>
      allowedAlgorithms.includes(alg as (typeof allowedAlgorithms)[number]),
    )
  )
    throw new Error("unsupported_provider");
  for (const endpoint of [
    metadata.authorization_endpoint,
    metadata.token_endpoint,
    metadata.jwks_uri,
  ])
    validateEndpoint(endpoint, config);
  metadataCache.set(config.issuer, {
    expires: Date.now() + CACHE_MS,
    value: metadata,
  });
  capCache(metadataCache);
  return metadata;
}
async function getJwks(
  metadata: OidcMetadata,
  config: AuthConfig,
  options: OidcOptions,
  force = false,
) {
  validateEndpoint(metadata.jwks_uri, config);
  const cached = jwksCache.get(metadata.jwks_uri);
  if (!force && cached && cached.expires > Date.now()) return cached.value;
  const raw = z
    .object({ keys: z.array(z.record(z.string(), z.unknown())).min(1).max(20) })
    .parse(await getJson(metadata.jwks_uri, options));
  if (raw.keys.some((key) => key.d !== undefined || key.k !== undefined))
    throw new Error("invalid_jwks");
  const keys = raw as JSONWebKeySet;
  jwksCache.set(metadata.jwks_uri, {
    expires: Date.now() + CACHE_MS,
    value: keys,
  });
  capCache(jwksCache);
  return keys;
}
export async function verifyIdentityToken(
  idToken: string,
  accessToken: string,
  attempt: LoginAttempt,
  config: AuthConfig,
  metadata: OidcMetadata,
  options: OidcOptions = {},
) {
  const algorithms = allowedAlgorithms.filter((alg) =>
    metadata.id_token_signing_alg_values_supported.includes(alg),
  );
  const verify = async (force = false) =>
    jwtVerify(
      idToken,
      createLocalJWKSet(await getJwks(metadata, config, options, force)),
      {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms,
        requiredClaims: ["iss", "aud", "exp", "iat", "sub", "nonce"],
        clockTolerance: 5,
        maxTokenAge: "10m",
      },
    );
  let verified;
  try {
    verified = await verify();
  } catch (error) {
    if ((error as { code?: string }).code !== "ERR_JWKS_NO_MATCHING_KEY")
      throw error;
    verified = await verify(true);
  }
  const payload = verified.payload;
  const now = Date.now() / 1000;
  if (
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat! > now + 5 ||
    payload.exp! <= payload.iat! ||
    (payload.nbf !== undefined && !Number.isSafeInteger(payload.nbf))
  )
    throw new Error("invalid_token_times");
  if (
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    payload.sub.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(payload.sub)
  )
    throw new Error("invalid_subject");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    (audiences.length > 1 && payload.azp !== config.clientId) ||
    (payload.azp !== undefined && payload.azp !== config.clientId)
  )
    throw new Error("invalid_authorized_party");
  if (
    typeof payload.nonce !== "string" ||
    !sameSecret(payload.nonce, attempt.nonce)
  )
    throw new Error("invalid_nonce");
  if (
    payload.at_hash !== undefined &&
    (typeof payload.at_hash !== "string" ||
      !sameSecret(
        payload.at_hash,
        sha256(accessToken).subarray(0, 16).toString("base64url"),
      ))
  )
    throw new Error("invalid_token_binding");
  const attr = (value: unknown, max: number) =>
    typeof value === "string" &&
    value.trim() &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
      ? value.trim()
      : undefined;
  return {
    issuer: config.issuer,
    subject: payload.sub,
    name: attr(payload.name, 80),
    email: attr(payload.email, 320),
  };
}
function cookieOptions(config: AuthConfig, expiresAt: number) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
    maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  };
}
function clearCookie(response: NextResponse, name: string, config: AuthConfig) {
  response.cookies.set(name, "", { ...cookieOptions(config, 0), maxAge: 0 });
}
function loginFailure(code: string, config?: AuthConfig) {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/login?error=${code}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  if (config) clearCookie(response, transactionCookieName(config), config);
  return response;
}
export async function beginLogin(request: Request, options: OidcOptions = {}) {
  let config: AuthConfig | undefined;
  try {
    config = getRequiredAuthConfig();
    assertTrustedHost(request, config);
    throttle("login");
    await cleanupAuth();
    const query = new URL(request.url).searchParams;
    if (query.getAll("returnTo").length > 1)
      return loginFailure("login_failed", config);
    const returnTo = safeReturnTo(query.get("returnTo") || "/");
    const metadata = await discoverOidc(config, options);
    const state = opaque(),
      nonce = opaque(),
      verifier = opaque(),
      browser = opaque();
    await createLoginTransaction({
      stateHash: hashAuthToken(state, config),
      browserHash: hashAuthToken(browser, config),
      nonce,
      pkceVerifier: verifier,
      returnTo,
      expiresAt: Date.now() + config.transactionTtlMs,
    });
    const target = new URL(metadata.authorization_endpoint);
    target.searchParams.set("client_id", config.clientId);
    target.searchParams.set("response_type", "code");
    target.searchParams.set("scope", "openid profile email");
    target.searchParams.set("redirect_uri", config.callbackUri);
    target.searchParams.set("state", state);
    target.searchParams.set("nonce", nonce);
    target.searchParams.set(
      "code_challenge",
      sha256(verifier).toString("base64url"),
    );
    target.searchParams.set("code_challenge_method", "S256");
    target.searchParams.set("response_mode", "query");
    const response = NextResponse.redirect(target, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(
      transactionCookieName(config),
      browser,
      cookieOptions(config, Date.now() + config.transactionTtlMs),
    );
    return response;
  } catch {
    return loginFailure(
      config ? "provider_unavailable" : "configuration",
      config,
    );
  }
}
export async function finishLogin(request: Request, options: OidcOptions = {}) {
  let config: AuthConfig | undefined;
  try {
    config = getRequiredAuthConfig();
    assertTrustedHost(request, config);
    throttle("callback");
    if (new URL(request.url).pathname !== new URL(config.callbackUri).pathname)
      return loginFailure("login_failed", config);
    const query = new URL(request.url).searchParams;
    const unique = (name: string) =>
      query.getAll(name).length === 1 ? query.get(name) : null;
    const state = unique("state"),
      browser = readCookie(request, transactionCookieName(config));
    if (
      !state ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !browser ||
      !/^[A-Za-z0-9_-]{43}$/.test(browser)
    )
      return loginFailure("login_failed", config);
    const attempt = await consumeLoginTransaction(
      hashAuthToken(state, config),
      hashAuthToken(browser, config),
    );
    if (!attempt) return loginFailure("expired_login", config);
    // Consume before contacting the provider: every response, including errors,
    // is single-use and cannot retry an authorization code under a new identity.
    if (
      query.has("error") ||
      query.has("access_token") ||
      query.has("id_token")
    )
      return loginFailure("login_failed", config);
    const code = unique("code");
    if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code))
      return loginFailure("login_failed", config);
    const metadata = await discoverOidc(config, options);
    const issuerResponse = unique("iss");
    if (
      (query.has("iss") && issuerResponse !== config.issuer) ||
      (metadata.authorization_response_iss_parameter_supported &&
        issuerResponse !== config.issuer)
    )
      return loginFailure("login_failed", config);
    const tokenResponse = await (options.fetch ?? fetch)(
      metadata.token_endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.callbackUri,
          client_id: config.clientId,
          code_verifier: attempt.pkceVerifier,
        }),
      },
    );
    const tokens = z
      .object({
        access_token: z.string().min(1).max(16000),
        token_type: z.string().regex(/^Bearer$/i),
        id_token: z.string().min(20).max(24000),
        expires_in: z.number().positive().finite().optional(),
        scope: z.string().optional(),
      })
      .parse(await jsonResponse(tokenResponse, 48000));
    if (tokens.scope && !tokens.scope.split(/\s+/).includes("openid"))
      throw new Error("invalid_token_scope");
    const identity = await verifyIdentityToken(
      tokens.id_token,
      tokens.access_token,
      attempt,
      config,
      metadata,
      options,
    );
    const profile = await upsertIdentity(identity);
    const token = opaque(),
      expiresAt = Date.now() + config.sessionTtlMs;
    await createSession(profile.id, hashAuthToken(token, config), expiresAt);
    const previous = readCookie(request, sessionCookieName(config));
    if (previous) await revokeSession(hashAuthToken(previous, config));
    const response = NextResponse.redirect(
      new URL(safeReturnTo(attempt.returnTo), config.appOrigin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    clearCookie(response, transactionCookieName(config), config);
    response.cookies.set(
      sessionCookieName(config),
      token,
      cookieOptions(config, expiresAt),
    );
    return response;
  } catch {
    return loginFailure(config ? "login_failed" : "configuration", config);
  }
}
export async function logout(request: Request) {
  if (request.method !== "POST")
    return NextResponse.json(
      { error: "Use POST to sign out." },
      { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
    );
  try {
    const config = getAuthConfig();
    if (!config)
      return NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 503 },
      );
    assertTrustedHost(request, config);
    assertSameOrigin(request, config);
    const token = readCookie(request, sessionCookieName(config));
    if (token) await revokeSession(hashAuthToken(token, config));
    await cleanupAuth();
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: "/login?loggedOut=1", "Cache-Control": "no-store" },
    });
    clearCookie(response, sessionCookieName(config), config);
    clearCookie(response, transactionCookieName(config), config);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Sign out could not be completed. Reload and try again." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
