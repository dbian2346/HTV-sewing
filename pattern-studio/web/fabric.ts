export function mountFabricControls() {
  const width=document.getElementById('fabric-width') as HTMLInputElement;
  const length=document.getElementById('fabric-length') as HTMLInputElement;
  const custom=document.getElementById('custom-fabric') as HTMLInputElement;
  const chips=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-fabric-type]'));
  let type='Linen';
  const update=()=>{
    const cm=width.valueAsNumber,meters=length.valueAsNumber;
    document.getElementById('fabric-map-title')!.textContent=`${Number.isFinite(cm)?cm:'—'} cm × ${Number.isFinite(meters)?meters.toFixed(1):'—'} m Pattern Map`;
    for(const [id,fraction] of [['ruler-quarter',.25],['ruler-half',.5],['ruler-three-quarter',.75],['ruler-end',1]] as const)
      document.getElementById(id)!.textContent=Number.isFinite(meters)?`${Number((meters*fraction).toFixed(2))} m`:'—';
  };
  document.querySelectorAll<HTMLButtonElement>('[data-fabric-input]').forEach(button=>button.addEventListener('click',()=>{
    const input=button.dataset.fabricInput==='fabric-width'?width:length;
    const next=Math.round(((input.valueAsNumber||0)+Number(button.dataset.delta))*1000)/1000;
    input.value=String(Math.min(Number(input.max),Math.max(Number(input.min),next)));
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }));
  for(const input of [width,length])input.addEventListener('input',update);
  const select=(value:string)=>{type=value;chips.forEach(chip=>{
    const selected=chip.dataset.fabricType===type;chip.setAttribute('aria-pressed',String(selected));
    let check=chip.querySelector('img');
    if(selected&&!check){check=document.createElement('img');check.src='/assets/fabric-imgContainer7.svg';check.alt='';chip.prepend(check);}
    if(!selected)check?.remove();
  });};
  chips.forEach(chip=>chip.addEventListener('click',()=>{select(chip.dataset.fabricType!);custom.value='';}));
  document.getElementById('custom-fabric-form')!.addEventListener('submit',event=>{
    event.preventDefault();if(custom.value.trim())select(custom.value.trim());
  });
  update();
  return {read(){
    if(!width.reportValidity()||!length.reportValidity())return null;
    return {width_mm:width.valueAsNumber*10,length_mm:length.valueAsNumber*1000,type};
  }};
}
