import { Design, Path } from '@pattern-studio/penelope-engine';
import { Penelope, front, back, waistband } from '@pattern-studio/penelope-engine';
import { penelopeSchema, mapPenelopeSettings, type PenelopeSpec } from './schema.js';
import { distance, formatMM, type Point, type Primitive } from '../geometry.js';
import type { VectorPattern, VectorPiece } from '../vector.js';
import type { FSOp, FSPath, FSPart, CutInfo } from './types.js';
import { trimStraightOffsetLoops } from './offset-joins.js';
import { layoutData, type LayoutData, type LayoutPiece } from '../layout.js';
import { nativePartLayout } from './layout.js';

// Penelope's back reads a side-seam length stored by the front. Make that draft order explicit.
const RegisteredPenelope = new Design({ ...Penelope.designConfig, parts: [front, back, waistband] });
export const PENELOPE_VERSION = '3.1.0';
export interface PenelopePattern {
  designId: 'penelope'; engine: 'FreeSewing'; engineVersion: string; spec: PenelopeSpec;
  vector: VectorPattern;
  layout: LayoutData;
  dimensions: { bodyLength: number; finishedLength: number; easedWaist: number; closedWaist: number;
    waistbandFinishedHeight: number; frontSideSeam: number; backSideSeam: number };
  checks: { name: string; differenceMm: number; toleranceMm: number }[];
  instructions: string[];
}
function point(p: Point | undefined, dx = 0, dy = 0): Point {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('FreeSewing produced nonfinite geometry. Change the measurements or options.');
  return { x: p.x + dx, y: p.y + dy };
}
/** Build exact SVG cubics from structured operations; no flattening or rounded path strings. */
export function pathData(ops: FSOp[], dx = 0, dy = 0): string {
  const xy = (p: Point | undefined) => { const q = point(p, dx, dy); return `${q.x} ${q.y}`; };
  return ops.map(op => {
    switch (op.type) {
      case 'move': return `M ${xy(op.to)}`;
      case 'line': return `L ${xy(op.to)}`;
      case 'curve': return `C ${xy(op.cp1)} ${xy(op.cp2)} ${xy(op.to)}`;
      case 'close': return 'Z';
      case 'noop': return '';
      default: throw new Error('Unsupported FreeSewing path operation.');
    }
  }).join(' ');
}
function closedWaistLength(part: FSPart): number {
  const path = part.paths.waist!;
  const tips = [part.points.dart1Middle, part.points.dart2Middle].filter((p): p is Point => !!p);
  let current: Point | undefined, dartLegs = 0;
  for (const op of path.ops) {
    if (op.type === 'move') { current = op.to; continue; }
    if (!op.to) continue;
    if (current && tips.some(t => distance(t, current!) < 1e-6 || distance(t, op.to!) < 1e-6)) {
      const leg = new Path().move(current);
      if (op.type === 'curve') leg.curve(op.cp1!, op.cp2!, op.to); else leg.line(op.to);
      dartLegs += leg.length();
    }
    current = op.to;
  }
  return path.length() - dartLegs;
}
function arrows(out: Primitive[], ops: FSOp[], dx: number, dy: number) {
  const first = ops.find(op => op.to)?.to, last = ops.filter(op => op.to).at(-1)?.to;
  if (!first || !last) return;
  const a = point(first, dx, dy), b = point(last, dx, dy), length = distance(a, b);
  if (!length) return;
  for (const [tip, other] of [[a, b], [b, a]] as const) {
    const ux = (other.x - tip.x) / length, uy = (other.y - tip.y) / length;
    for (const sign of [-1, 1]) out.push({ kind: 'line', style: 'annotation', from: tip,
      to: { x: tip.x + ux * 4 + sign * uy * 2, y: tip.y + uy * 4 - sign * ux * 2 } });
  }
}
function lengthBelowHem(path: FSPath, hemY: number) {
  // SideSeam starts at the extended hem; omit the reflected hem extension from the sewing comparison.
  let current: Point | undefined, length = 0;
  for (const op of path.ops) {
    if (op.type === 'move') { current = op.to; continue; }
    if (!current || !op.to) continue;
    if (current.y <= hemY + 1e-6 && op.to.y <= hemY + 1e-6) {
      const segment = new Path().move(current);
      if (op.type === 'curve') segment.curve(op.cp1!, op.cp2!, op.to); else segment.line(op.to);
      length += segment.length();
    }
    current = op.to;
  }
  return length;
}

