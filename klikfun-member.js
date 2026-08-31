/* Klikfun Member UI */
(()=>{
 const API={register:"/api/member/register",login:"/api/member/login",me:"/api/member/me",logout:"/api/member/logout",recover:"/api/member/recover",state:"/api/member/state"};
 let member=null;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function req(url,opt={}){
  const r=await fetch(url,{credentials:"same-origin",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});
  let d={};try{d=await r.json()}catch(_){}
  if(!r.ok)throw Error(d.error||"Permintaan tidak berhasil.");
  return d
 }
 function keys(){
  const out=["kf_kp_v2","kf_streak_v2","kf_activity_v2","kf_janji_v2","kf_reward_entitlement_v2","kf_portal_archive_v1","kf_game_inventory_v1","kf_market_listings_v1","kf_hero_progress_v2","kf_hero_unlock_v2"];
  return [...new Set(out)]
 }
 function collect(){const values={};for(const k of keys()){const v=localStorage.getItem(k);if(v!==null)values[k]=v}return{version:1,values}}
 function apply(s){if(!s||s.version!==1||!s.values)return;for(const k of keys())if(Object.prototype.hasOwnProperty.call(s.values,k))localStorage.setItem(k,String(s.values[k]))}
 async function save(){if(!member)return;await req(API.state,{method:"PUT",body:JSON.stringify({state:collect()})})}
 async function load(){if(!member)return;const d=await req(API.state);if(d.state)apply(d.state);else await save()}
 function status(t,bad=false){const e=$("memberStatus");if(!e)return;e.textContent=t||"";e.style.display=t?"block":"none";e.className="notice "+(bad?"warn":"ok")}
 function render(mode="login"){
  const e=$("memberGate");if(!e)return;
  const reg=mode==="register",rec=mode==="recover";
  e.innerHTML=`<h2>Member Klikfun</h2>
  <p class="small">${rec?"Pulihkan akses akun.":reg?"Buat akun untuk menyimpan progres Klikfun.":"Masuk ke akun Klikfun."}</p>
  <div id="memberStatus" class="notice" style="display:none"></div>
  ${reg?'<label class="small">Nama tampilan<input id="memberDisplayName" maxlength="40" autocomplete="name"></label>':""}
  <label class="small">Username<input id="memberUsername" maxlength="24" autocapitalize="none" autocomplete="username"></label>
  ${rec?'<label class="small">Kode pemulihan<input id="memberRecoveryCode" maxlength="100" autocomplete="off"></label>':""}
  <label class="small">${rec?"Kata sandi baru":"Kata sandi"}<input id="memberPassword" type="password" maxlength="128" autocomplete="${reg?"new-password":"current-password"}"></label>
  <button class="btn primary" id="memberPrimary">${rec?"Pulihkan akun":reg?"Daftar":"Masuk"}</button>
  ${!reg&&!rec?'<button class="btn soft" id="memberToRegister">Buat akun baru</button>':""}
  ${reg?'<button class="btn ghost" id="memberToLogin">Sudah punya akun · Masuk</button>':""}
  ${!rec?'<button class="btn ghost" id="memberToRecover">Pulihkan akses</button>':'<button class="btn ghost" id="memberToLogin">Balik ke Masuk</button>'}
  <button class="btn ghost" id="memberBack">Balik</button>`;
  $("memberPrimary").onclick=rec?recover:reg?register:login;
  $("memberToRegister")&&($("memberToRegister").onclick=()=>render("register"));
  $("memberToLogin")&&($("memberToLogin").onclick=()=>render("login"));
  $("memberToRecover")&&($("memberToRecover").onclick=()=>render("recover"));
  $("memberBack").onclick=()=>window.showOnly?showOnly("welcome"):history.back()
 }
 function home(extra=""){
  const e=$("memberGate");if(!e||!member)return;
  e.innerHTML=`<h2>Member Klikfun</h2>
  <div class="metric"><span>Nama</span><b>${esc(member.display_name)}</b></div>
  <div class="metric"><span>Member ID</span><b>${esc(member.member_id)}</b></div>
  <div class="metric"><span>Username</span><b>@${esc(member.username)}</b></div>
  ${extra?`<div class="notice ok">${esc(extra)}</div>`:""}
  <button class="btn primary" id="memberContinue">Lanjut ke Klikfun</button>
  <button class="btn soft" id="memberSave">Simpan progres</button>
  <button class="btn ghost" id="memberLogout">Keluar akun</button>`;
  $("memberContinue").onclick=async()=>{try{await save()}catch(_){}window.goHome?goHome():showOnly("welcome")};
  $("memberSave").onclick=async()=>{try{await save();alert("Progres tersimpan.")}catch(e){alert(e.message)}};
  $("memberLogout").onclick=logout
 }
 async function register(){
  status("Membuat akun…");
  try{
   const d=await req(API.register,{method:"POST",body:JSON.stringify({username:$("memberUsername").value.trim(),display_name:$("memberDisplayName").value.trim(),password:$("memberPassword").value})});
   member=d.member;await save();home("Akun berhasil dibuat. Simpan kode pemulihan ini di tempat aman: "+d.recovery_code)
  }catch(e){status(e.message,true)}
 }
 async function login(){
  status("Masuk…");
  try{const d=await req(API.login,{method:"POST",body:JSON.stringify({username:$("memberUsername").value.trim(),password:$("memberPassword").value})});member=d.member;await load();home()}
  catch(e){status(e.message,true)}
 }
 async function recover(){
  status("Memulihkan akun…");
  try{
   const d=await req(API.recover,{method:"POST",body:JSON.stringify({username:$("memberUsername").value.trim(),recovery_code:$("memberRecoveryCode").value.trim(),new_password:$("memberPassword").value})});
   const m=await req(API.me);member=m.member;await load();home("Akses dipulihkan. Kode pemulihan baru: "+d.recovery_code)
  }catch(e){status(e.message,true)}
 }
 async function logout(){try{await req(API.logout,{method:"POST",body:"{}"})}catch(_){}member=null;render("login")}
 async function gate(){
  if(window.showOnly)showOnly("memberGate");
  try{const d=await req(API.me);member=d.member;await load();home()}catch(_){member=null;render("login")}
 }
 window.showMemberGate=gate;
 window.KF_MEMBER={save,load,current:()=>member};
})();
