import { specSchema, type PatternSpec } from './schema.js';
import { offsetRectangle, type PatternPiece, type EdgeAllowances } from './geometry.js';

export interface SeamRelationship {
  id: string; from: { piece: string; edge: 'top' | 'bottom' | 'left' | 'right' }[];
  to: { piece: string; edge: 'top' | 'bottom' | 'left' | 'right' }[];
  sourceLength: number; targetLength: number; gatherRatio: number;
}
export interface Pattern {
  version: 1; units: 'mm'; spec: PatternSpec; pieces: PatternPiece[];
  seams: SeamRelationship[];
  dimensions: { finishedLength: number; bodyHeight: number; skirtCircumference: number;
    waistbandCircumference: number; elasticJoinedLength: number; elasticCutLength: number };
  instructions: string[];
}
function rectanglePiece(id: string, name: string, width: number, height: number,
  allowances: EdgeAllowances, notes: string[]): PatternPiece {
  const stitch = { x: allowances.left, y: allowances.top, width, height };
  return { id, name, cutQuantity: 1, stitch, cut: offsetRectangle(stitch, allowances), allowances,
    grainline: { from: { x: stitch.x + width * 0.8, y: stitch.y + height * 0.2 },
      to: { x: stitch.x + width * 0.8, y: stitch.y + height * 0.8 } },
    foldlines: [], notches: [], notes };
}
function draftGatheredSkirt(spec: PatternSpec): Pattern {
  const { waist, hip } = spec.measurements;
  const { length, fullnessRatio, waistband: b, ruffle: r } = spec.garment;
  const { seamAllowance: sa, hemAllowance: hem } = spec.construction;
  const circumference = waist * fullnessRatio;
  const bandCircumference = Math.max(waist, hip) + b.hipEase;
  const bodyHeight = length - b.finishedHeight - (r.enabled ? r.height : 0);
  const pieces: PatternPiece[] = ['front', 'back'].map(id => {
    const p = rectanglePiece(id, `${id === 'front' ? 'Front' : 'Back'} skirt panel`, circumference / 2, bodyHeight,
      { top: sa, right: sa, bottom: r.enabled ? sa : hem, left: sa },
      [r.enabled ? 'Gather top to waistband; attach ruffle below.' : 'Gather top to waistband; hem below.']);
    p.notches = [{ edge: 'top', offset: circumference / 4, label: `Center ${id}` },
      { edge: 'bottom', offset: circumference / 4, label: `Center ${id}` }];
    if (!r.enabled && hem > 0) p.foldlines.push({ from: { x: 0, y: p.stitch.y + bodyHeight + hem / 2 },
      to: { x: p.cut.width, y: p.stitch.y + bodyHeight + hem / 2 }, label: 'FIRST HEM FOLD (then fold at hem line)' });
    return p;
  });
  const band = rectanglePiece('waistband', 'Elastic waistband', bandCircumference, 2 * b.finishedHeight,
    { top: sa, right: sa, bottom: sa, left: sa }, ['Join short ends; fold lengthwise; match quarter marks.']);
  band.foldlines.push({ from: { x: band.stitch.x, y: sa + b.finishedHeight },
    to: { x: band.stitch.x + bandCircumference, y: sa + b.finishedHeight }, label: 'FOLD - TOP OF CASING' });
  band.grainline = { from: { x: bandCircumference * 0.8, y: sa + 5 },
    to: { x: bandCircumference * 0.8, y: sa + 2 * b.finishedHeight - 5 } };
  for (const edge of ['top', 'bottom'] as const)
    for (const fraction of [0.25, 0.5, 0.75]) band.notches.push({ edge, offset: bandCircumference * fraction, label: 'Quarter' });
  pieces.push(band);
  if (r.enabled) {
    for (const id of ['front', 'back']) {
      const width = circumference * r.fullnessRatio / 2;
      const p = rectanglePiece(`ruffle-${id}`, `${id === 'front' ? 'Front' : 'Back'} ruffle`, width, r.height,
        { top: sa, right: sa, bottom: hem, left: sa }, ['Gather top between side seams; match centers.']);
      p.notches.push({ edge: 'top', offset: width / 2, label: `Center ${id}` });
      if (hem > 0) p.foldlines.push({ from: { x: 0, y: sa + r.height + hem / 2 },
        to: { x: p.cut.width, y: sa + r.height + hem / 2 }, label: 'FIRST HEM FOLD (then fold at hem line)' });
      pieces.push(p);
    }
  }
  const seams: SeamRelationship[] = [];
  const sideSeam = (id: string, left: string, right: string, height: number) => {
    for (const edge of ['left', 'right'] as const) seams.push({ id: `${id}-${edge}`,
      from: [{ piece: left, edge }], to: [{ piece: right, edge: edge === 'left' ? 'right' : 'left' }],
      sourceLength: height, targetLength: height, gatherRatio: 1 });
  };
  sideSeam('body-side', 'front', 'back', bodyHeight);
  seams.push({ id: 'waistband-join', from: [{ piece: 'waistband', edge: 'left' }],
    to: [{ piece: 'waistband', edge: 'right' }], sourceLength: 2 * b.finishedHeight,
    targetLength: 2 * b.finishedHeight, gatherRatio: 1 });
  seams.push({ id: 'waist-attachment', from: ['front', 'back'].map(piece => ({ piece, edge: 'top' })),
    to: [{ piece: 'waistband', edge: 'bottom' }], sourceLength: circumference,
    targetLength: bandCircumference, gatherRatio: circumference / bandCircumference });
  if (r.enabled) {
    sideSeam('ruffle-side', 'ruffle-front', 'ruffle-back', r.height);
    for (const id of ['front', 'back']) seams.push({ id: `ruffle-attachment-${id}`,
      from: [{ piece: `ruffle-${id}`, edge: 'top' }], to: [{ piece: id, edge: 'bottom' }],
      sourceLength: circumference * r.fullnessRatio / 2, targetLength: circumference / 2, gatherRatio: r.fullnessRatio });
  }
  return { version: 1, units: 'mm', spec, pieces, seams,
    dimensions: { finishedLength: length, bodyHeight, skirtCircumference: circumference,
      waistbandCircumference: bandCircumference, elasticJoinedLength: waist * b.elasticLengthRatio,
      elasticCutLength: waist * b.elasticLengthRatio + b.elasticOverlap },
    instructions: [
      'All dimensions in mm. Cut every labeled piece once, full width, on a single layer; no cut-on-fold edges.',
      'Grain arrows follow lengthwise grain. Quarter notches are shallow marks inside seam allowances.',
      'Sew body side seams right sides together; finish raw edges. Keep centers and side seams as quarter marks.',
      ...(r.enabled ? ['Join ruffle side seams; double-fold hem using half the hem allowance twice. Gather ruffle tops to body bottoms, matching centers and side seams; stitch and finish.']
        : ['Double-fold hem using half the hem allowance twice; final hem lies at the bottom dashed line.']),
      'Join waistband short ends. Press lengthwise fold. Baste both raw long edges together, matching quarter marks.',
      'Gather skirt top to open waistband circumference; attach both casing layers at the waist seam, leaving an elastic insertion gap.',
      `Insert ${b.elasticWidth} mm elastic, cut ${waist * b.elasticLengthRatio + b.elasticOverlap} mm. Overlap ends ${b.elasticOverlap} mm, secure, and close the insertion gap.`,
      'Elastic ratios are starting assumptions: confirm actual elastic stretch and comfort on the wearer before cutting.',
    ] };
}
const templates = { gathered_skirt: draftGatheredSkirt };
export function generatePattern(input: unknown): Pattern {
  const spec = specSchema.parse(input);
  return templates[spec.garment.type](spec);
}