export function generatePenelope(input: unknown): PenelopePattern {
  const spec = penelopeSchema.parse(input);
  const drafted = new RegisteredPenelope(mapPenelopeSettings(spec)).draft();
  const logs = drafted.getLogs();
  const failures = [...logs.pattern.error, ...logs.sets.flatMap(s => s.error)];
  if (failures.length) throw new Error(`FreeSewing could not draft this variation: ${[...new Set(failures)].join('; ')}`);
  const render = drafted.getRenderProps();
  const parts = drafted.parts[0]!;
  const cutlist = drafted.setStores[0]!.get('cutlist');
  const m = spec.measurements, o = spec.options;
  const bodyLength = m.waistToKnee * (1 + o.lengthBonusPct / 100);
  const easedWaist = m.waist * (1 + o.waistEasePct / 100);
  const frontLength = lengthBelowHem(parts['penelope.front']!.paths.sideSeam!, bodyLength);
  const backLength = lengthBelowHem(parts['penelope.back']!.paths.sideSeam!, bodyLength);
  const closedWaist = 2 * (closedWaistLength(parts['penelope.front']!) + closedWaistLength(parts['penelope.back']!));
  const checks = [
    { name: 'Front/back side seams', differenceMm: Math.abs(frontLength - backLength), toleranceMm: 1 },
    { name: 'Closed dart waist / eased waist', differenceMm: Math.abs(closedWaist - easedWaist), toleranceMm: 4 },
  ];
  if (o.waistband) checks.push({ name: 'Waistband / closed dart waist',
    differenceMm: Math.abs(parts['penelope.waistband']!.points.BL!.y * 2 - closedWaist), toleranceMm: 4 });
  for (const check of checks) if (!Number.isFinite(check.differenceMm) || check.differenceMm > check.toleranceMm)
    throw new Error(`${check.name} differ by ${formatMM(check.differenceMm)} mm (limit ${check.toleranceMm} mm). This variation is outside the verified drafting tolerance.`);

  const pieces: VectorPiece[] = [];
  const layoutPieces: LayoutPiece[] = [];
  for (const id of ['penelope.front', 'penelope.back', 'penelope.waistband']) {
    const part = parts[id]!; if (part.hidden) continue;
    const rp = render.stacks[id]?.parts[0];
    if (!rp) throw new Error(`Missing FreeSewing render data for ${id}.`);
    const bounds = rp, dx = -bounds.topLeft.x + 5, dy = -bounds.topLeft.y + 5;
    const info: CutInfo = cutlist[id]!;
    const name = id === 'penelope.front' ? 'Penelope front' : id === 'penelope.back' ? 'Penelope back' : 'Penelope waistband';
    const cutQuantity = info.materials.fabric.reduce((n, cut) => n + cut.cut, 0);
    const onFold = !!info.cutOnFold, mirrored = cutQuantity === 2;
    const primitives: Primitive[] = [];
    let cuttingOps: FSOp[] | undefined;
    let cuttingPathId = 'sa';
    for (const [pathId, path] of Object.entries(rp.paths)) {
      if (path.hidden || pathId.includes('scalebox')) continue;
      if (path.attributes.list.transform?.length) throw new Error(`Unimplemented path transform in ${id}/${pathId}.`);
      const fold = pathId.includes('cutonfold'), grain = pathId.includes('grainline');
      const style = pathId === 'sa' ? 'cut' : pathId === 'seam' ? 'stitch' : pathId === 'outline'
        ? (spec.construction.seamAllowanceMm > 0 ? 'stitch' : 'cut') : pathId === 'hem' || fold ? 'fold' : 'annotation';
      primitives.push({ kind: 'path', d: pathData(pathId === 'sa' ? trimStraightOffsetLoops(path.ops) : path.ops, dx, dy), style });
      if (style === 'cut') { cuttingOps = pathId === 'sa' ? trimStraightOffsetLoops(path.ops) : path.ops; cuttingPathId = pathId; }
      if (fold || grain) {
        arrows(primitives, path.ops, dx, dy);
        const first = path.ops.find(op => op.to)!.to!, last = path.ops.filter(op => op.to).at(-1)!.to!;
        const vertical = Math.abs(last.y - first.y) > Math.abs(last.x - first.x);
        primitives.push({ kind: 'text', at: { x: (first.x + last.x) / 2 + dx + 4, y: (first.y + last.y) / 2 + dy - 3 },
          text: fold ? 'CUT ON FOLD' : 'GRAIN', size: 3, rotation: vertical ? -90 : 0 });
      }
    }
    if (id !== 'penelope.waistband' && spec.construction.seamAllowanceMm === 0) {
      // Darts remain stitching marks even without allowances; never cut down their legs.
      const cutting = part.paths.leftSide!.clone().join(part.paths.bottom!).join(part.paths.sideSeam!)
        .join(part.paths.waistSA!).close();
      primitives.push({ kind: 'path', style: 'cut', d: pathData(cutting.ops, dx, dy) });
      cuttingOps = cutting.ops; cuttingPathId = 'assembled-cutting-outline';
    }
    if (id === 'penelope.waistband') {
      const center = part.points.TR!.x / 2 + dx;
      primitives.push({ kind: 'line', style: 'fold', from: { x: center, y: dy }, to: { x: center, y: part.points.BL!.y + dy } },
        { kind: 'text', at: { x: center + 5, y: dy + part.points.BL!.y / 2 }, text: 'FOLD LENGTHWISE', size: 3, rotation: 90 });
    }
    if (id !== 'penelope.waistband' && spec.construction.seamAllowanceMm > 0) {
      const p = point(part.points.rSeat, dx, dy), sa = spec.construction.seamAllowanceMm;
      primitives.push({ kind: 'line', style: 'annotation', from: { x: p.x + sa, y: p.y },
        to: { x: p.x + sa - Math.min(3, sa / 2), y: p.y } });
    }
    const width = bounds.bottomRight.x - bounds.topLeft.x + 10, height = bounds.bottomRight.y - bounds.topLeft.y + 10;
    if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('FreeSewing returned invalid piece bounds.');
    const isBand = id === 'penelope.waistband';
    const inset = isBand ? part.points.TR!.x * 0.4 : Math.min(75, part.points.rSeat!.x * 0.25);
    const x = dx + inset, y = isBand ? dy + 65 : dy + m.waistToSeat + 25;
    const rotation = id === 'penelope.waistband' ? 90 : 0;
    const bandScale = isBand ? Math.min(1, part.points.TR!.x / 40) : 1;
    const label = (text: string, offset: number, size = 3.5) => primitives.push({ kind: 'text',
      at: { x: x - (rotation ? offset * bandScale : 0), y: y + (rotation ? 0 : offset) }, text,
      size: isBand ? size * bandScale : Math.min(size, (part.points.rSeat!.x - inset - 6) / (text.length * 0.6)), rotation });
    label(name, 0, 4.5);
    label(`CUT ${cutQuantity}${onFold ? ' ON FOLD' : mirrored ? ' MIRRORED' : ''}`, 7);
    label(`FreeSewing ${PENELOPE_VERSION} - ${spec.construction.seamAllowanceMm} mm SA`, 13, 2.8);
    pieces.push({ id, name, width, height, cutQuantity, onFold, mirrored, primitives });
    layoutPieces.push(...nativePartLayout({name:id,paths:rp.paths}, info, id, spec.construction.seamAllowanceMm,
      cuttingOps ? {pathId:cuttingPathId,ops:cuttingOps} : undefined).map(piece=>({...piece,name})));
  }
  const waistbandFinishedHeight = o.waistband ? (parts['penelope.waistband']!.points.TR!.x / 2) : 0;
  return { designId: 'penelope', engine: 'FreeSewing', engineVersion: PENELOPE_VERSION, spec,
    layout: layoutData(layoutPieces), vector: { title: 'Penelope fitted skirt - FreeSewing', units: 'mm', pieces,
      cuttingInstructions: 'Follow CUT / FOLD labels: front on fold, back mirrored, optional band on fold.',
      constructionNote: 'Back zipper; waistband meets edge-to-edge. Make a fit sample before final fabric.' },
    dimensions: { bodyLength, finishedLength: bodyLength + waistbandFinishedHeight, easedWaist, closedWaist,
      waistbandFinishedHeight, frontSideSeam: frontLength, backSideSeam: backLength }, checks,
    instructions: [
      'Penelope fitted pencil skirt, drafted with FreeSewing. Use woven fabric and a back zipper; there is no elastic waistband.',
      'Cut the front once on the center-front fold and the back twice as a mirrored pair. Preserve the curved dart stitching lines.',
      'Transfer dart tips, dart legs, fold/grain marks and seat-level side-seam notches. Sew and press the darts before joining panels.',
      'Join front and back side seams, matching the seat-level notches. Finish raw edges; test the fit before finishing the waist.',
      o.backVent ? 'Prepare the back vent, then join the center-back seam while leaving the zipper opening. Choose a zipper ending above the vent.' : 'Join the center-back seam while leaving an opening for a suitable back zipper.',
      o.waistband ? `Cut the waistband once on the marked short-edge fold; unfold, then fold it lengthwise for a ${formatMM(waistbandFinishedHeight)} mm finished band. Interface as needed. Ease the closed-dart waist to the band (${formatMM(Math.abs(closedWaist - easedWaist))} mm total difference); band ends meet edge-to-edge at the back zipper, without a button overlap.`
        : 'Finish the waist with a separately prepared bias binding or facing. A facing template is not included.',
      'Install the back zipper and finish the waist edges. Turn the hem at the marked finished hem line; the drafted turn-up includes FreeSewing hem and seam allowances.',
      'This adapter checks side-seam and closed-dart waist lengths. It does not establish fit: sew a toile and check sitting/walking ease, dart placement and zipper length.',
    ] };
}
