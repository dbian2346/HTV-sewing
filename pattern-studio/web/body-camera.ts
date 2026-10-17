interface CameraOptions {
  video:HTMLVideoElement; controls:HTMLElement; countdown:HTMLElement; openButton:HTMLButtonElement;
  captureButton:HTMLButtonElement; cancelButton:HTMLButtonElement; switchButton:HTMLButtonElement;
  onCapture:(file:File)=>void; onError:(message:string)=>void; onActive:(active:boolean)=>void;
}
/** Camera access begins only after an explicit click; stale requests never leave a camera running. */
export function mountBodyCamera(options:CameraOptions) {
  const {video,controls,countdown,openButton,captureButton,cancelButton,switchButton}=options;
  let stream:MediaStream|null=null, revision=0, facing:'user'|'environment'='user';
  let timer:ReturnType<typeof setInterval>|null=null, capturing=false;
  const resetCountdown=()=>{
    if(timer!==null)clearInterval(timer);
    timer=null;countdown.hidden=true;countdown.textContent='';
    capturing=false;captureButton.textContent='Capture in 10s';switchButton.disabled=false;
  };
  const stop=()=>{
    resetCountdown();
    revision++;stream?.getTracks().forEach(track=>track.stop());stream=null;
    video.pause();video.srcObject=null;video.hidden=true;controls.hidden=true;
    openButton.disabled=false;openButton.hidden=false;
    options.onActive(false);
  };
  const open=async()=>{
    stop();const request=revision;
    if(!navigator.mediaDevices?.getUserMedia){options.onError('Live camera is unavailable here. Open the app on localhost or HTTPS, or upload a photo.');return;}
    openButton.disabled=true;options.onError('');options.onActive(true);
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:1920}}});
      if(request!==revision){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;video.srcObject=stream;video.hidden=false;controls.hidden=false;openButton.hidden=true;
      acquired.getTracks().forEach(track=>track.addEventListener('ended',()=>{
        if(stream===acquired){stop();options.onError('Camera disconnected. Reopen the camera or upload a photo.');}
      }));
      captureButton.disabled=true;switchButton.disabled=false;
      await video.play();if(request!==revision)return;
      captureButton.disabled=video.videoWidth===0 || video.videoHeight===0;
    } catch(error) {
      if(request!==revision)return;stop();
      const name=error instanceof DOMException?error.name:'';
      options.onError(name==='NotAllowedError'?'Allow camera access in your browser, or upload a photo.'
        :name==='NotFoundError'?'No camera found. Connect a camera or upload a photo.'
        :name==='NotReadableError'?'The camera is busy. Close other camera apps and try again.'
        :'Could not open the camera. Try again or upload a photo.');
    }
  };
  video.addEventListener('loadeddata',()=>{if(stream)captureButton.disabled=capturing||!video.videoWidth||!video.videoHeight;});
  openButton.addEventListener('click',()=>void open());
  cancelButton.addEventListener('click',stop);
  switchButton.addEventListener('click',()=>{facing=facing==='user'?'environment':'user';void open();});
  const captureFrame=()=>{
    resetCountdown();
    if(!stream || !video.videoWidth || !video.videoHeight){captureButton.disabled=true;return;}
    const request=revision,canvas=document.createElement('canvas');
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const context=canvas.getContext('2d');if(!context){captureButton.disabled=false;options.onError('Could not capture this frame. Try uploading a photo.');return;}
    capturing=true;captureButton.disabled=true;switchButton.disabled=true;context.drawImage(video,0,0);
    canvas.toBlob(blob=>{
      if(request!==revision)return;
      if(!blob){resetCountdown();captureButton.disabled=false;options.onError('Could not capture this frame. Try again.');return;}
      stop();options.onCapture(new File([blob],'body-camera.jpg',{type:'image/jpeg'}));
    },'image/jpeg',.92);
  };
  captureButton.addEventListener('click',()=>{
    if(capturing||!stream||!video.videoWidth||!video.videoHeight)return;
    capturing=true;captureButton.disabled=true;switchButton.disabled=true;
    const request=revision,deadline=Date.now()+10000;
    countdown.textContent='10';countdown.hidden=false;captureButton.textContent='Counting down…';
    timer=setInterval(()=>{
      if(request!==revision){resetCountdown();return;}
      const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
      if(remaining===0)captureFrame();
      else countdown.textContent=String(remaining);
    },1000);
  });
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {stop};
}
