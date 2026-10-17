import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateStudioPattern, exportStudioArtifacts, exportStudioSVG } from '../src/index.js';
import { layoutPath, makeLayoutPieces, outlineBounds } from '../src/layout.js';
import { nativePartLayout } from '../src/freesewing/layout.js';
import type { FSOp } from '../src/freesewing/types.js';
const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const rectangle: FSOp[] = [{type:'move',to:{x:10,y:20}},{type:'line',to:{x:110,y:20}},
  {type:'line',to:{x:110,y:220}},{type:'line',to:{x:10,y:220}},{type:'close'}];
const grain = {from:{x:50,y:50},to:{x:50,y:150}};
describe('optimizer layout export', () => {
  it('returns unchanged SVG plus JSON-safe metadata, with cutting dimensions rather than sheet dimensions', () => {
    const p = generateStudioPattern(example('gathered-skirt'));
    const artifacts = exportStudioArtifacts(p);
    expect(artifacts.svg).toBe(exportStudioSVG(p));
    expect(JSON.parse(JSON.stringify(artifacts.layout))).toEqual(p.layout);
    for (const piece of p.layout.pieces) {
      const original = p.pieces.find(p=>p.id===piece.source.svg_group_id)!;
      expect([piece.width_mm,piece.height_mm]).toEqual([original.width,original.height]);
      expect(piece.optimizer_ready).toBe(true); expect(piece.allowed_rotations_deg).toEqual([0]);
      expect(piece.cut_quantity).toBe(1); expect(piece.outline!.commands).toHaveLength(5);
    }
    expect(p.layout.pieces.find(p=>p.source.part_id==='waistband')!.on_fold).toBe(false);
    expect(artifacts.layout).not.toHaveProperty('fabric_width_mm');
  });
  it('keeps exact cubic control points and computes curve extrema analytically', () => {
    const ops: FSOp[] = [{type:'move',to:{x:10,y:20}},{type:'curve',cp1:{x:10,y:120},cp2:{x:110,y:120},to:{x:110,y:20}},{type:'close'}];
    const [p] = makeLayoutPieces({id:'curve',name:'Curve',svgGroupId:'curve',pathId:'sa',ops,grain,materials:{fabric:[{cut:2,identical:false}]}});
    expect(p!.width_mm).toBe(100); expect(p!.height_mm).toBe(75);
    expect(p!.outline!.commands[1]).toEqual({type:'curve',cp1:{x:0,y:100},cp2:{x:100,y:100},to:{x:100,y:0}});
    expect(p!.outline!.d).toContain('C 0 100 100 100 100 0');
    expect(p!.cut_type).toBe('mirrored'); expect(p!.mirrored_pairs).toBe(1);
    expect(ops[0]!.to).toEqual({x:10,y:20});
  });
  it('exports shaped FreeSewing contours, fold geometry and mirrored quantities', () => {
    for (const name of ['penelope','titan']) {
      const p = generateStudioPattern(example(name));
      for (const piece of p.layout.pieces) {
        expect(piece.optimizer_ready).toBe(true); expect(piece.outline!.closed).toBe(true);
        expect(piece.outline!.commands.some(op=>op.type==='curve') || piece.name.includes('waistband')).toBe(true);
        const displayed = p.pieces.find(p=>p.id===piece.source.svg_group_id)!;
        expect(piece.width_mm!).toBeLessThan(displayed.width); expect(piece.height_mm!).toBeLessThan(displayed.height);
      }
    }
    const p = generateStudioPattern(example('penelope'));
    const front=p.layout.pieces.find(p=>p.source.part_id==='penelope.front')!;
    const back=p.layout.pieces.find(p=>p.source.part_id==='penelope.back')!;
    const band=p.layout.pieces.find(p=>p.source.part_id==='penelope.waistband')!;
    expect(front.cut_type).toBe('on_fold'); expect(front.fold_line).not.toBeNull();
    expect(back.cut_quantity).toBe(2); expect(back.cut_type).toBe('mirrored');
    expect(band.allowed_rotations_deg).toEqual([90]);
  });
  it('uses the adapter’s corrected zero-allowance cutting path, not dart stitching', () => {
    const spec=example('penelope');spec.construction.seamAllowanceMm=0;
    const p=generateStudioPattern(spec),front=p.layout.pieces.find(p=>p.source.part_id==='penelope.front')!;
    expect(front.source.path_id).toBe('assembled-cutting-outline');expect(front.optimizer_ready).toBe(true);
    expect(front.outline!.closed).toBe(true);
  });
  it('keeps materials and cut instructions separate, including bias, identical and odd mirrored cuts', () => {
    const pieces=makeLayoutPieces({id:'part',name:'Part',svgGroupId:'stack',pathId:'sa',ops:rectangle,grain,
      materials:{fabric:[{cut:3,identical:false},{cut:2,identical:true,onBias:true}],lining:[{cut:1,identical:true}]}});
    expect(pieces.map(p=>[p.material,p.cut_quantity,p.cut_type])).toEqual([['fabric',3,'mirrored'],['fabric',2,'identical'],['lining',1,'single']]);
    expect(pieces[0]!.mirrored_pairs).toBe(1);expect(pieces[0]!.unpaired_quantity).toBe(1);
    expect(pieces[1]!.on_bias).toBe(true);expect(pieces[1]!.allowed_rotations_deg).toEqual([135]);
  });
  it('does not fabricate geometry or constraints for missing/ambiguous native metadata', () => {
    const [p]=nativePartLayout({name:'part',paths:{seam:{ops:rectangle}}},undefined,'stack',10);
    expect(p!.outline).toBeNull();expect(p!.cut_quantity).toBeNull();expect(p!.grainline).toBeNull();
    expect(p!.optimizer_ready).toBe(false);expect(p!.native_paths![0]!.commands).toEqual(rectangle);
    const [transformed]=nativePartLayout({name:'part',paths:{sa:{ops:rectangle,attributes:{list:{transform:['scale(2)']}}}}},
      {materials:{fabric:[{cut:1}]},grain:270},'stack',10);
    expect(transformed!.optimizer_ready).toBe(false);expect(transformed!.issues.join()).toContain('transform');
    const [invalid]=nativePartLayout({name:'part',paths:{sa:{ops:[{type:'move',to:{x:NaN,y:0}}]}}},
      {materials:{fabric:[{cut:1}]},grain:270},'stack',10);
    expect(invalid!.optimizer_ready).toBe(false);expect(invalid!.outline).toBeNull();
    expect(JSON.stringify(invalid)).not.toContain('NaN');
  });
  it('closes open contours only when the missing edge is a proven cutting fold', () => {
    const open=rectangle.slice(0,-1);
    const source={id:'part',name:'Part',svgGroupId:'stack',pathId:'sa',ops:open,grain,materials:{fabric:[{cut:1}]}};
    expect(makeLayoutPieces(source)[0]!.optimizer_ready).toBe(false);
    expect(makeLayoutPieces({...source,fold:[{x:10,y:20},{x:10,y:220}]})[0]!.optimizer_ready).toBe(true);
    expect(makeLayoutPieces({...source,fold:[{x:0,y:0},{x:0,y:220}]})[0]!.optimizer_ready).toBe(false);
    expect(layoutPath(open).closed).toBe(false);
    expect(()=>outlineBounds([{type:'move',to:{x:NaN,y:0}}])).toThrow('Nonfinite');
  });
});
