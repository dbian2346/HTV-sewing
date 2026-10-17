export type PatternInput = {
  schemaVersion: 1;
  garment: {
    type: 'gatheredSkirt'; name: string; waistFinish: 'elasticCasing';
    finishedLengthMm: number; fullnessRatio: number; hipEaseMm: number;
    waistbandFinishedHeightMm: number; elasticWidthMm: number; elasticReductionMm: number;
    ruffle: { enabled: boolean; finishedHeightMm: number; fullnessRatio: number };
  };
  measurements: { waistCircumferenceMm: number; hipCircumferenceMm: number };
  construction: { seamAllowanceMm: number; hemAllowanceMm: number; elasticOverlapMm: number };
  print: { paper: 'A4' | 'Letter'; marginMm: number; overlapMm: number };
};
export type Point = { x: number; y: number };
export type Line = { from: Point; to: Point; kind: 'cut' | 'stitch' | 'fold' | 'grain' | 'guide' };
export type Label = { at: Point; text: string; sizeMm?: number };
export type Piece = {
  id: string; title: string; cutInstruction: string;
  widthMm: number; heightMm: number; origin: Point; lines: Line[]; labels: Label[];
};
export type Pattern = {
  input: PatternInput; pieces: Piece[]; widthMm: number; heightMm: number;
  dimensions: {
    shellCircumferenceMm: number; effectiveFullnessRatio: number;
    shellVisibleHeightMm: number; elasticCutLengthMm: number;
    ruffleCircumferenceMm: number | null;
  };
};
