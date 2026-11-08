import Link from "next/link";
import { ShieldCheck } from "lucide-react";
export default function AuthenticationErrorPage() {
  return (
    <main className="initial-loading auth-validation">
      <ShieldCheck size={32} />
      <h1>Sign-in could not be completed.</h1>
      <p className="muted">
        No verified studio session was created. Start a new sign-in attempt to
        continue.
      </p>
      <Link className="btn btn-primary" href="/login?error=callback">
        Return to sign-in
      </Link>
    </main>
  );
}
