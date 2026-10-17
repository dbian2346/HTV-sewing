import type { Point } from './geometry.js';
import type { FSOp } from './freesewing/types.js';

export interface LayoutPath { format: 'svg_path'; d: string; commands: FSOp[]; closed: boolean }
export interface LayoutPiece {
  id: string; name: string; material: string | null;
  cut_quantity: number | null; cut_type: 'single' | 'identical' | 'mirrored' | 'on_fold' | 'unknown';
  mirrored_pairs: number; unpaired_quantity: number;
  width_mm: number | null; height_mm: number | null; origin_mm: [number, number];
  outline: LayoutPath | null;
  grainline: { from: [number, number] | null; to: [number, number] | null; angle_deg: number } | null;
  on_fold: boolean; fold_line: { from: [number, number]; to: [number, number] } | null;
  on_bias: boolean; can_rotate: false; allowed_rotations_deg: number[];
  optimizer_ready: boolean; issues: string[];
  source: { svg_group_id: string; part_id: string; path_id: string | null; part_transforms?: string[] };
  native_paths?: { id: string; commands: FSOp[]; transforms: string[] }[];
}
export interface LayoutData { schema_version: 1; units: 'mm'; coordinate_system: 'x_right_y_down'; pieces: LayoutPiece[] }
export interface NativeCut { cut: number; identical?: boolean; onFold?: boolean; onBias?: boolean }
export interface LayoutSource {
  id: string; name: string; svgGroupId: string; pathId: string | null; ops?: FSOp[];
  materials?: Record<string, NativeCut[]>; fold?: Point[];
  grain?: { from?: Point; to?: Point; angleDeg?: number };
  issues?: string[]; nativePaths?: LayoutPiece['native_paths']; partTransforms?: string[];
}
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const mod180 = (n: number) => ((n % 180) + 180) % 180;
const valid = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
export function copyOps(ops: FSOp[], dx = 0, dy = 0): FSOp[] {
  return ops.filter(op => op.type !== 'noop').map(op => {
    const result: FSOp = { type: op.type };
    for (const key of ['to', 'cp1', 'cp2'] as const) if (op[key]) {
      if (!valid(op[key])) throw new Error('Nonfinite layout path coordinate.');
      result[key] = { x: op[key].x + dx, y: op[key].y + dy };
    }
    if ((op.type === 'move' || op.type === 'line' || op.type === 'curve') && !result.to || op.type === 'curve' && (!result.cp1 || !result.cp2))
      throw new Error('Incomplete layout path operation.');
    return result;
  });
}
export function layoutPath(ops: FSOp[]): LayoutPath {
  const commands = copyOps(ops), xy = (p: Point | undefined) => `${p!.x} ${p!.y}`;
  return { format: 'svg_path', commands, closed: isClosed(commands), d: commands.map(op => {
    if (op.type === 'move') return `M ${xy(op.to)}`;
    if (op.type === 'line') return `L ${xy(op.to)}`;
    if (op.type === 'curve') return `C ${xy(op.cp1)} ${xy(op.cp2)} ${xy(op.to)}`;
    if (op.type === 'close') return 'Z';
    throw new Error(`Unsupported layout path operation: ${op.type}`);
  }).join(' ') };
}
function isClosed(ops: FSOp[]) {
  let start: Point | undefined, end: Point | undefined, closed = true, hasPath = false;
  for (const op of ops) {
    if (op.type === 'move') {
      if (start && end && Math.hypot(start.x - end.x, start.y - end.y) > 1e-7) closed = false;
      start = end = op.to; hasPath = true;
    } else if (op.type === 'close') end = start;
    else if (op.to) end = op.to;
  }
  return hasPath && closed && !!start && !!end && Math.hypot(start.x - end.x, start.y - end.y) < 1e-7;
}
/** Exact cubic extrema, not control-point bounds or a sampled rectangle. */
export function outlineBounds(ops: FSOp[]) {
  const xs: number[] = [], ys: number[] = [];
  let current: Point | undefined, start: Point | undefined;
  const add = (p: Point) => { xs.push(p.x); ys.push(p.y); };
  const cubic = (a: number, b: number, c: number, d: number, t: number) => (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
  const roots = (a: number, b: number, c: number, d: number) => {
    const A = -a + 3*b - 3*c + d, B = 2*(a - 2*b + c), C = b-a;
    if (Math.abs(A) < 1e-12) return Math.abs(B) < 1e-12 ? [] : [-C/B];
    const disc = B*B - 4*A*C;
    return disc < 0 ? [] : [(-B+Math.sqrt(disc))/(2*A), (-B-Math.sqrt(disc))/(2*A)];
  };
  for (const op of copyOps(ops)) {
    if (op.type === 'move') { current = start = op.to; add(current!); }
    else if (op.type === 'close') current = start;
    else if (op.to && current) {
      add(op.to);
      if (op.type === 'curve') for (const t of [...roots(current.x,op.cp1!.x,op.cp2!.x,op.to.x),...roots(current.y,op.cp1!.y,op.cp2!.y,op.to.y)])
        if (t > 0 && t < 1) add({ x:cubic(current.x,op.cp1!.x,op.cp2!.x,op.to.x,t),y:cubic(current.y,op.cp1!.y,op.cp2!.y,op.to.y,t) });
      current = op.to;
    }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs)-x, height: Math.max(...ys)-y };
}
export function makeLayoutPieces(source: LayoutSource): LayoutPiece[] {
  const issues = [...(source.issues ?? [])];
  let ops: FSOp[] | null = null;
  try { ops = source.ops ? copyOps(source.ops) : null; }
  catch (error) { issues.push(error instanceof Error ? error.message : 'Invalid native cutting geometry.'); }
  const fold = source.fold?.length === 2 && source.fold.every(valid) ? source.fold as [Point, Point] : null;
  // An open allowance path may omit the straight fold boundary. Close only on that proven boundary.
  if (ops && !isClosed(ops) && fold) {
    const [a,b] = fold, len = Math.hypot(b.x-a.x,b.y-a.y);
    const onLine = (p: Point | undefined) => valid(p) && len > 0 && Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/len < 1e-6;
    const contours: FSOp[][] = [];
    for (const op of ops) {
      if (op.type === 'move') contours.push([]);
      contours.at(-1)?.push(op);
    }
    ops = contours.flatMap(contour => {
      if (!isClosed(contour) && [contour[0]?.to,contour.filter(op=>op.to).at(-1)?.to].every(onLine))
        return [...contour,{type:'close' as const}];
      return contour;
    });
  }
  const bounds = ops ? outlineBounds(ops) : null;
  if (!ops || !bounds || bounds.width <= 0 || bounds.height <= 0) issues.push('Cutting outline unavailable.');
  if (ops && !isClosed(ops)) issues.push('Cutting outline is open; no unambiguous closing boundary.');
  const origin: [number,number] = [bounds?.x ?? 0, bounds?.y ?? 0];
  const local = (p: Point): [number,number] => [p.x-origin[0],p.y-origin[1]];
  const grain = source.grain;
  const grainAngle = valid(grain?.from) && valid(grain?.to) && Math.hypot(grain.to.x-grain.from.x,grain.to.y-grain.from.y)>1e-7
    ? angle(grain.from,grain.to) : grain?.angleDeg;
  const grainline = grainAngle !== undefined && Number.isFinite(grainAngle)
    ? { from: valid(grain?.from) ? local(grain.from) : null, to: valid(grain?.to) ? local(grain.to) : null, angle_deg: grainAngle } : null;
  if (!grainline) issues.push('Grain direction unavailable; confirm alignment before nesting.');
  const entries = Object.entries(source.materials ?? {}).flatMap(([material,cuts]) => cuts.filter(c=>c.cut>0).map((cut,index)=>({material,cut,index})));
  if (!entries.length) entries.push({material: 'unknown', cut: {cut: NaN}, index: 0});
  return entries.map(({material,cut,index}) => {
    const ownIssues = [...issues], knownCut = Number.isInteger(cut.cut) && cut.cut>0;
    if (!knownCut) ownIssues.push('Cut quantity/material unavailable.');
    const onFold = !!fold || !!cut.onFold, onBias = !!cut.onBias;
    if (onFold && !fold) ownIssues.push('Cut-on-fold edge coordinates unavailable.');
    if (cut.cut>1 && cut.identical === undefined) ownIssues.push('Identical versus mirrored cuts unspecified.');
    const mirrored = !onFold && cut.cut>1 && cut.identical === false;
    const rotation = fold ? mod180(90-angle(fold[0],fold[1])) : grainline ? mod180((onBias ? 45 : 90)-grainline.angle_deg) : null;
    if (fold && grainline) {
      const delta = mod180(grainline.angle_deg + rotation! - (onBias ? 45 : 90));
      if (Math.min(delta,180-delta)>1e-6) ownIssues.push('Grain/bias and fold constraints conflict for a lengthwise fabric fold.');
    }
    return { id: `${source.id}:${material}:${index}`, name: source.name, material: knownCut ? material : null,
      cut_quantity: knownCut ? cut.cut : null, cut_type: !knownCut ? 'unknown' : onFold ? 'on_fold' : mirrored ? 'mirrored' : cut.cut>1 ? (cut.identical ? 'identical' : 'unknown') : 'single',
      mirrored_pairs: mirrored ? Math.floor(cut.cut/2) : 0, unpaired_quantity: knownCut ? mirrored ? cut.cut%2 : cut.cut : 0,
      width_mm: bounds?.width ?? null, height_mm: bounds?.height ?? null, origin_mm: origin,
      outline: ops ? layoutPath(copyOps(ops,-origin[0],-origin[1])) : null,
      grainline, on_fold: onFold, fold_line: fold ? {from:local(fold[0]),to:local(fold[1])} : null,
      on_bias: onBias, can_rotate: false, allowed_rotations_deg: rotation === null ? [] : [rotation],
      optimizer_ready: ownIssues.length === 0, issues: ownIssues,
      source: {svg_group_id:source.svgGroupId,part_id:source.id,path_id:source.pathId,
        ...(source.partTransforms?.length ? {part_transforms:source.partTransforms} : {})},
      ...(source.nativePaths ? {native_paths:source.nativePaths} : {}) } as LayoutPiece;
  });
}
export const layoutData = (pieces: LayoutPiece[]): LayoutData => ({schema_version:1,units:'mm',coordinate_system:'x_right_y_down',pieces});
