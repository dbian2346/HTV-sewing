import type { FSOp } from './types.js';
import type { Point } from '../geometry.js';

/** Remove tiny self-crossing joins in a straight run of an offset cutting path.
 * Curved runs are never changed. Keep the intersection of the two crossing
 * segments and discard only the loop between them (for example at a back vent).
 */
export function trimStraightOffsetLoops(input: FSOp[]): FSOp[] {
  let ops = input.map(op => ({ ...op }));
  for (let pass = 0; pass < input.length; pass++) {
    let current: Point | undefined;
    const starts: (Point | undefined)[] = ops.map(op => {
      const start = current; if (op.to) current = op.to; return start;
    });
    let trimmed = false;
    outer: for (let i = 0; i < ops.length; i++) {
      if (ops[i]!.type !== 'line' || !starts[i]) continue;
      const a = starts[i]!, b = ops[i]!.to!;
      for (let j = i + 1; j < ops.length && ops[j]!.type === 'line'; j++) {
        if (j === i + 1) continue;
        const c = starts[j]!, d = ops[j]!.to!;
        const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - c.x, vy = d.y - c.y;
        const det = ux * vy - uy * vx; if (Math.abs(det) < 1e-10) continue;
        const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det;
        const v = ((c.x - a.x) * uy - (c.y - a.y) * ux) / det;
        if (t <= 1e-8 || t >= 1 - 1e-8 || v <= 1e-8 || v >= 1 - 1e-8) continue;
        ops = [...ops.slice(0, i), { type: 'line', to: { x: a.x + t * ux, y: a.y + t * uy } }, ...ops.slice(j)];
        trimmed = true; break outer;
      }
    }
    if (!trimmed) return ops;
  }
  throw new Error('Could not resolve a straight cutting-path offset join.');
}
