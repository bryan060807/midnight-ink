"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, ShieldAlert } from "lucide-react";
import { academyLabs } from "@/lib/academy-labs";

const sourceLessons: Record<string, string> = {
  "academy-setup": "controls-workspace",
  "academy-lines": "straight-lines",
  "academy-shapes": "circles-corners",
  "academy-blackwork": "solid-fill",
  "academy-stencil": "transfer-practice",
  "academy-capstone": "original-motifs",
};
const initialChecks = () => [] as boolean[];

type Props = { completedLessonIds: string[]; onRefresh: () => Promise<void> };

export default function Academy({ completedLessonIds, onRefresh }: Props) {
  const [labId, setLabId] = useState(academyLabs[0].id);
  const [stage, setStage] = useState(0);
  const [checks, setChecks] = useState<boolean[]>(initialChecks);
  const [reflection, setReflection] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lab = academyLabs.find(item => item.id === labId) ?? academyLabs[0];
  const finished = completedLessonIds.includes(sourceLessons[lab.id]);
  const finishedCount = academyLabs.filter(item => completedLessonIds.includes(sourceLessons[item.id])).length;
  const practiceUrl = lab.exerciseId ? `/practice?exercise=${encodeURIComponent(lab.exerciseId)}` : "/equipment";

  function selectLab(id: string) {
    setLabId(id);
    setStage(0);
    setChecks([]);
    setReflection("");
    setShowAnswer(false);
    setError("");
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lab");
    if (id && academyLabs.some(item => item.id === id)) selectLab(id);
  }, []);

  async function finish() {
    if (checks.filter(Boolean).length !== lab.steps.length || reflection.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/lessons/${sourceLessons[lab.id]}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflection: reflection.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to save progress.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Progress could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function markStage() {
    setChecks(previous => {
      const copy = [...previous];
      copy[stage] = !copy[stage];
      return copy;
    });
  }
  const allChecked = lab.steps.every((_, index) => checks[index] === true);
  const stageData = lab.steps[stage];

  return (
    <section className="academy-shell" aria-labelledby="academy-heading">
      <div className="academy-heading">
        <div>
          <p className="eyebrow">MIDNIGHT INK ACADEMY · PRACTICAL FIELD LABS</p>
          <h2 id="academy-heading">Learn it. Practice it. Prove it to yourself.</h2>
          <p>Six structured labs with specific drills, observation checkpoints, printable worksheets, and linked lesson completion. Existing lesson completions count here too. Practice records and photos belong to your existing private workspace.</p>
        </div>
        <div className="academy-counter"><strong>{finishedCount}<small> / {academyLabs.length}</small></strong><span>Linked lessons completed</span></div>
      </div>
      <div className="academy-layout">
        <nav className="academy-rail" aria-label="Choose a practical lab">
          {academyLabs.map((item, index) => (
            <button key={item.id} type="button" aria-current={lab.id === item.id ? "step" : undefined} className={`academy-lab-button ${item.id === lab.id ? "active" : ""}`} onClick={() => selectLab(item.id)}>
              <span className="academy-index">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{item.title}</strong><small>{item.minutes} min · {item.subtitle}</small></span>
              {completedLessonIds.includes(sourceLessons[item.id]) && <CheckCircle2 size={17} aria-label="Completed" />}
            </button>
          ))}
        </nav>
        <article className="academy-content">
          <div className="academy-topline"><span className="chip chip-copper">LAB {String(academyLabs.indexOf(lab) + 1).padStart(2, "0")}</span><span className="muted">{lab.minutes} min suggested · {finished ? "Completed" : "In progress"}</span></div>
          <h3>{lab.title}</h3>
          <p className="academy-lead">{lab.overview}</p>
          <div className="academy-brief">
            <div><h4>What you&apos;re training</h4><ul>{lab.objectives.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>Bring to your station</h4><ul>{lab.equipment.map(item => <li key={item}>{item}</li>)}</ul></div>
          </div>
          <div className="academy-stage-heading">
            <div><span className="eyebrow">WORKSHOP · STEP {stage + 1} OF {lab.steps.length}</span><h4>{stageData.title}</h4></div>
            <span className="muted">{checks.filter(Boolean).length} / {lab.steps.length} checked</span>
          </div>
          <div className="academy-stage">
            <p>{stageData.action}</p>
            <div className="academy-checkpoint"><ClipboardCheck size={18} /><div><strong>Checkpoint</strong><p>{stageData.checkpoint}</p></div></div>
            <label className="academy-check"><input type="checkbox" checked={checks[stage] === true} onChange={markStage} /> I performed or reviewed this step and checked the result</label>
          </div>
          <div className="academy-stage-nav">
            <button className="btn" type="button" disabled={stage === 0} onClick={() => setStage(current => Math.max(0, current - 1))}><ChevronLeft size={16} /> Previous</button>
            <div className="academy-dots" aria-label="Lab step progress">{lab.steps.map((_, index) => <button key={index} type="button" className={`academy-dot ${index === stage ? "current" : ""} ${checks[index] ? "checked" : ""}`} aria-label={`Go to step ${index + 1}`} onClick={() => setStage(index)} />)}</div>
            <button className="btn btn-primary" type="button" disabled={stage >= lab.steps.length - 1} onClick={() => setStage(current => Math.min(lab.steps.length - 1, current + 1))}>Next <ChevronRight size={16} /></button>
          </div>
          <div className="academy-tools">
            {lab.id === "academy-setup" && <div><h4>Print your setup checklist</h4><p>Use this A4 checklist during the unpowered station rehearsal. It includes equipment identification, contact zones, sharps planning, and a readiness review.</p><a className="btn" href="/academy-station-checklist.html" target="_blank" rel="noopener noreferrer"><Download size={14} /> Print / Save checklist</a></div>}
            {lab.worksheetIds.length > 0 && <div><h4>Print the drills</h4><div className="academy-links">{lab.worksheetIds.map(id => <a className="btn" key={id} href={`/api/worksheets/${id}`} download><Download size={14} /> {id.replaceAll("-", " ")} SVG</a>)}</div><p className="muted">Print at 100% and verify physical scaling with a ruler.</p></div>}
            <div><h4>Record actual practice</h4><p>Your session timer, self-assessment, photos, and notes live in Practice Studio. Save a real session there, then return to this lab.</p><Link className="btn btn-primary" href={practiceUrl} target="_blank" rel="noopener noreferrer">{lab.exerciseId ? "Open matching exercise" : "Open equipment inventory"} <ChevronRight size={15} /></Link></div>
          </div>
          <div className="academy-review">
            <h4>Debrief</h4>
            <ul>{lab.review.map(item => <li key={item}>{item}</li>)}</ul>
            <p><strong>Think about it:</strong> {lab.question}</p>
            <label className="label" htmlFor="academy-reflection">Your answer or next-action note</label>
            <textarea id="academy-reflection" rows={3} maxLength={2000} value={reflection} onChange={event => setReflection(event.target.value)} placeholder="Record what happened, what you noticed, and one thing to change next time." />
            <button type="button" className="btn btn-ghost" onClick={() => setShowAnswer(value => !value)}>{showAnswer ? "Hide teaching note" : "Show teaching note"}</button>
            {showAnswer && <p className="academy-answer">{lab.answer}</p>}
            <div className="academy-warnings"><ShieldAlert size={18} /><div><strong>Before you continue</strong><ul>{lab.watchFor.map(item => <li key={item}>{item}</li>)}</ul></div></div>
            {error && <p role="alert" className="error">{error}</p>}
            {finished ? <p className="academy-finished"><CheckCircle2 size={17} /> Linked lesson completion is saved. You can repeat this lab and record new attempts any time.</p> : <button className="btn btn-primary" type="button" disabled={!allChecked || reflection.trim().length < 3 || busy} onClick={() => void finish()}><BookOpenCheck size={17} /> {busy ? "Saving…" : "Save linked lesson completion"}</button>}
            <p className="muted">Checks and draft reflections are temporary until submitted. Completing a lab records its linked curriculum lesson; it is not certification or evidence that a practice session was performed.</p>
          </div>
        </article>
      </div>
      <style>{`
        .academy-shell{display:grid;gap:22px;margin-bottom:32px;min-width:0}.academy-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:22px 24px;border:1px solid #9f524a55;background:linear-gradient(120deg,#301d1c,#171b1b 67%);border-radius:14px}.academy-heading h2{font-size:clamp(23px,3vw,35px);font-family:Georgia,serif;margin:4px 0 10px}.academy-heading p{line-height:1.6;max-width:760px;color:#bab0a8;margin:0}.academy-counter{display:flex;flex-direction:column;align-items:center;min-width:95px}.academy-counter strong{font-size:31px;color:#f1d0bb}.academy-counter strong small{font-size:15px;color:#a39488}.academy-counter span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#b4aaa0}.academy-layout{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(0,1.6fr);gap:18px}.academy-rail{display:grid;gap:8px;align-content:start}.academy-lab-button{display:flex;gap:11px;align-items:center;text-align:left;width:100%;border:1px solid #ffffff18;border-radius:11px;background:#17191a;padding:13px;color:#e7ded5;cursor:pointer}.academy-lab-button.active{background:#8f39302a;border-color:#bc675e}.academy-lab-button>span:nth-child(2){flex:1;min-width:0}.academy-lab-button strong{display:block;font-size:13px}.academy-lab-button small{display:block;margin-top:5px;font-size:11px;color:#a99f96;line-height:1.4}.academy-index{font-size:11px;color:#c39177}.academy-content{background:#191b1b;border:1px solid #ffffff15;padding:24px;border-radius:13px;min-width:0}.academy-topline,.academy-stage-heading,.academy-stage-nav{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.academy-content h3{font:normal clamp(23px,3vw,32px) Georgia,serif;margin:20px 0 10px}.academy-content h4{font-size:15px;margin:0 0 12px}.academy-content p,.academy-content li{line-height:1.65}.academy-lead{color:#c6bab0}.academy-brief{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}.academy-brief>div{background:#ffffff05;border-radius:9px;padding:17px}.academy-brief ul,.academy-review ul{padding-left:19px;margin:8px 0}.academy-brief li,.academy-review li{margin-bottom:8px;font-size:13px}.academy-stage-heading{padding-top:20px;border-top:1px solid #ffffff1a}.academy-stage-heading h4{font-size:21px;margin:8px 0 12px}.academy-stage{padding:20px;border:1px solid #ffffff18;border-radius:10px;background:#101414}.academy-stage>p{font-size:15px}.academy-checkpoint{display:flex;gap:12px;padding:13px 15px;border-left:3px solid #b18065;background:#ffffff05;margin:20px 0}.academy-checkpoint p{margin:5px 0 0}.academy-check{display:flex;align-items:center;gap:12px;font-size:13px;cursor:pointer}.academy-check input{width:18px;height:18px;accent-color:#b26457}.academy-stage-nav{margin:18px 0 26px}.academy-dots{display:flex;gap:8px}.academy-dot{width:12px;height:12px;border-radius:50%;border:1px solid #91766b;background:transparent;cursor:pointer}.academy-dot.current{outline:2px solid #c38b72;outline-offset:2px}.academy-dot.checked{background:#b7775c}.academy-tools{display:grid;gap:15px;padding:20px 0;border-top:1px solid #ffffff1a}.academy-tools>div{background:#ffffff05;border-radius:9px;padding:17px}.academy-tools p,.academy-review p{font-size:13px}.academy-links{display:flex;gap:9px;flex-wrap:wrap}.academy-review{display:grid;gap:13px;border-top:1px solid #ffffff1a;padding-top:22px}.academy-review textarea{width:100%;min-height:95px}.academy-review .btn{justify-self:start}.academy-answer{padding:12px;background:#ffffff08;border-radius:8px}.academy-warnings{display:flex;gap:12px;border:1px solid #926b4566;padding:14px;border-radius:9px}.academy-warnings ul{margin-bottom:0}.academy-finished{display:flex;align-items:center;gap:9px;color:#bbd2b0}.academy-finished svg{flex-shrink:0}@media(max-width:920px){.academy-layout{grid-template-columns:1fr}.academy-rail{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.academy-heading,.academy-content{padding:17px}.academy-rail,.academy-brief{grid-template-columns:1fr}.academy-stage{padding:14px}.academy-stage-nav{justify-content:center}}
      `}</style>
    </section>
  );
}
