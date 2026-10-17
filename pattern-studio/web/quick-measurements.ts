/** UI values are centimeters; drafting values and saved profiles remain millimeters. */
export type MeasurementKind = 'top' | 'bottom' | 'other';
export interface QuickDesign { family:string; required:string[]; baseline:Record<string,number> }
export function measurementKind(design:QuickDesign):MeasurementKind {
  if(['skirt','trousers','leggings'].includes(design.family))return 'bottom';
  if(design.required.includes('chest')||design.required.includes('shoulderToShoulder'))return 'top';
  if(design.required.includes('waist')||design.required.includes('hips')||design.required.includes('seat'))return 'bottom';
  return 'other';
}
export function lengthKey(design:QuickDesign) {
  return ['waistToFloor','waistToKnee','waistToUpperLeg','waistToSeat','waistToHips'].find(key=>design.required.includes(key));
}
export function quickKeys(design:QuickDesign) {
  const kind=measurementKind(design);
  return kind==='top'?['shoulderToShoulder','chest','waist']:kind==='bottom'?['length','waist']:design.required;
}
export function completeMeasurements(design:QuickDesign, entered:Record<string,number>, known:Record<string,number>={}, heightMm?:number) {
  const kind=measurementKind(design), primaryLength=lengthKey(design);
  const mm=Object.fromEntries(Object.entries(entered).map(([key,value])=>[key,key==='shoulderSlope'?value:value*10]));
  const waistScale=(mm.waist??known.waist??760)/(design.baseline.waist??760);
  const chestScale=(mm.chest??known.chest??1000)/(design.baseline.chest??1000);
  const verticalScale=heightMm?heightMm/1700:kind==='top'?(mm.shoulderToShoulder??420)/(design.baseline.shoulderToShoulder??420)
    :primaryLength==='waistToFloor'?(mm.length??1060)/(design.baseline.waistToFloor??1060):waistScale;
  const measurements:Record<string,number>={},estimated:string[]=[];
  for(const key of design.required){
    if(key===primaryLength&&kind==='bottom'){measurements[key]=mm.length!;continue;}
    if(mm[key]!==undefined){measurements[key]=mm[key]!;continue;}
    if(known[key]!==undefined){measurements[key]=known[key]!;continue;}
    const base=design.baseline[key];if(base===undefined)throw new Error(`No drafting proportion available for ${key}.`);
    const scale=key==='shoulderSlope'?1:/To|inseam|crossSeam|crotchDepth/.test(key)?verticalScale
      :/^waist/.test(key)||kind==='bottom'?waistScale:chestScale;
    measurements[key]=Math.round(base*scale*100)/100;estimated.push(key);
  }
  return {measurements,estimated};
}
export function mountQuickMeasurements(parent:HTMLElement) {
  let design:QuickDesign={family:'skirt',required:['waist','hip'],baseline:{waist:760,hip:1020}};
  const names:Record<string,string>={shoulderToShoulder:'Shoulder to shoulder',chest:'Chest',waist:'Waist',length:'Length'};
  const entered=()=>Object.fromEntries([...parent.querySelectorAll<HTMLInputElement>('input')].map(input=>[input.dataset.measurement!,input.valueAsNumber]));
  return {
    set(next:QuickDesign,valuesMm:Record<string,number>,lengthMm?:number){
      design=next;parent.replaceChildren();
      const grid=document.createElement('div');grid.className='field-grid';
      for(const key of quickKeys(design)){
        const label=document.createElement('label');label.className='field';label.textContent=names[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2');
        const wrap=document.createElement('div');wrap.className='input-wrap';
        const input=document.createElement('input');input.type='number';input.name=`customize-${key}`;input.dataset.measurement=key;input.required=true;
        input.min=key==='shoulderSlope'?'0.1':'1';input.max=key==='shoulderSlope'?'60':'500';input.step='any';
        const value=key==='length'?lengthMm:valuesMm[key];input.value=value===undefined?'':String(value/(key==='shoulderSlope'?1:10));
        const unit=document.createElement('span');unit.textContent=key==='shoulderSlope'?'°':'cm';wrap.append(input,unit);label.append(wrap);grid.append(label);
      }
      parent.append(grid);
    },
    entered,
    complete(known:Record<string,number>,heightMm?:number){return completeMeasurements(design,entered(),known,heightMm);},
    valid(report=true){return [...parent.querySelectorAll<HTMLInputElement>('input')].every(input=>report?input.reportValidity():input.checkValidity());}
  };
}
