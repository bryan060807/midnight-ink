import { finishLogin } from "@/lib/oidc";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return finishLogin(request);
}
