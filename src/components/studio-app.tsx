"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Feather,
  Flame,
  GraduationCap,
  House,
  Layers3,
  Library,
  LogOut,
  LockKeyhole,
  UserRound,
  Menu,
  MessageSquare,
  Palette,
  PenLine,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { modules, lessons, exercises, techniqueCards } from "@/lib/curriculum";
import DesignStudio from "./design-studio";
import PracticeStudio from "./practice-studio";
import EquipmentManager from "./equipment-manager";

type AuthSession = {
  authenticated: boolean;
  mode: "demo" | "authenticated" | "anonymous";
  profile: { id: string; name: string } | null;
  identity: {
    issuer: string;
    subject: string;
    email?: string | null;
    name?: string | null;
  } | null;
  expiresAt: number | null;
  loginAvailable: boolean;
  configurationValid: boolean;
  demoImportAvailable?: boolean;
};

function loginDestination(reason = "expired") {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return `/login?error=${encodeURIComponent(reason)}&returnTo=${encodeURIComponent(returnTo)}`;
}

type Workspace = {
  profile: { id: string; name: string; level: string; path: string };
  settings: { coachName: string; goalMinutes: number };
  equipment: any[];
  lessonProgress: any[];
  sessions: any[];
  photos: any[];
  assessments: any[];
  designs: any[];
  goals: any[];
  coaching: any[];
};
const navigation = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: House },
  { id: "learn", label: "Learn", href: "/learn", icon: BookOpen },
  {
    id: "practice",
    label: "Practice Studio",
    href: "/practice",
    icon: PenLine,
  },
  { id: "coach", label: "AI Coach", href: "/coach", icon: MessageSquare },
  { id: "design", label: "Design Studio", href: "/design", icon: Palette },
  { id: "equipment", label: "Equipment", href: "/equipment", icon: Wrench },
  { id: "progress", label: "Progress", href: "/progress", icon: TrendingUp },
  {
    id: "library",
    label: "Reference Library",
    href: "/library",
    icon: Library,
  },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings2 },
];
const pageInfo: Record<string, [string, string]> = {
  dashboard: [
    "Your craft starts here.",
    "A little intention. A little practice. Steady progress.",
  ],
  learn: [
    "Build your foundation.",
    "A considered path from your first line to professional foundations.",
  ],
  practice: [
    "Make every line count.",
    "Deliberate exercises. Honest reflection. Paper and synthetic skin.",
  ],
  coach: [
    "A second set of ideas.",
    "Meet Rook. Practical guidance, grounded in your learning.",
  ],
  design: [
    "From idea to ink.",
    "An open canvas for original flash, drawing, and stencil practice.",
  ],
  equipment: [
    "Know your tools.",
    "Your equipment, your notes. Specifications stay honest.",
  ],
  progress: [
    "Proof of your practice.",
    "A record of the work you have actually put in.",
  ],
  library: [
    "Keep good references.",
    "Original educational cards, with clear sources and boundaries.",
  ],
  settings: [
    "Make this space yours.",
    "Your workspace, learning preferences, and personal data.",
  ],
};
async function mutate(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 401) {
    window.dispatchEvent(new Event("midnight-session-expired"));
    throw new Error("Your session has ended. Sign in again to continue.");
  }
  if (!response.ok)
    throw new Error(result.error || "The change could not be saved.");
  return result;
}
function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function totalMinutes(data: Workspace) {
  return data.sessions.reduce((n, s) => n + s.durationMinutes, 0);
}
function uniqueDays(data: Workspace) {
  return new Set(data.sessions.map((s) => s.createdAt.slice(0, 10))).size;
}
function nextLesson(data: Workspace) {
  const completed = new Set(data.lessonProgress.map((p) => p.lessonId));
  const inPath = lessons.filter((l) => l.moduleId === data.profile.path);
  return (
    inPath.find((l) => !completed.has(l.id)) ||
    lessons.find((l) => !completed.has(l.id)) ||
    lessons[0]
  );
}
function Stats({ data }: { data: Workspace }) {
  const items = [
    {
      icon: BookOpen,
      value: data.lessonProgress.length,
      unit: `/ ${lessons.length}`,
      label: "Lessons completed",
    },
    {
      icon: Clock3,
      value: Math.round(totalMinutes(data)),
      unit: "min",
      label: "Time in practice",
    },
    {
      icon: PenLine,
      value: data.sessions.length,
      unit: "sessions",
      label: "Practice sessions",
    },
    {
      icon: Flame,
      value: uniqueDays(data),
      unit: "days",
      label: "Days with practice",
    },
  ];
  return (
    <div className="grid-4 stats">
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-icon">
            <s.icon size={19} />
          </div>
          <div>
            <div className="stat-value">
              {s.value}
              <small>{s.unit}</small>
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function StudioApp({ section }: { section: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [accessPending, setAccessPending] = useState(true);
  const refreshVersion = useRef(0);
  const currentOwner = useRef<string | null>(null);
  const endSession = useCallback(() => {
    refreshVersion.current += 1;
    currentOwner.current = null;
    setData(null);
    setSession(null);
    window.location.replace(loginDestination());
  }, []);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const auth = (await sessionResponse.json()) as AuthSession & {
        error?: string;
      };
      if (version !== refreshVersion.current) return;
      if (!sessionResponse.ok) {
        setData(null);
        setSession(null);
        throw new Error(
          auth.error ||
            "The sign-in service is not configured. Open the sign-in page for details.",
        );
      }
      if (
        auth.mode === "anonymous" ||
        (!auth.authenticated && auth.mode !== "demo")
      ) {
        endSession();
        return;
      }
      if (currentOwner.current !== auth.profile?.id) {
        setData(null);
        currentOwner.current = auth.profile?.id || null;
      }
      setSession(auth);
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const json = await response.json();
      if (version !== refreshVersion.current) return;
      if (response.status === 401) {
        endSession();
        return;
      }
      if (!response.ok) {
        setData(null);
        throw new Error(
          response.status === 403
            ? "Access to this workspace was denied. Sign in with the correct account or contact the operator."
            : json.error || "The workspace could not be opened.",
        );
      }
      if (auth.profile && json.profile?.id !== auth.profile.id) {
        setData(null);
        throw new Error(
          "The workspace identity could not be confirmed. Sign in again.",
        );
      }
      setData(json);
      setError("");
      setAccessPending(document.visibilityState === "hidden");
    } catch (failure) {
      if (version !== refreshVersion.current) return;
      setData(null);
      setAccessPending(false);
      setError(
        failure instanceof Error
          ? failure.message
          : "The workspace could not be opened. Try again.",
      );
      throw failure;
    }
  }, [endSession]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const validate = () => {
      if (document.visibilityState === "visible") {
        setAccessPending(true);
        refresh().catch((e) => {
          setData(null);
          setError(e.message);
        });
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") {
        refreshVersion.current += 1;
        // Keep unsaved child drafts mounted, but make every private view
        // invisible and inert until the returning tab validates the same owner.
        setAccessPending(true);
      } else validate();
    };
    const expired = () => endSession();
    const interval = window.setInterval(validate, 60_000);
    window.addEventListener("focus", validate);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("midnight-session-expired", expired);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", validate);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("midnight-session-expired", expired);
    };
  }, [refresh, endSession]);
  useEffect(() => {
    if (session?.mode !== "authenticated" || !session.expiresAt) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      endSession();
      return;
    }
    const timer = window.setTimeout(
      endSession,
      Math.min(remaining, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [session, endSession]);
  if (!session)
    return (
      <main className="initial-loading auth-validation" aria-live="polite">
        <div className="brand-glyph">✦</div>
        <h1>
          {error
            ? "Your workspace is protected."
            : "Checking your workspace access…"}
        </h1>
        <p className="muted">
          {error || "Your private records will open after session validation."}
        </p>
        {error && (
          <Link className="btn btn-primary" href="/login">
            Open sign-in <ArrowRight size={15} />
          </Link>
        )}
      </main>
    );
  const current = navigation.find((n) => n.id === section)!;
  const title = pageInfo[section];
  return (
    <>
      <div
        className="shell"
        style={{ visibility: accessPending ? "hidden" : undefined }}
        inert={accessPending || undefined}
        aria-hidden={accessPending || undefined}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="sidebar">
          <Link href="/" className="brand" aria-label="Midnight Ink home">
            <span className="brand-glyph">✦</span>
            <div className="brand-name">
              MIDNIGHT INK<span>AN AIBRY LABS STUDIO</span>
            </div>
          </Link>
          <div className="nav-caption">THE STUDIO</div>
          <nav className="nav" aria-label="Main navigation">
            {navigation.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={section === n.id ? "active" : ""}
                aria-current={section === n.id ? "page" : undefined}
              >
                <n.icon size={17} strokeWidth={1.6} />
                {n.label}
                {section === n.id && <span className="nav-dot" />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="workspace-badge">
              <strong>
                {data?.profile.name ||
                  session.profile?.name ||
                  "Your workspace"}
              </strong>
              <span className="muted">
                <span className="status-dot" />
                {session.mode === "authenticated"
                  ? "Private AIBRY ID workspace"
                  : "Private development workspace"}
              </span>
            </div>
            <div className="sidebar-foot">
              <div className="row">
                <ShieldCheck size={13} />
                Made for mindful practice.
              </div>
              <p style={{ margin: "8px 0 0" }}>
                Learn the craft. Earn the confidence.
              </p>
            </div>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div className="breadcrumb">
              Your workspace <ChevronRight size={12} />
              <strong>{current.label}</strong>
            </div>
            <Link href="/" className="mobile-brand">
              <span className="brand-glyph">✦</span>MIDNIGHT INK
            </Link>
            <div className="topbar-right">
              <span className="local-badge">
                <span
                  style={{
                    width: 5,
                    height: 5,
                    background: "#9aad87",
                    borderRadius: "50%",
                  }}
                />{" "}
                {session.mode === "authenticated" ? "AIBRY ID" : "LOCAL DEMO"}
              </span>
              <details className="auth-account-menu">
                <summary
                  className="avatar"
                  aria-label="Account menu"
                  title="Account menu"
                >
                  {(data?.profile.name || session.profile?.name || "MI")
                    .slice(0, 2)
                    .toUpperCase()}
                </summary>
                <div className="auth-account-popover">
                  <strong>
                    {data?.profile.name ||
                      session.profile?.name ||
                      "Your workspace"}
                  </strong>
                  <small className="muted">
                    {session.mode === "authenticated"
                      ? "Connected through AIBRY ID"
                      : "Local demo identity"}
                  </small>
                  <Link href="/settings">
                    <UserRound size={15} />
                    Account & settings
                  </Link>
                  {session.mode === "authenticated" ? (
                    <form
                      method="post"
                      action="/auth/logout"
                      onSubmit={() => setData(null)}
                    >
                      <button type="submit">
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </form>
                  ) : (
                    session.loginAvailable && (
                      // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth starts with a full document navigation and must not be prefetched.
                      <a href="/auth/aibry-id/login?returnTo=%2F">
                        <LockKeyhole size={15} />
                        Sign in with AIBRY ID
                      </a>
                    )
                  )}
                </div>
              </details>
            </div>
          </header>
          <main
            id="main-content"
            className="content"
            key={session.profile?.id || session.mode}
          >
            <div className="page-heading between">
              <div>
                <div className="eyebrow">
                  {section === "dashboard"
                    ? "WELCOME TO MIDNIGHT INK"
                    : current.label.toUpperCase()}
                </div>
                <h1>{title[0]}</h1>
                <p>{title[1]}</p>
              </div>
              <span className="date">
                <Circle size={6} fill="currentColor" />
                LEARN · PRACTICE · CREATE
              </span>
            </div>
            {error ? (
              <div className="panel">
                <div className="error" role="alert">
                  {error}
                </div>
                <p className="muted" style={{ marginTop: 17 }}>
                  Your records remain private. Retry the request, or return to
                  sign-in if your access has changed.
                </p>
                <button
                  className="btn"
                  onClick={() => refresh().catch((e) => setError(e.message))}
                >
                  Retry workspace
                </button>
              </div>
            ) : !data ? (
              <div aria-live="polite" className="stack">
                <p className="muted">Opening your private workspace…</p>
                <div className="skeleton loading-shimmer" />
                <div className="grid-2">
                  <div className="skeleton loading-shimmer" />
                  <div className="skeleton loading-shimmer" />
                </div>
              </div>
            ) : (
              <>
                {section === "dashboard" && (
                  <Dashboard
                    data={data}
                    refresh={refresh}
                    demo={session.mode === "demo"}
                  />
                )}
                {section === "learn" && <Learn data={data} refresh={refresh} />}
                {section === "practice" && (
                  <PracticeStudio workspace={data} onRefresh={refresh} />
                )}
                {section === "equipment" && (
                  <EquipmentManager workspace={data} onRefresh={refresh} />
                )}
                {section === "design" && (
                  <DesignStudio designs={data.designs} onRefresh={refresh} />
                )}
                {section === "coach" && <Coach data={data} refresh={refresh} />}
                {section === "progress" && (
                  <Progress data={data} refresh={refresh} />
                )}
                {section === "library" && <ReferenceLibrary />}
                {section === "settings" && (
                  <WorkspaceSettings
                    data={data}
                    refresh={refresh}
                    session={session}
                  />
                )}
              </>
            )}
            <footer className="footer">
              <span>✦ MIDNIGHT INK · AIBRY LABS</span>
              <span>A steady hand begins with a curious mind.</span>
              <Link href="/learn">Education, never certification.</Link>
            </footer>
          </main>
        </div>
        <nav className="mobile-bar" aria-label="Mobile navigation">
          {[
            { id: "dashboard", label: "Home", href: "/", icon: House },
            { id: "learn", label: "Learn", href: "/learn", icon: BookOpen },
            {
              id: "practice",
              label: "Practice",
              href: "/practice",
              icon: PenLine,
            },
            { id: "design", label: "Create", href: "/design", icon: Palette },
          ].map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setMore(false)}
              className={section === n.id ? "active" : ""}
              aria-current={section === n.id ? "page" : undefined}
            >
              <n.icon size={20} strokeWidth={1.6} />
              {n.label}
            </Link>
          ))}
          <button
            className={more ? "active" : ""}
            aria-expanded={more}
            aria-controls="more-navigation"
            onClick={() => setMore(!more)}
          >
            {more ? <X size={20} /> : <Menu size={20} />}More
          </button>
        </nav>
        {more && (
          <nav
            id="more-navigation"
            className="mobile-more"
            aria-label="More navigation"
          >
            {navigation
              .filter(
                (n) =>
                  !["dashboard", "learn", "practice", "design"].includes(n.id),
              )
              .map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className={n.id === section ? "active" : ""}
                  onClick={() => setMore(false)}
                >
                  <n.icon size={18} />
                  {n.label}
                </Link>
              ))}
          </nav>
        )}
      </div>
      {accessPending && (
        <div className="auth-access-overlay" role="status" aria-live="polite">
          <div className="brand-glyph">✦</div>
          <p>Checking your workspace access…</p>
        </div>
      )}
    </>
  );
}
function Dashboard({
  data,
  refresh,
  demo,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
  demo: boolean;
}) {
  const next = nextLesson(data);
  const mod = modules.find((m) => m.id === next.moduleId)!;
  const [path, setPath] = useState(data.profile.path);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const recent = data.sessions[0];
  const safetyLessons = lessons.filter((l) => l.moduleId === "professional");
  const safetyDone = data.lessonProgress.filter((p) =>
    safetyLessons.some((l) => l.id === p.lessonId),
  ).length;
  async function savePath() {
    try {
      await mutate("/api/profile", { path }, "PATCH");
      await refresh();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {!data.lessonProgress.length && !data.sessions.length && !saved && (
        <section className="panel first-run">
          <div className="between">
            <div>
              <h3>A fresh page. A clear starting point.</h3>
              <p>
                {demo
                  ? "This is your private local demo workspace. Pick a path, review the editable sample equipment, and begin on paper."
                  : "This private workspace belongs to your AIBRY ID. Pick a path, add equipment when you are ready, and begin on paper. Demo records stay separate unless you deliberately authorize an import."}
              </p>
            </div>
            <GraduationCap size={30} className="muted" />
          </div>
          <div className="row">
            <label
              className="label"
              htmlFor="learning-path"
              style={{ margin: 0 }}
            >
              Learning path
            </label>
            <select
              id="learning-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <button className="btn btn-small" onClick={savePath}>
              Save learning path <Check size={13} />
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">YOUR NEXT CHAPTER</div>
          <h2>
            Great work starts
            <br />
            with the fundamentals.
          </h2>
          <p>
            Build your eye. Find your rhythm. Develop your craft, one
            intentional practice at a time.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href={`/learn?lesson=${next.id}`}>
              Continue Learning <ArrowRight size={15} />
            </Link>
            <span className="hero-stage">
              <Layers3 size={13} />
              {data.profile.level === "intermediate"
                ? "Intermediate practice"
                : "Beginner · Paper & practice skin"}
            </span>
          </div>
        </div>
        <img
          src="/ink-rose.svg"
          alt="Original fine-line botanical rose illustration"
          className="hero-art"
        />
      </section>
      <Stats data={data} />
      <div className="dashboard-columns">
        <div className="stack">
          <section className="panel">
            <div className="section-heading">
              <h2>Your learning path</h2>
              <Link href="/learn" className="text-link">
                View curriculum <ArrowRight size={13} />
              </Link>
            </div>
            <div className="lesson-feature">
              <div className="lesson-drawing">
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <path d="M28 75 69 19l11 8-41 56-11-8Zm41-56 5-6 11 8-5 6M28 75l-8 17 19-9m-6-15 12 8m-7-15 12 8M18 29h28m-28 9h20m-20 9h12" />
                  <circle cx="63" cy="66" r="20" strokeDasharray="2 4" />
                  <path d="M50 94h35" />
                </svg>
              </div>
              <div>
                <span className="chip chip-copper">
                  MODULE {mod.number} · {mod.title.toUpperCase()}
                </span>
                <h3>{next.title}</h3>
                <p>{next.summary}</p>
                <div className="mini-meta">
                  <span>
                    <Clock3 size={12} />
                    {next.minutes} min
                  </span>
                  <span>
                    <BookOpen size={12} />
                    Guided lesson
                  </span>
                </div>
              </div>
            </div>
            <div className="between">
              <span className="muted" style={{ fontSize: 11 }}>
                {data.lessonProgress.length} of {lessons.length} lessons
                completed
              </span>
              <Link className="text-link" href={`/learn?lesson=${next.id}`}>
                {data.lessonProgress.length === lessons.length
                  ? "Revisit a lesson"
                  : "Open lesson"}{" "}
                <ArrowRight size={13} />
              </Link>
            </div>
            <div className="module-progress">
              {lessons.map((l) => (
                <i
                  key={l.id}
                  className={
                    data.lessonProgress.some((p) => p.lessonId === l.id)
                      ? "done"
                      : ""
                  }
                />
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Today’s practice</h2>
              <span className="chip">PAPER FIRST</span>
            </div>
            <div className="between">
              <div>
                <h3 style={{ marginBottom: 7 }}>
                  A steady line, a steady rhythm.
                </h3>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Start with straight lines. Notice the movement, not the speed.
                </p>
              </div>
              <span className="muted row" style={{ fontSize: 11 }}>
                <Clock3 size={13} />
                15 min
              </span>
            </div>
            <div className="exercise-preview">
              <svg viewBox="0 0 500 60" fill="none" strokeWidth="1.2">
                <path d="M10 10h105m-105 15h105m-105 15h105m-105 15h105M155 10h105m-105 15h105m-105 15h105m-105 15h105M300 10h105m-105 15h105m-105 15h105m-105 15h105" />
                <path
                  d="M440 10v45m15-45v45m15-45v45m15-45v45"
                  strokeDasharray="3 4"
                />
              </svg>
            </div>
            <div className="between">
              <a
                href={`/api/worksheets/${exercises[0]?.id}`}
                download
                className="text-link"
              >
                <ArrowDownToLine size={13} />
                Get the worksheet
              </a>
              <Link href="/practice" className="btn btn-small">
                Enter Practice Studio <ArrowRight size={13} />
              </Link>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Your latest session</h2>
              <Link href="/progress" className="text-link">
                View progress <ArrowRight size={13} />
              </Link>
            </div>
            {recent ? (
              <div className="detail-item">
                <div className="list-icon">
                  <PenLine size={19} />
                </div>
                <div>
                  <h3>
                    {exercises.find((e) => e.id === recent.exerciseId)?.title ||
                      recent.exerciseId}
                  </h3>
                  <p>
                    {dateLabel(recent.createdAt)} · {recent.durationMinutes}{" "}
                    minutes · Self-rated difficulty {recent.difficulty}/5
                  </p>
                  {recent.notes && (
                    <p style={{ marginTop: 9, color: "#c9cebf" }}>
                      {recent.notes.slice(0, 180)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <PenLine size={23} />
                <h3>Your first practice belongs here.</h3>
                <p style={{ fontSize: 11 }}>
                  Start a session, make a few marks, and record what you notice.
                </p>
                <Link href="/practice" className="text-link">
                  Start your first session <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel coach-card">
            <div className="row">
              <div className="coach-avatar">
                <Feather size={24} />
              </div>
              <div>
                <h3>Meet {data.settings.coachName || "Rook"}</h3>
                <span className="muted" style={{ fontSize: 10 }}>
                  YOUR PRACTICE COMPANION
                </span>
              </div>
            </div>
            <p>
              “Start small. A page of thoughtful lines will teach you more than
              a rushed design. Let’s find your next step.”
            </p>
            <Link href="/coach" className="btn">
              Ask {data.settings.coachName || "Rook"}{" "}
              <MessageSquare size={15} />
            </Link>
            <p
              className="note-caption"
              style={{ fontSize: 9, margin: "12px 0 0" }}
            >
              Curated offline guidance. No API key needed.
            </p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2 style={{ fontSize: 18 }}>The next small step</h2>
              <Target size={17} style={{ color: "var(--copper)" }} />
            </div>
            <ul className="checklist">
              <li>
                <CheckCircle2 size={14} />
                <span>Explore your first lesson.</span>
              </li>
              <li>
                <CheckCircle2 size={14} />
                <span>Review your equipment notes.</span>
              </li>
              <li>
                <CheckCircle2 size={14} />
                <span>Log practice, then reflect.</span>
              </li>
            </ul>
            <Link href="/progress" className="text-link">
              Set a personal goal <ArrowRight size={13} />
            </Link>
          </section>
          <section className="panel equipment-panel">
            <div className="section-heading">
              <h2 style={{ fontSize: 18 }}>On your workstation</h2>
              <Link href="/equipment" className="text-link">
                Manage <ArrowRight size={12} />
              </Link>
            </div>
            <div className="detail-list">
              {data.equipment.length ? (
                data.equipment.slice(0, 3).map((e) => (
                  <div key={e.id} className="detail-item">
                    <div className="list-icon">
                      {e.kind === "machine" ? (
                        <PenLine size={15} />
                      ) : e.kind === "cartridge" ? (
                        <Layers3 size={15} />
                      ) : (
                        <Palette size={15} />
                      )}
                    </div>
                    <div>
                      <h3>{e.name}</h3>
                      <p>
                        {e.provenance?.includes("Sample")
                          ? "Sample user-provided information"
                          : "User-reported information"}
                        {e.kind === "ink" ? " · Practice only" : ""}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>
                  Paper and a pencil are enough to begin. Add equipment whenever
                  you are ready.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      <div className="safety-inline">
        <ShieldCheck size={20} />
        <div>
          <strong>Build skill. Respect the craft.</strong> Beginner exercises
          are for paper and synthetic skin. Live-skin work requires supervised
          professional training, infection control, and applicable licensing.
          <div style={{ marginTop: 5, fontSize: 10 }}>
            Safety learning: {safetyDone} of {safetyLessons.length}{" "}
            professional-foundation lessons completed. Learning progress is
            never certification.
          </div>
        </div>
      </div>
    </>
  );
}
function Learn({
  data,
  refresh,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(nextLesson(data).id);
  const [reflection, setReflection] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lesson = lessons.find((l) => l.id === selected) || lessons[0];
  const [openModule, setOpenModule] = useState(lesson.moduleId);
  const complete = data.lessonProgress.some((p) => p.lessonId === lesson.id);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lesson");
    const match = lessons.find((l) => l.id === id);
    if (match) {
      setSelected(match.id);
      setOpenModule(match.moduleId);
    }
  }, []);
  function choose(id: string) {
    setSelected(id);
    setReflection("");
    setError("");
  }
  async function markComplete() {
    setBusy(true);
    setError("");
    try {
      await mutate(`/api/lessons/${lesson.id}/complete`, { reflection });
      await refresh();
      setReflection("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learning-layout">
      <div className="module-list">
        {modules.map((mod) => {
          const related = lessons.filter((l) => l.moduleId === mod.id);
          const done = related.filter((l) =>
            data.lessonProgress.some((p) => p.lessonId === l.id),
          ).length;
          return (
            <section className="panel module-card" key={mod.id}>
              <button
                className="module-button"
                aria-expanded={openModule === mod.id}
                onClick={() =>
                  setOpenModule(openModule === mod.id ? "" : mod.id)
                }
              >
                <span className="module-number">
                  {String(mod.number).padStart(2, "0")}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{mod.title}</strong>
                  <small className="muted">
                    {done} / {related.length} lessons
                  </small>
                </div>
                <ChevronDown size={14} />
              </button>
              {openModule === mod.id && (
                <div className="lesson-list">
                  {related.map((l) => (
                    <button
                      key={l.id}
                      className={`lesson-button ${lesson.id === l.id ? "selected" : ""}`}
                      onClick={() => choose(l.id)}
                    >
                      {data.lessonProgress.some((p) => p.lessonId === l.id) ? (
                        <CheckCircle2 className="lesson-status" size={14} />
                      ) : (
                        <Circle size={12} />
                      )}
                      <span style={{ flex: 1 }}>{l.title}</span>
                      <small>{l.minutes}m</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <article className="panel lesson-body">
        <div className="between">
          <span className="chip chip-copper">
            {modules.find((m) => m.id === lesson.moduleId)?.title}
          </span>
          <span className="muted row" style={{ fontSize: 11 }}>
            <Clock3 size={13} />
            {lesson.minutes} min
          </span>
        </div>
        <h2>{lesson.title}</h2>
        <p>{lesson.summary}</p>
        {complete && (
          <span className="chip">
            <Check size={12} />
            Completed · available to revisit
          </span>
        )}
        <div className="objective">
          <h3>What you’ll learn</h3>
          <ul>
            {lesson.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <h3>Understand the craft</h3>
        {lesson.explanation.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h3>Put it into practice</h3>
        <ol>
          {lesson.practice.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
        <div className="grid-2">
          <div>
            <h3>Have these ready</h3>
            <ul>
              {lesson.equipment.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Watch out for</h3>
            <ul>
              {lesson.mistakes.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="knowledge">
          <h3>A moment to reflect</h3>
          <p>{lesson.question}</p>
          <label className="label" htmlFor="lesson-reflection">
            Your answer or reflection
          </label>
          <textarea
            id="lesson-reflection"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            maxLength={2000}
            placeholder="Explain it in your own words…"
          />
          <details>
            <summary>Compare with the teaching note</summary>
            <p>{lesson.answer}</p>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || complete || reflection.trim().length < 3}
            onClick={markComplete}
          >
            {complete ? (
              <>
                <Check size={15} />
                Lesson completed
              </>
            ) : busy ? (
              "Saving progress…"
            ) : (
              <>
                Complete lesson <Check size={15} />
              </>
            )}
          </button>
          <p className="note-caption">
            Completion records your participation, not professional competence.
          </p>
        </div>
        <h3>Keep these references close</h3>
        <div className="row wrap">
          {lesson.referenceIds.map((id) => {
            const card = techniqueCards.find((c) => c.id === id);
            return card ? (
              <Link className="chip" key={id} href={`/library?card=${id}`}>
                <Library size={12} />
                {card.title}
              </Link>
            ) : null;
          })}
        </div>
        <hr className="divider" />
        <Link href="/practice" className="btn">
          Take this into practice <ArrowRight size={14} />
        </Link>
      </article>
    </div>
  );
}
function Coach({
  data,
  refresh,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [moduleId, setModuleId] = useState(data.profile.path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("offline");
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((v) => setProvider(v.coachProvider || v.provider || "offline"))
      .catch(() => {});
  }, []);
  const name = data.settings.coachName || "Rook";
  const live = provider === "openai";
  async function ask(e: FormEvent) {
    e.preventDefault();
    if (live && !consent) {
      setError(
        "Choose whether to send the disclosed text context to OpenAI before asking.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await mutate("/api/coach", { question, moduleId });
      setQuestion("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const messages = [...data.coaching].reverse();
  return (
    <div className="coach-layout">
      <section className="panel">
        <div className="between">
          <div className="row">
            <div className="coach-avatar">
              <Feather size={22} />
            </div>
            <div>
              <h2 style={{ marginBottom: 4 }}>{name}</h2>
              <span className="muted" style={{ fontSize: 10 }}>
                Your patient, practical practice companion
              </span>
            </div>
          </div>
          <span className="chip">
            {live ? "OPTIONAL LIVE MODEL" : "CURATED · OFFLINE"}
          </span>
        </div>
        {!messages.length && (
          <div className="chat-empty">
            <h2>What are you working on?</h2>
            <p>
              Tell me where you are getting stuck. I’ll use the studio’s
              original educational cards and your saved practice context to
              suggest a manageable next step.
            </p>
            <div className="prompt-grid">
              {[
                "My lines are wobbly. What should I practice?",
                "Explain my 1205M1 cartridge.",
                "How do I plan a shading gradient?",
                "What should I know about sharps disposal?",
              ].map((p) => (
                <button
                  className="btn btn-ghost"
                  key={p}
                  onClick={() => setQuestion(p)}
                >
                  {p}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div aria-live="polite">
          {messages.map((message) => {
            const response =
              typeof message.response === "string"
                ? { answer: message.response }
                : message.response;
            return (
              <div key={message.id}>
                <div className="chat-message user">
                  <div className="chat-author">
                    You · {dateLabel(message.createdAt)}
                  </div>
                  <p>{message.question}</p>
                </div>
                <div className="chat-message">
                  <div className="chat-author">
                    {response.coachName || name} ·{" "}
                    {response.source === "openai"
                      ? "AI-generated suggestions"
                      : "Original curated guidance"}
                  </div>
                  <p>{response.answer}</p>
                  {response.steps && (
                    <ol>
                      {response.steps.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  <div>
                    {response.referenceIds?.map((id: string) => {
                      const card = techniqueCards.find((c) => c.id === id);
                      return card ? (
                        <Link
                          key={id}
                          href={`/library?card=${id}`}
                          className="chip"
                        >
                          <Library size={11} />
                          {card.title}
                        </Link>
                      ) : null;
                    })}
                  </div>
                  {response.notice && (
                    <div className="notice" style={{ marginTop: 12 }}>
                      {response.notice}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {busy && (
            <p className="muted" role="status">
              {name} is preparing a grounded response…
            </p>
          )}
        </div>
        <form className="chat-form" onSubmit={ask}>
          <div className="field">
            <label className="label" htmlFor="coach-module">
              Learning context
            </label>
            <select
              id="coach-module"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
            >
              {modules.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          {live && (
            <div className="notice" style={{ marginBottom: 15 }}>
              <p style={{ marginBottom: 10 }}>
                Live mode sends your question, skill level, learning path,
                equipment names/codes, goals, recent exercise summaries, and
                selected reference cards to OpenAI. Photos, private session
                notes, and chat history are excluded.
              </p>
              <label className="row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I choose to send this text context when I ask.
              </label>
            </div>
          )}
          <label className="label" htmlFor="coach-question">
            Your question
          </label>
          <textarea
            id="coach-question"
            maxLength={2000}
            minLength={2}
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="For example: my S-curves flatten at the turn. What should I try?"
          />
          <div className="between">
            <small>
              {question.length}/2000 · No photos are sent or analyzed.
            </small>
            <button
              className="btn btn-primary"
              disabled={
                busy || question.trim().length < 2 || (live && !consent)
              }
            >
              {busy ? "Thinking…" : `Ask ${name}`}
              <ArrowRight size={15} />
            </button>
          </div>
          {error && (
            <p className="error" role="alert" style={{ marginTop: 15 }}>
              {error}
            </p>
          )}
        </form>
      </section>
      <aside className="panel coach-context">
        <div className="eyebrow">GROUNDED IN YOUR PRACTICE</div>
        <h3>Context, with boundaries.</h3>
        <ul className="checklist">
          <li>
            <CheckCircle2 size={15} />
            {data.profile.level} learner
          </li>
          <li>
            <CheckCircle2 size={15} />
            {data.equipment.length} recorded equipment items
          </li>
          <li>
            <CheckCircle2 size={15} />
            {data.sessions.length} saved practice sessions
          </li>
          <li>
            <CheckCircle2 size={15} />
            {techniqueCards.length} original reference cards
          </li>
        </ul>
        <hr className="divider" />
        <p className="muted" style={{ fontSize: 12 }}>
          Rook distinguishes user-reported equipment from verified
          specifications. It cannot infer sterility, physical depth, or
          human-skin safety from an image.
        </p>
        <Link href="/library" className="text-link">
          Browse the source cards <ArrowRight size={13} />
        </Link>
        <hr className="divider" />
        <ShieldCheck
          size={20}
          style={{ color: "var(--copper)", marginBottom: 12 }}
        />
        <p className="muted" style={{ fontSize: 11 }}>
          No coaching response is certification or permission to tattoo a
          person.
        </p>
      </aside>
    </div>
  );
}
function ReferenceLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("card");
    const card = techniqueCards.find((c) => c.id === id);
    if (card) setQuery(card.title);
  }, []);
  const cards = techniqueCards.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      `${c.title} ${c.description} ${c.compatibility.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="filters">
        <label className="search">
          <span className="sr-only">Search reference cards</span>
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search techniques, equipment, or safety…"
          />
        </label>
        <select
          aria-label="Reference category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {[...new Set(techniqueCards.map((c) => c.category))].map((c) => (
            <option value={c} key={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 11, marginBottom: 20 }}>
        {cards.length} original cards · Authored educational guidance, not
        independently expert-verified or manufacturer specifications.
      </p>
      <div className="library-grid">
        {cards.map((card) => (
          <article className="panel library-card" key={card.id}>
            <div className="between">
              <span className="chip chip-copper">{card.category}</span>
              <Library size={16} className="muted" />
            </div>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <div className="row wrap">
              {card.compatibility.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
            {card.safetyNotes.length > 0 && (
              <div className="notice" style={{ marginTop: 16 }}>
                {card.safetyNotes.join(" ")}
              </div>
            )}
            <div className="library-meta">
              <strong style={{ fontWeight: 500 }}>{card.attribution}</strong>
              <div style={{ marginTop: 4 }}>
                Status: {card.reviewStatus} ·{" "}
                {card.lastReviewed
                  ? `Reviewed ${card.lastReviewed}`
                  : "No external review claimed"}
              </div>
              {card.sourceUrl && (
                <a
                  href={card.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                  className="text-link"
                >
                  Original source <ArrowRight size={12} />
                </a>
              )}
              <div className="row wrap" style={{ marginTop: 10 }}>
                {card.lessonIds.slice(0, 2).map((id) => {
                  const l = lessons.find((l) => l.id === id);
                  return l ? (
                    <Link
                      className="text-link"
                      key={id}
                      href={`/learn?lesson=${id}`}
                    >
                      <BookOpen size={12} />
                      {l.title}
                    </Link>
                  ) : null;
                })}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!cards.length && (
        <div className="empty-state">
          <Search size={24} />
          <h3>No cards match that search.</h3>
          <p>Try a material, a technique, or a simpler phrase.</p>
          <button
            className="btn"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Clear search
          </button>
        </div>
      )}
    </>
  );
}
function Progress({
  data,
  refresh,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
}) {
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function saveGoal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await mutate("/api/goals", { title: goal });
      setGoal("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeGoal(g: any, remove = false) {
    try {
      await mutate(
        `/api/goals/${g.id}`,
        remove
          ? {}
          : { title: g.title, notes: g.notes || "", completed: !g.completed },
        remove ? "DELETE" : "PATCH",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const timeline = [
    ...data.sessions.map((s) => ({
      id: s.id,
      date: s.createdAt,
      title:
        exercises.find((e) => e.id === s.exerciseId)?.title ||
        "Practice session",
      detail: `${s.durationMinutes} minutes · Difficulty ${s.difficulty}/5`,
      notes: s.notes,
    })),
    ...data.lessonProgress.map((p) => ({
      id: p.id,
      date: p.completedAt,
      title:
        lessons.find((l) => l.id === p.lessonId)?.title || "Lesson completed",
      detail: "Lesson completed",
      notes: "",
    })),
    ...data.designs.map((d) => ({
      id: d.id,
      date: d.updatedAt || d.createdAt,
      title: d.name,
      detail: "Design saved",
      notes: "",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <Stats data={data} />
      <div className="progress-layout">
        <div className="stack">
          <section className="panel">
            <div className="section-heading">
              <h2>Your learning, chapter by chapter</h2>
              <GraduationCap size={21} className="muted" />
            </div>
            {modules.map((m) => {
              const all = lessons.filter((l) => l.moduleId === m.id);
              const done = all.filter((l) =>
                data.lessonProgress.some((p) => p.lessonId === l.id),
              ).length;
              return (
                <div key={m.id} className="module-row">
                  <div className="between">
                    <span>{m.title}</span>
                    <small>
                      {done} / {all.length}
                    </small>
                  </div>
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-label={m.title}
                    aria-valuenow={done}
                    aria-valuemax={all.length}
                  >
                    <span style={{ width: `${(done / all.length) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="note-caption">
              These are records of learning participation, not competency
              scores.
            </p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>A timeline of the work</h2>
              <Clock3 size={18} className="muted" />
            </div>
            {timeline.length ? (
              timeline.slice(0, 30).map((t) => (
                <div key={t.id} className="timeline-item">
                  <h3>{t.title}</h3>
                  <p>
                    {dateLabel(t.date)} · {t.detail}
                  </p>
                  {t.notes && <p style={{ color: "#c2c9b7" }}>{t.notes}</p>}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <BookOpen size={24} />
                <h3>Every practice has a place.</h3>
                <p>
                  Your completed lessons, practice sessions, and saved designs
                  will appear here.
                </p>
                <Link href="/learn" className="btn">
                  Begin a lesson <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Small goals. Real momentum.</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              Choose something you can notice and repeat.
            </p>
            {data.goals.map((g) => (
              <div
                key={g.id}
                className={`goal-row ${g.completed ? "done" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Complete goal ${g.title}`}
                  checked={g.completed}
                  onChange={() => changeGoal(g)}
                />
                <span>{g.title}</span>
                <button
                  className="icon-button"
                  aria-label={`Delete goal ${g.title}`}
                  onClick={() => changeGoal(g, true)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <form onSubmit={saveGoal} style={{ marginTop: 17 }}>
              <label className="label" htmlFor="personal-goal">
                A goal for your next session
              </label>
              <input
                id="personal-goal"
                required
                maxLength={300}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Draw ten circles at the same size"
              />
              <button
                className="btn btn-small"
                disabled={busy || !goal.trim()}
                style={{ marginTop: 11 }}
              >
                <Plus size={13} />
                Add goal
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Self-assessment notes</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              Latest recorded assessment. These ratings are yours; Rook has not
              assessed your photos.
            </p>
            {data.assessments.length ? (
              <>
                {[
                  "consistency",
                  "smoothness",
                  "coverage",
                  "edgeControl",
                  "surfaceDamage",
                ].map((key) => (
                  <div className="assessment-row" key={key}>
                    <span>
                      {key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (s) => s.toUpperCase())}
                    </span>
                    <span>{data.assessments[0][key]} / 5</span>
                  </div>
                ))}
                {data.assessments[0].goals && (
                  <p style={{ marginTop: 17, fontSize: 12 }}>
                    {data.assessments[0].goals}
                  </p>
                )}
              </>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                Add a self-assessment when you save a practice session.
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Your practice portfolio</h2>
            <p className="muted" style={{ fontSize: 12 }}>
              {data.photos.length} saved practice photos. Revisit and compare
              them in Practice Studio.
            </p>
            {data.photos.length > 0 && (
              <div
                className="grid-2"
                style={{
                  gap: 8,
                  gridTemplateColumns: "1fr 1fr",
                  marginBottom: 17,
                }}
              >
                {data.photos.slice(0, 4).map((p) => (
                  <a
                    href={p.url || `/api/photos/${p.id}`}
                    key={p.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={p.url || `/api/photos/${p.id}`}
                      alt={`Practice photo from ${dateLabel(p.createdAt)}`}
                      style={{
                        width: "100%",
                        height: 110,
                        objectFit: "cover",
                        borderRadius: 5,
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
            <Link href="/practice" className="btn">
              Review and compare <ArrowRight size={14} />
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
function WorkspaceSettings({
  data,
  refresh,
  session,
}: {
  data: Workspace;
  refresh: () => Promise<void>;
  session: AuthSession;
}) {
  const [name, setName] = useState(data.profile.name);
  const [level, setLevel] = useState(data.profile.level);
  const [path, setPath] = useState(data.profile.path);
  const [coachName, setCoachName] = useState(data.settings.coachName);
  const [minutes, setMinutes] = useState(data.settings.goalMinutes);
  const [confirmation, setConfirmation] = useState("");
  const [importAuthorization, setImportAuthorization] = useState("");
  const [importConfirmation, setImportConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await mutate("/api/profile", { name, level, path }, "PATCH");
      await mutate(
        "/api/settings",
        { coachName, goalMinutes: Number(minutes) },
        "PATCH",
      );
      await refresh();
      setStatus("Workspace preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const deletion = await mutate("/api/data", { confirm: confirmation }, "DELETE");
      setConfirmation("");
      await refresh();
      setStatus(
        deletion.fileCleanup === "pending"
          ? "Your records were deleted. Photo-file cleanup is queued and will retry; the original curriculum is retained."
          : "Your user records and photos have been deleted. Original curriculum is retained; sample equipment will not be re-created.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importDemo(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await mutate("/api/auth/import-demo", {
        authorization: importAuthorization,
        confirm: importConfirmation,
      });
      setImportAuthorization("");
      setImportConfirmation("");
      const importedResponse = await fetch("/api/workspace", {
        cache: "no-store",
      });
      if (importedResponse.status === 401) {
        window.dispatchEvent(new Event("midnight-session-expired"));
        throw new Error(
          "The import completed. Sign in again to review your records.",
        );
      }
      if (importedResponse.ok) {
        const imported = (await importedResponse.json()) as Workspace;
        setName(imported.profile.name);
        setLevel(imported.profile.level);
        setPath(imported.profile.path);
        setCoachName(imported.settings.coachName);
        setMinutes(imported.settings.goalMinutes);
      }
      await refresh();
      setStatus(
        "The authorized demo records were moved into this private workspace. The one-time authorization cannot be used again.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <section className="panel auth-identity-panel">
        <div className="eyebrow">
          {session.mode === "authenticated"
            ? "CONNECTED IDENTITY"
            : "DEVELOPMENT IDENTITY"}
        </div>
        <div className="between">
          <div className="row">
            <div className="auth-identity-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2>
                {session.mode === "authenticated"
                  ? "Your AIBRY ID workspace"
                  : "Local demo workspace"}
              </h2>
              <p>
                {session.mode === "authenticated"
                  ? "Only this verified identity can access your personal records."
                  : "One local identity for private development. No AIBRY ID account is connected."}
              </p>
            </div>
          </div>
          <span className="chip">
            {session.mode === "authenticated" ? "SESSION ACTIVE" : "LOCAL DEMO"}
          </span>
        </div>
        {session.mode === "authenticated" && session.identity && (
          <>
            <dl className="auth-identity-details">
              <div>
                <dt>Account</dt>
                <dd>
                  {session.identity.name ||
                    session.profile?.name ||
                    "AIBRY ID account"}
                </dd>
              </div>
              {session.identity.email && (
                <div>
                  <dt>Profile email</dt>
                  <dd>{session.identity.email}</dd>
                </div>
              )}
              <div>
                <dt>Identity provider</dt>
                <dd>{session.identity.issuer}</dd>
              </div>
              <div>
                <dt>Immutable account subject</dt>
                <dd>{session.identity.subject}</dd>
              </div>
              <div>
                <dt>Session expires</dt>
                <dd>
                  {session.expiresAt
                    ? new Date(session.expiresAt).toLocaleString()
                    : "At the server-configured expiration"}
                </dd>
              </div>
            </dl>
            <p className="note-caption">
              Email and display name are profile attributes. Your workspace is
              mapped by the provider’s immutable subject.
            </p>
          </>
        )}
        {session.mode === "authenticated" ? (
          <form method="post" action="/auth/logout">
            <button className="btn" type="submit">
              <LogOut size={15} />
              Sign out
            </button>
            <p className="note-caption">
              Sign-out revokes this Midnight Ink session. Your AIBRY ID provider
              session may remain active.
            </p>
          </form>
        ) : (
          session.loginAvailable && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth starts with a full document navigation and must not be prefetched.
            <a className="btn" href="/auth/aibry-id/login?returnTo=%2Fsettings">
              <LockKeyhole size={15} />
              Continue with AIBRY ID
            </a>
          )
        )}
      </section>
      <form className="panel" onSubmit={save}>
        <div className="eyebrow">
          {session.mode === "authenticated"
            ? "PRIVATE WORKSPACE"
            : "LOCAL WORKSPACE"}
        </div>
        <h2>A space for your practice</h2>
        <p>
          {session.mode === "authenticated"
            ? "Your learning preferences and records belong to this signed-in account. Other AIBRY ID accounts receive separate workspaces."
            : "This development workspace needs no account and is available on loopback only. Keep the demo server on your own machine."}
        </p>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="workspace-name">
              Workspace name
            </label>
            <input
              id="workspace-name"
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="skill-level">
              Learning stage
            </label>
            <select
              id="skill-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="settings-path">
              Active learning path
            </label>
            <select
              id="settings-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            >
              {modules.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="daily-minutes">
              Daily practice intention (minutes)
            </label>
            <input
              id="daily-minutes"
              type="number"
              min={5}
              max={300}
              required
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="coach-name">
            Coach name
          </label>
          <input
            id="coach-name"
            maxLength={40}
            required
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
          <Check size={15} />
        </button>
      </form>
      <section className="panel">
        <div className="eyebrow">YOUR RECORDS, YOUR CHOICE</div>
        <h2>Keep a copy of your progress.</h2>
        <p>
          Export your profile, equipment, lessons, practice notes, assessments,
          design documents, goals, coaching history, and photo metadata as JSON.
          Photo binaries are not included; open photos in Practice Studio to
          save a copy.
        </p>
        <a className="btn" href="/api/export" download>
          <ArrowDownToLine size={15} />
          Export my records
        </a>
        <p className="note-caption">
          Local images are re-encoded to strip metadata. Nothing is sent for
          image analysis.
        </p>
      </section>
      <section className="panel">
        <div className="eyebrow">COACH & PRIVACY</div>
        <h2>Good guidance, clear provenance.</h2>
        <p>
          The default coach uses original educational cards and your local
          practice context. An optional OpenAI provider is configured
          server-side; the coach screen discloses text sharing and requires a
          deliberate choice before sending. API keys never belong in browser
          settings.
        </p>
        <div className="row wrap">
          <span className="chip">Offline by default</span>
          <span className="chip">No photo analysis</span>
          <span className="chip">No competency certification</span>
        </div>
        <hr className="divider" />
        <h3>Identity and privacy</h3>
        <p>
          Personal APIs require a verified server session outside local demo
          mode. Signing in never assigns existing demo records to your account.
          Your browser holds an HttpOnly session cookie; identity tokens and
          session secrets are never exposed in this screen.
        </p>
      </section>
      {session.mode === "authenticated" && session.demoImportAvailable && (
        <form className="panel auth-import-panel" onSubmit={importDemo}>
          <div className="eyebrow">ONE-TIME DEMO IMPORT</div>
          <h2>Bring over an existing practice workspace.</h2>
          <p>
            Signing in did not give you access to the original demo records.
            Import requires a separate one-time authorization supplied by the
            operator, an empty destination workspace, and your explicit
            confirmation. It replaces your learning preferences with the demo
            preferences and moves the demo’s saved records and photos into this
            account while preserving their relationships. Export and back up
            both workspaces first.
          </p>
          <label className="label" htmlFor="demo-import-authorization">
            One-time import authorization
          </label>
          <input
            id="demo-import-authorization"
            type="password"
            autoComplete="off"
            value={importAuthorization}
            maxLength={512}
            onChange={(e) => setImportAuthorization(e.target.value)}
            required
          />
          <label
            className="label"
            htmlFor="demo-import-confirmation"
            style={{ marginTop: 15 }}
          >
            Type IMPORT DEMO DATA to confirm ownership transfer
          </label>
          <input
            id="demo-import-confirmation"
            autoComplete="off"
            value={importConfirmation}
            onChange={(e) => setImportConfirmation(e.target.value)}
            required
          />
          <button
            className="btn"
            type="submit"
            disabled={
              busy ||
              !importAuthorization ||
              importConfirmation !== "IMPORT DEMO DATA"
            }
            style={{ marginTop: 15 }}
          >
            {busy
              ? "Checking authorization…"
              : "Import demo data into my account"}
          </button>
        </form>
      )}
      <section className="panel" style={{ borderColor: "#60423b" }}>
        <h2>Delete your workspace data</h2>
        <p>
          This permanently removes your saved progress, practice sessions and
          photos, equipment, designs, goals, and coaching history from this
          workspace. Export anything you want to keep first. The curriculum
          remains available.
        </p>
        <label className="label" htmlFor="delete-confirm">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          placeholder="DELETE"
        />
        <button
          className="btn btn-danger"
          disabled={busy || confirmation !== "DELETE"}
          onClick={erase}
          style={{ marginTop: 15 }}
        >
          <Trash2 size={15} />
          Delete all my data
        </button>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="notice" role="status">
          {status}
        </div>
      )}
    </div>
  );
}
