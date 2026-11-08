import { describe, expect, it } from 'vitest';
import { designSvg, flashTemplates, newDocument, parseDesign, pointPath, type DesignDocument } from '../src/lib/design';

const raster = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const withShape = (): DesignDocument => ({ ...newDocument(), elements: [{ id: 'stroke-1', type: 'path', points: [[20, 40], [120, 240]], strokeWidth: 5 }] });

describe('safe, persistent design documents', () => {
  it('round-trips a vector drawing without aliasing mutable points', () => {
    const original = withShape();
    const restored = parseDesign(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
    restored!.elements[0].points![0][0] = 200;
    expect(original.elements[0].points![0][0]).toBe(20);
  });
  it('all original flash templates are valid, vector-exportable documents', () => {
    expect(flashTemplates).toHaveLength(6);
    expect(new Set(flashTemplates.map(template => template.theme)).size).toBe(6);
    for (const template of flashTemplates) {
      const doc = { ...newDocument(), elements: template.elements };
      expect(parseDesign(doc)).not.toBeNull();
      const svg = designSvg(doc);
      expect(svg).toContain('<svg');
      expect(svg).toMatch(/<(path|ellipse)/);
      expect(svg).not.toContain('<image');
    }
  });
  it('exports mirror and contrast state and includes a reference only when requested', () => {
    const doc: DesignDocument = { ...withShape(), reference: { dataUrl: raster, width: 1, height: 1 }, mirror: true, contrast: true };
    expect(parseDesign(doc)).not.toBeNull();
    const svg = designSvg(doc);
    expect(svg).toContain('translate(800 0) scale(-1 1)');
    expect(svg).toContain('filter="url(#threshold)"');
    expect(svg).toContain(raster);
    expect(designSvg(doc, false)).not.toContain('<image');
  });
  it.each([
    { ...withShape(), width: 1600 },
    { ...withShape(), version: 999 },
    { ...withShape(), elements: [{ id: 'x', type: 'script', strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'path', points: [[NaN, 30]], strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'path', points: [[20, Infinity]], strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'path', points: [], strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'rect', x: 1, y: 1, width: -4, height: 50, strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'rect', x: 700, y: 1, width: 300, height: 50, strokeWidth: 5 }] },
    { ...withShape(), elements: [{ id: 'x', type: 'path', points: [[20, 40]], strokeWidth: 100 }] },
    { ...withShape(), reference: { dataUrl: 'javascript:alert(1)', width: 1, height: 1 } },
    { ...withShape(), reference: { dataUrl: `data:image/svg+xml;base64,${btoa('<svg onload="alert(1)"/>')}`, width: 1, height: 1 } },
    { ...withShape(), reference: { dataUrl: `data:image/png;base64,${btoa('<svg onload="alert(1)"/>')}`, width: 1, height: 1 } },
    { ...withShape(), reference: { dataUrl: raster, width: -1, height: 1 } },
    { ...withShape(), reference: { dataUrl: raster, width: 10000, height: 1 } },
  ])('rejects malformed, unsafe, or out-of-bounds documents %#', value => {
    expect(parseDesign(value)).toBeNull();
    expect(() => designSvg(value as DesignDocument)).toThrow(/unsupported/);
  });
  it('rejects excessively complex shapes and projects', () => {
    const shape = withShape().elements[0];
    expect(parseDesign({ ...newDocument(), elements: Array(3001).fill(shape) })).toBeNull();
    expect(parseDesign({ ...newDocument(), elements: [{ ...shape, points: Array(15001).fill([1, 1]) }] })).toBeNull();
    expect(parseDesign({ ...newDocument(), elements: Array(10).fill({ ...shape, points: Array(15000).fill([1, 1]) }) })).toBeNull();
  });
  it('does not interpolate untrusted IDs or arbitrary attributes into SVG', () => {
    const doc = { ...newDocument(), elements: [{ ...withShape().elements[0], id: '"><script>alert(1)</script>', onload: 'alert(1)', stroke: 'url(https://attacker.invalid)' }] };
    const parsed = parseDesign(doc);
    expect(parsed!.elements[0]).not.toHaveProperty('onload');
    const svg = designSvg(doc);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('attacker');
  });
  it('retains single marks and rounds multi-point path geometry predictably', () => {
    expect(pointPath([])).toBe('');
    expect(pointPath([[5, 10]])).toBe('M5 10l0.1 0.1');
    expect(pointPath([[5.555, 10], [30, 44.444]])).toBe('M5.6 10.0 L30.0 44.4');
  });
});
