import {describe,it,expect} from 'vitest';
import {estimateBodyMeasurements,measurementLandmarks} from '../server/measurement-api.mjs';
import {profileValue} from '../web/measurement-profile.js';
const input=()=>({heightCm:170,mimeType:'image/png',imageBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')});
const vision=(measurements:unknown[])=>async()=>({usablePhoto:true,issue:null,measurements});
const m=(key:string,value:number|null,unit='mm')=>({key,value,unit,confidence:'low'});
describe('height-calibrated body photo estimates',()=>{
 it('uses the repo landmark definitions with degrees for shoulder slope',()=>{
   expect(measurementLandmarks).toHaveLength(38);
   expect(measurementLandmarks.find((m:any)=>m.key==='shoulderSlope').unit).toBe('deg');
   expect(measurementLandmarks.every((m:any)=>!('defaultRatioToHeight' in m))).toBe(true);
 });
 it('returns mm estimates with confidence and leaves unavailable dimensions missing',async()=>{
   const result=await estimateBodyMeasurements(input(),{vision:vision([m('waist',740),m('seat',990),m('shoulderSlope',15,'deg'),m('chest',null)])});
   expect(result.measurements).toEqual({waist:740,seat:990,shoulderSlope:15});
   expect(result.height_mm).toBe(1700);expect(result.source).toBe('photo_estimate');expect(result.requires_review).toBe(true);
   expect(result.missing_keys).toContain('chest');expect(result.measurements.chest).toBeUndefined();
 });
 it('never falls back to height ratios when the provider fails',async()=>{
   await expect(estimateBodyMeasurements(input(),{vision:async()=>{throw new Error('Provider unavailable');}})).rejects.toThrow('Provider unavailable');
 });
 it('validates height, image type/signature and size before calling vision',async()=>{
   let called=false;const provider=async()=>{called=true;return {};};
   for(const bad of [{...input(),heightCm:0},{...input(),heightCm:NaN},{...input(),mimeType:'image/jpeg'},{...input(),imageBase64:'garbage!'}])
     await expect(estimateBodyMeasurements(bad,{vision:provider})).rejects.toThrow();
   expect(called).toBe(false);
 });
 it('rejects unsupported photos, duplicate fields, unexpected keys and invalid units',async()=>{
   await expect(estimateBodyMeasurements(input(),{vision:async()=>({usablePhoto:false,issue:'Show your feet.',measurements:[]})})).rejects.toThrow('Show your feet.');
   for(const measurements of [[m('waist',700),m('waist',710)],[m('invented',700)],[m('shoulderSlope',15,'mm')],[m('shoulderSlope',90,'deg')]])
     await expect(estimateBodyMeasurements(input(),{vision:vision(measurements)})).rejects.toThrow();
   await expect(estimateBodyMeasurements(input(),{vision:vision([m('waist',null)])})).rejects.toThrow('No usable measurements');
 });
 it('calibrates with only height and the image; no manual body dimensions are sent',async()=>{
   await estimateBodyMeasurements(input(),{vision:async(schema:any,prompt:string,image:any)=>{
     expect(prompt).toContain('170 cm');expect(prompt).toContain('never exact');expect(prompt).toContain('Do not fill missing');
     expect(image.mimeType).toBe('image/png');expect(image.data).toBe(input().imageBase64);
     return {usablePhoto:true,issue:null,measurements:[m('waist',700)]};
   }});
 });
 it('maps full-hip measurements to the gathered skirt without confusing high hip and seat',()=>{
   const profile={source:'photo_estimate' as const,measurements:{seat:1000,hips:900,waist:700}};
   expect(profileValue(profile,'hip','gathered_skirt')).toBe(1000);
   expect(profileValue(profile,'hips','sven')).toBe(900);
   expect(profileValue(profile,'seat','penelope')).toBe(1000);
   expect(profileValue(profile,'neck','sven')).toBeUndefined();
 });
});
