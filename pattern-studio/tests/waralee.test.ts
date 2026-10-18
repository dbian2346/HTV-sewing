import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {designs,themePlugin} from '@pattern-studio/catalog-engine';
import {generateStudioPattern,exportStudioSVG,exportStudioPDF} from '../src/index.js';
import {validateCatalogSpec} from '../src/freesewing/catalog-runtime.js';
import {catalogEntries,catalogExample} from '../web/catalog-form.js';
import {completeMeasurements,quickKeys,quickLengthMm,lengthKey} from '../web/quick-measurements.js';
const base=()=>JSON.parse(readFileSync(new URL('../examples/waralee.json',import.meta.url),'utf8'));
const entry=catalogEntries.find(d=>d.designId==='waralee')!;
const config=()=>({designId:entry.designId,family:entry.family,required:entry.requiredMeasurements,baseline:catalogExample('waralee').measurements});
describe('Waralee wrap pants integration',()=>{
 it('keeps Waralee registered once and asks only for length and waist',()=>{
  expect(catalogEntries.filter(d=>d.designId==='waralee')).toHaveLength(1);
  expect(quickKeys(config())).toEqual(['length','waist']);expect(lengthKey(config())).toBe('inseam');
 });
 it.each([[70,65],[90,76],[100,76],[110,100]])('drafts length %s cm and waist %s cm without overwriting hip depth',(length,waist)=>{
  const completed=completeMeasurements(config(),{length,waist});expect(completed.issues).toEqual([]);
  expect(completed.measurements.waistToHips).toBeLessThan(completed.measurements.crotchDepth!);
  expect(completed.measurements.waist).toBe(waist*10);
  expect(quickLengthMm(config(),completed.measurements)).toBeCloseTo(length*10,6);
  const p=generateStudioPattern({...base(),measurements:completed.measurements,options:completed.optionOverrides});
  expect(p.pieces.length).toBe(7);expect(exportStudioSVG(p)).not.toMatch(/NaN|Infinity/);
  const pants=p.layout.pieces.find(p=>p.source.part_id==='waralee.pants')!;
  expect(pants.cut_quantity).toBe(2);expect(pants.outline!.commands.some(op=>op.type==='curve')).toBe(true);
 });
 it('places the native hem fold at the requested finished length, excluding the hem allowance',()=>{
  const c=completeMeasurements(config(),{length:100,waist:76});
  const Constructor=designs.waralee!;const native=new Constructor({measurements:c.measurements,expand:true,sa:10}).use(themePlugin).draft();native.render();
  const pants=Object.values(native.stacks).flatMap(stack=>[...stack.parts]).find(part=>part.name==='waralee.pants')!;
  expect(pants.paths.legFold!.ops[0]!.to!.y).toBeCloseTo(1000,6);
 });
 it('preserves known body inseam and adjusts the native leg-size option for requested length',()=>{
  const known=base().measurements,completed=completeMeasurements(config(),{length:100,waist:77},known,1700);
  expect(completed.measurements.inseam).toBe(800);expect(completed.measurements.waistToHips).toBe(190);
  expect(completed.optionOverrides.legSizePct).toBeCloseTo(88.95,6);expect(completed.measurements.waist).toBe(770);
  expect(quickLengthMm({...config(),options:completed.optionOverrides},completed.measurements)).toBeCloseTo(1000,6);
  expect(generateStudioPattern({...base(),measurements:completed.measurements,options:completed.optionOverrides}).pieces.length).toBe(7);
 });
 it('accounts for the native waist-raise and leg-size options',()=>{
  const options={waistRaisePct:10,legSizePct:80},c=completeMeasurements({...config(),options},{length:100,waist:76});
  expect(quickLengthMm({...config(),options},c.measurements)).toBeCloseTo(1000,6);
  expect(generateStudioPattern({...base(),measurements:c.measurements,options}).pieces.length).toBe(7);
 });
 it('reports unsupported lengths without throwing during input editing',()=>{
  expect(completeMeasurements(config(),{length:10,waist:76}).issues[0]).toContain('length must exceed');
  expect(completeMeasurements(config(),{length:120,waist:76},base().measurements).issues[0]).toContain('saved inseam');
 });
 it('rejects a garment length accidentally submitted as hip depth before native drafting',()=>{
  const s=base();s.measurements.waistToHips=1000;
  expect(()=>validateCatalogSpec(s)).toThrow(/waist-to-hip depth shorter than crotch depth/);
 });
 it('exports each native outline, including allowance-inclusive facings, without invented grain constraints',()=>{
  const p=generateStudioPattern(base());expect(p.layout.pieces).toHaveLength(7);
  const svg=exportStudioSVG(p);expect(svg).not.toMatch(/(?:id|(?:xlink:)?href)="#?logo"/);
  expect(svg).toContain('CUT 2');
  expect(p.layout.pieces.every(piece=>piece.outline&&piece.width_mm!>0&&piece.height_mm!>0)).toBe(true);
  const front=p.layout.pieces.find(p=>p.source.part_id==='waralee.facingFront')!;
  expect(front.source.path_id).toBe('seamSeam');expect(front.cut_quantity).toBe(4);
  expect(front.width_mm).toBeCloseTo(146,6);expect(front.height_mm).toBeCloseTo(63,6);
  expect(front.grainline).toBeNull();expect(front.optimizer_ready).toBe(false);
  expect(front.issues).toContain('Grain direction unavailable; confirm alignment before nesting.');
 });
 it.each([{frontPocket:false,backPocket:false},{frontPocketStyle:'waistband',separateWaistband:true}])('drafts pocket/waistband variants %j',options=>{
  const p=generateStudioPattern({...base(),options});expect(p.pieces.length).toBeGreaterThan(0);
  expect(p.layout.pieces.every(piece=>piece.outline)).toBe(true);
 });
 it('exports a tiled vector PDF with a calibration page',async()=>{
  const p=generateStudioPattern(base()),bytes=await exportStudioPDF(p,{paperSize:'A4'});
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe('None');
 });
});
