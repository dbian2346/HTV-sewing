import type { Label, Line, Pattern, PatternInput, Piece, Point } from './types.ts';

function line(x1: number, y1: number, x2: number, y2: number, kind: Line['kind']): Line {
  return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, kind };
}

function rectanglePiece(opts: {
  id: string; title: string; cutInstruction: string; width: number; height: number;
  sideSeam: number; topAllowance: number; bottomAllowance: number;
  topDescription: string; bottomDescription: string; foldY?: number;
}): Piece {
  const { width: w, height: h, sideSeam: sa } = opts;
  const lines: Line[] = [
    line(0, 0, w, 0, 'cut'), line(w, 0, w, h, 'cut'),
    line(w, h, 0, h, 'cut'), line(0, h, 0, 0, 'fold'),
    line(0, opts.topAllowance, w - sa, opts.topAllowance, 'stitch'),
    line(w - sa, opts.topAllowance, w - sa, h - opts.bottomAllowance, 'stitch'),
    line(w - sa, h - opts.bottomAllowance, 0, h - opts.bottomAllowance,
      opts.bottomDescription === 'hem' ? 'fold' : 'stitch'),
    line(w * 0.5, Math.min(h * 0.28, 80), w * 0.5, Math.max(h * 0.72, h - 80), 'grain'),
  ];
  if (opts.foldY !== undefined) lines.push(line(0, opts.foldY, w - sa, opts.foldY, 'fold'));
  const labelY = Math.min(60, Math.max(20, h * 0.2));
  const labels: Label[] = [
    { at: { x: 12, y: labelY }, text: opts.title, sizeMm: 5 },
    { at: { x: 12, y: labelY + 8 }, text: opts.cutInstruction, sizeMm: 3.5 },
    { at: { x: 12, y: labelY + 16 }, text: `${w.toFixed(1)} x ${h.toFixed(1)} mm cut`, sizeMm: 3.2 },
    { at: { x: Math.max(12, w - 40), y: h / 2 }, text: `side ${sa} mm`, sizeMm: 2.8 },
  ];
  if (opts.foldY !== undefined)
    labels.push({ at: { x: 65, y: opts.foldY - 3 }, text: 'FOLD CASING HERE', sizeMm: 3 });
  if (opts.bottomDescription === 'hem')
    labels.push({ at: { x: 65, y: h - opts.bottomAllowance - 3 }, text: 'HEM FOLD', sizeMm: 3 });
  return { id: opts.id, title: opts.title, cutInstruction: opts.cutInstruction,
    widthMm: w, heightMm: h, origin: { x: 0, y: 0 }, lines, labels };
}

function movePoint(point: Point, origin: Point): Point {
  return { x: point.x + origin.x, y: point.y + origin.y };
}

export function draftPattern(input: PatternInput): Pattern {
  const { garment: g, measurements: m, construction: c } = input;
  const shellCircumference = Math.max(m.waistCircumferenceMm * g.fullnessRatio, m.hipCircumferenceMm + g.hipEaseMm);
  const shellVisibleHeight = g.finishedLengthMm - g.waistbandFinishedHeightMm - (g.ruffle.enabled ? g.ruffle.finishedHeightMm : 0);
  const sa = c.seamAllowanceMm;
  const shell = rectanglePiece({
    id: 'shell', title: 'Skirt panel', cutInstruction: 'Cut 2 on fold',
    width: shellCircumference / 4 + sa,
    height: shellVisibleHeight + sa + (g.ruffle.enabled ? sa : c.hemAllowanceMm),
    sideSeam: sa, topAllowance: sa, bottomAllowance: g.ruffle.enabled ? sa : c.hemAllowanceMm,
    topDescription: 'waist', bottomDescription: g.ruffle.enabled ? 'ruffle seam' : 'hem',
  });
  const band = rectanglePiece({
    id: 'band', title: 'Waistband casing', cutInstruction: 'Cut 1 on fold; fold across center',
    width: shellCircumference / 2 + sa,
    height: 2 * (g.waistbandFinishedHeightMm + sa),
    sideSeam: sa, topAllowance: sa, bottomAllowance: sa,
    topDescription: 'join skirt', bottomDescription: 'join skirt',
    foldY: g.waistbandFinishedHeightMm + sa,
  });
  const pieces = [shell, band];
  const ruffleCircumference = g.ruffle.enabled ? shellCircumference * g.ruffle.fullnessRatio : null;
  if (ruffleCircumference !== null) pieces.push(rectanglePiece({
    id: 'ruffle', title: 'Ruffle panel', cutInstruction: 'Cut 2 on fold; gather top',
    width: ruffleCircumference / 4 + sa,
    height: g.ruffle.finishedHeightMm + sa + c.hemAllowanceMm,
    sideSeam: sa, topAllowance: sa, bottomAllowance: c.hemAllowanceMm,
    topDescription: 'gather', bottomDescription: 'hem',
  }));
  const padding = 20;
  let y = padding;
  for (const piece of pieces) {
    piece.origin = { x: padding, y };
    piece.lines = piece.lines.map(item => ({ ...item,
      from: movePoint(item.from, piece.origin), to: movePoint(item.to, piece.origin) }));
    piece.labels = piece.labels.map(item => ({ ...item, at: movePoint(item.at, piece.origin) }));
    y += piece.heightMm + padding;
  }
  return {
    input, pieces,
    widthMm: Math.max(...pieces.map(piece => piece.widthMm)) + 2 * padding,
    heightMm: y,
    dimensions: {
      shellCircumferenceMm: shellCircumference,
      effectiveFullnessRatio: shellCircumference / m.waistCircumferenceMm,
      shellVisibleHeightMm: shellVisibleHeight,
      elasticCutLengthMm: m.waistCircumferenceMm - g.elasticReductionMm + c.elasticOverlapMm,
      ruffleCircumferenceMm: ruffleCircumference,
    },
  };
}
