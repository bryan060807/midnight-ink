import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  assertSameOrigin,
  getAuthConfig,
  getRequiredAuthConfig,
  readCookie,
  sessionCookieName,
  transactionCookieName,
} from "../src/lib/auth-config";
beforeEach(() => {
  for (const name of [
    "AIBRY_ID_ISSUER",
    "AIBRY_ID_CLIENT_ID",
    "APP_ORIGIN",
    "SESSION_SECRET",
    "AIBRY_ID_ALLOW_HTTP_LOCALHOST",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());
function configure(origin = "http://localhost:3101") {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("AIBRY_ID_CLIENT_ID", "midnight-ink-public-web");
  vi.stubEnv("SESSION_SECRET", randomBytes(48).toString("base64url"));
}
describe("authentication configuration boundary", () => {
  it("leaves the local demo independent but refuses a partially configured identity client", () => {
    expect(getAuthConfig()).toBeNull();
    vi.stubEnv("AIBRY_ID_CLIENT_ID", "midnight-ink-public-web");
    expect(() => getAuthConfig()).toThrow("incomplete");
  });
  it("requires a stable server secret and an exact origin rather than a callback URL", () => {
    configure();
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => getAuthConfig()).toThrow();
    configure("http://localhost:3101/auth/aibry-id/callback");
    expect(() => getAuthConfig()).toThrow("exact origin");
  });
  it("never accepts a mock or obsolete issuer or HTTP origin in production", () => {
    configure("https://midnight-ink.aibrylabs.com");
    vi.stubEnv("NODE_ENV", "production");
    expect(getRequiredAuthConfig().issuer).toBe("https://id.aibrylabs.com");
    expect(sessionCookieName(getRequiredAuthConfig())).toBe(
      "__Host-mi_session",
    );
    expect(transactionCookieName(getRequiredAuthConfig())).toBe(
      "__Host-mi_login",
    );
    vi.stubEnv("AIBRY_ID_ALLOW_HTTP_LOCALHOST", "true");
    vi.stubEnv("AIBRY_ID_ISSUER", "http://localhost:3211");
    expect(() => getAuthConfig()).toThrow();
    vi.stubEnv("AIBRY_ID_ISSUER", "https://aibry.shop");
    expect(() => getAuthConfig()).toThrow();
    vi.stubEnv("AIBRY_ID_ISSUER", "https://id.aibrylabs.com");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3101");
    expect(() => getAuthConfig()).toThrow("HTTPS");
  });
  it("requires an exact non-null Origin on authenticated writes even behind forwarded headers", () => {
    configure();
    const config = getRequiredAuthConfig();
    for (const origin of [
      undefined,
      "null",
      "http://localhost:9999",
      "https://attacker.invalid",
    ]) {
      const headers: Record<string, string> = {
        host: "localhost:3101",
        "x-forwarded-host": "localhost:3101",
        "x-forwarded-proto": "https",
      };
      if (origin) headers.origin = origin;
      expect(() =>
        assertSameOrigin(
          new Request("http://internal:3000/api/profile", {
            method: "PATCH",
            headers,
          }),
          config,
        ),
      ).toThrow("Cross-origin");
    }
    expect(() =>
      assertSameOrigin(
        new Request("http://internal:3000/api/profile", {
          method: "PATCH",
          headers: { host: "localhost:3101", origin: config.appOrigin },
        }),
        config,
      ),
    ).not.toThrow();
  });
  it("rejects duplicate or malformed session cookies instead of choosing a client-supplied identity", () => {
    const token = randomBytes(32).toString("base64url");
    expect(
      readCookie(
        new Request("http://localhost", {
          headers: { cookie: `mi_session=${token}; mi_session=${token}` },
        }),
        "mi_session",
      ),
    ).toBeNull();
    expect(
      readCookie(
        new Request("http://localhost", {
          headers: { cookie: "mi_session=not-a-token" },
        }),
        "mi_session",
      ),
    ).toBeNull();
  });
});
