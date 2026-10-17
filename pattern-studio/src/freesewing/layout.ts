import type { Point } from '../geometry.js';
import type { FSOp } from './types.js';
import { copyOps, makeLayoutPieces, type NativeCut, type LayoutPiece } from '../layout.js';

export interface LayoutNativePath { ops: FSOp[]; hidden?: boolean; attributes?: { list: Record<string, unknown[]> } }
export interface LayoutNativePart {
  name: string; hidden?: boolean; paths: Record<string, LayoutNativePath>;
  attributes?: { list: Record<string, unknown[]> };
}
export interface LayoutCutInfo { cutOnFold?: Point[]; grain?: number; grainOrigin?: string; materials?: Record<string, NativeCut[]> }
/** Export intrinsic drafting geometry per part, never the packed/annotated stack's bounding box. */
export function nativePartLayout(part: LayoutNativePart, info: LayoutCutInfo | undefined, svgGroupId: string,
  seamAllowance: number, override?: { pathId: string; ops: FSOp[] }): LayoutPiece[] {
  const visible = Object.entries(part.paths).filter(([,path])=>!path.hidden);
  let pathId = override?.pathId ?? (visible.some(([id])=>id==='sa') ? 'sa' : seamAllowance === 0
    ? visible.some(([id])=>id==='seam') ? 'seam' : visible.some(([id])=>id==='outline') ? 'outline' : null : null);
  if (!pathId) {
    const allowance = visible.filter(([,p])=>(p.attributes?.list.class ?? []).join(' ').split(/\s+/).includes('sa'));
    if (allowance.length === 1) pathId = allowance[0]![0];
  }
  const path = pathId ? part.paths[pathId] : undefined;
  const issues: string[] = [];
  if (part.attributes?.list.transform?.length) issues.push('Native part transform needs review; intrinsic geometry is exported before that transform.');
  if (path?.attributes?.list.transform?.length) issues.push('Native cutting path transform needs review; raw operations are exported.');
  const grainPath = visible.find(([id,p])=>id.toLowerCase().includes('grainline') && p.ops.filter(op=>op.to).length===2)?.[1];
  const grainPoints = grainPath?.ops.filter(op=>op.to).map(op=>op.to!);
  const fold = info?.cutOnFold;
  const grain = grainPoints?.length === 2 ? {from:grainPoints[0],to:grainPoints[1]}
    : info?.grainOrigin === 'cutonfold' && fold?.length === 2 ? {from:fold[0],to:fold[1]}
    // FreeSewing angles are counterclockwise in Cartesian coordinates; SVG y points down.
    : typeof info?.grain === 'number' ? {angleDeg:-info.grain} : undefined;
  const ops = override?.ops ?? path?.ops;
  const nativePaths: NonNullable<LayoutPiece['native_paths']> = [];
  for (const [id,p] of visible) {
    try { nativePaths.push({id,commands:copyOps(p.ops),transforms:(p.attributes?.list.transform??[]).map(String)}); }
    catch { if (id === pathId || !ops) issues.push(`Native path ${id} contains invalid coordinates or commands.`); }
  }
  return makeLayoutPieces({id:part.name,name:part.name.replaceAll('.', ' · '),svgGroupId,pathId,ops,
    materials:info?.materials,fold,grain,issues,partTransforms:(part.attributes?.list.transform??[]).map(String),
    ...(!ops || issues.length ? {nativePaths} : {})});
}
