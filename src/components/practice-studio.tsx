'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Play, Pause, RotateCcw, Download, Clock3, Pencil, Trash2, ImagePlus, Check, X, Images, ArrowUpRight } from 'lucide-react';
import { exercises } from '@/lib/curriculum';

interface EquipmentItem { id: string; name: string; kind: string }
interface Assessment { consistency: number; smoothness: number; coverage: number; edgeControl: number; surfaceDamage: number; goals: string }
interface Session {
  id: string; exerciseId: string; durationMinutes: number; equipmentIds: string[];
  machineSettings: string; notes: string; difficulty: number; assessment?: Assessment | null; createdAt: string;
}
interface Photo { id: string; sessionId: string; createdAt?: string; originalName?: string }
interface Workspace { sessions: Session[]; photos: Photo[]; equipment: EquipmentItem[] }
interface Draft { exerciseId: string; durationMinutes: string; equipmentIds: string[]; machineSettings: string; notes: string; difficulty: number; assessment: Assessment }
const initialAssessment: Assessment = { consistency: 3, smoothness: 3, coverage: 3, edgeControl: 3, surfaceDamage: 3, goals: '' };
const assessmentLabels: Array<{ key: keyof Omit<Assessment, 'goals'>; label: string; hint: string }> = [
  { key: 'consistency', label: 'Consistency', hint: '1: uneven · 5: repeatable' },
  { key: 'smoothness', label: 'Smoothness', hint: '1: hesitant · 5: flowing' },
  { key: 'coverage', label: 'Coverage', hint: '1: patchy · 5: even' },
  { key: 'edgeControl', label: 'Edge control', hint: '1: drifting · 5: intentional' },
  { key: 'surfaceDamage', label: 'Visible surface damage', hint: '1: substantial · 5: none noticed' },
];
const freshDraft = (exerciseId: string): Draft => ({ exerciseId, durationMinutes: '15', equipmentIds: [], machineSettings: '', notes: '', difficulty: 3, assessment: { ...initialAssessment } });
const dateLabel = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Your changes could not be saved.');
  return data;
}
async function upload(sessionId: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
  const form = new FormData(); form.set('sessionId', sessionId); form.set('file', file);
  const response = await fetch('/api/photos', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Photo upload failed. Your session is saved; you can try adding the photo again.');
}

export default function PracticeStudio({ workspace, onRefresh }: { workspace: Workspace; onRefresh: () => Promise<void> }) {
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? 'straight-lines');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const selected = exercises.find(exercise => exercise.id === exerciseId) ?? exercises[0];
  useEffect(() => {
    if (startedAt === null) return;
    const interval = window.setInterval(() => setElapsed(elapsedRef.current + Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(interval);
  }, [startedAt]);
  const toggleTimer = () => {
    if (startedAt !== null) { const current = elapsedRef.current + Math.floor((Date.now() - startedAt) / 1000); elapsedRef.current = current; setElapsed(current); setStartedAt(null); setDraft(value => value ? { ...value, durationMinutes: String(Math.max(0.1, Math.round(current / 6) / 10)) } : null); }
    else setStartedAt(Date.now());
  };
  function openSession(session?: Session) {
    setError(''); setNotice(''); setFile(null); elapsedRef.current = 0; setElapsed(0); setStartedAt(null); setEditingId(session?.id ?? null);
    if (session) {
      setExerciseId(session.exerciseId);
      setDraft({ exerciseId: session.exerciseId, durationMinutes: String(session.durationMinutes), equipmentIds: (session.equipmentIds ?? []).filter(id => workspace.equipment.some(item => item.id === id)), machineSettings: session.machineSettings ?? '', notes: session.notes ?? '', difficulty: session.difficulty, assessment: { ...initialAssessment, ...session.assessment } });
    } else setDraft({ ...freshDraft(exerciseId), durationMinutes: String(selected?.minutes ?? 15) });
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    const duration = startedAt === null ? Number(draft.durationMinutes) : Math.round((elapsedRef.current + (Date.now() - startedAt) / 1000) / 6) / 10;
    if (!Number.isFinite(duration) || duration < 0 || duration > 1440) { setError('Enter practice time between 0 and 1,440 minutes.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await request(editingId ? `/api/sessions/${editingId}` : '/api/sessions', editingId ? 'PATCH' : 'POST', { ...draft, durationMinutes: duration });
      setStartedAt(null);
      if (file) {
        try { await upload(saved.id, file); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Session saved, but photo upload failed.'); }
      }
      await onRefresh(); setDraft(null); setFile(null); setNotice(editingId ? 'Practice session updated.' : 'Practice saved. Small, deliberate repetitions add up.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save practice.'); }
    finally { setBusy(false); }
  }
  async function removeSession(session: Session) {
    if (!window.confirm('Delete this practice session and its photos? This cannot be undone.')) return;
    setBusy(true); setError('');
    try { await request(`/api/sessions/${session.id}`, 'DELETE'); await onRefresh(); if (editingId === session.id) { setDraft(null); setStartedAt(null); } setNotice('Session and its photos deleted.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete session.'); }
    finally { setBusy(false); }
  }
  async function addPhoto(sessionId: string, photo: File | undefined) {
    if (!photo) return;
    setBusy(true); setError('');
    try { await upload(sessionId, photo); await onRefresh(); setNotice('Photo saved locally. It has not been sent to an AI provider.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save photo.'); }
    finally { setBusy(false); }
  }
  async function removePhoto(id: string) {
    if (!window.confirm('Delete this practice photo?')) return;
    setBusy(true); setError('');
    try { await request(`/api/photos/${id}`, 'DELETE'); if (compareA === id) setCompareA(''); if (compareB === id) setCompareB(''); await onRefresh(); setNotice('Photo deleted.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete photo.'); }
    finally { setBusy(false); }
  }
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : null);
  const photoLabel = (photo: Photo) => {
    const session = workspace.sessions.find(item => item.id === photo.sessionId);
    return `${exercises.find(item => item.id === session?.exerciseId)?.title ?? 'Practice'} · ${session ? dateLabel(session.createdAt) : photo.id.slice(0, 8)} · ${photo.id.slice(0, 5)}`;
  };
  return <div className="practice-studio">
    <div className="practice-intro"><p className="eyebrow">A little better, every session</p><h2>Train with intention.</h2><p className="muted">Pick one skill. Work on paper or synthetic practice skin. Save what you noticed, and make the next repetition more deliberate.</p></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="practice-success"><Check size={16} /> {notice}</p>}
    <section className="practice-exercise-layout">
      <div className="practice-exercise-list" aria-label="Choose an exercise">{exercises.map((exercise, index) => <button key={exercise.id} className={`practice-exercise ${exerciseId === exercise.id ? 'selected' : ''}`} onClick={() => setExerciseId(exercise.id)} aria-pressed={exerciseId === exercise.id}><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{exercise.title}</strong><small>{exercise.minutes} min · {exercise.category}</small></span><ArrowUpRight className="exercise-chevron" size={15} aria-hidden="true" /></button>)}</div>
      {selected && <article className="panel exercise-detail"><div className="section-heading"><span className="chip">{selected.category}</span><span className="muted"><Clock3 size={14} /> {selected.minutes} min</span></div><h3>{selected.title}</h3><p>{selected.description}</p><p className="eyebrow">The practice</p><ol className="practice-steps">{selected.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol><p className="eyebrow">Bring to the desk</p><p className="muted">{selected.equipment.join(' · ')}</p><div className="exercise-goal"><strong>Look for</strong><ul>{selected.goals.map((goal, index) => <li key={index}>{goal}</li>)}</ul></div><div className="practice-actions"><button className="btn btn-primary" onClick={() => openSession()}><Play size={16} /> Start practice session</button><a className="btn" href={`/api/worksheets/${selected.id}`} download={`${selected.id}-worksheet.svg`}><Download size={16} /> Worksheet SVG</a></div></article>}
    </section>
    {draft && <form className="panel practice-form" onSubmit={save} ref={formRef}>
      <div className="section-heading"><div><p className="eyebrow">{editingId ? 'Refine your record' : 'Your deliberate practice'}</p><h3>{editingId ? 'Edit practice session' : 'Record a session'}</h3></div><button type="button" className="btn btn-ghost" onClick={() => { setDraft(null); setStartedAt(null); }} aria-label="Close session form"><X size={18} /></button></div>
      <div className="practice-timer"><div><span className="eyebrow">Optional session timer</span><strong aria-live="off">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</strong></div><div className="practice-actions"><button type="button" className="btn" onClick={toggleTimer}>{startedAt === null ? <Play size={16} /> : <Pause size={16} />}{startedAt === null ? 'Run timer' : 'Pause & use time'}</button><button type="button" className="btn btn-ghost" onClick={() => { setStartedAt(null); elapsedRef.current = 0; setElapsed(0); }} aria-label="Reset timer"><RotateCcw size={16} /></button></div></div>
      <div className="grid-2"><label className="field"><span className="label">Exercise</span><select value={draft.exerciseId} onChange={event => patch('exerciseId', event.target.value)}>{exercises.map(exercise => <option value={exercise.id} key={exercise.id}>{exercise.title}</option>)}</select></label><label className="field"><span className="label">Logged practice time (minutes)</span><input type="number" required min={0} max={1440} step={0.1} value={draft.durationMinutes} onChange={event => { setStartedAt(null); patch('durationMinutes', event.target.value); }} /></label></div>
      <fieldset className="practice-equipment"><legend className="label">Equipment used (optional)</legend>{workspace.equipment.length ? workspace.equipment.map(item => <label className="practice-checkbox" key={item.id}><input type="checkbox" checked={draft.equipmentIds.includes(item.id)} onChange={event => patch('equipmentIds', event.target.checked ? [...draft.equipmentIds, item.id] : draft.equipmentIds.filter(id => id !== item.id))} /><span>{item.name}</span></label>) : <p className="muted">No inventory yet. Paper and a pencil are enough to begin drawing practice.</p>}</fieldset>
      <div className="grid-2"><label className="field"><span className="label">Machine settings you used (optional)</span><input maxLength={500} value={draft.machineSettings} onChange={event => patch('machineSettings', event.target.value)} placeholder="Your observed settings, not a recommendation" /></label><label className="field"><span className="label">Perceived difficulty</span><select value={draft.difficulty} onChange={event => patch('difficulty', Number(event.target.value))}><option value={1}>1 · Easy</option><option value={2}>2 · Comfortable</option><option value={3}>3 · Challenging</option><option value={4}>4 · Difficult</option><option value={5}>5 · Very difficult</option></select></label></div>
      <label className="field"><span className="label">Practice notes</span><textarea rows={3} maxLength={4000} value={draft.notes} onChange={event => patch('notes', event.target.value)} placeholder="What changed? Which movement felt controlled? What would you repeat?" /></label>
      <div><p className="eyebrow">Your self-assessment</p><p className="muted">These are your observations, not AI scores or proof of readiness for human skin. For surface damage, a higher number means less visible damage.</p><div className="practice-assessments">{assessmentLabels.map(({ key, label, hint }) => <label className="field" key={key}><span className="label">{label}</span><select value={draft.assessment[key]} onChange={event => patch('assessment', { ...draft.assessment, [key]: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map(value => <option value={value} key={value}>{value} / 5</option>)}</select><small className="muted">{hint}</small></label>)}</div></div>
      <label className="field"><span className="label">One improvement goal</span><input maxLength={2000} value={draft.assessment.goals} onChange={event => patch('assessment', { ...draft.assessment, goals: event.target.value })} placeholder="Next time, slow down before each curve…" /></label>
      <label className="field practice-upload"><span className="label"><ImagePlus size={16} /> Add a practice photo (optional)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} /><small className="muted">JPEG, PNG or WebP · up to 5 MB · stored locally, metadata stripped · never sent to AI here.</small></label>
      <div className="practice-actions"><button type="submit" disabled={busy} className="btn btn-primary">{busy ? 'Saving session…' : editingId ? 'Save changes' : 'Save practice session'}</button><button className="btn btn-ghost" type="button" onClick={() => { setDraft(null); setStartedAt(null); }}>Cancel</button></div>
    </form>}
    <section><div className="section-heading"><div><p className="eyebrow">Your practice journal</p><h2>Previous attempts</h2></div><span className="chip">{workspace.sessions.length} sessions</span></div>
      <div className="practice-history">{workspace.sessions.map(session => {
        const exercise = exercises.find(item => item.id === session.exerciseId);
        const photos = workspace.photos.filter(photo => photo.sessionId === session.id);
        return <article className="panel practice-session" key={session.id}><div className="section-heading"><div><p className="eyebrow">{dateLabel(session.createdAt)}</p><h3>{exercise?.title ?? session.exerciseId}</h3></div><div className="practice-actions"><button className="btn btn-ghost" onClick={() => openSession(session)} aria-label={`Edit ${exercise?.title ?? 'practice'} session`}><Pencil size={16} /></button><button className="btn btn-ghost" disabled={busy} onClick={() => removeSession(session)} aria-label={`Delete ${exercise?.title ?? 'practice'} session`}><Trash2 size={16} /></button></div></div><div className="practice-session-meta"><span><Clock3 size={14} /> {session.durationMinutes} min</span><span>Difficulty {session.difficulty}/5</span><span>{(session.equipmentIds ?? []).length} equipment items</span></div>{session.notes && <p className="practice-note">{session.notes}</p>}{session.machineSettings && <p className="muted">Recorded settings: {session.machineSettings}</p>}{session.assessment && <><div className="practice-ratings">{assessmentLabels.map(({ key, label }) => <span key={key}>{label}<strong>{session.assessment?.[key]}/5</strong></span>)}</div>{session.assessment.goals && <p className="practice-goal"><strong>Next repetition</strong> {session.assessment.goals}</p>}</>}
          {!!photos.length && <div className="practice-photos">{photos.map(photo => <figure key={photo.id}><a href={`/api/photos/${photo.id}`} target="_blank" rel="noreferrer"><img src={`/api/photos/${photo.id}`} alt={`Saved ${exercise?.title ?? 'practice'} on ${dateLabel(session.createdAt)}`} /></a><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => removePhoto(photo.id)} aria-label="Delete practice photo"><Trash2 size={14} /></button></figure>)}</div>}
          <label className="btn practice-photo-button"><ImagePlus size={15} /> Add photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void addPhoto(session.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        </article>;
      })}{!workspace.sessions.length && <div className="panel empty-state"><Clock3 size={30} /><h3>Your first repetition belongs here.</h3><p>No scores to chase. Choose a short exercise, record what you noticed, and give yourself a useful starting point.</p><button className="btn" onClick={() => openSession()}>Record your first session</button></div>}</div>
    </section>
    <section className="panel practice-compare"><div><p className="eyebrow">Look back, see the difference</p><h3><Images size={20} /> Compare your practice</h3><p className="muted">Choose two saved images and assess them side by side. These images stay in this workspace; no visual judgments are generated.</p></div>{workspace.photos.length >= 2 ? <div className="grid-2">{[{ value: compareA, set: setCompareA, label: 'Earlier / left image' }, { value: compareB, set: setCompareB, label: 'Later / right image' }].map(({ value, set, label }) => <div key={label}><label className="field"><span className="label">{label}</span><select value={value} onChange={event => set(event.target.value)}><option value="">Choose a practice photo</option>{workspace.photos.map(photo => <option key={photo.id} value={photo.id}>{photoLabel(photo)}</option>)}</select></label>{value && workspace.photos.some(photo => photo.id === value) && <img className="comparison-image" src={`/api/photos/${value}`} alt={label} />}</div>)}</div> : <p className="muted">Save at least two practice photos to compare line control, coverage, and visible changes over time.</p>}</section>
    <style>{`.practice-studio{display:grid;gap:28px}.practice-intro h2{font-size:32px;margin:0 0 12px}.practice-intro p{max-width:760px}.practice-exercise-layout{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.5fr);gap:24px}.practice-exercise-list{display:grid;gap:8px;align-content:start}.practice-exercise{display:flex;align-items:center;gap:14px;text-align:left;padding:16px;border:1px solid #ffffff0d;border-radius:10px;background:#161819;color:#e8e3dc;cursor:pointer;min-height:74px}.practice-exercise.selected{background:#8e333324;border-color:#a9585166}.exercise-number{font-size:11px;color:#aa8774;letter-spacing:.08em}.practice-exercise strong{display:block;font-size:14px}.practice-exercise small{display:block;color:#98928b;margin-top:5px;font-size:11px}.exercise-chevron{margin-left:auto;color:#a47767}.exercise-detail{display:grid;gap:14px;align-content:start}.exercise-detail h3{font-size:27px;margin:0}.exercise-detail p{line-height:1.8;margin:0}.exercise-detail .section-heading .muted{display:flex;align-items:center;gap:5px;font-size:12px}.practice-steps{list-style:decimal;padding-left:23px;display:grid;gap:12px;font-size:14px;line-height:1.75;margin:0}.exercise-goal{background:#ffffff04;border-left:2px solid #95634f;padding:15px 18px;font-size:13px;line-height:1.8}.exercise-goal ul{list-style:disc;padding-left:18px;margin-bottom:0}.practice-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.practice-form{display:grid;gap:22px;scroll-margin-top:30px}.practice-form h3{margin:0}.practice-timer{display:flex;align-items:center;justify-content:space-between;padding:18px;background:#ffffff04;border-radius:10px;gap:16px;flex-wrap:wrap}.practice-timer .eyebrow{display:block}.practice-timer strong{font-size:30px;font-variant-numeric:tabular-nums;display:block;letter-spacing:.06em}.practice-equipment{border:1px solid #ffffff14;border-radius:10px;padding:14px 18px;display:grid;gap:13px;margin:0;min-width:0}.practice-checkbox{display:flex;gap:12px;align-items:center;font-size:13px;cursor:pointer}.practice-checkbox input{width:18px;height:18px;accent-color:#a94b4b}.practice-assessments{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:18px}.practice-assessments small{font-size:10px}.practice-upload .label{display:flex;align-items:center;gap:8px}.practice-upload input{padding:12px;max-width:100%}.practice-upload small{font-size:11px}.practice-history{display:grid;gap:18px;margin-top:20px}.practice-history>.panel+.panel{margin-top:0}.practice-session h3{margin:0;font-size:20px}.practice-session-meta{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:12px;color:#b4aaa0;margin:18px 0}.practice-session-meta span{display:flex;gap:5px;align-items:center}.practice-note{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:14px}.practice-ratings{display:flex;flex-wrap:wrap;gap:9px;margin:20px 0}.practice-ratings span{display:flex;gap:12px;background:#ffffff04;border:1px solid #ffffff0c;border-radius:6px;padding:8px 10px;font-size:11px;color:#a9a198}.practice-ratings strong{color:#e8d8c8}.practice-goal{font-size:13px;line-height:1.7;color:#c8b19a}.practice-goal strong{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}.practice-photos{display:flex;gap:12px;overflow:auto;margin:18px 0;padding-bottom:5px}.practice-photos figure{margin:0;position:relative;flex:0 0 150px}.practice-photos img{width:150px;height:130px;object-fit:cover;display:block;border-radius:8px}.practice-photos button{position:absolute;right:5px;bottom:5px;background:#191919e8}.practice-photo-button{display:inline-flex;position:relative;margin-top:12px;cursor:pointer;font-size:12px}.practice-photo-button input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.practice-photo-button:focus-within{outline:2px solid #e1b09c;outline-offset:3px}.practice-compare{display:grid;gap:20px}.practice-compare h3{display:flex;gap:10px;align-items:center;font-size:22px;margin:0 0 12px}.comparison-image{width:100%;max-height:480px;object-fit:contain;background:#0c0d0e;border:1px solid #ffffff12;border-radius:8px;margin-top:14px}.practice-success{display:flex;align-items:center;gap:8px;color:#b4c6ae;font-size:14px}.form-error{padding:14px 16px;border:1px solid #ac555550;background:#ac555514;border-radius:10px;color:#ffb6ae}@media(max-width:760px){.practice-exercise-layout{grid-template-columns:1fr}.practice-exercise-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.practice-exercise{padding:12px;gap:8px;min-height:78px}.exercise-number{display:none}.practice-exercise strong{font-size:12px}.practice-exercise small{font-size:10px}.exercise-chevron{display:none}.practice-intro h2{font-size:28px}.exercise-detail h3{font-size:23px}.practice-assessments{grid-template-columns:repeat(2,minmax(0,1fr))}.practice-ratings{gap:6px}.practice-ratings span{font-size:10px}.practice-session-meta{gap:10px}}`}</style>
  </div>;
}
