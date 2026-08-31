/* Klikfun owner-only Reward Camera access */
(()=>{
  const OWNER_KEY_HASH="b8c578b24888a582381613cc741b0402ce4febe4c8d66ad1c12be365d8f5febc";
  const OWNER_FLAG="kf_owner_reward_v1";
  const $=id=>document.getElementById(id);

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

  async function activateFromUrl(){
    const u=new URL(location.href);
    if(u.searchParams.get("owner")!=="1")return;

    u.searchParams.delete("owner");
    history.replaceState(null,"",u.pathname+(u.search?u.search:"")+u.hash);

    const key=prompt("Masukkan kunci akses pemilik.");
    if(!key)return;

    if(await sha256(key)!==OWNER_KEY_HASH){
      alert("Kunci akses tidak cocok.");
      return;
    }

    localStorage.setItem(OWNER_FLAG,"1");
    installButton();
  }

  function openRewardCamera(){
    if(!isOwner())return;

    if(typeof window.unlockReward!=="function"){
      alert("Reward Camera belum dapat dibuka.");
      return;
    }

    window.unlockReward("akses khusus");
  }

  function installButton(){
    if(!isOwner()||$("ownerRewardCameraBtn"))return;

    const b=document.createElement("button");
    b.id="ownerRewardCameraBtn";
    b.type="button";
    b.className="btn primary";
    b.textContent="Reward Camera";
    b.setAttribute("aria-label","Buka Reward Camera");

    b.style.position="fixed";
    b.style.right="16px";
    b.style.bottom="84px";
    b.style.zIndex="9999";
    b.style.width="auto";
    b.style.maxWidth="180px";

    b.onclick=openRewardCamera;
    document.body.appendChild(b);
  }

  function disableOwner(){
    localStorage.removeItem(OWNER_FLAG);
    $("ownerRewardCameraBtn")?.remove();
  }

  window.KF_OWNER={
    active:isOwner,
    openRewardCamera,
    disable:disableOwner
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{
      installButton();
      activateFromUrl();
    },{once:true});
  }else{
    installButton();
    activateFromUrl();
  }
})();
