/* Klikfun Reward Camera UX v2 (public runtime only) */
(()=>{
  let cameraFacing="user";

  const $id=id=>document.getElementById(id);

  function updateSwitchLabel(){
    const b=$id("switchCameraBtn");
    if(b)b.textContent=cameraFacing==="user"?"↻ Pakai kamera belakang":"↻ Pakai kamera depan";
  }

  function hideCameraControls(){
    ["camBtn","snapBtn","switchCameraBtn"].forEach(id=>{const el=$id(id);if(el)el.classList.add("hidden")});
  }

  function showCameraControls(){
    ["camBtn","snapBtn","switchCameraBtn"].forEach(id=>{const el=$id(id);if(el)el.classList.remove("hidden")});
  }

  function resetCameraButtons(){
    showCameraControls();
    const b=$id("camBtn");
    if(b)b.textContent=camStream?"Matikan kamera":"Nyalakan kamera";
    updateSwitchLabel();
  }

  async function startSelectedCamera(){
    try{
      if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}
      camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing}},audio:false});
      const v=$id("camVideo");
      v.srcObject=camStream;await v.play();v.classList.remove("hidden");
      const b=$id("camBtn");if(b)b.textContent="Matikan kamera";
      updateSwitchLabel();
    }catch(e){alert("Kamera tidak tersedia atau izin kamera belum diberikan.")}
  }

  window.toggleCamera=async function(){
    if(camStream){stopCamera();const b=$id("camBtn");if(b)b.textContent="Nyalakan kamera";return}
    await startSelectedCamera();
  };

  async function switchCamera(){cameraFacing=cameraFacing==="user"?"environment":"user";await startSelectedCamera()}

  function installSwitchCamera(){
    if($id("switchCameraBtn"))return;
    const camBtn=$id("camBtn");if(!camBtn)return;
    const b=document.createElement("button");
    b.id="switchCameraBtn";b.className="btn ghost";b.type="button";b.onclick=switchCamera;
    camBtn.parentElement.insertAdjacentElement("afterend",b);updateSwitchLabel();
  }

  window.takePhoto=function(){
    const v=$id("camVideo"),c=$id("camCanvas");
    if(!v||!v.videoWidth){alert("Nyalakan kamera dulu.");return}
    c.width=360;c.height=480;
    const x=c.getContext("2d");
    if(cameraFacing==="user"){
      x.save();x.translate(c.width,0);x.scale(-1,1);x.drawImage(v,0,0,c.width,c.height);x.restore();
    }else{x.drawImage(v,0,0,c.width,c.height)}
    stopCamera();rewardShot=true;rewardFixed=false;rewardDownloaded=false;rewardDataUrl=c.toDataURL("image/jpeg",.92);
    v.classList.add("hidden");c.classList.remove("hidden");
          const edit=$id("rewardEdit");if(edit)edit.classList.remove("hidden");
    hideCameraControls();
    if(typeof refreshRewardSubject==="function")Promise.resolve(refreshRewardSubject()).catch(()=>{});
    if(typeof applyStylePreview==="function")applyStylePreview();
  };

  window.retakePhoto=async function(){
    if(rewardFixed)return;
    rewardShot=false;rewardDataUrl=null;
    const edit=$id("rewardEdit"),c=$id("camCanvas"),v=$id("camVideo");
    if(edit)edit.classList.add("hidden");
    if(c){c.classList.add("hidden");c.style.filter="none"}
    if(v)v.classList.remove("hidden");
    resetCameraButtons();await startSelectedCamera();
  };

  function photoBrightness(){
    const c=$id("camCanvas");if(!c||!rewardShot)return 255;
    const t=document.createElement("canvas");t.width=36;t.height=48;
    const x=t.getContext("2d",{willReadFrequently:true});x.drawImage(c,0,0,36,48);
    const d=x.getImageData(0,0,36,48).data;let total=0,n=0;
    for(let i=0;i<d.length;i+=4){total+=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;n++}
    return n?total/n:255;
  }

  function photoGoodForAI(){
    if(photoBrightness()<42){alert("Foto terlalu gelap. Ambil foto ulang dengan wajah dan pencahayaan yang lebih jelas.");return false}
    return true;
  }

  function normalizeSports(){
    const s=$id("aiTheme");if(!s)return;
    [...s.options].forEach(o=>{
      let t=o.textContent.trim();
      if(/^American Football/i.test(t)){o.remove();return}
      t=t.replace(/^Football\b/i,"Soccer");o.textContent=t;o.value=t;
    });
  }

  function cleanThemeName(v){
    return String(v||"").replace(/\bAmerican Football\b/gi,"").replace(/\bFootball\b/gi,"Soccer").trim();
  }

  window.buildIdentitySafePrompt=function(theme){
    return cleanThemeName(theme).slice(0,70);
  };

  const STYLE_FILTERS={
    natural:"brightness(1.10) contrast(1.06) saturate(1.08)",
    soft:"brightness(1.13) contrast(1.01) saturate(1.06)",
    smooth:"brightness(1.10) contrast(1.03) saturate(1.02)",
    bright:"brightness(1.16) contrast(1.03) saturate(1.05)",
    warm:"brightness(1.10) contrast(1.05) saturate(1.10) sepia(.08)",
    cool:"brightness(1.09) contrast(1.06) saturate(.96) hue-rotate(5deg)",
    elegant:"brightness(1.08) contrast(1.10) saturate(.96)",
    confident:"brightness(1.06) contrast(1.14) saturate(1.04)",
    dreamy:"brightness(1.12) contrast(.99) saturate(1.07)",
    classy:"brightness(1.06) contrast(1.11) saturate(.91)",
    cinematic:"brightness(1.04) contrast(1.16) saturate(.96)",
    vivid:"brightness(1.06) contrast(1.08) saturate(1.20)",
    food:"brightness(1.08) contrast(1.07) saturate(1.24)",
    product:"brightness(1.12) contrast(1.08) saturate(.98)"
  };

  function selectedStyleId(){const s=$id("rewardStyle");return s?String(s.value||"natural"):"natural"}
  function selectedFilter(){return STYLE_FILTERS[selectedStyleId()]||"brightness(1.10) contrast(1.07) saturate(1.07)"}

  function paintEnhancedPhoto(source,target,filter){
    target.width=source.width;target.height=source.height;
    const x=target.getContext("2d");
    x.clearRect(0,0,target.width,target.height);
    x.filter="blur(1.15px) "+filter;x.globalAlpha=.38;x.drawImage(source,0,0);
    x.filter=filter;x.globalAlpha=.82;x.drawImage(source,0,0);
    x.filter="none";x.globalAlpha=1;
    const g=x.createRadialGradient(target.width*.5,target.height*.35,20,target.width*.5,target.height*.45,target.height*.72);
    g.addColorStop(0,"rgba(255,255,255,.12)");g.addColorStop(.58,"rgba(255,255,255,0)");g.addColorStop(1,"rgba(0,0,0,.08)");
    x.fillStyle=g;x.fillRect(0,0,target.width,target.height);
  }

  window.applyStylePreview=function(){
    const c=$id("camCanvas");if(c)c.style.filter=selectedFilter();
        const h=$id("styleHint");if(h)h.style.display="none";
  };

  window.fixReward=function(){
    if(!rewardShot||rewardFixed)return;
    const c=$id("camCanvas"),base=document.createElement("canvas"),out=document.createElement("canvas");
    base.width=c.width;base.height=c.height;
    const bx=base.getContext("2d");
    const id=selectedStyleId();
    if(typeof rewardStyleObjectEffect==="function"){
      bx.filter=selectedFilter();
      try{rewardStyleObjectEffect(bx,c,id,c.width,c.height,typeof rewardSubject!=="undefined"?rewardSubject:null)}
      catch(_){bx.drawImage(c,0,0)}
      bx.filter="none";
    }else{bx.drawImage(c,0,0)}
    paintEnhancedPhoto(base,out,"brightness(1.04) contrast(1.04) saturate(1.03)");
    c.width=out.width;c.height=out.height;c.style.filter="none";c.getContext("2d").drawImage(out,0,0);
    rewardDataUrl=c.toDataURL("image/jpeg",.93);rewardFixed=true;
    if(typeof finalizeRewardUI==="function")finalizeRewardUI();
    if(typeof kfTrack==="function")kfTrack("reward_fixed",{theme:"edit:"+id});
  };

  const KF_REWARD_AI_ENDPOINT="/api/reward-ai";

  async function aiTransformV2(){
    if(!rewardShot||rewardFixed||!photoGoodForAI())return;
    const c=$id("camCanvas"),cat=$id("aiCategory")?.value||"beauty",theme=cleanThemeName($id("aiTheme")?.value||"");
    const source=document.createElement("canvas");source.width=c.width;source.height=c.height;source.getContext("2d").drawImage(c,0,0);
    const blob=await new Promise((res,rej)=>source.toBlob(b=>b?res(b):rej(Error("Gagal memproses foto")),"image/jpeg",.92));
    const form=new FormData();
    form.append("image",blob,"klikfun.jpg");form.append("theme",cat);form.append("subtheme",theme);
    form.append("mode",rewardUnlockSource==="group-shared"?"group":"solo");
    if(typeof rewardSubject!=="undefined"&&rewardSubject?.type)form.append("subject_type",rewardSubject.type);
    const r=await fetch(KF_REWARD_AI_ENDPOINT,{method:"POST",body:form});
    let err={};
    if(!r.ok){try{err=await r.json()}catch(_){}throw Error(err.error||"AI Transform belum berhasil. Coba foto atau tema lain.")}
    const out=await r.blob();if(!out.type.startsWith("image/"))throw Error("Hasil AI tidak valid.");
    const url=URL.createObjectURL(out),img=new Image();
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});
    const w=360,h=480;c.width=w;c.height=h;c.style.filter="none";
    const x=c.getContext("2d");x.clearRect(0,0,w,h);
    const scale=Math.max(w/img.width,h/img.height),dw=img.width*scale,dh=img.height*scale;
    x.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);URL.revokeObjectURL(url);
    rewardDataUrl=c.toDataURL("image/jpeg",.94);rewardFixed=true;
    if(typeof finalizeRewardUI==="function")finalizeRewardUI();
    if(typeof kfTrack==="function")kfTrack("reward_fixed",{theme:(cat+":"+theme).slice(0,80)});
  }

  window.fakeAiTransform=async function(){
    try{await aiTransformV2()}catch(e){alert(e?.message||"AI Transform belum berhasil. Coba foto atau tema lain.")}
    if(rewardFixed)hideCameraControls();
  };

  function injectStyles(){
    if($id("kfRewardUiStyle"))return;
    const s=document.createElement("style");s.id="kfRewardUiStyle";s.textContent=`
      .reward-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px}
      .reward-choice{border:1px solid var(--line);border-radius:18px;padding:16px;background:#fff}
      .reward-choice h3{margin:0 0 12px;font-size:18px}.reward-choice select{margin:7px 0}.reward-choice .btn{margin-top:12px;width:100%}
      .reward-retake{margin-top:20px}#rewardFixed{margin-top:16px}
      @media(max-width:520px){.reward-choice-grid{grid-template-columns:1fr;gap:26px}.reward-choice{padding:16px}}
    `;document.head.appendChild(s);
}
  
  function rebuildRewardUi(){
    const edit=$id("rewardEdit"),fixed=$id("rewardFixed");if(!edit||!fixed)return;
    edit.innerHTML=`<div id="subjectHint" class="small"></div><div class="reward-choice-grid">
      <div class="reward-choice"><h3>Edit Foto</h3><select id="rewardStyle" onchange="applyStylePreview()"></select><div id="styleHint" class="small" style="display:none"></div><button id="applyEditBtn" class="btn primary" type="button">Terapkan</button></div>
      <div class="reward-choice"><h3>AI Transform</h3><select id="aiCategory" onchange="renderAiThemes()"><option value="beauty">Beauty</option><option value="fantasy">Fantasy</option><option value="geo">Historical / Geographic</option><option value="ninja">Ninja</option><option value="cartoon">Cartoon / Anime</option><option value="sport">Sport</option><option value="fun">Fun</option><option value="visual">Visual</option></select><select id="aiTheme"></select><button id="applyAiBtn" class="btn soft" type="button">Buat dengan AI</button></div>
    </div><button id="rewardRetakeBtn" class="btn ghost reward-retake" type="button" onclick="retakePhoto()">Foto ulang</button>`;
    fixed.innerHTML=`<button id="downloadBtn" class="btn primary" onclick="downloadReward()">Download final sekali</button><button class="btn ghost" onclick="goHome()">Selesai</button>`;
    if(typeof renderStyleOptions==="function")renderStyleOptions();
    if(typeof renderAiThemes==="function")renderAiThemes();
    normalizeSports();bindButtons();
  }

  function setLocked(v){["rewardFile","rewardStyle","aiCategory","aiTheme","applyEditBtn","applyAiBtn","rewardRetakeBtn"].forEach(id=>{const e=$id(id);if(e)e.disabled=!!v})}

  function showFinal(){
    $id("rewardEdit")?.classList.add("hidden");$id("rewardFixed")?.classList.remove("hidden");hideCameraControls();
    setTimeout(()=>$id("downloadBtn")?.scrollIntoView({behavior:"smooth",block:"center"}),60);
  }

  function bindButtons(){
    const edit=$id("applyEditBtn"),ai=$id("applyAiBtn");
    if(edit)edit.onclick=()=>{if(!rewardShot||rewardFixed)return;setLocked(true);try{window.fixReward();if(rewardFixed)showFinal();else setLocked(false)}catch(e){setLocked(false);alert("Foto belum dapat diterapkan. Coba lagi.")}};
    if(ai)ai.onclick=async()=>{if(!rewardShot||rewardFixed)return;setLocked(true);ai.textContent="Memproses...";await window.fakeAiTransform();if(rewardFixed){showFinal();return}setLocked(false);ai.textContent="Buat dengan AI"};
  }

  function watchThemes(){
    const cat=$id("aiCategory");if(cat)cat.addEventListener("change",()=>setTimeout(normalizeSports,0));
    const theme=$id("aiTheme");if(theme)new MutationObserver(normalizeSports).observe(theme,{childList:true});
  }

  const previousUnlock=window.unlockReward;
  window.unlockReward=function(source){
    previousUnlock(source);
    setTimeout(()=>{rebuildRewardUi();setLocked(false);resetCameraButtons();watchThemes();},0);
  };

  function init(){
    injectStyles();installSwitchCamera();rebuildRewardUi();watchThemes();resetCameraButtons();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
  
