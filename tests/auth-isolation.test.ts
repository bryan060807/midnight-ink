import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { GET, POST, PATCH, DELETE } from "../src/app/api/[...path]/route";
import { POST as coachPost } from "../src/app/api/coach/route";
import {
  closeDatabase,
  createRecord,
  getDatabase,
  getWorkspace,
} from "../src/lib/db";
import { createSession, upsertIdentity } from "../src/lib/auth-store";
import {
  getRequiredAuthConfig,
  hashAuthToken,
  sessionCookieName,
} from "../src/lib/auth-config";
import { savePhoto } from "../src/lib/uploads";
import { exercises, lessons } from "../src/lib/curriculum";
import { newDocument } from "../src/lib/design";

const origin = "http://localhost:3101";
const handlers = { GET, POST, PATCH, DELETE };
let directory: string,
  alice: { id: string; cookie: string },
  bob: { id: string; cookie: string };
function request(
  route: string,
  method: string,
  cookie?: string,
  input?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`${origin}${route}`, {
    method,
    headers: {
      host: "localhost:3101",
      ...(cookie ? { cookie } : {}),
      ...(method !== "GET" ? { origin } : {}),
      ...(input !== undefined ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
}
async function api(
  method: keyof typeof handlers,
  route: string,
  user?: { cookie: string },
  input?: unknown,
  extra: Record<string, string> = {},
) {
  const resource = route.split("?")[0];
  return handlers[method](
    request(`/api/${route}`, method, user?.cookie, input, extra),
    { params: Promise.resolve({ path: resource.split("/") }) },
  );
}
function identity(subject: string) {
  const profile = upsertIdentity({
    issuer: "https://id.aibrylabs.com",
    subject,
    email: "same-mutable-email@example.test",
    name: subject,
  });
  const config = getRequiredAuthConfig(),
    token = randomBytes(32).toString("base64url");
  createSession(
    String(profile.id),
    hashAuthToken(token, config),
    Date.now() + 3600_000,
  );
  return {
    id: String(profile.id),
    cookie: `${sessionCookieName(config)}=${token}`,
  };
}
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "midnight-isolation-test-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LOCAL_DEMO_ENABLED", "false");
  vi.stubEnv("ROOK_PROVIDER", "offline");
  vi.stubEnv("DATABASE_PATH", path.join(directory, "auth.sqlite"));
  vi.stubEnv("MIDNIGHT_INK_DATA_DIR", directory);
  vi.stubEnv("AIBRY_ID_ISSUER", "https://id.aibrylabs.com");
  vi.stubEnv("AIBRY_ID_CLIENT_ID", "midnight-ink-public-web");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("SESSION_SECRET", randomBytes(48).toString("base64url"));
  closeDatabase();
  alice = identity("alice-subject");
  bob = identity("bob-subject");
});
afterEach(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("server-owned identity across every workspace boundary", () => {
  it("rejects anonymous access and owner-spoofing headers without a session", async () => {
    for (const route of [
      "workspace",
      "export",
      "equipment",
      `photos/${randomBytes(16).toString("hex")}`,
    ])
      expect((await api("GET", route)).status).toBe(401);
    const spoof = await api(
      "GET",
      `workspace?profileId=${alice.id}`,
      undefined,
      undefined,
      {
        "x-profile-id": alice.id,
        "x-user-id": alice.id,
        authorization: `Bearer ${alice.id}`,
      },
    );
    expect(spoof.status).toBe(401);
  });
  it("isolates equipment and rejects client-selected ownership on writes", async () => {
    const response = await api("POST", "equipment", alice, {
      kind: "cartridge",
      name: "Alice cartridge",
      code: "1205M1",
    });
    expect(response.status).toBe(201);
    const item = await response.json();
    expect(
      (await api("PATCH", `equipment/${item.id}`, bob, { name: "Taken" }))
        .status,
    ).toBe(404);
    expect((await api("DELETE", `equipment/${item.id}`, bob)).status).toBe(404);
    expect(
      (
        await api("POST", "equipment", bob, {
          kind: "machine",
          name: "Injected",
          profileId: alice.id,
        })
      ).status,
    ).toBe(400);
    const bobData = await (
      await api("GET", `workspace?profileId=${alice.id}`, bob)
    ).json();
    expect(bobData.equipment).toHaveLength(0);
    expect(bobData.profile.id).toBe(bob.id);
    expect(getWorkspace(alice.id).equipment).toHaveLength(1);
  });
  it("checks practice-session ownership and owned equipment relationships", async () => {
    const equipment = createRecord("Equipment", alice.id, {
      kind: "machine",
      name: "Alice pen",
    });
    expect(
      (
        await api("POST", "sessions", bob, {
          exerciseId: exercises[0].id,
          durationMinutes: 10,
          equipmentIds: [equipment.id],
        })
      ).status,
    ).toBe(404);
    const response = await api("POST", "sessions", alice, {
      exerciseId: exercises[0].id,
      durationMinutes: 10,
      notes: "Alice private notes",
    });
    const session = await response.json();
    expect(response.status).toBe(201);
    expect(
      (await api("PATCH", `sessions/${session.id}`, bob, { notes: "Taken" }))
        .status,
    ).toBe(404);
    expect((await api("DELETE", `sessions/${session.id}`, bob)).status).toBe(
      404,
    );
    expect(getWorkspace(alice.id).sessions[0].notes).toBe(
      "Alice private notes",
    );
  });
  it("isolates uploaded photo downloads, deletion, and parent sessions", async () => {
    const session = createRecord("PracticeSession", alice.id, {
      exerciseId: exercises[0].id,
      durationMinutes: 10,
    });
    const bytes = await sharp({
      create: { width: 30, height: 30, channels: 3, background: "#eeeeee" },
    })
      .png()
      .toBuffer();
    const photo = await savePhoto(
      alice.id,
      String(session.id),
      new File([new Uint8Array(bytes)], "study.png", { type: "image/png" }),
    );
    expect((await api("GET", `photos/${photo.id}`, alice)).status).toBe(200);
    expect((await api("GET", `photos/${photo.id}`, bob)).status).toBe(404);
    expect((await api("DELETE", `photos/${photo.id}`, bob)).status).toBe(404);
    expect(getWorkspace(alice.id).photos).toHaveLength(1);
    expect((await api("DELETE", `sessions/${session.id}`, bob)).status).toBe(
      404,
    );
    expect((await api("GET", `photos/${photo.id}`, alice)).status).toBe(200);
  });
  it("fails closed for inconsistent dependent photo ownership instead of exposing the parent", async () => {
    const session = createRecord("PracticeSession", alice.id, {
      exerciseId: exercises[0].id,
      durationMinutes: 10,
    });
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#dddddd" },
    })
      .png()
      .toBuffer();
    const photo = await savePhoto(
      alice.id,
      String(session.id),
      new File([new Uint8Array(bytes)], "study.png", { type: "image/png" }),
    );
    expect(() =>
      getDatabase()
        .prepare("UPDATE PracticePhoto SET profileId=? WHERE id=?")
        .run(bob.id, photo.id),
    ).toThrow("Photo ownership must match its practice session");
    expect((await api("GET", `photos/${photo.id}`, bob)).status).toBe(404);
    const workspace = await (await api("GET", "workspace", bob)).json();
    expect(workspace.photos).toHaveLength(0);
  });
  it("isolates design documents, goals, learning progress and settings", async () => {
    const design = await (
      await api("POST", "designs", alice, {
        name: "Alice design",
        document: newDocument(),
      })
    ).json();
    expect(
      (await api("PATCH", `designs/${design.id}`, bob, { name: "Taken" }))
        .status,
    ).toBe(404);
    expect((await api("DELETE", `designs/${design.id}`, bob)).status).toBe(404);
    const goal = await (
      await api("POST", "goals", alice, { title: "Alice learning goal" })
    ).json();
    expect(
      (await api("PATCH", `goals/${goal.id}`, bob, { title: "Taken" })).status,
    ).toBe(404);
    expect((await api("DELETE", `goals/${goal.id}`, bob)).status).toBe(404);
    expect(
      (await api("POST", `lessons/${lessons[0].id}/complete`, alice, {}))
        .status,
    ).toBe(200);
    expect(
      (await api("PATCH", "settings", alice, { coachName: "Alice Rook" }))
        .status,
    ).toBe(200);
    const bobData = await (await api("GET", "workspace", bob)).json();
    expect(bobData.designs).toHaveLength(0);
    expect(bobData.goals).toHaveLength(0);
    expect(bobData.lessonProgress).toHaveLength(0);
    expect(bobData.settings.coachName).toBe("Rook");
  });
  it("isolates coaching records, exports and deletion even when another profile is requested", async () => {
    const coached = await coachPost(
      request("/api/coach", "POST", alice.cookie, {
        question: "How do I practice straight lines?",
      }),
    );
    expect(coached.status).toBe(200);
    createRecord("Equipment", alice.id, {
      kind: "machine",
      name: "Alice-only pen",
    });
    createRecord("Equipment", bob.id, {
      kind: "machine",
      name: "Bob-only pen",
    });
    const exported = await (
      await api("GET", `export?profileId=${alice.id}`, bob)
    ).json();
    expect(exported.profile.id).toBe(bob.id);
    expect(exported.coaching).toHaveLength(0);
    expect(JSON.stringify(exported)).not.toContain("Alice-only pen");
    const deletion = await api("DELETE", `data?profileId=${alice.id}`, bob, {
      confirm: "DELETE",
    });
    expect(deletion.status).toBe(200);
    expect(getWorkspace(alice.id).equipment).toHaveLength(1);
    expect(getWorkspace(alice.id).coaching).toHaveLength(1);
    expect(getWorkspace(bob.id).equipment).toHaveLength(0);
    expect(getWorkspace("local-demo").equipment).toHaveLength(3);
  });
  it("requires same-origin proof for cookie-authenticated writes and ignores forwarded origins", async () => {
    for (const extra of [
      { origin: "https://attacker.invalid" },
      { origin: "", "x-forwarded-host": "localhost:3101" },
      { origin, "sec-fetch-site": "cross-site" },
    ] as Array<Record<string, string>>) {
      const response = await api(
        "POST",
        "equipment",
        alice,
        { kind: "machine", name: "Blocked" },
        extra,
      );
      expect(response.status).toBe(403);
    }
    expect(getWorkspace(alice.id).equipment).toHaveLength(0);
  });
  it("accepts a persisted authenticated production session with the configured host and secure cookie name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://midnight-ink.aibrylabs.com");
    const config = getRequiredAuthConfig(),
      token = randomBytes(32).toString("base64url");
    createSession(
      alice.id,
      hashAuthToken(token, config),
      Date.now() + 3600_000,
    );
    expect(sessionCookieName(config)).toBe("__Host-mi_session");
    const response = await GET(
      new Request("http://internal-upstream/api/workspace", {
        headers: {
          host: "midnight-ink.aibrylabs.com",
          cookie: `${sessionCookieName(config)}=${token}`,
        },
      }),
      { params: Promise.resolve({ path: ["workspace"] }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).profile.id).toBe(alice.id);
  });
  it("never grants production access by setting demo flags or identity headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_DEMO_ENABLED", "true");
    expect(
      (
        await api("GET", "workspace", undefined, undefined, {
          "x-profile-id": alice.id,
        })
      ).status,
    ).toBe(503);
  });
});
