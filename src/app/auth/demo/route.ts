import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import {
  getAuthConfig,
  isLoopback,
  readCookie,
  sessionCookieName,
  hashAuthToken,
  safeReturnTo,
} from "@/lib/auth-config";
import { revokeSession } from "@/lib/auth-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  try {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.LOCAL_DEMO_ENABLED === "false"
    )
      throw new ApiError(403, "The local demo workspace is disabled.");
    const url = new URL(request.url);
    const authority = request.headers.get("host") || url.host;
    const host = new URL(`${url.protocol}//${authority}`);
    if (
      !isLoopback(host.hostname) ||
      host.username ||
      host.password ||
      host.pathname !== "/" ||
      host.search ||
      host.hash
    )
      throw new ApiError(
        403,
        "The local demo workspace is available on localhost only.",
      );
    if (
      request.headers.get("origin") !== host.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new ApiError(403, "Cross-origin changes are not allowed.");
    const config = getAuthConfig();
    const token = config
      ? readCookie(request, sessionCookieName(config))
      : null;
    if (token && config) revokeSession(hashAuthToken(token, config));
    let returnTo = "/";
    if (
      request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    ) {
      if (Number(request.headers.get("content-length") || 0) > 4096)
        throw new ApiError(413, "The request is too large.");
      if (request.body) {
        const reader = request.body.getReader();
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 4096)
              throw new ApiError(413, "The request is too large.");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
        returnTo = safeReturnTo(
          new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get(
            "returnTo",
          ),
        );
      }
    }
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: returnTo, "Cache-Control": "no-store" },
    });
    for (const name of [
      "mi_session",
      "mi_login",
      "__Host-mi_session",
      "__Host-mi_login",
    ])
      response.cookies.set(name, "", {
        httpOnly: true,
        secure: name.startsWith("__Host-"),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    return response;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "The local demo could not be opened.",
      },
      {
        status: error instanceof ApiError ? error.status : 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
