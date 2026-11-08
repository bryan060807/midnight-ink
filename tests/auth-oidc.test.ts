import { configureTestDatabase, type TestDatabase } from './fixtures/database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { startMockOidc, type MockFault, type MockIssuer, } from "./fixtures/mock-oidc";
import { beginLogin, finishLogin, logout, resetOidcCaches, } from "../src/lib/oidc";
import { closeDatabase, getDatabase } from "../src/lib/db";
import { getRequiredAuthConfig, hashAuthToken, safeReturnTo, sessionCookieName, transactionCookieName, } from "../src/lib/auth-config";
import { findSession } from "../src/lib/auth-store";
import { requireWorkspace } from "../src/lib/auth";
let fixture: TestDatabase;
const appOrigin = "http://localhost:3101";
let mock: MockIssuer, directory: string;
const testSecret = randomBytes(48).toString("base64url");
function appRequest(url: string, options: RequestInit = {}) {
    return new Request(new URL(url, appOrigin), {
        ...options,
        headers: {
            host: "localhost:3101",
            ...(options.method && options.method !== "GET"
                ? { origin: appOrigin }
                : {}),
            ...options.headers,
        },
    });
}
function cookie(response: Response, name: string) {
    const value = response.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${name}=`) && !item.includes("Max-Age=0"));
    return value?.split(";")[0] ?? "";
}
async function attempt(user = "alice", returnTo = "/practice") {
    const config = getRequiredAuthConfig();
    const started = await beginLogin(appRequest(`/auth/aibry-id/login?returnTo=${encodeURIComponent(returnTo)}`));
    expect(started.status).toBeGreaterThanOrEqual(300);
    expect(started.status).toBeLessThan(400);
    const authorization = new URL(started.headers.get("location")!);
    expect(authorization.origin).toBe(mock.issuer);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("nonce")).toBeTruthy();
    authorization.searchParams.set("mock_user", user);
    const provider = await fetch(authorization, { redirect: "manual" });
    expect(provider.status).toBe(302);
    return {
        authorization,
        callback: new URL(provider.headers.get("location")!),
        browserCookie: cookie(started, transactionCookieName(config)),
        started,
    };
}
async function completed(user = "alice") {
    const login = await attempt(user);
    const response = await finishLogin(appRequest(login.callback.toString(), {
        headers: { cookie: login.browserCookie },
    }));
    return {
        login,
        response,
        cookie: cookie(response, sessionCookieName(getRequiredAuthConfig())),
    };
}
async function rejected(response: Response) {
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = new URL(response.headers.get("location")!, appOrigin);
    expect(location.origin).toBe(appOrigin);
    expect(location.pathname).toBe("/login");
    expect(cookie(response, sessionCookieName(getRequiredAuthConfig()))).toBe("");
    expect((await getDatabase().query("SELECT \"tokenHash\" FROM \"AppSession\" WHERE \"revokedAt\" IS NULL", [])).rows).toHaveLength(0);
}
beforeAll(async () => {
    mock = await startMockOidc({
        callbackUri: `${appOrigin}/auth/aibry-id/callback`,
    });
});
afterAll(async () => {
    await mock.close();
});
beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "midnight-oidc-test-"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LOCAL_DEMO_ENABLED", "false");
    fixture = await configureTestDatabase();
    vi.stubEnv("MIDNIGHT_INK_DATA_DIR", directory);
    vi.stubEnv("AIBRY_ID_ISSUER", mock.issuer);
    vi.stubEnv("AIBRY_ID_CLIENT_ID", mock.clientId);
    vi.stubEnv("APP_ORIGIN", appOrigin);
    vi.stubEnv("SESSION_SECRET", testSecret);
    vi.stubEnv("AIBRY_ID_ALLOW_HTTP_LOCALHOST", "true");
    mock.behavior.fault = "none";
    mock.behavior.discoveryFault = undefined;
    await closeDatabase();
    resetOidcCaches();
});
afterEach(async () => {
    await fixture?.cleanup();
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
});
describe("real code-flow protocol against an isolated generated-key OIDC issuer", () => {
    it("verifies PKCE, state, nonce, signed claims and creates an opaque persistent session", async () => {
        const { response, cookie: sessionCookie } = await completed();
        expect(new URL(response.headers.get("location")!, appOrigin).pathname).toBe("/practice");
        expect(sessionCookie).toMatch(/^mi_session=[A-Za-z0-9_-]{32,}$/);
        const setCookie = response.headers
            .getSetCookie()
            .find((c) => c.startsWith("mi_session="))!;
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toMatch(/SameSite=Lax/i);
        expect(setCookie).toContain("Path=/");
        expect(setCookie).toMatch(/Expires=|Max-Age=/i);
        expect(setCookie).not.toContain("Domain=");
        const raw = sessionCookie.slice(sessionCookie.indexOf("=") + 1);
        const stored = (await getDatabase().query("SELECT * FROM \"AppSession\"", [])).rows;
        expect(stored).toHaveLength(1);
        expect(JSON.stringify(stored)).not.toContain(raw);
        expect(stored[0].tokenHash).toBe(hashAuthToken(raw, getRequiredAuthConfig()));
        const owner = await requireWorkspace(appRequest("/api/workspace", { headers: { cookie: sessionCookie } }));
        expect(owner).not.toBe("local-demo");
        expect((await getDatabase().query("SELECT * FROM \"OidcIdentity\" WHERE \"profileId\"=$1", [owner])).rows[0]).toMatchObject({ issuer: mock.issuer, subject: "mock-alice" });
        expect((await getDatabase().query("SELECT id FROM \"Equipment\" WHERE \"profileId\"=$1", [owner])).rows).toHaveLength(0);
        await closeDatabase();
        expect(await requireWorkspace(appRequest("/api/workspace", { headers: { cookie: sessionCookie } }))).toBe(owner);
        expect(mock.counters.token).toBeGreaterThan(0);
    });
    it("maps immutable issuer/subject rather than merging equal mutable email addresses", async () => {
        const alice = await completed("alice"), bob = await completed("bob"), aliceAgain = await completed("alice");
        const owner = async (c: string) => await requireWorkspace(appRequest("/api/workspace", { headers: { cookie: c } }));
        expect(await owner(alice.cookie)).not.toBe(await owner(bob.cookie));
        expect(await owner(alice.cookie)).toBe(await owner(aliceAgain.cookie));
        expect((await getDatabase().query("SELECT subject FROM \"OidcIdentity\"", [])).rows).toHaveLength(2);
    });
    it("binds temporary transactions to the browser cookie and rejects an absent binding", async () => {
        const login = await attempt();
        await rejected(await finishLogin(appRequest(login.callback.toString())));
    });
    it("rejects an incorrect state without redeeming the authorization code", async () => {
        const login = await attempt(), count = mock.counters.token;
        login.callback.searchParams.set("state", randomBytes(32).toString("base64url"));
        await rejected(await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        })));
        expect(mock.counters.token).toBe(count);
    });
    it("consumes state once and rejects callback replay", async () => {
        const done = await completed();
        const count = mock.counters.token;
        const replay = await finishLogin(appRequest(done.login.callback.toString(), {
            headers: { cookie: done.login.browserCookie },
        }));
        expect(new URL(replay.headers.get("location")!, appOrigin).pathname).toBe("/login");
        expect(mock.counters.token).toBe(count);
        expect((await getDatabase().query("SELECT \"tokenHash\" FROM \"AppSession\"", [])).rows).toHaveLength(1);
    });
    it("rejects expired login attempts before exchanging a code", async () => {
        const login = await attempt(), count = mock.counters.token;
        (await getDatabase().query("UPDATE \"LoginTransaction\" SET \"createdAt\"=$1, \"expiresAt\"=$2", [Date.now() - 10000, Date.now() - 1]));
        await rejected(await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        })));
        expect(mock.counters.token).toBe(count);
    });
    it("fails a real S256 exchange when the stored verifier does not match the authorization challenge", async () => {
        const login = await attempt(), rejectedBefore = mock.counters.rejectedPkce;
        (await getDatabase().query("UPDATE \"LoginTransaction\" SET \"pkceVerifier\"=$1", [randomBytes(32).toString("base64url")]));
        await rejected(await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        })));
        expect(mock.counters.rejectedPkce).toBe(rejectedBefore + 1);
    });
    it("handles provider authorization errors without leaking descriptions or creating sessions", async () => {
        const login = await attempt();
        login.callback.searchParams.delete("code");
        login.callback.searchParams.set("error", "access_denied");
        login.callback.searchParams.set("error_description", "private-provider-debug-token");
        const response = await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        }));
        await rejected(response);
        expect(response.headers.get("location")).not.toContain("private-provider-debug-token");
    });
    it("rejects an issuer parameter that differs from discovery", async () => {
        const login = await attempt();
        login.callback.searchParams.set("iss", "https://another-issuer.invalid");
        await rejected(await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        })));
    });
    it.each<MockFault>([
        "nonce",
        "signature",
        "issuer",
        "audience",
        "expired",
        "algorithm",
        "subject",
        "future-iat",
        "future-nbf",
        "missing-iat",
        "missing-exp",
        "azp",
        "multi-audience",
        "pkce",
        "at-hash",
        "missing-access-token",
        "wrong-token-type",
    ])("rejects invalid %s token/exchange behavior", async (fault) => {
        const login = await attempt();
        mock.behavior.fault = fault;
        await rejected(await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        })));
        expect((await getDatabase().query("SELECT * FROM \"LoginTransaction\"", [])).rows).toHaveLength(0);
        if (fault === "pkce")
            expect(mock.counters.rejectedPkce).toBeGreaterThan(0);
    });
    it.each(["issuer", "endpoint", "pkce", "public-client"] as const)("refuses incompatible discovery: %s", async (fault) => {
        mock.behavior.discoveryFault = fault;
        const response = await beginLogin(appRequest("/auth/aibry-id/login"));
        await rejected(response);
    });
});
describe("session lifecycle, mutation trust and local destinations", () => {
    it("revokes server-side access on same-origin POST logout and clears the cookie", async () => {
        const done = await completed(), config = getRequiredAuthConfig(), raw = done.cookie.split("=")[1];
        const response = await logout(appRequest("/auth/logout", {
            method: "POST",
            headers: { cookie: done.cookie },
        }));
        expect(response.headers
            .getSetCookie()
            .some((c) => c.startsWith("mi_session=") &&
            /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true);
        expect(await findSession(hashAuthToken(raw, config))).toBeNull();
        await expect(requireWorkspace(appRequest("/api/workspace", { headers: { cookie: done.cookie } }))).rejects.toThrow();
    });
    it("rejects expired application sessions and never falls into the demo identity", async () => {
        const done = await completed();
        (await getDatabase().query("UPDATE \"AppSession\" SET \"createdAt\"=$1, \"expiresAt\"=$2", [Date.now() - 10000, Date.now() - 1]));
        vi.stubEnv("LOCAL_DEMO_ENABLED", "true");
        await expect(requireWorkspace(appRequest("/api/workspace", { headers: { cookie: done.cookie } }))).rejects.toThrow();
    });
    it("does not reuse a session when the configured trusted issuer changes", async () => {
        const done = await completed();
        vi.stubEnv("AIBRY_ID_ISSUER", "https://id.aibrylabs.com");
        await expect(requireWorkspace(appRequest("/api/workspace", { headers: { cookie: done.cookie } }))).rejects.toThrow("no longer available");
    });
    it("rejects cross-origin logout without revoking a valid session", async () => {
        const done = await completed();
        const response = await logout(appRequest("/auth/logout", {
            method: "POST",
            headers: { cookie: done.cookie, origin: "https://attacker.invalid" },
        }));
        expect(response.status).toBe(403);
        expect(await requireWorkspace(appRequest("/api/workspace", { headers: { cookie: done.cookie } }))).toBeTruthy();
    });
    it("does not trust forwarded hosts to bypass the canonical host", async () => {
        const done = await completed();
        await expect(requireWorkspace(appRequest("/api/workspace", {
            headers: {
                cookie: done.cookie,
                host: "attacker.invalid",
                "x-forwarded-host": "localhost:3101",
            },
        }))).rejects.toThrow();
    });
    it.each([
        "https://attacker.invalid",
        "//attacker.invalid",
        "/%2f%2fattacker.invalid",
        "/\\attacker.invalid",
        "/auth/logout",
        "/login",
        "/api/export",
        "/%0d%0aLocation:bad",
    ])("rejects unsafe return destination %s", (value) => {
        expect(safeReturnTo(value)).toBe("/");
    });
    it("allows a local learning destination and preserves it through successful login", async () => {
        expect(safeReturnTo("/learn?lesson=machine-motion")).toBe("/learn?lesson=machine-motion");
        const login = await attempt("alice", "/learn?lesson=machine-motion");
        const response = await finishLogin(appRequest(login.callback.toString(), {
            headers: { cookie: login.browserCookie },
        }));
        const destination = new URL(response.headers.get("location")!, appOrigin);
        expect(destination.pathname + destination.search).toBe("/learn?lesson=machine-motion");
    });
});
