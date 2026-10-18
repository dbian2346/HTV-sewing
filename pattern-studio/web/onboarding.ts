import { measurementProfileSchema, type MeasurementProfile } from './measurement-profile.js';
import { mountBodyCamera } from './body-camera.js';
type Stage = 'welcome' | 'guest' | 'intro' | 'method' | 'manual' | 'body-photo';
export function mountOnboarding(onComplete: (profile:MeasurementProfile)=>void, onCancel?:()=>void) {
  const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
  let profile:MeasurementProfile = {source:'manual',measurements:{}};
  let photo:File|null=null, photoURL:string|null=null, abort:AbortController|null=null, revision=0;
  let reviewing=false;
  let editing=false;
  let camera:ReturnType<typeof mountBodyCamera>|null=null;
  const cleanupPhoto=()=>{
    camera?.stop();
    abort?.abort();abort=null;revision++;
    if(photoURL)URL.revokeObjectURL(photoURL);
    photoURL=null;photo=null;$<HTMLInputElement>('body-photo-file').value='';
    $<HTMLImageElement>('body-photo-preview').removeAttribute('src');$('body-photo-preview').hidden=true;
    $<HTMLButtonElement>('estimate-body').disabled=false;$('estimate-body').textContent='Estimate measurements';
  };
  const show=(stage:Stage)=>{
    document.body.classList.add('onboarding-active');
    $('onboarding').dataset.stage=stage;
    $('onboard-error').textContent='';
    $('onboarding').querySelectorAll<HTMLElement>('[data-onboard-page]').forEach(el=>el.hidden=el.dataset.onboardPage!==stage);
    document.title=`Sewberry — ${stage==='welcome'?'Welcome':stage==='guest'?'Continue as guest':'Measurements'}`;
    window.scrollTo(0,0);
    $('onboarding').querySelector<HTMLElement>(`[data-onboard-page="${stage}"] h1`)?.focus();
  };
  const error=(message:string)=>{ $('onboard-error').textContent=message; };
  const manual=(review=false)=>{
    reviewing=review;$('profile-title').textContent=review?'Review estimates':'Measurements';
    for(const key of ['chest','waist','seat']) $<HTMLInputElement>(`profile-${key}`).value=profile.measurements[key]===undefined?'':String(Math.round(profile.measurements[key]!)/10);
    $('profile-save').textContent=review?'Use these measurements →':'Save & Continue →';
    show('manual');
  };
  $('get-started').addEventListener('click',()=>show('guest'));
  $('demo-sign-in').addEventListener('click',()=>show('guest'));
  $('continue-guest').addEventListener('click',()=>show('intro'));
  $('add-measurements').addEventListener('click',()=>show('method'));
  $('choose-manual').addEventListener('click',()=>manual());
  $('choose-body-photo').addEventListener('click',()=>show('body-photo'));
  $('onboard-back').addEventListener('click',()=>{
    if(editing){cleanupPhoto();editing=false;document.body.classList.remove('onboarding-active');onCancel?.();return;}
    const stage=$('onboarding').dataset.stage as Stage;
    cleanupPhoto();show(stage==='guest'?'welcome':stage==='intro'?'guest':stage==='method'?'intro':'method');
  });
  $('profile-form').addEventListener('submit',event=>{
    event.preventDefault();const form=$<HTMLFormElement>('profile-form');if(!form.reportValidity())return;
    const measurements={...profile.measurements};
    for(const key of ['chest','waist','seat'])measurements[key]=$<HTMLInputElement>(`profile-${key}`).valueAsNumber*10;
    profile=measurementProfileSchema.parse({...profile,source:reviewing || profile.source==='photo_estimate'?'photo_estimate':'manual',measurements});
    cleanupPhoto();editing=false;document.body.classList.remove('onboarding-active');onComplete(profile);
  });
  const fileInput=$<HTMLInputElement>('body-photo-file');
  const selectPhoto=(file:File|undefined)=>{
    abort?.abort();revision++;photo=null;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=null;
    $('body-photo-preview').hidden=true;$('onboard-error').textContent='';
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>3*1024*1024){error('Choose a JPG, PNG or WebP image up to 3 MB.');return;}
    photo=file;photoURL=URL.createObjectURL(file);const image=$<HTMLImageElement>('body-photo-preview');image.src=photoURL;image.hidden=false;
    image.onerror=()=>{photo=null;abort?.abort();revision++;image.hidden=true;error('This photo could not be opened. Choose another image.');};
    $<HTMLButtonElement>('estimate-body').disabled=false;$('estimate-body').textContent='Estimate measurements';
  };
  camera=mountBodyCamera({video:$<HTMLVideoElement>('body-camera-video'),controls:$('body-camera-controls'),countdown:$('body-camera-countdown'),
    openButton:$<HTMLButtonElement>('capture-body-photo'),captureButton:$<HTMLButtonElement>('capture-body-frame'),
    cancelButton:$<HTMLButtonElement>('cancel-body-camera'),switchButton:$<HTMLButtonElement>('switch-body-camera'),
    onCapture:selectPhoto,onError:error,onActive:active=>{
      if(active){abort?.abort();revision++;$('body-photo-preview').hidden=true;}
      else $('body-photo-preview').hidden=!photo;
      $<HTMLButtonElement>('estimate-body').disabled=active;
    }});
  $('upload-body-photo').addEventListener('click',()=>{camera?.stop();fileInput.removeAttribute('capture');fileInput.click();});
  fileInput.addEventListener('change',()=>{camera?.stop();selectPhoto(fileInput.files?.[0]);});
  $('body-height').addEventListener('input',()=>{
    abort?.abort();revision++;$<HTMLButtonElement>('estimate-body').disabled=false;$('estimate-body').textContent='Estimate measurements';
  });
  $('body-photo-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!$<HTMLFormElement>('body-photo-form').reportValidity())return;
    if(!photo){error('Add a full-body photo first.');return;}
    const heightCm=$<HTMLInputElement>('body-height').valueAsNumber, file=photo, request=++revision;
    abort?.abort();const controller=new AbortController();abort=controller;
    const button=$<HTMLButtonElement>('estimate-body');button.disabled=true;button.textContent='Estimating…';error('');
    try {
      const imageBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(new Error('Could not read this photo.'));reader.readAsDataURL(file);});
      if(request!==revision)return;
      const response=await fetch('/api/measure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64,mimeType:file.type,heightCm}),signal:controller.signal});
      const result=await response.json().catch(()=>{throw new Error('Photo estimation is unavailable. Try again or enter measurements manually.');});
      if(!response.ok)throw new Error(result.error||'Could not estimate measurements. Try another photo or enter them manually.');
      if(request!==revision)return;
      profile=measurementProfileSchema.parse(result);cleanupPhoto();manual(true);
    } catch(e){if(request===revision&&!controller.signal.aborted)error(e instanceof Error?e.message:'Photo estimation failed. Try again.');}
    finally{if(request===revision){button.disabled=false;button.textContent='Estimate measurements';}}
  });
  $('body-photo-manual').addEventListener('click',()=>{
    cleanupPhoto();if(editing){editing=false;document.body.classList.remove('onboarding-active');onCancel?.();}else manual();
  });
  show('welcome');
  return { editPhoto:()=>{cleanupPhoto();editing=true;show('body-photo');}, getProfile:()=>profile };
}
