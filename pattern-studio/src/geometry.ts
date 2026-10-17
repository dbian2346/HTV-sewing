export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface EdgeAllowances { top: number; right: number; bottom: number; left: number }
export type Edge = keyof EdgeAllowances;
export type Primitive =
  | { kind: 'line'; from: Point; to: Point; style: 'cut' | 'stitch' | 'annotation' | 'fold' }
  | { kind: 'path'; d: string; style: 'cut' | 'stitch' | 'annotation' | 'fold' }
  | { kind: 'text'; at: Point; text: string; size: number; rotation?: number };
export interface Notch { edge: Edge; offset: number; label: string }
export interface PatternPiece {
  id: string; name: string; cutQuantity: number;
  stitch: Rect; cut: Rect; allowances: EdgeAllowances;
  grainline: { from: Point; to: Point };
  foldlines: { from: Point; to: Point; label: string }[];
  notches: Notch[];
  notes: string[];
}
export function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function corners(r: Rect): Point[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
}
/** Rectangle-only offset: each edge can have its own allowance. */
export function offsetRectangle(r: Rect, a: EdgeAllowances): Rect {
  if (![r.x, r.y, r.width, r.height, ...Object.values(a)].every(Number.isFinite) ||
      r.width <= 0 || r.height <= 0 || Object.values(a).some(v => v < 0))
    throw new RangeError('Rectangle dimensions must be positive and allowances nonnegative, all finite.');
  return { x: r.x - a.left, y: r.y - a.top,
    width: r.width + a.left + a.right, height: r.height + a.top + a.bottom };
}
export function rectangleLines(r: Rect, style: 'cut' | 'stitch'): Primitive[] {
  const p = corners(r);
  return p.map((from, i) => ({ kind: 'line', from, to: p[(i + 1) % 4]!, style }));
}
export const formatMM = (n: number) => Number(n.toFixed(2)).toString();

/** Common display list keeps PDF and SVG pattern marks identical. Local origin is cut top-left. */
export function piecePrimitives(p: PatternPiece): Primitive[] {
  const out: Primitive[] = [...rectangleLines(p.cut, 'cut'), ...rectangleLines(p.stitch, 'stitch')];
  const line = (from: Point, to: Point, style: 'annotation' | 'fold' = 'annotation') =>
    out.push({ kind: 'line', from, to, style });
  const text = (x: number, y: number, value: string, size = 3) =>
    out.push({ kind: 'text', at: { x, y }, text: value,
      size: Math.min(size, (p.cut.width - x - 3) / (value.length * 0.6)) });
  const g = p.grainline;
  line(g.from, g.to);
  for (const [tip, other] of [[g.from, g.to], [g.to, g.from]]) {
    const sign = other!.y > tip!.y ? 1 : -1;
    line(tip!, { x: tip!.x - 2, y: tip!.y + sign * 4 });
    line(tip!, { x: tip!.x + 2, y: tip!.y + sign * 4 });
  }
  text(g.from.x + 4, (g.from.y + g.to.y) / 2 - 3, 'GRAIN', 2.5);
  for (const f of p.foldlines) { line(f.from, f.to, 'fold'); text(f.from.x + 4, f.from.y - 2, f.label, 2.5); }
  for (const n of p.notches) {
    const { cut: c, stitch: s } = p;
    const depth = Math.min(3, p.allowances[n.edge] / 2);
    if (depth <= 0) continue;
    let tip: Point, base1: Point, base2: Point;
    if (n.edge === 'top' || n.edge === 'bottom') {
      const x = s.x + n.offset, y = n.edge === 'top' ? c.y : c.y + c.height;
      tip = { x, y: y + (n.edge === 'top' ? depth : -depth) };
      base1 = { x: x - 1.5, y }; base2 = { x: x + 1.5, y };
    } else {
      const x = n.edge === 'left' ? c.x : c.x + c.width, y = s.y + n.offset;
      tip = { x: x + (n.edge === 'left' ? depth : -depth), y };
      base1 = { x, y: y - 1.5 }; base2 = { x, y: y + 1.5 };
    }
    line(base1, tip); line(tip, base2);
  }
  const isCasing = p.id === 'waistband';
  const x = p.stitch.x + 8, y = p.stitch.y + (isCasing ? 6 : 9);
  text(x, y, `${p.name} - CUT ${p.cutQuantity}`, 3.5);
  text(x, y + 5, `Seam rectangle: ${formatMM(p.stitch.width)} x ${formatMM(p.stitch.height)} mm`);
  text(x, y + 10, `Cut rectangle: ${formatMM(p.cut.width)} x ${formatMM(p.cut.height)} mm`);
  p.notes.forEach((note, i) => text(x, isCasing ? p.stitch.y + p.stitch.height / 2 + 8 + i * 4 : y + 15 + i * 4, note, 2.5));
  return out;
}
