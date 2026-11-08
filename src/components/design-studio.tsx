'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { Brush, Eraser, Undo2, Redo2, Square, Circle, Upload, Download, Printer, Save, FolderOpen, Trash2, FlipHorizontal2, Contrast, Plus, X, PenTool } from 'lucide-react';
import { designSvg, flashTemplates, newDocument, parseDesign, pointPath, type DesignDocument, type DesignElement, type Point } from '@/lib/design';

type Project = { id: string; name: string; document: unknown; createdAt?: string; updatedAt?: string };
type Props = { designs: Project[]; onRefresh: () => Promise<void> };
type Tool = 'brush' | 'eraser' | 'rect' | 'ellipse';
const createId = () => crypto.randomUUID();
const clamp = (value: number) => Math.max(0, Math.min(800, value));

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function hits(el: DesignElement, p: Point, radius: number) {
  if (el.type !== 'path') {
    const x = el.x || 0, y = el.y || 0, w = el.width || 0, h = el.height || 0;
    if (el.type === 'ellipse') {
      if (!w || !h) return false;
      const distance = Math.sqrt(((p[0] - x - w / 2) / (w / 2)) ** 2 + ((p[1] - y - h / 2) / (h / 2)) ** 2);
      return Math.abs(distance - 1) <= (radius + el.strokeWidth / 2) / Math.max(1, Math.min(w, h) / 2);
    }
    return p[0] >= x - radius && p[0] <= x + w + radius && p[1] >= y - radius && p[1] <= y + h + radius && (Math.abs(p[0] - x) <= radius || Math.abs(p[0] - x - w) <= radius || Math.abs(p[1] - y) <= radius || Math.abs(p[1] - y - h) <= radius);
  }
  const points = el.points || [];
  const tolerance = radius + el.strokeWidth / 2;
  if (points.length === 1) return Math.hypot(points[0][0] - p[0], points[0][1] - p[1]) < tolerance;
  return points.slice(1).some((end, i) => {
    const start = points[i];
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const t = Math.max(0, Math.min(1, ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - start[0] - t * dx, p[1] - start[1] - t * dy) < tolerance;
  });
}

export default function DesignStudio({ designs, onRefresh }: Props) {
  const [doc, setDoc] = useState<DesignDocument>(newDocument);
  const [past, setPast] = useState<DesignDocument[]>([]);
  const [future, setFuture] = useState<DesignDocument[]>([]);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(5);
  const [name, setName] = useState('Untitled study');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DesignElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ start: Point; before: DesignDocument; element: DesignElement | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function commit(next: DesignDocument, before = doc) {
    setPast(value => [...value.slice(-39), before]); setFuture([]); setDoc(next); setDirty(true); setNotice('');
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture(values => [doc, ...values]); setDoc(previous); setPast(values => values.slice(0, -1)); setDirty(true);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast(values => [...values, doc]); setDoc(next); setFuture(values => values.slice(1)); setDirty(true);
  }
  function position(event: PointerEvent<SVGSVGElement>): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width * 800);
    return [doc.mirror ? 800 - x : x, clamp((event.clientY - rect.top) / rect.height * 800)];
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || busy) return;
    if (doc.elements.length >= 3000) { setError('This study has reached its 3,000-shape limit. Save it and begin another.'); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const p = position(event);
    const element: DesignElement | null = tool === 'eraser' ? null : tool === 'brush' ? { id: createId(), type: 'path', points: [p], strokeWidth: brushSize } : { id: createId(), type: tool, x: p[0], y: p[1], width: 0, height: 0, strokeWidth: brushSize };
    gesture.current = { start: p, before: doc, element };
    if (tool === 'eraser') setDoc(current => ({ ...current, elements: current.elements.filter(el => !hits(el, p, brushSize * 2)) }));
    else setDraft(element);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active) return;
    const p = position(event);
    if (tool === 'eraser') { setDoc(current => ({ ...current, elements: current.elements.filter(el => !hits(el, p, brushSize * 2)) })); return; }
    const element = active.element!;
    if (element.type === 'path') {
      const previous = element.points!.at(-1)!;
      if (Math.hypot(previous[0] - p[0], previous[1] - p[1]) < 1 || element.points!.length >= 15000) return;
      element.points = [...element.points!, p];
    } else {
      element.x = Math.min(active.start[0], p[0]); element.y = Math.min(active.start[1], p[1]); element.width = Math.abs(p[0] - active.start[0]); element.height = Math.abs(p[1] - active.start[1]);
    }
    setDraft({ ...element });
  }
  function pointerUp() {
    const active = gesture.current;
    if (!active) return;
    if (tool === 'eraser') commit(doc, active.before);
    else if (active.element) commit({ ...active.before, elements: [...active.before.elements, active.element] }, active.before);
    gesture.current = null; setDraft(null);
  }
  function fresh() {
    if (dirty && !window.confirm('Start a new study? Unsaved changes will be lost.')) return;
    setDoc(newDocument()); setPast([]); setFuture([]); setProjectId(null); setName('Untitled study'); setDirty(false); setNotice('New blank study.'); setError('');
  }
  function open(project: Project) {
    if (dirty && !window.confirm('Open this project? Unsaved changes will be lost.')) return;
    const parsed = parseDesign(project.document);
    if (!parsed) { setError('This project uses an unsupported or invalid drawing format.'); return; }
    setDoc(parsed); setName(project.name); setProjectId(project.id); setPast([]); setFuture([]); setDirty(false); setError(''); setNotice('Project opened.');
  }
  async function save() {
    if (!name.trim()) { setError('Give your study a name before saving.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(projectId ? `/api/designs/${projectId}` : '/api/designs', { method: projectId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), document: doc }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The project could not be saved.');
      setProjectId(data.id || data.design?.id || projectId); setDirty(false); await onRefresh(); setNotice('Study saved to your workspace.');
    } catch (err) { setError(err instanceof Error ? err.message : 'The project could not be saved.'); }
    finally { setBusy(false); }
  }
  async function remove(project: Project) {
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/designs/${project.id}`, { method: 'DELETE' });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'The project could not be deleted.'); }
      if (projectId === project.id) { setProjectId(null); setDirty(true); }
      await onRefresh(); setNotice('Saved project deleted. The current canvas is still available.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed.'); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
      if (!png && !jpeg && !webp) throw new Error('Use a valid PNG, JPEG, or WebP image. SVG references are not accepted.');
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40_000_000) { bitmap.close(); throw new Error('This image is too large. Resize it below 40 megapixels.'); }
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = window.document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser cannot process this image.');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length > 6_500_000) throw new Error('This image is too detailed to save locally. Choose a smaller reference.');
      commit({ ...doc, reference: { dataUrl, width: canvas.width, height: canvas.height } }); setNotice('Reference added. It stays local and is never sent to an AI provider.');
    } catch (err) { setError(err instanceof Error ? err.message : 'This image could not be opened.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  const safeName = name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'midnight-study';
  async function exportPng() {
    setBusy(true); setError('');
    const url = URL.createObjectURL(new Blob([designSvg(doc)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('The image export could not be rendered.')); img.src = url; });
      const canvas = window.document.createElement('canvas'); canvas.width = 1600; canvas.height = 1600;
      canvas.getContext('2d')!.drawImage(img, 0, 0, 1600, 1600);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG export is unavailable in this browser.');
      download(blob, `${safeName}.png`); setNotice('PNG exported at 1,600 × 1,600 pixels.');
    } catch (err) { setError(err instanceof Error ? err.message : 'PNG export failed.'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  function printStencil() {
    const printWindow = window.open('', '_blank', 'width=850,height=950');
    if (!printWindow) { setError('Allow the print window in your browser, then try again.'); return; }
    const title = printWindow.document.createElement('title'); title.textContent = `${name} · Midnight Ink stencil study`; printWindow.document.head.append(title);
    const style = printWindow.document.createElement('style'); style.textContent = '@page{size:A4;margin:15mm}body{font:12px Arial;color:#111}svg{width:160mm;max-width:100%;height:auto;display:block;margin:10mm auto}h1{font-size:16px}p{line-height:1.5}@media print{button{display:none}}'; printWindow.document.head.append(style);
    const heading = printWindow.document.createElement('h1'); heading.textContent = name; printWindow.document.body.append(heading);
    const note = printWindow.document.createElement('p'); note.textContent = 'MIDNIGHT INK · Paper and synthetic-skin stencil study. Verify printed size. High-contrast artwork requires manual review and is not cleared for professional application.'; printWindow.document.body.append(note);
    const drawing = new DOMParser().parseFromString(designSvg({ ...doc, contrast: true }), 'image/svg+xml'); printWindow.document.body.append(printWindow.document.importNode(drawing.documentElement, true));
    const button = printWindow.document.createElement('button'); button.textContent = 'Print stencil layout'; button.onclick = () => printWindow.print(); printWindow.document.body.append(button);
    printWindow.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
    setNotice('Print layout opened in a separate window.');
  }
  function renderElement(el: DesignElement) {
    const props = { fill: 'none', stroke: '#151316', strokeWidth: el.strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    if (el.type === 'path') return <path key={el.id} d={pointPath(el.points || [])} {...props} />;
    if (el.type === 'rect') return <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height} {...props} />;
    return <ellipse key={el.id} cx={el.x! + el.width! / 2} cy={el.y! + el.height! / 2} rx={el.width! / 2} ry={el.height! / 2} {...props} />;
  }

  return <div className="ink-design">
    <style>{`
      .ink-design{min-width:0}.ink-design .design-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:22px;align-items:start}.ink-design .design-workspace{padding:20px;min-width:0}.ink-design .design-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:16px}.ink-design .tool{width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--border,#343136);background:transparent;color:inherit;cursor:pointer}.ink-design .tool.active{background:#a54348;border-color:#b6585d;color:#fff}.ink-design .tool:disabled{opacity:.35;cursor:not-allowed}.ink-design .tool:focus-visible{outline:2px solid #dfaaa3;outline-offset:3px}.ink-design .design-canvas-wrap{padding:16px;border:1px solid #383538;border-radius:10px;background:#151519;box-shadow:inset 0 1px 20px #0003}.ink-design .design-canvas{display:block;width:100%;height:auto;aspect-ratio:1;background:#f5efe4;touch-action:none;border-radius:3px;cursor:crosshair}.ink-design .design-canvas:focus-visible{outline:3px solid #bd7477;outline-offset:4px}.ink-design .design-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:#aaa4a2}.ink-design .design-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.ink-design .template-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ink-design .template-btn{padding:12px 8px;border:1px solid #3b3436;border-radius:8px;background:#1c191c;color:#e4ded5;text-align:left;cursor:pointer;min-height:70px}.ink-design .template-btn:hover{border-color:#a66567}.ink-design .template-btn strong{display:block;font-size:12px;line-height:1.5}.ink-design .template-btn span{font-size:10px;color:#aaa19a}.ink-design .design-aside{display:grid;gap:16px}.ink-design .design-aside .panel{padding:18px}.ink-design .saved-design{display:flex;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #332e31}.ink-design .saved-design:last-child{border:0}.ink-design .saved-design .open-design{flex:1;text-align:left;background:none;border:0;color:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;min-height:40px}.ink-design .saved-design .open-design span{overflow-wrap:anywhere}.ink-design .design-notice{padding:12px 16px;background:#182c26;border:1px solid #355447;border-radius:8px;margin-bottom:16px;color:#c3decc}.ink-design .design-error{padding:12px 16px;background:#361c20;border:1px solid #704044;border-radius:8px;margin-bottom:16px;color:#f3cdcd}.ink-design .design-help{font-size:12px;line-height:1.7;color:#b5aaa5}.ink-design .range-control{display:flex;align-items:center;gap:8px;margin-left:8px;font-size:12px}.ink-design .range-control input{width:85px;accent-color:#b14d55}.ink-design .design-name{display:flex;gap:10px;align-items:end;margin-bottom:20px}.ink-design .design-name label{flex:1;min-width:0}.ink-design .design-name input{width:100%;box-sizing:border-box}.ink-design h3{font-size:14px;margin:0 0 14px}.ink-design .tool-divider{height:25px;width:1px;background:#393136;margin:0 3px}.ink-design .reference-info{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:#aaa19a}@media(max-width:1000px){.ink-design .design-layout{grid-template-columns:1fr}.ink-design .design-aside{grid-template-columns:1fr 1fr}}@media(max-width:580px){.ink-design .design-workspace{padding:12px}.ink-design .design-canvas-wrap{padding:8px}.ink-design .design-aside{grid-template-columns:1fr}.ink-design .design-name{flex-wrap:wrap}.ink-design .range-control{margin-left:0;flex-basis:100%;margin-top:6px}.ink-design .range-control input{width:120px}.ink-design .design-actions .btn{flex:1;white-space:nowrap;font-size:12px}.ink-design .tool{width:40px;height:40px}}
    `}</style>
    <header style={{ marginBottom: 24 }}><div className="eyebrow">MAKE YOUR MARK</div><h1 className="page-title">Design Studio</h1><p className="muted">A quiet space for bold ideas. Draw, simplify, and build your next paper study.</p></header>
    {error && <div role="alert" className="design-error">{error}</div>}
    {notice && <div role="status" className="design-notice">{notice}</div>}
    <div className="design-layout">
      <section className="panel design-workspace" aria-label="Drawing workspace">
        <div className="design-name"><label><span className="label">Study name</span><input className="field" value={name} maxLength={120} onChange={e => { setName(e.target.value); setDirty(true); }} aria-label="Study name" /></label><button className="btn btn-primary" onClick={save} disabled={busy}><Save size={16} />{busy ? 'Working…' : 'Save study'}</button></div>
        <div className="design-toolbar" role="toolbar" aria-label="Drawing tools">
          {([{ id: 'brush', label: 'Freehand brush', Icon: Brush }, { id: 'eraser', label: 'Eraser', Icon: Eraser }, { id: 'rect', label: 'Rectangle', Icon: Square }, { id: 'ellipse', label: 'Circle or ellipse', Icon: Circle }] as const).map(({ id, label, Icon }) => <button key={id} type="button" className={`tool ${tool === id ? 'active' : ''}`} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} /></button>)}
          <span className="tool-divider" />
          <button className="tool" aria-label="Undo" title="Undo" disabled={!past.length} onClick={undo}><Undo2 size={18} /></button><button className="tool" aria-label="Redo" title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={18} /></button>
          <button className={`tool ${doc.mirror ? 'active' : ''}`} aria-label="Mirror horizontally" title="Mirror horizontally" aria-pressed={doc.mirror} onClick={() => commit({ ...doc, mirror: !doc.mirror })}><FlipHorizontal2 size={18} /></button>
          <button className={`tool ${doc.contrast ? 'active' : ''}`} aria-label="High contrast reference preview" title="High contrast reference preview" aria-pressed={doc.contrast} onClick={() => commit({ ...doc, contrast: !doc.contrast })}><Contrast size={18} /></button>
          <label className="range-control">{tool === 'eraser' ? 'Eraser radius' : 'Brush size'}<input aria-label="Brush size" type="range" min="1" max="40" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} /><span>{brushSize}{tool === 'eraser' ? ' × 2' : ' px'}</span></label>
        </div>
        <div className="design-canvas-wrap">
          <svg ref={svgRef} className="design-canvas" viewBox="0 0 800 800" role="img" aria-label="Drawing canvas. Use a pointer to draw. Keyboard users can insert a flash template below." tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
            <defs><pattern id="study-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#a99e8a" strokeWidth=".4" opacity=".3" /></pattern><filter id="ink-threshold" colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncR type="discrete" tableValues="0 1" /><feFuncG type="discrete" tableValues="0 1" /><feFuncB type="discrete" tableValues="0 1" /></feComponentTransfer></filter></defs>
            <rect width="800" height="800" fill="#f5efe4" /><rect width="800" height="800" fill="url(#study-grid)" />
            <g transform={doc.mirror ? 'translate(800 0) scale(-1 1)' : undefined}>
              {doc.reference && <image href={doc.reference.dataUrl} x={40} y={40} width={720} height={720} preserveAspectRatio="xMidYMid meet" filter={doc.contrast ? 'url(#ink-threshold)' : undefined} />}
              {doc.elements.map(renderElement)}{draft && renderElement(draft)}
            </g>
            {!doc.elements.length && !doc.reference && !draft && <g pointerEvents="none" fill="#8c7d6e" textAnchor="middle"><text x="400" y="380" fontSize="16" fontFamily="Georgia,serif">Every mark starts somewhere.</text><text x="400" y="414" fontSize="11" fontFamily="sans-serif">Draw here, upload a reference, or choose a flash template.</text></g>}
          </svg>
        </div>
        <div className="design-meta"><span>800 × 800 canvas · {doc.elements.length} shapes</span><span>{dirty ? 'Unsaved changes' : projectId ? 'Saved project' : 'New study'} · {tool === 'eraser' ? 'Touch a stroke to remove it' : 'Paper / synthetic-skin practice'}</span></div>
        {doc.reference && <div className="reference-info"><span>Reference attached · vector export requires its removal</span><button className="tool" aria-label="Remove reference image" onClick={() => commit({ ...doc, reference: null })}><X size={15} /></button></div>}
        <div className="design-actions"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void upload(e.target.files?.[0])} /><button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={15} />Reference</button><button className="btn" onClick={exportPng} disabled={busy}><Download size={15} />PNG</button><button className="btn" disabled={!!doc.reference || busy} title={doc.reference ? 'Remove the raster reference to export vectors' : 'Export editable vector geometry'} onClick={() => { download(new Blob([designSvg(doc, false)], { type: 'image/svg+xml' }), `${safeName}.svg`); setNotice('Vector SVG exported.'); }}><Download size={15} />SVG</button><button className="btn" onClick={printStencil} disabled={busy}><Printer size={15} />Stencil</button><button className="btn" onClick={fresh} disabled={busy}><Plus size={15} />New</button></div>
        <p className="design-help" style={{ marginBottom: 0 }}>References are re-encoded to remove metadata and saved only when you save the study. High contrast is a study aid; review every edge and printed size before synthetic-skin transfer.</p>
      </section>
      <aside className="design-aside">
        <section className="panel"><h3><PenTool size={15} style={{ marginRight: 8, verticalAlign: 'middle' }} />Original flash studies</h3><p className="design-help">Start with a shape. Make it yours. Templates add editable strokes to the current canvas.</p><div className="template-list">{flashTemplates.map(template => <button key={template.id} className="template-btn" onClick={() => { if (doc.elements.length + template.elements.length > 3000) { setError('Your canvas has reached its shape limit. Start a new study.'); return; } commit({ ...doc, elements: [...doc.elements, ...template.elements.map(el => ({ ...el, id: createId() }))] }); setNotice(`${template.name} added to your canvas.`); }}><strong>{template.name}</strong><span>{template.theme}</span></button>)}</div></section>
        <section className="panel"><h3>Saved studies <span className="muted">({designs.length})</span></h3>{designs.length ? designs.map(project => <div className="saved-design" key={project.id}><button className="open-design" onClick={() => open(project)}><FolderOpen size={16} style={{ flexShrink: 0 }} /><span>{project.name}</span></button><button className="tool" aria-label={`Delete ${project.name}`} disabled={busy} onClick={() => void remove(project)}><Trash2 size={15} /></button></div>) : <p className="design-help">Your first study belongs here. Add a few marks and save it to return any time.</p>}</section>
      </aside>
    </div>
  </div>;
}
