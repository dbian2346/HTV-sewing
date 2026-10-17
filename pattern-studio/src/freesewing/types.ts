import type { Point } from '../geometry.js';
export interface FSOp { type: 'move' | 'line' | 'curve' | 'close' | 'noop'; to?: Point; cp1?: Point; cp2?: Point }
export interface FSPath { ops: FSOp[]; hidden: boolean; length(): number; clone(): FSPath; join(other: FSPath): FSPath; close(): FSPath }
export interface FSPart { hidden: boolean; paths: Record<string, FSPath>; points: Record<string, Point> }
export interface CutInfo { cutOnFold?: Point[]; grain?: number; grainOrigin?: string; materials: { fabric: { cut: number; identical: boolean }[] } }
export interface RenderPath { hidden: boolean; ops: FSOp[]; attributes: { list: Record<string, unknown[]> } }
export interface RenderPart { paths: Record<string, RenderPath>; topLeft: Point; bottomRight: Point }
export interface FSDraft {
  draft(): FSDraft;
  parts: Record<number, Record<string, FSPart>>;
  setStores: { get(key: 'cutlist'): Record<string, CutInfo> }[];
  getRenderProps(): { stacks: Record<string, { parts: RenderPart[] }> };
  getLogs(): { pattern: { error: string[]; warn: string[] }; sets: { error: string[]; warn: string[] }[] };
}
