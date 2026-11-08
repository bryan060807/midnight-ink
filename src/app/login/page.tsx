import { headers } from "next/headers";
import LoginScreen from "@/components/login-screen";
import { getAuthConfig, safeReturnTo } from "@/lib/auth-config";

export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  let loginAvailable = false;
  try {
    loginAvailable = Boolean(getAuthConfig());
  } catch {
    /* Fail closed; do not disclose configuration details. */
  }
  const incoming = await headers();
  let loopback = false;
  try {
    loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      new URL(`http://${incoming.get("host") || "invalid"}`).hostname,
    );
  } catch {
    /* Invalid Host is never a demo entry. */
  }
  const demoAvailable =
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_DEMO_ENABLED !== "false" &&
    loopback;
  const error = value("error");
  const status = value("status");
  let message:
    | "expired"
    | "callback"
    | "denied"
    | "signed-out"
    | "unconfigured"
    | undefined;
  if (
    status === "signed-out" ||
    error === "signed-out" ||
    value("signedOut") === "1" ||
    value("loggedOut") === "1"
  )
    message = "signed-out";
  else if (
    [
      "expired",
      "session_expired",
      "session_required",
      "expired_login",
    ].includes(error || "")
  )
    message = "expired";
  else if (error === "configuration") message = "unconfigured";
  else if (error === "access_denied" || error === "denied") message = "denied";
  else if (error) message = "callback";
  if (!loginAvailable && !message) message = "unconfigured";
  return (
    <LoginScreen
      loginAvailable={loginAvailable}
      demoAvailable={demoAvailable}
      returnTo={safeReturnTo(value("returnTo"))}
      message={message}
    />
  );
}
