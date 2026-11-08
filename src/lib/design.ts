/** Small, serializable drawing format. A project never contains executable SVG or HTML. */
export type Point = [number, number];
export type DesignElement = {
  id: string;
  type: 'path' | 'rect' | 'ellipse';
  points?: Point[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strokeWidth: number;
};
export type DesignDocument = {
  version: 1;
  width: 800;
  height: 800;
  elements: DesignElement[];
  reference: { dataUrl: string; width: number; height: number } | null;
  mirror: boolean;
  contrast: boolean;
};
export const newDocument = (): DesignDocument => ({ version: 1, width: 800, height: 800, elements: [], reference: null, mirror: false, contrast: false });

export function parseDesign(value: unknown): DesignDocument | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as Partial<DesignDocument>;
  if (doc.version !== 1 || doc.width !== 800 || doc.height !== 800 || !Array.isArray(doc.elements) || doc.elements.length > 3000) return null;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000;
  const coordinate = (n: unknown): n is number => finite(n) && n >= 0 && n <= 800;
  const elements: DesignElement[] = [];
  let totalPoints = 0;
  for (const el of doc.elements) {
    if (!el || typeof el.id !== 'string' || el.id.length > 100 || !['path', 'rect', 'ellipse'].includes(el.type) || !finite(el.strokeWidth) || el.strokeWidth < 1 || el.strokeWidth > 80) return null;
    if (el.type === 'path') {
      if (!Array.isArray(el.points) || !el.points.length || el.points.length > 15000 || !el.points.every(p => Array.isArray(p) && p.length === 2 && p.every(coordinate))) return null;
      totalPoints += el.points.length;
      if (totalPoints > 100000) return null;
      elements.push({ id: el.id, type: 'path', strokeWidth: el.strokeWidth, points: el.points.map(p => [p[0], p[1]]) });
    } else {
      if (![el.x, el.y, el.width, el.height].every(coordinate) || el.x! + el.width! > 800 || el.y! + el.height! > 800) return null;
      elements.push({ id: el.id, type: el.type, strokeWidth: el.strokeWidth, x: el.x, y: el.y, width: el.width, height: el.height });
    }
  }
  let reference: DesignDocument['reference'] = null;
  if (doc.reference !== null && doc.reference !== undefined) {
    const ref = doc.reference;
    if (!ref || typeof ref !== 'object' || typeof ref.dataUrl !== 'string' || ref.dataUrl.length > 7_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(ref.dataUrl) || !finite(ref.width) || !finite(ref.height) || ref.width <= 0 || ref.height <= 0 || ref.width > 4096 || ref.height > 4096) return null;
    try {
      const header = atob(ref.dataUrl.slice(ref.dataUrl.indexOf(',') + 1, ref.dataUrl.indexOf(',') + 25));
      const png = ref.dataUrl.startsWith('data:image/png;') && header.startsWith('\x89PNG\r\n\x1a\n');
      const jpeg = ref.dataUrl.startsWith('data:image/jpeg;') && header.startsWith('\xff\xd8\xff');
      const webp = ref.dataUrl.startsWith('data:image/webp;') && header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
      if (!png && !jpeg && !webp) return null;
    } catch { return null; }
    reference = { dataUrl: ref.dataUrl, width: ref.width, height: ref.height };
  }
  return { version: 1, width: 800, height: 800, elements, reference, mirror: doc.mirror === true, contrast: doc.contrast === true };
}

export function pointPath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}l0.1 0.1`;
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

/** Only numeric geometry and validated image data are interpolated into exports. */
export function designSvg(document: DesignDocument, includeReference = true): string {
  const doc = parseDesign(document);
  if (!doc) throw new Error('This project has an unsupported drawing format.');
  const elements = doc.elements.map(el => {
    const props = `fill="none" stroke="#151316" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    if (el.type === 'path') return `<path d="${pointPath(el.points || [])}" ${props}/>`;
    if (el.type === 'rect') return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" ${props}/>`;
    return `<ellipse cx="${el.x! + el.width! / 2}" cy="${el.y! + el.height! / 2}" rx="${el.width! / 2}" ry="${el.height! / 2}" ${props}/>`;
  }).join('');
  const filter = '<defs><filter id="threshold" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/></feComponentTransfer></filter></defs>';
  const ref = includeReference && doc.reference ? `<image href="${doc.reference.dataUrl}" x="40" y="40" width="720" height="720" preserveAspectRatio="xMidYMid meet"${doc.contrast ? ' filter="url(#threshold)"' : ''}/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">${filter}<rect width="800" height="800" fill="white"/><g${doc.mirror ? ' transform="translate(800 0) scale(-1 1)"' : ''}>${ref}${elements}</g></svg>`;
}

const path = (id: string, points: Point[], strokeWidth = 4): DesignElement => ({ id, type: 'path', points, strokeWidth });
const ellipse = (id: string, x: number, y: number, width: number, height: number): DesignElement => ({ id, type: 'ellipse', x, y, width, height, strokeWidth: 4 });
export const flashTemplates: { id: string; name: string; theme: string; elements: DesignElement[] }[] = [
  { id: 'north', name: 'Northbound', theme: 'Geometric', elements: [path('n1', [[400, 150], [570, 400], [400, 650], [230, 400], [400, 150]]), path('n2', [[400, 225], [485, 400], [400, 575], [315, 400], [400, 225]], 2), path('n3', [[400, 100], [400, 700]], 2), path('n4', [[180, 400], [620, 400]], 2)] },
  { id: 'sprig', name: 'Night sprig', theme: 'Botanical', elements: [path('b1', [[350, 660], [370, 540], [400, 420], [430, 300], [455, 180]]), path('b2', [[370, 540], [260, 510], [220, 430], [300, 440], [370, 540]]), path('b3', [[400, 420], [310, 360], [290, 280], [370, 320], [400, 420]]), path('b4', [[420, 340], [510, 320], [550, 245], [470, 260], [420, 340]]), path('b5', [[448, 220], [420, 155], [460, 100], [480, 160], [448, 220]])] },
  { id: 'arch', name: 'Quiet cathedral', theme: 'Gothic', elements: [path('g1', [[220, 650], [220, 350], [260, 250], [400, 100], [540, 250], [580, 350], [580, 650], [220, 650]]), path('g2', [[275, 600], [275, 365], [310, 280], [400, 180], [490, 280], [525, 365], [525, 600], [275, 600]], 3), path('g3', [[400, 180], [400, 600]], 3), ellipse('g4', 335, 320, 130, 130)] },
  { id: 'orbit', name: 'Little orbit', theme: 'Minimal symbol', elements: [ellipse('m1', 285, 285, 230, 230), ellipse('m2', 180, 345, 440, 110), path('m3', [[590, 200], [590, 260]], 3), path('m4', [[560, 230], [620, 230]], 3)] },
  { id: 'letter', name: 'Letterform study', theme: 'Lettering practice', elements: [path('l1', [[260, 600], [330, 200], [400, 440], [470, 200], [540, 600]], 8), path('l2', [[220, 600], [580, 600]], 2), path('l3', [[250, 200], [550, 200]], 2)] },
  { id: 'flow', name: 'After hours', theme: 'Abstract blackwork', elements: [path('a1', [[250, 640], [250, 520], [290, 420], [380, 350], [470, 300], [520, 220], [520, 140]], 24), path('a2', [[330, 680], [330, 560], [370, 460], [460, 390], [550, 340], [600, 260]], 12), path('a3', [[170, 570], [170, 450], [210, 350], [300, 280], [390, 230], [440, 150]], 6)] },
];
