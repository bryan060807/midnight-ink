'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Package, PenTool, Droplets, X, Check } from 'lucide-react';
import { parseCartridge } from '@/lib/cartridge';

type EquipmentKind = 'machine' | 'cartridge' | 'ink';
interface EquipmentItem {
  id: string; kind: EquipmentKind; name: string; manufacturer?: string; model?: string;
  machineType?: string; stroke?: string; power?: string; brand?: string; code?: string;
  configuration?: string; purpose?: string; expiresAt?: string; notes?: string; provenance?: string;
}
type EquipmentDraft = Omit<EquipmentItem, 'id'>;
const emptyDraft: EquipmentDraft = { kind: 'machine', name: '', manufacturer: '', model: '', machineType: '', stroke: '', power: '', brand: '', code: '', configuration: '', purpose: 'Practice only', expiresAt: '', notes: '', provenance: 'User-reported; manufacturer specifications not independently verified.' };
const kindLabels = { machine: 'Machine', cartridge: 'Cartridge', ink: 'Ink' };
const iconFor = { machine: PenTool, cartridge: Package, ink: Droplets };

async function mutation(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Your change could not be saved. Please try again.');
  return data;
}

export default function EquipmentManager({ workspace, onRefresh }: { workspace: { equipment: EquipmentItem[] }; onRefresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<EquipmentDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('1205M1');
  const parsed = parseCartridge(code);
  const update = (key: keyof EquipmentDraft, value: string) => setDraft(current => current ? { ...current, [key]: value } : null);
  function open(item?: EquipmentItem) {
    setError(''); setNotice(''); setEditingId(item?.id ?? null);
    if (item) { const fields = Object.fromEntries(Object.keys(emptyDraft).map(key => [key, item[key as keyof EquipmentItem] ?? emptyDraft[key as keyof EquipmentDraft]])) as EquipmentDraft; setDraft(fields); }
    else setDraft({ ...emptyDraft });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) { setError('Give this equipment a name so you can identify it during practice.'); return; }
    setBusy(true); setError('');
    try {
      await mutation(editingId ? `/api/equipment/${editingId}` : '/api/equipment', editingId ? 'PATCH' : 'POST', draft);
      await onRefresh(); setDraft(null); setNotice(editingId ? 'Equipment updated.' : 'Equipment added to your workspace.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save equipment.'); }
    finally { setBusy(false); }
  }
  async function remove(item: EquipmentItem) {
    if (!window.confirm(`Remove ${item.name} from your equipment inventory?`)) return;
    setBusy(true); setError('');
    try { await mutation(`/api/equipment/${item.id}`, 'DELETE'); await onRefresh(); if (editingId === item.id) setDraft(null); setNotice('Equipment removed.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not remove equipment.'); }
    finally { setBusy(false); }
  }
  const textField = (key: keyof EquipmentDraft, label: string, placeholder = '') => (
    <label className="field" key={key}><span className="label">{label}</span><input value={draft?.[key] ?? ''} maxLength={key === 'notes' ? 4000 : 500} onChange={event => update(key, event.target.value)} placeholder={placeholder} /></label>
  );
  return <div className="equipment-manager">
    <div className="section-heading"><div><p className="eyebrow">Know your tools</p><h2>Your equipment</h2></div><button className="btn btn-primary" onClick={() => open()}><Plus size={17} /> Add equipment</button></div>
    <p className="muted">Build an honest inventory. Unknown specifications stay unknown; cartridge conventions do not verify a particular product.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="form-success"><Check size={16} /> {notice}</p>}
    {draft && <form className="panel equipment-form" onSubmit={save}>
      <div className="section-heading"><h3>{editingId ? 'Edit equipment' : 'Add equipment'}</h3><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)} aria-label="Close equipment form"><X size={18} /></button></div>
      <div className="grid-2">
        <label className="field"><span className="label">Equipment type</span><select value={draft.kind} onChange={event => update('kind', event.target.value)}><option value="machine">Machine</option><option value="cartridge">Cartridge</option><option value="ink">Ink</option></select></label>
        <label className="field"><span className="label">Name *</span><input required value={draft.name} maxLength={150} onChange={event => update('name', event.target.value)} placeholder="A name you recognize" /></label>
        {draft.kind === 'machine' && <>{textField('manufacturer', 'Manufacturer', 'Unknown is fine')}{textField('model', 'Model')}{textField('machineType', 'Machine type', 'Rotary pen, coil, unknown…')}{textField('stroke', 'Stroke specification', 'Unknown')}{textField('power', 'Battery / power details')}</>}
        {draft.kind === 'cartridge' && <>{textField('brand', 'Cartridge brand')}{textField('code', 'Cartridge code', '1205M1')}{textField('configuration', 'Configuration', 'Five-point magnum')}{textField('expiresAt', 'Packaging expiration', 'YYYY-MM or YYYY-MM-DD')}</>}
        {draft.kind === 'ink' && <>{textField('brand', 'Ink brand')}{textField('purpose', 'Purpose / safety status', 'Practice only — human-use status unverified')}{textField('expiresAt', 'Expiration information', 'Unknown')}</>}
      </div>
      <label className="field"><span className="label">Personal notes</span><textarea rows={3} maxLength={4000} value={draft.notes ?? ''} onChange={event => update('notes', event.target.value)} placeholder="Packaging details, maintenance, and questions to verify…" /></label>
      <p className="muted">Entries are your reported information. Packaging claims and expiration dates do not independently establish sterility or suitability for human tattooing.</p>
      <div className="equipment-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save equipment'}</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    <div className="grid-3 equipment-cards">
      {workspace.equipment.map(item => {
        const Icon = iconFor[item.kind] ?? Package;
        const details = item.kind === 'machine' ? [['Manufacturer', item.manufacturer], ['Model', item.model], ['Type', item.machineType], ['Stroke', item.stroke], ['Power', item.power]] : item.kind === 'cartridge' ? [['Brand', item.brand], ['Code', item.code], ['Configuration', item.configuration], ['Expiration', item.expiresAt]] : [['Brand', item.brand], ['Purpose', item.purpose], ['Expiration', item.expiresAt]];
        return <article className="panel equipment-card" key={item.id}>
          <div className="section-heading"><span className="chip"><Icon size={14} /> {kindLabels[item.kind]}</span><div className="equipment-actions"><button className="btn btn-ghost" onClick={() => open(item)} aria-label={`Edit ${item.name}`}><Pencil size={16} /></button><button className="btn btn-ghost" disabled={busy} onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16} /></button></div></div>
          <h3>{item.name}</h3><dl className="equipment-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Unknown'}</dd></div>)}</dl>
          {item.notes && <p className="muted">{item.notes}</p>}
          <p className="equipment-provenance">{item.provenance || 'User-reported equipment information. Specifications not independently verified.'}</p>
        </article>;
      })}
      {!workspace.equipment.length && <div className="panel empty-state"><Package size={30} /><h3>Your kit starts here</h3><p>Add a pencil, practice machine, cartridge, or practice ink. Only record specifications you actually know.</p><button className="btn" onClick={() => open()}>Add your first item</button></div>}
    </div>
    <section className="panel cartridge-explainer"><div><p className="eyebrow">Decode the packaging</p><h3>Cartridge code explainer</h3><p className="muted">A guide to common labeling conventions, not a manufacturer verification.</p></div>
      <label className="field"><span className="label">Cartridge code</span><input value={code} maxLength={40} onChange={event => setCode(event.target.value)} placeholder="Try 1203RL or 1007RM" /></label>
      <div aria-live="polite"><h4>{parsed.label}</h4><p>{parsed.explanation}</p>{parsed.warning && <p className="muted">{parsed.warning}</p>}</div>
      <p className="equipment-provenance">Practice only. Never reuse disposable cartridges. Follow packaging instructions and local sharps disposal rules; a photograph cannot verify sterile status.</p>
    </section>
    <style>{`.equipment-manager{display:grid;gap:22px}.equipment-manager h2,.equipment-manager h3{margin:0 0 8px}.equipment-cards{align-items:stretch}.equipment-cards>.empty-state{grid-column:1/-1}.equipment-cards>.panel+.panel{margin-top:0}.equipment-card{min-width:0;display:flex;flex-direction:column}.equipment-card h3{font-size:18px;line-height:1.45}.equipment-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.equipment-details{display:grid;gap:10px;margin:18px 0}.equipment-details>div{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #ffffff0b;padding-bottom:8px}.equipment-details dt{color:#a7a19a;font-size:12px;flex-shrink:0}.equipment-details dd{margin:0;text-align:right;font-size:13px;overflow-wrap:anywhere}.equipment-provenance{font-size:11px;line-height:1.6;color:#ad9b88;padding-top:14px;border-top:1px solid #ffffff0d;margin-top:auto}.equipment-form{display:grid;gap:20px}.cartridge-explainer{display:grid;gap:16px;max-width:900px}.cartridge-explainer .field{max-width:360px}.form-error{padding:14px 16px;border:1px solid #ac555550;background:#ac555514;border-radius:10px;color:#ffb6ae}.form-success{display:flex;align-items:center;gap:8px;color:#b4c6ae;font-size:14px}`}</style>
  </div>;
}
