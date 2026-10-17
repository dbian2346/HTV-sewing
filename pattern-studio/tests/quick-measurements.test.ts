import {describe,it,expect} from 'vitest';
import {completeMeasurements,quickKeys,measurementKind} from '../web/quick-measurements.js';
import {generateStudioPattern} from '../src/index.js';
import {catalogEntries,catalogExample} from '../web/catalog-form.js';
import {fittedExample} from '../web/fitted-form.js';
const design=(id:string)=>{const spec=catalogExample(id),entry=catalogEntries.find(d=>d.designId===id)!;return {family:entry.family,required:entry.requiredMeasurements,baseline:spec.measurements};};
describe('reduced Customize measurements',()=>{
 it('asks for exactly three measurements on tops and two on bottoms',()=>{
  expect(quickKeys(design('simon'))).toEqual(['shoulderToShoulder','chest','waist']);
  expect(quickKeys(design('titan'))).toEqual(['length','waist']);
  expect(quickKeys({family:'skirt',required:['waist','hip'],baseline:{}})).toEqual(['length','waist']);
  expect(measurementKind(design('sven'))).toBe('top');
 });
 it('converts cm once and completes a working top draft with marked estimates',()=>{
  const config=design('simon'),completed=completeMeasurements(config,{shoulderToShoulder:42,chest:100,waist:76});
  expect(completed.measurements.shoulderToShoulder).toBe(420);expect(completed.measurements.chest).toBe(1000);expect(completed.measurements.waist).toBe(760);
  expect(completed.estimated).toContain('neck');expect(completed.estimated).not.toContain('waist');
  expect(generateStudioPattern({...catalogExample('simon'),measurements:completed.measurements}).pieces.length).toBeGreaterThan(0);
 });
 it('uses provided profile values before estimating secondary dimensions',()=>{
  const completed=completeMeasurements(design('simon'),{shoulderToShoulder:43,chest:98,waist:77},{neck:390,waist:800,shoulderSlope:14},1750);
  expect(completed.measurements.neck).toBe(390);expect(completed.measurements.waist).toBe(770);expect(completed.measurements.shoulderSlope).toBe(14);
  expect(completed.estimated).not.toContain('neck');
 });
 it('uses bottom length in millimeters and preserves anatomical ordering in a working draft',()=>{
  const config=design('titan'),completed=completeMeasurements(config,{length:106,waist:76});
  expect(completed.measurements.waistToFloor).toBe(1060);expect(completed.measurements.waist).toBe(760);
  expect(completed.measurements.waistToHips).toBeLessThan(completed.measurements.waistToSeat!);
  expect(generateStudioPattern({...catalogExample('titan'),measurements:completed.measurements}).pieces.length).toBeGreaterThan(0);
 });
 it('drafts the fitted skirt from waist and length, retaining saved seat measurements',()=>{
  const spec=fittedExample() as any,config={family:'skirt',required:Object.keys(spec.measurements),baseline:spec.measurements};
  const completed=completeMeasurements(config,{length:60,waist:76},{seat:1040});
  expect(completed.measurements.waistToKnee).toBe(600);expect(completed.measurements.seat).toBe(1040);
  expect(generateStudioPattern({...spec,measurements:completed.measurements}).pieces.length).toBeGreaterThan(0);
 });
 it('does not replace accessories with unrelated top/bottom fields or convert degrees',()=>{
  expect(quickKeys(design('florence'))).toEqual(['head']);
  expect(completeMeasurements({family:'other',required:['shoulderSlope'],baseline:{}},{shoulderSlope:15}).measurements.shoulderSlope).toBe(15);
 });
});
