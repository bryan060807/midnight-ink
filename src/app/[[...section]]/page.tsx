import StudioApp from "@/components/studio-app";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireWorkspace, ApiError } from "@/lib/auth";
import { getAuthConfig, safeReturnTo } from "@/lib/auth-config";
export const dynamic = "force-dynamic";
const destinations = [
  "learn",
  "practice",
  "coach",
  "design",
  "equipment",
  "progress",
  "library",
  "settings",
];
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (section && (section.length !== 1 || !destinations.includes(section[0])))
    notFound();
  const incoming = await headers();
  const pathname = section?.length ? `/${section[0]}` : "/";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value))
      for (const item of value) query.append(key, item);
  }
  const destination = safeReturnTo(pathname + (query.size ? `?${query}` : ""));
  let origin = "http://localhost";
  try {
    origin = getAuthConfig()?.appOrigin || origin;
  } catch {
    /* login explains incomplete configuration */
  }
  try {
    requireWorkspace(
      new Request(`${origin}${destination}`, { headers: incoming }),
    );
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const hadSession = /(?:^|;\s*)(?:__Host-mi_session|mi_session)=/.test(
      incoming.get("cookie") || "",
    );
    const reason =
      error.status === 503
        ? "configuration"
        : error.status === 403
          ? "denied"
          : hadSession
            ? "session_expired"
            : null;
    redirect(
      `/login?returnTo=${encodeURIComponent(destination)}${reason ? `&error=${reason}` : ""}`,
    );
  }
  return <StudioApp section={section?.[0] || "dashboard"} />;
}
