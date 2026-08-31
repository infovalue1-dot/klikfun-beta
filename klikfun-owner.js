/* Klikfun owner access + Reward Camera UX fixes */
(()=>{
  const OWNER_KEY_HASH="b8c578b24888a582381613cc741b0402ce4febe4c8d66ad1c12be365d8f5febc";
  const OWNER_FLAG="kf_owner_reward_v1";
  const TAP_COUNT=5;
  const TAP_WINDOW_MS=3500;

  let taps=[];
  let cameraFacing="user";

  async function sha256(v){
    const d=await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(String(v||""))
    );
    return [...new Uint8Array(d)]
      .map(x=>x.toString(16).padStart(2,"0"))
      .join("");
  }

  function isOwner(){
    return localStorage.getItem(OWNER_FLAG)==="1";
  }

  function openRewardCamera(){
    if(!isOwner())return;

    localStorage.setItem(
      "kf_reward_entitlement_v2",
      JSON.stringify({
        source:"owner",
        grantedAt:Date.now(),
        expiresAt:Date.now()+3600000,
        used:false,
        downloaded:false
      })
    );

    window.unlockReward("owner");

    setTimeout(()=>{
      normalizeSports();
      resetCameraButtons();
    },50);
  }

  async function requestOwnerAccess(){
    if(isOwner()){
      openRewardCamera();
      return;
    }

    const key=prompt("Masukkan kunci akses pemilik.");
    if(!key)return;

    if(await sha256(key)!==OWNER_KEY_HASH){
      alert("Kunci akses tidak cocok.");
      return;
    }

    localStorage.setItem(OWNER_FLAG,"1");
    openRewardCamera();
  }

  function onBrandTap(){
    const now=Date.now();

    taps=taps.filter(t=>now-t<=TAP_WINDOW_MS);
    taps.push(now);

    if(taps.length>=TAP_COUNT){
      taps=[];
      requestOwnerAccess();
    }
  }

  function installHiddenTrigger(){
    const brand=document.querySelector(".brand");

    if(!brand || brand.dataset.ownerTrigger==="1")return;

    brand.dataset.ownerTrigger="1";
    brand.addEventListener("click",onBrandTap);
  }

  function disableOwner(){
    localStorage.removeItem(OWNER_FLAG);
    taps=[];
  }

  async function startSelectedCamera(){
    try{
      if(camStream){
        camStream.getTracks().forEach(t=>t.stop());
        camStream=null;
      }

      camStream=await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:{ideal:cameraFacing}
        },
        audio:false
      });

      const video=document.getElementById("camVideo");

      video.srcObject=camStream;
      await video.play();

      video.classList.remove("hidden");

      const camBtn=document.getElementById("camBtn");

      if(camBtn){
        camBtn.textContent="Matikan kamera";
      }

      updateSwitchLabel();

    }catch(e){
      alert("Kamera tidak tersedia atau izin kamera belum diberikan.");
    }
        }
    window.toggleCamera=async function(){
    if(camStream){
      stopCamera();

      const camBtn=document.getElementById("camBtn");

      if(camBtn){
        camBtn.textContent="Nyalakan kamera";
      }

      return;
    }

    await startSelectedCamera();
  };

  async function switchCamera(){
    cameraFacing=
      cameraFacing==="user"
        ?"environment"
        :"user";

    await startSelectedCamera();
  }

  function updateSwitchLabel(){
    const b=document.getElementById("switchCameraBtn");

    if(!b)return;

    b.textContent=
      cameraFacing==="user"
        ?"↻ Pakai kamera belakang"
        :"↻ Pakai kamera depan";
  }

  function installSwitchCamera(){
    if(document.getElementById("switchCameraBtn"))return;

    const camBtn=document.getElementById("camBtn");

    if(!camBtn)return;

    const b=document.createElement("button");

    b.id="switchCameraBtn";
    b.className="btn ghost";
    b.type="button";
    b.textContent="↻ Pakai kamera belakang";
    b.onclick=switchCamera;

    camBtn.parentElement.insertAdjacentElement(
      "afterend",
      b
    );
  }

  function hideCameraControls(){
    const camBtn=document.getElementById("camBtn");
    const snapBtn=document.getElementById("snapBtn");
    const switchBtn=document.getElementById("switchCameraBtn");

    if(camBtn)camBtn.classList.add("hidden");
    if(snapBtn)snapBtn.classList.add("hidden");
    if(switchBtn)switchBtn.classList.add("hidden");
  }

  function showCameraControls(){
    const camBtn=document.getElementById("camBtn");
    const snapBtn=document.getElementById("snapBtn");
    const switchBtn=document.getElementById("switchCameraBtn");

    if(camBtn)camBtn.classList.remove("hidden");
    if(snapBtn)snapBtn.classList.remove("hidden");
    if(switchBtn)switchBtn.classList.remove("hidden");
  }

  function resetCameraButtons(){
    showCameraControls();

    const camBtn=document.getElementById("camBtn");

    if(camBtn){
      camBtn.textContent=
        camStream
          ?"Matikan kamera"
          :"Nyalakan kamera";
    }

    updateSwitchLabel();
  }

  window.takePhoto=function(){
    const v=document.getElementById("camVideo");
    const c=document.getElementById("camCanvas");

    if(!v || !v.videoWidth){
      alert("Nyalakan kamera dulu.");
      return;
    }

    c.width=360;
    c.height=480;

    const ctx=c.getContext("2d");

    if(cameraFacing==="user"){
      ctx.save();
      ctx.translate(c.width,0);
      ctx.scale(-1,1);
      ctx.drawImage(v,0,0,c.width,c.height);
      ctx.restore();
    }else{
      ctx.drawImage(v,0,0,c.width,c.height);
          }
        stopCamera();

    rewardShot=true;
    rewardFixed=false;
    rewardDataUrl=c.toDataURL("image/jpeg",.9);

    v.classList.add("hidden");
    c.classList.remove("hidden");

    const edit=document.getElementById("rewardEdit");

    if(edit){
      edit.classList.remove("hidden");
    }

    hideCameraControls();

    if(typeof refreshRewardSubject==="function"){
      Promise.resolve(
        refreshRewardSubject()
      ).catch(()=>{});
    }

    if(typeof applyStylePreview==="function"){
      applyStylePreview();
    }
  };

  window.retakePhoto=async function(){
    if(rewardFixed)return;

    rewardShot=false;
    rewardDataUrl=null;

    const edit=document.getElementById("rewardEdit");
    const canvas=document.getElementById("camCanvas");
    const video=document.getElementById("camVideo");

    if(edit){
      edit.classList.add("hidden");
    }

    if(canvas){
      canvas.classList.add("hidden");
      canvas.style.filter="none";
    }

    if(video){
      video.classList.remove("hidden");
    }

    resetCameraButtons();
    await startSelectedCamera();
  };

  function photoBrightness(){
    const canvas=document.getElementById("camCanvas");

    if(!canvas || !rewardShot){
      return 255;
    }

    const tiny=document.createElement("canvas");

    tiny.width=48;
    tiny.height=64;

    const x=tiny.getContext(
      "2d",
      {willReadFrequently:true}
    );

    x.drawImage(
      canvas,
      0,0,
      tiny.width,
      tiny.height
    );

    const data=x.getImageData(
      0,0,
      tiny.width,
      tiny.height
    ).data;

    let total=0;
    let count=0;

    for(let i=0;i<data.length;i+=4){
      total+=
        data[i]*0.2126+
        data[i+1]*0.7152+
        data[i+2]*0.0722;

      count++;
    }

    return count
      ?total/count
      :255;
  }

  function photoGoodForAI(){
    const brightness=photoBrightness();

    if(brightness<45){
      alert(
        "Foto terlalu gelap untuk AI Transform. "+
        "Ambil foto ulang dengan wajah dan pencahayaan yang lebih jelas."
      );

      return false;
    }

    return true;
  }

  window.buildIdentitySafePrompt=function(theme){
    const clean=String(theme||"")
      .replace(/\bAmerican Football\b/gi,"")
      .replace(/\bFootball\b/gi,"Soccer")
      .trim();

    return (
      clean+
      " preserve exact same face identity facial features age and skin tone"
    ).slice(0,78);
  };
    const originalAI=
    typeof window.fakeAiTransform==="function"
      ?window.fakeAiTransform
      :null;

  window.fakeAiTransform=async function(){
    if(!rewardShot || rewardFixed)return;

    if(!photoGoodForAI())return;

    if(!originalAI){
      alert("AI Transform belum dapat digunakan.");
      return;
    }

    await originalAI();

    if(rewardFixed){
      hideCameraControls();
    }
  };

  const oldFinalize=
    typeof window.finalizeRewardUI==="function"
      ?window.finalizeRewardUI
      :null;

  if(oldFinalize){
    window.finalizeRewardUI=function(){
      oldFinalize();
      hideCameraControls();
    };
  }

  const oldFix=
    typeof window.fixReward==="function"
      ?window.fixReward
      :null;

  if(oldFix){
    window.fixReward=function(){
      oldFix();

      if(rewardFixed){
        hideCameraControls();
      }
    };
  }

  function normalizeSports(){
    const select=document.getElementById("aiTheme");

    if(!select)return;

    [...select.options].forEach(opt=>{
      let t=opt.textContent.trim();

      if(/^American Football/i.test(t)){
        opt.remove();
        return;
      }

      t=t.replace(
        /^Football\b/i,
        "Soccer"
      );

      opt.textContent=t;
      opt.value=t;
    });
  }

  function watchThemes(){
    const theme=document.getElementById("aiTheme");

    if(!theme)return;

    const obs=new MutationObserver(()=>{
      normalizeSports();
    });

    obs.observe(
      theme,
      {childList:true}
    );

    const category=document.getElementById("aiCategory");

    if(category){
      category.addEventListener(
        "change",
        ()=>setTimeout(normalizeSports,0)
      );
    }

    normalizeSports();
  }

  function watchRewardState(){
    const fixed=document.getElementById("rewardFixed");

    if(!fixed)return;

    const obs=new MutationObserver(()=>{
      if(!fixed.classList.contains("hidden")){
        hideCameraControls();
      }
    });

    obs.observe(
      fixed,
      {
        attributes:true,
        attributeFilter:["class"]
      }
    );
  }

  function init(){
    installHiddenTrigger();
    installSwitchCamera();
    watchThemes();
    watchRewardState();
    resetCameraButtons();
  }

  window.KF_OWNER={
    active:isOwner,
    openRewardCamera,
    disable:disableOwner
  };

  if(document.readyState==="loading"){
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {once:true}
    );
  }else{
    init();
  }
})();
