import Link from "next/link";
import { ArrowRight, Feather, LockKeyhole, ShieldCheck } from "lucide-react";

type Props = {
  loginAvailable: boolean;
  demoAvailable: boolean;
  returnTo: string;
  message?: "expired" | "callback" | "denied" | "signed-out" | "unconfigured";
};
const notices = {
  expired: {
    title: "Your studio session has ended.",
    text: "Sign in again to return to your private workspace. Your saved practice is still there.",
  },
  callback: {
    title: "We couldn’t complete that sign-in.",
    text: "The request may have expired or could not be verified. Start a new sign-in attempt.",
  },
  denied: {
    title: "Sign-in was not completed.",
    text: "No studio session was created. You can try again whenever you are ready.",
  },
  "signed-out": {
    title: "You’re signed out of Midnight Ink.",
    text: "This studio session has been revoked. Your saved work remains private. Your AIBRY ID provider session may still be active.",
  },
  unconfigured: {
    title: "Sign-in is awaiting operator configuration.",
    text: "AIBRY ID settings and an approved client registration are required before this studio can accept a sign-in.",
  },
};

export default function LoginScreen({
  loginAvailable,
  demoAvailable,
  returnTo,
  message,
}: Props) {
  const notice = message ? notices[message] : undefined;
  return (
    <main className="auth-login-shell">
      <div className="auth-login-brand">
        <span className="brand-glyph" aria-hidden="true">
          ✦
        </span>
        <div className="brand-name">
          MIDNIGHT INK<span>AN AIBRY LABS STUDIO</span>
        </div>
      </div>
      <div className="auth-login-layout">
        <section className="auth-login-story" aria-label="About your studio">
          <div className="eyebrow">LEARN THE CRAFT. EARN THE CONFIDENCE.</div>
          <h1>
            A private space.
            <br />A deliberate practice.
          </h1>
          <p>
            Keep your lessons, designs, and practice together in a studio that
            belongs to you.
          </p>
          <img
            className="auth-login-art"
            src="/ink-rose.svg"
            alt="Original fine-line botanical rose illustration"
          />
          <div className="auth-login-principle">
            <Feather size={19} />
            <span>
              One considered line. One small improvement. A practice worth
              returning to.
            </span>
          </div>
        </section>
        <section
          className="panel auth-login-panel"
          aria-labelledby="login-heading"
        >
          <div className="auth-login-lock">
            <LockKeyhole size={24} />
          </div>
          <div className="eyebrow">YOUR MIDNIGHT INK WORKSPACE</div>
          <h2 id="login-heading">Welcome to the studio.</h2>
          <p className="muted">
            Use your AIBRY ID to open your personal learning workspace.
          </p>
          {notice && (
            <div className="auth-login-notice" role="status">
              <strong>{notice.title}</strong>
              <p>{notice.text}</p>
            </div>
          )}
          {loginAvailable ? (
            <a
              className="btn btn-primary auth-login-button"
              href={`/auth/aibry-id/login?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Continue with AIBRY ID <ArrowRight size={16} />
            </a>
          ) : (
            <div className="auth-unconfigured">
              <p>
                Secure sign-in is not available until the operator completes the
                identity configuration.
              </p>
              <p className="note-caption">
                No personal workspace data is available anonymously.
              </p>
            </div>
          )}
          <div className="auth-login-privacy">
            <ShieldCheck size={18} />
            <p>
              Authentication happens with AIBRY ID. Midnight Ink creates a
              private, revocable session and never asks for your AIBRY ID
              password.
            </p>
          </div>
          {demoAvailable && (
            <div className="auth-login-demo">
              <span className="chip">DEVELOPMENT ONLY · LOOPBACK</span>
              <p>
                The local demo is a separate workspace. Its records are never
                assigned to a signed-in account automatically.
              </p>
              <form action="/auth/demo" method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="btn btn-ghost" type="submit">
                  Continue in local demo <ArrowRight size={14} />
                </button>
              </form>
            </div>
          )}
          <p className="auth-login-safety">
            Paper and synthetic-skin learning. Progress is never professional
            certification.
          </p>
        </section>
      </div>
      <footer className="auth-login-footer">
        <span>✦ MIDNIGHT INK · AIBRY LABS</span>
        <Link href="/login">A careful craft starts with trust.</Link>
      </footer>
    </main>
  );
}
