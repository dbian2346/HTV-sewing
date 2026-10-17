import {afterEach,describe,it,expect,vi} from 'vitest';
import {mountBodyCamera} from '../web/body-camera.js';
class Element extends EventTarget {hidden=false;disabled=false;textContent='';srcObject:unknown=null;videoWidth=720;videoHeight=1280;play=vi.fn(async()=>{});pause=vi.fn();click(){this.dispatchEvent(new Event('click'));}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const makeStream=()=>{const track=Object.assign(new EventTarget(),{stop:vi.fn()});return {stream:{getTracks:()=>[track]} as unknown as MediaStream,track};};
function setup(getUserMedia:any) {
 const video=new Element(),controls=new Element(),countdown=new Element(),openButton=new Element(),captureButton=new Element(),cancelButton=new Element(),switchButton=new Element();
 const onCapture=vi.fn(),onError=vi.fn(),onActive=vi.fn(),win=new EventTarget(),doc=Object.assign(new EventTarget(),{hidden:false,createElement:vi.fn(()=>({width:0,height:0,getContext:()=>({drawImage:vi.fn()}),toBlob:(cb:any)=>cb(new Blob([new Uint8Array([255,216,255,0])],{type:'image/jpeg'}))}))});
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
 const camera=mountBodyCamera({video:video as unknown as HTMLVideoElement,controls:controls as unknown as HTMLElement,countdown:countdown as unknown as HTMLElement,
   openButton:openButton as unknown as HTMLButtonElement,captureButton:captureButton as unknown as HTMLButtonElement,
   cancelButton:cancelButton as unknown as HTMLButtonElement,switchButton:switchButton as unknown as HTMLButtonElement,onCapture,onError,onActive});
 return {camera,video,controls,countdown,openButton,captureButton,cancelButton,switchButton,onCapture,onError,onActive,win,doc};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('live body measurement camera',()=>{
 it('requests video only after a click, captures JPEG and stops all tracks',async()=>{
  const {stream,track}=makeStream(),get=vi.fn(async()=>stream),ui=setup(get);
  expect(get).not.toHaveBeenCalled();ui.openButton.click();await tick();
  expect(get.mock.calls[0]![0]).toMatchObject({audio:false,video:{facingMode:{ideal:'user'}}});
  expect(ui.video.srcObject).toBe(stream);expect(ui.captureButton.disabled).toBe(false);
  vi.useFakeTimers();ui.captureButton.click();
  expect(ui.countdown.hidden).toBe(false);expect(ui.countdown.textContent).toBe('10');
  expect(ui.captureButton.disabled).toBe(true);expect(ui.switchButton.disabled).toBe(true);
  ui.video.dispatchEvent(new Event('loadeddata'));expect(ui.captureButton.disabled).toBe(true);
  vi.advanceTimersByTime(1000);expect(ui.countdown.textContent).toBe('9');
  vi.advanceTimersByTime(8000);expect(ui.countdown.textContent).toBe('1');
  expect(ui.doc.createElement).not.toHaveBeenCalled();expect(ui.onCapture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);expect(ui.onCapture.mock.calls[0]![0].type).toBe('image/jpeg');
  expect(ui.countdown.hidden).toBe(true);
  expect(track.stop).toHaveBeenCalledOnce();expect(ui.video.srcObject).toBeNull();expect(ui.controls.hidden).toBe(true);
 });
 it('cancels the countdown without taking a photo and resets on reopen',async()=>{
  const a=makeStream(),b=makeStream(),ui=setup(vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream));
  ui.openButton.click();await tick();vi.useFakeTimers();ui.captureButton.click();vi.advanceTimersByTime(3000);
  ui.cancelButton.click();vi.advanceTimersByTime(10000);
  expect(ui.onCapture).not.toHaveBeenCalled();expect(ui.countdown.hidden).toBe(true);expect(a.track.stop).toHaveBeenCalledOnce();
  ui.openButton.click();await vi.advanceTimersByTimeAsync(0);ui.captureButton.click();expect(ui.countdown.textContent).toBe('10');
  ui.doc.hidden=true;ui.doc.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(10000);
  expect(ui.onCapture).not.toHaveBeenCalled();expect(b.track.stop).toHaveBeenCalledOnce();
 });
 it('stops a permission request that resolves after cancellation',async()=>{
  let resolve!:(s:MediaStream)=>void;const get=vi.fn(()=>new Promise<MediaStream>(r=>{resolve=r})),ui=setup(get),{stream,track}=makeStream();
  ui.openButton.click();ui.cancelButton.click();resolve(stream);await tick();
  expect(track.stop).toHaveBeenCalledOnce();expect(ui.video.srcObject).toBeNull();expect(ui.video.play).not.toHaveBeenCalled();
 });
 it('handles denied permission with upload fallback messaging',async()=>{
  const ui=setup(async()=>{throw new DOMException('Denied','NotAllowedError')});ui.openButton.click();await tick();
  expect(ui.onError).toHaveBeenLastCalledWith('Allow camera access in your browser, or upload a photo.');
  expect(ui.openButton.disabled).toBe(false);expect(ui.controls.hidden).toBe(true);
 });
 it('switches front/rear cameras and stops streams on page exit',async()=>{
  const first=makeStream(),second=makeStream(),get=vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream),ui=setup(get);
  ui.openButton.click();await tick();ui.switchButton.click();await tick();
  expect(first.track.stop).toHaveBeenCalledOnce();expect(get.mock.calls[1]![0].video.facingMode.ideal).toBe('environment');
  ui.win.dispatchEvent(new Event('pagehide'));expect(second.track.stop).toHaveBeenCalledOnce();expect(ui.video.srcObject).toBeNull();
 });
 it('stops the camera when hidden and handles disconnected devices',async()=>{
  const a=makeStream(),b=makeStream(),get=vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream),ui=setup(get);
  ui.openButton.click();await tick();ui.doc.hidden=true;ui.doc.dispatchEvent(new Event('visibilitychange'));expect(a.track.stop).toHaveBeenCalledOnce();
  ui.doc.hidden=false;ui.openButton.click();await tick();b.track.dispatchEvent(new Event('ended'));
  expect(ui.controls.hidden).toBe(true);expect(ui.onError).toHaveBeenLastCalledWith('Camera disconnected. Reopen the camera or upload a photo.');
 });
});
