/* Klikfun owner-only Reward Camera access */
(()=>{
  const OWNER_KEY_HASH="b8c578b24888a582381613cc741b0402ce4febe4c8d66ad1c12be365d8f5febc";
  const OWNER_FLAG="kf_owner_reward_v1";
  const TAP_COUNT=5;
  const TAP_WINDOW_MS=3500;

  let taps=[];

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

  window.KF_OWNER={
    active:isOwner,
    openRewardCamera,
    disable:disableOwner
  };

  function init(){
    installHiddenTrigger();
  }

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
