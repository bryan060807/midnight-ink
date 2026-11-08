/** Deliberately local, generated-key OIDC fixture. Never deploy this test identity provider. */
import { createServer, type ServerResponse } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

export type MockFault =
  | "none"
  | "nonce"
  | "signature"
  | "issuer"
  | "audience"
  | "expired"
  | "algorithm"
  | "subject"
  | "future-iat"
  | "future-nbf"
  | "missing-iat"
  | "missing-exp"
  | "azp"
  | "multi-audience"
  | "pkce"
  | "at-hash"
  | "missing-access-token"
  | "wrong-token-type";
interface Code {
  verifierChallenge: string;
  nonce: string;
  redirectUri: string;
  clientId: string;
  subject: string;
}
export interface MockIssuer {
  issuer: string;
  clientId: string;
  jwk: JWK;
  behavior: {
    fault: MockFault;
    discoveryFault?: "issuer" | "endpoint" | "pkce" | "public-client";
    delayMs?: number;
  };
  counters: {
    authorization: number;
    token: number;
    discovery: number;
    jwks: number;
    rejectedPkce: number;
  };
  close: () => Promise<void>;
}
const equal = (a: string, b: string) => {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const json = (response: ServerResponse, data: unknown, status = 200) => {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(data));
};

export async function startMockOidc(
  options: {
    port?: number;
    clientId?: string;
    callbackUri?: string;
    host?: string;
  } = {},
): Promise<MockIssuer> {
  const host = options.host ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("The mocked OIDC issuer is loopback-only.");
  const clientId = options.clientId ?? "midnight-ink-public-web";
  const keys = await generateKeyPair("RS256", { extractable: true });
  const otherKeys = await generateKeyPair("RS256", { extractable: true });
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "mock-rsa-key",
    use: "sig",
    alg: "RS256",
  };
  const codes = new Map<string, Code>();
  const behavior: MockIssuer["behavior"] = { fault: "none" };
  const counters = {
    authorization: 0,
    token: 0,
    discovery: 0,
    jwks: 0,
    rejectedPkce: 0,
  };
  let issuer = "";
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", issuer);
      if (url.pathname === "/.well-known/openid-configuration") {
        counters.discovery++;
        return json(response, {
          issuer:
            behavior.discoveryFault === "issuer" ? `${issuer}/wrong` : issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri:
            behavior.discoveryFault === "endpoint"
              ? "https://untrusted.invalid/jwks"
              : `${issuer}/jwks`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported:
            behavior.discoveryFault === "pkce" ? ["plain"] : ["S256"],
          token_endpoint_auth_methods_supported:
            behavior.discoveryFault === "public-client"
              ? ["client_secret_basic"]
              : ["none"],
        });
      }
      if (url.pathname === "/jwks") {
        counters.jwks++;
        response.writeHead(200, {
          "content-type": "application/jwk-set+json",
          "cache-control": "no-store",
        });
        return response.end(JSON.stringify({ keys: [jwk] }));
      }
      if (url.pathname === "/health")
        return json(response, { status: "test-only", issuer });
      if (url.pathname === "/authorize") {
        counters.authorization++;
        const query = url.searchParams;
        const redirectUri = query.get("redirect_uri") ?? "";
        const registered = options.callbackUri;
        if (
          query.get("client_id") !== clientId ||
          (registered && redirectUri !== registered) ||
          query.get("response_type") !== "code" ||
          query.get("code_challenge_method") !== "S256" ||
          !query.get("code_challenge") ||
          !query.get("nonce") ||
          !query.get("state") ||
          !(query.get("scope") ?? "").split(" ").includes("openid")
        )
          return json(response, { error: "invalid_request" }, 400);
        if (
          !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/auth\/aibry-id\/callback$/.test(
            redirectUri,
          )
        )
          return json(response, { error: "invalid_redirect_uri" }, 400);
        const user = query.get("mock_user");
        if (user !== "alice" && user !== "bob") {
          // The fixture provides an explicit identity choice instead of pretending to authenticate a real user.
          const href = (name: string) => {
            const next = new URL(url);
            next.searchParams.set("mock_user", name);
            return (
              next.pathname +
              next.search.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
            );
          };
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
          return response.end(
            `<!doctype html><html lang="en"><head><title>Mock AIBRY ID · Test only</title></head><body><h1>Mock AIBRY ID</h1><p>Generated test identities. This is not the real AIBRY ID.</p><p><a href="${href("alice")}">Sign in as Alice</a></p><p><a href="${href("bob")}">Sign in as Bob</a></p></body></html>`,
          );
        }
        const code = randomBytes(24).toString("base64url");
        codes.set(code, {
          verifierChallenge: query.get("code_challenge")!,
          nonce: query.get("nonce")!,
          redirectUri,
          clientId,
          subject: `mock-${user}`,
        });
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", query.get("state")!);
        callback.searchParams.set("iss", issuer);
        response.writeHead(302, {
          location: callback.toString(),
          "cache-control": "no-store",
        });
        return response.end();
      }
      if (url.pathname === "/token" && request.method === "POST") {
        counters.token++;
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 16_384)
            return json(response, { error: "invalid_request" }, 413);
        }
        const query = new URLSearchParams(body),
          code = codes.get(query.get("code") ?? "");
        codes.delete(query.get("code") ?? "");
        if (
          !code ||
          query.get("grant_type") !== "authorization_code" ||
          query.get("client_id") !== code.clientId ||
          query.get("redirect_uri") !== code.redirectUri
        )
          return json(response, { error: "invalid_grant" }, 400);
        const challenge = createHash("sha256")
          .update(query.get("code_verifier") ?? "")
          .digest("base64url");
        if (
          !equal(challenge, code.verifierChallenge) ||
          behavior.fault === "pkce"
        ) {
          counters.rejectedPkce++;
          return json(response, { error: "invalid_grant" }, 400);
        }
        if (behavior.delayMs)
          await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
        const now = Math.floor(Date.now() / 1000),
          fault = behavior.fault;
        const access = randomBytes(32).toString("base64url");
        const claims: Record<string, unknown> = {
          iss: fault === "issuer" ? "https://another-issuer.invalid" : issuer,
          aud:
            fault === "audience"
              ? "another-client"
              : fault === "multi-audience" || fault === "azp"
                ? [clientId, "another-client"]
                : clientId,
          sub: code.subject,
          nonce: fault === "nonce" ? "unbound-nonce" : code.nonce,
          iat: fault === "future-iat" ? now + 600 : now,
          exp: fault === "expired" ? now - 60 : now + 300,
          nbf: fault === "future-nbf" ? now + 600 : now - 1,
          name: code.subject === "mock-alice" ? "Alice Artist" : "Bob Artist",
          email: "mutable-address@example.test",
          email_verified: true,
          at_hash:
            fault === "at-hash"
              ? "incorrect-access-token-hash"
              : createHash("sha256")
                  .update(access)
                  .digest()
                  .subarray(0, 16)
                  .toString("base64url"),
        };
        if (fault === "subject") delete claims.sub;
        if (fault === "missing-iat") delete claims.iat;
        if (fault === "missing-exp") delete claims.exp;
        if (fault === "azp") claims.azp = "another-client";
        const token = new SignJWT(claims);
        const idToken =
          fault === "algorithm"
            ? await token
                .setProtectedHeader({ alg: "HS256", kid: "mock-rsa-key" })
                .sign(
                  Buffer.from("a-test-only-shared-key-with-at-least-32-bytes"),
                )
            : await token
                .setProtectedHeader({ alg: "RS256", kid: "mock-rsa-key" })
                .sign(
                  fault === "signature"
                    ? otherKeys.privateKey
                    : keys.privateKey,
                );
        return json(response, {
          access_token: fault === "missing-access-token" ? undefined : access,
          id_token: idToken,
          token_type: fault === "wrong-token-type" ? "MAC" : "Bearer",
          expires_in: 300,
        });
      }
      return json(response, { error: "not_found" }, 404);
    } catch {
      if (!response.headersSent)
        json(response, { error: "mock_provider_error" }, 500);
      else response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing mock issuer address.");
  issuer = `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`;
  return {
    issuer,
    clientId,
    jwk,
    behavior,
    counters,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
