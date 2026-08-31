const $=id=>document.getElementById(id);
const ALL_SECTIONS=['welcome','memberGate','home','quiz','handoff','result','groupSetup','groupRound','janji','janjiDone','game','gameMode','gameResult','gameStore','rewardCamera','profile'];

const CONFIG={
  maxGroup:5,
  publicUserThreshold:5000,
  paymentEnabled:false,
  gamePaymentEnabled:false,
  vendorPaymentEnabled:false,
  vaVisible:false,
  gameMinimumIDR:5000,
  allowPaid:false,
  deviceFirst:true,
  serverGameRendering:false,
  distributedUserCompute:false
};

const FALLBACK_BANK=[
 {q:'Kalau punya waktu kosong, kamu lebih pilih?',o:['Keluar sebentar','Nonton','Main game','Tidur']},
 {q:'Kalau harus pilih suasana, kamu lebih suka?',o:['Ramai','Tenang','Alam','Kota']},
 {q:'Kalau makan, kamu tipe?',o:['Coba baru','Menu aman','Pedas','Manis']},
 {q:'Kalau diajak aktivitas, kamu lebih pilih?',o:['Olahraga','Nonton','Ngopi','Jalan']},
 {q:'Kalau kerja kelompok, kamu biasanya?',o:['Ngatur','Eksekusi','Kasih ide','Ikut alur']},
 {q:'Kalau akhir pekan, kamu lebih sering?',o:['Di rumah','Keluar','Beres-beres','Main']},
 {q:'Kalau pilih hiburan, kamu lebih suka?',o:['Komedi','Aksi','Musik','Game']},
 {q:'Kalau perjalanan, kamu lebih nyaman?',o:['Motor','Mobil','Transport umum','Jalan kaki']},
 {q:'Kalau belajar sesuatu, kamu lebih suka?',o:['Video','Praktik','Baca','Diskusi']},
 {q:'Kalau dapat hadiah kecil, kamu lebih suka?',o:['Makanan','Voucher','Aksesori','Pengalaman']}
];
const BANK=(window.KLIKFUN_DB&&Array.isArray(window.KLIKFUN_DB.questions)&&window.KLIKFUN_DB.questions.length?window.KLIKFUN_DB.questions:FALLBACK_BANK);

let quiz=[],selfAnswers=[],friendAnswers=[],quizIndex=0,quizMode='self',shareToken=null;
let janjiActivity=null,janjiTime=null;
let camStream=null,rewardShot=false,rewardFixed=false,rewardDataUrl=null,rewardDownloaded=false,rewardUnlockSource=null;
let kp=0;

function showOnly(id){
  ALL_SECTIONS.forEach(x=>$(x)&&$(x).classList.add('hidden'));
  $(id).classList.remove('hidden');
  if(id!=='welcome'&&id!=='memberGate')$('bottomnav').classList.remove('hidden'); else $('bottomnav').classList.add('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
function enterGuest(){sessionStorage.setItem('kf_guest','1');showOnly('home');loadPublicCount()}
function showMemberGate(){showOnly('memberGate')}
function goHome(){stopCamera();showOnly('home');loadPublicCount()}
function sampleQuestions(){
  const usable=BANK.filter(x=>x&&x.q&&Array.isArray(x.o)&&x.o.length>=2);
  const copy=[...usable].sort(()=>Math.random()-.5);
  const out=[];const seen=new Set();
  for(const q of copy){const key=String(q.q).trim().toLowerCase();if(!seen.has(key)){seen.add(key);out.push(q)}if(out.length===7)break}
  while(out.length<7)out.push(FALLBACK_BANK[out.length%FALLBACK_BANK.length]);
  return out;
}
function startSelf(){quiz=sampleQuestions();selfAnswers=[];friendAnswers=[];quizIndex=0;quizMode='self';showOnly('quiz');renderQuiz()}
function renderQuiz(){
  const q=quiz[quizIndex];
  $('step').textContent=(quizMode==='self'?'Tentang kamu':'Tebak jawaban dia')+' · '+(quizIndex+1)+'/7';
  $('bar').style.width=(quizIndex/7*100)+'%';
  $('q').textContent=q.q;$('opts').innerHTML='';
  q.o.slice(0,4).forEach((opt,n)=>{const b=document.createElement('button');b.className='option';b.textContent=opt;b.onclick=()=>answerQuiz(n);$('opts').appendChild(b)})
}
function answerQuiz(n){
  (quizMode==='self'?selfAnswers:friendAnswers).push(n);quizIndex++;
  if(quizIndex<7)return renderQuiz();
  if(quizMode==='self')finishSelf();else finishFriend();
}
function finishSelf(){
  shareToken=cryptoRandomToken();
  const payload={q:quiz.map(x=>({q:x.q,o:x.o.slice(0,4)})),a:selfAnswers,t:Date.now()};
  sessionStorage.setItem('kf_round_'+shareToken,JSON.stringify(payload));
  $('shareUrl').textContent=inviteUrl(shareToken);showOnly('handoff')
}
function inviteUrl(token){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('join',token);return u.toString()}
async function shareInvite(){const url=inviteUrl(shareToken);try{if(navigator.share)await navigator.share({title:'Klikfun',text:'Coba tebak jawaban aku di Klikfun',url});else await navigator.clipboard.writeText(url)}catch(e){}}
async function copyInvite(){try{await navigator.clipboard.writeText(inviteUrl(shareToken));alert('Link disalin.')}catch(e){}}
function startFriendLocal(){quizMode='friend';quizIndex=0;friendAnswers=[];showOnly('quiz');renderQuiz()}
function finishFriend(){
  let s=0,miss=[];
  for(let i=0;i<7;i++){if(friendAnswers[i]===selfAnswers[i])s++;else miss.push(quiz[i].q)}
  $('score').textContent=s;$('reaction').textContent=s>=6?'Tebakannya tajam.':s>=3?'Lumayan kena.':'Masih banyak plot twist.';
  $('miss').textContent=miss.length?'Yang berbeda antara lain: '+miss.slice(0,2).join(' · '):'Semua hampir pas.';
  showOnly('result')
}
function cryptoRandomToken(){const a=new Uint8Array(18);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function joinFromLink(token){
  const raw=sessionStorage.getItem('kf_round_'+token);
  if(!raw){goHome();return}
  try{const d=JSON.parse(raw);quiz=d.q;selfAnswers=d.a;friendAnswers=[];quizIndex=0;quizMode='friend';showOnly('quiz');renderQuiz()}catch(e){goHome()}
}

function showGroupSetup(){showOnly('groupSetup')}
function createLocalGroup(){
  const size=Math.max(2,Math.min(5,Number($('groupSize').value||2)));
  $('groupPeople').innerHTML='';
  for(let i=1;i<=size;i++){const d=document.createElement('div');d.className='metric';d.innerHTML='<span>Peserta '+i+'</span><b>menunggu</b>';$('groupPeople').appendChild(d)}
  $('groupStatus').textContent=size+' peserta · masing-masing 7 pertanyaan berbeda · maksimum 5 wajah untuk Group Reward Camera';
  showOnly('groupRound')
}

const ACTIVITIES=['Ngopi','Makan','Main','Olahraga','Nonton','Jalan','Belajar bareng'];
const TIMES=['hari ini','besok','akhir pekan','minggu depan','atur nanti'];
function renderJanjiChips(){
  $('activityChips').innerHTML=ACTIVITIES.map(x=>`<button class="chip ${janjiActivity===x?'active':''}" onclick="pickJanjiActivity('${x}')">${x}</button>`).join('');
  $('timeChips').innerHTML=TIMES.map(x=>`<button class="chip ${janjiTime===x?'active':''}" onclick="pickJanjiTime('${x}')">${x}</button>`).join('');
  $('janjiPreview').textContent=janjiActivity&&janjiTime?janjiActivity+' · '+janjiTime:'Belum dipilih.'
}
function showJanji(){showOnly('janji');renderJanjiChips()}
function pickJanjiActivity(x){janjiActivity=x;renderJanjiChips()}
function pickJanjiTime(x){janjiTime=x;renderJanjiChips()}
function saveJanji(){if(!janjiActivity||!janjiTime){alert('Pilih kegiatan dan waktu.');return}$('janjiDoneText').textContent=janjiActivity+' · '+janjiTime;showOnly('janjiDone')}
async function shareJanji(){const text='JANJI Klikfun: '+janjiActivity+' · '+janjiTime;try{if(navigator.share)await navigator.share({title:'JANJI Klikfun',text});else await navigator.clipboard.writeText(text)}catch(e){}}

function showGame(){showOnly('game')}
function showGameMode(mode){$('gameModeTitle').textContent=mode==='solo'?'Main Sendiri':mode==='multi'?'Main Bareng':'Event & Turnamen';showOnly('gameMode')}
function simulateGame(){kp+=25;$('kpValue').textContent=kp;showOnly('gameResult')}
function legacyShowGameStore(){showOnly('gameStore')}

const STYLE_PRESETS=[
 {id:'natural',name:'Natural Beauty',hint:'Natural, bersih, flattering.',filter:'brightness(1.04) contrast(1.02) saturate(1.03)'},
 {id:'soft',name:'Soft Glow',hint:'Lembut dan bercahaya.',filter:'brightness(1.08) contrast(.98) saturate(1.04)'},
 {id:'smooth',name:'Smooth Portrait',hint:'Portrait halus tanpa mengubah identitas.',filter:'brightness(1.04) contrast(1.01) saturate(.98)'},
 {id:'bright',name:'Bright Face',hint:'Wajah lebih terang secara lokal.',filter:'brightness(1.10) contrast(1.00)'},
 {id:'warm',name:'Warm Beauty',hint:'Nuansa hangat.',filter:'sepia(.08) brightness(1.05) saturate(1.06)'},
 {id:'cool',name:'Cool Beauty',hint:'Nuansa dingin bersih.',filter:'brightness(1.03) saturate(.92) hue-rotate(4deg)'},
 {id:'elegant',name:'Elegant',hint:'Rapi dan premium.',filter:'brightness(1.03) contrast(1.06) saturate(.94)'},
 {id:'confident',name:'Confident',hint:'Kontras lebih tegas.',filter:'contrast(1.10) brightness(1.01)'},
 {id:'dreamy',name:'Dreamy',hint:'Soft dreamy.',filter:'brightness(1.07) contrast(.96) saturate(1.03)'},
 {id:'classy',name:'Classy',hint:'Warna tertahan.',filter:'contrast(1.06) saturate(.88)'},
 {id:'cinematic',name:'Cinematic Beauty',hint:'Kontras sinematik ringan.',filter:'contrast(1.12) saturate(.90) brightness(.99)'},
 {id:'vivid',name:'Vivid Scene',hint:'Scene lebih hidup.',filter:'saturate(1.18) contrast(1.04)'},
 {id:'food',name:'Food Pop',hint:'Cocok untuk makanan.',filter:'saturate(1.22) brightness(1.04)'},
 {id:'product',name:'Product Clean',hint:'Bersih dan netral.',filter:'contrast(1.05) brightness(1.06) saturate(.95)'},
 {id:'tembem',name:'Tembem',hint:'Efek komedi lokal ringan.',filter:'saturate(1.10) brightness(1.03)'},
 {id:'pusing',name:'Pusing',hint:'Efek komedi aman.',filter:'saturate(.85) contrast(1.04)'},
 {id:'kaget',name:'Kaget',hint:'Ekspresi kaget tetap family-safe.',filter:'contrast(1.08) brightness(1.03)'}
];

const SPORT_THEMES=['football-star','football-striker','football-goalkeeper','football-captain','football-champion','football-street','futsal-star','basketball-star','basketball-point-guard','basketball-slam-dunk','basketball-shooter','basketball-all-star','basketball-street','badminton-star','badminton-singles','badminton-doubles','tennis-star','volleyball-star','futsal-goalkeeper','runner','sprinter','marathon-runner','swimmer','cyclist','racing-driver','motorcycle-racer','boxer','martial-artist','archery-athlete','baseball-star','american-football-star','golf-player','table-tennis-star','skateboarder','surfing-athlete'];

const AI_THEMES={
 beauty:['Natural Photogenic','Korean Look','Japanese Look','Chinese Look','Middle Eastern Look','Eastern European Look','European Classic','Slavic Glam','Elegant','Charming / Confident'],
 fantasy:['Fantasy Royal','Fantasy Being','Fantasy Warrior','Fantasy World','Elf Queen','Aurora Queen','Crystal Palace','Future Queen'],
 geo:['Asia 1','Asia 2','Asia 3','Eropa 1','Eropa 2','Amerika 1','Amerika 2'],
 ninja:['Shadow Ninja','Forest Ninja','Royal Ninja','Future Ninja'],
 cartoon:['Cartoon Hero','Anime Hero','Fantasy Cartoon','Comic Style'],
 sport:SPORT_THEMES,
 fun:['Tembem','Cekung','Kepala Besar','Dahi Lebar','Muka Gepeng','Muka Panjang','Pusing','Cemberut','Kaget'],
 visual:['Cinematic','Retro','Royal','Misterius','Gothic','Studio Editorial']
};

function unlockReward(source){
  rewardUnlockSource=source;$('rewardSource').textContent=source==='group-shared'?'Reward grup bersama · maksimal 5 wajah':'Reward pribadi · terbuka dari '+source;
  rewardShot=false;rewardFixed=false;rewardDataUrl=null;rewardDownloaded=false;renderStyleOptions();renderAiThemes();
  $('rewardEdit').classList.add('hidden');$('rewardFixed').classList.add('hidden');$('camVideo').classList.remove('hidden');$('camCanvas').classList.add('hidden');
  showOnly('rewardCamera')
}
function renderStyleOptions(){$('rewardStyle').innerHTML=STYLE_PRESETS.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');applyStylePreview()}
function renderAiThemes(){const list=AI_THEMES[$('aiCategory').value]||[];$('aiTheme').innerHTML=list.map(x=>`<option>${x}</option>`).join('')}
async function toggleCamera(){
  if(camStream){stopCamera();$('camBtn').textContent='Nyalakan kamera';return}
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});$('camVideo').srcObject=camStream;await $('camVideo').play();$('camBtn').textContent='Matikan kamera'}catch(e){alert('Kamera tidak tersedia atau izin belum diberikan.')}
}
function stopCamera(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}}
function takePhoto(){
  const v=$('camVideo'),c=$('camCanvas');if(!v.videoWidth){alert('Nyalakan kamera dulu.');return}
  c.width=360;c.height=480;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,c.width,c.height);stopCamera();rewardShot=true;
  v.classList.add('hidden');c.classList.remove('hidden');$('rewardEdit').classList.remove('hidden');applyStylePreview()
}
function currentStyle(){return STYLE_PRESETS.find(x=>x.id===$('rewardStyle').value)||STYLE_PRESETS[0]}
function applyStylePreview(){const x=currentStyle();if($('camCanvas'))$('camCanvas').style.filter=x.filter;$('styleHint').textContent=x.hint}
function fakeAiTransform(){
  if(!rewardShot)return;
  alert('Transform belum tersedia. Gunakan STYLE untuk mengedit foto.')
}
function retakePhoto(){if(rewardFixed)return;rewardShot=false;rewardDataUrl=null;$('rewardEdit').classList.add('hidden');$('camCanvas').classList.add('hidden');$('camVideo').classList.remove('hidden');$('camCanvas').style.filter='none'}
function fixReward(){
  if(!rewardShot||rewardFixed)return;
  const c=$('camCanvas'),out=document.createElement('canvas');out.width=360;out.height=480;const ctx=out.getContext('2d');ctx.filter=currentStyle().filter;ctx.drawImage(c,0,0,360,480);ctx.filter='none';
  rewardDataUrl=out.toDataURL('image/jpeg',.90);rewardFixed=true;$('rewardEdit').classList.add('hidden');$('rewardFixed').classList.remove('hidden')
}
function downloadReward(){
  if(!rewardFixed||!rewardDataUrl||rewardDownloaded)return;
  const a=document.createElement('a');a.href=rewardDataUrl;a.download='klikfun-reward.jpg';document.body.appendChild(a);a.click();a.remove();rewardDownloaded=true;rewardDataUrl=null;$('downloadBtn').disabled=true;$('downloadBtn').textContent='Sudah didownload · terkunci'
}

async function loadPublicCount(){
  $('publicCount').classList.add('hidden');
  try{
    const r=await fetch('/api/config',{cache:'no-store'}),d=await r.json();
    const n=Number(d.public_user_count);
    if(Number.isFinite(n)&&n>CONFIG.publicUserThreshold){$('publicCount').textContent=n.toLocaleString('id-ID')+' pengguna';$('publicCount').classList.remove('hidden')}
  }catch(e){}
}

function closeReport(){$('reportModal').classList.add('hidden')}
function init(){
  const sp=new URLSearchParams(location.search),join=sp.get('join');
  if(join){enterGuest();joinFromLink(join);return}
  showOnly('welcome');
  renderJanjiChips();
  renderStyleOptions();
  renderAiThemes();
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
// legacy init suppressed; final integration initializes on load


/* ===== KLIKFUN FINAL INTEGRATION LAYER ===== */
const KF_VERSION='2026-08-31-final-concept';
const KF_API={session:'/api/session',guess:'/api/guess',group:'/api/group',event:'/api/event',report:'/api/report',rewardAI:'/api/reward-ai',config:'/api/config'};
const KF_STORAGE={install:'kf_install_id_v2',kp:'kf_kp_v2',streak:'kf_streak_v2',activity:'kf_activity_v2',janji:'kf_janji_v2',reward:'kf_reward_entitlement_v2'};
const KF_SAFE_EVENTS=new Set(['friend_started','became_next','report_open','invite_shared','invite_copied','reward_fixed','reward_downloaded','group_started']);
const KF_POLICY={
  minAgeGate:null,dating:false,freeTextJanji:false,maxGroup:5,maxFaces:5,
  rewardTtlHours:24,rewardDownloadLimit:1,allowPaid:false,paymentEnabled:false,
  vaVisible:false,gameMinimumIDR:5000,publicCounterThreshold:5000,
  deviceFirst:true,serverRendersFrames:false,distributedCompute:false,
  aiFailClosed:true,aiFreeOnly:true
};
function kfTrack(event,meta={}){if(!KF_SAFE_EVENTS.has(event))return;fetch(KF_API.event,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,code:window.activeCode||null,parent_code:window.parentCode||null,meta})}).catch(()=>{})}
function kfInstallId(){let id=localStorage.getItem(KF_STORAGE.install);if(id)return id;const a=new Uint8Array(16);crypto.getRandomValues(a);id=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(KF_STORAGE.install,id);return id}
function kfLogActivity(type,label){const arr=JSON.parse(localStorage.getItem(KF_STORAGE.activity)||'[]');arr.unshift({type,label,at:Date.now()});localStorage.setItem(KF_STORAGE.activity,JSON.stringify(arr.slice(0,50)));renderProfileFinal()}
function kfGetKP(){return Number(localStorage.getItem(KF_STORAGE.kp)||0)}
function kfAddKP(n,why){const next=Math.max(0,kfGetKP()+Number(n||0));localStorage.setItem(KF_STORAGE.kp,String(next));if(why)kfLogActivity('kp',`${why} · +${n} KP`);renderProfileFinal();return next}
function kfUpdateStreak(){const today=new Date().toISOString().slice(0,10),raw=localStorage.getItem(KF_STORAGE.streak),s=raw?JSON.parse(raw):{last:null,count:0};if(s.last===today)return s.count;const prev=new Date(Date.now()-86400000).toISOString().slice(0,10);s.count=s.last===prev?s.count+1:1;s.last=today;localStorage.setItem(KF_STORAGE.streak,JSON.stringify(s));return s.count}
function renderProfileFinal(){if(!$('kpValue'))return;$('kpValue').textContent=kfGetKP();const card=$('profile');if(!card)return;let streak=0;try{streak=JSON.parse(localStorage.getItem(KF_STORAGE.streak)||'{}').count||0}catch(e){};const mets=card.querySelectorAll('.metric');if(mets[1])mets[1].querySelector('b').textContent=streak+' hari';const acts=JSON.parse(localStorage.getItem(KF_STORAGE.activity)||'[]');if(mets[4])mets[4].querySelector('b').textContent=acts.length?acts[0].label:'Belum ada'}

const KF_MODERATION={
 block:[
 /\b(porn|porno|pornografi|bokep|ngentot|ngewe|kontol|memek|seks|sexual|telanjang|bugil)\b/i,
 /\b(perkosa|pemerkosaan|bunuh dia|membunuh dia)\b/i,
 /\b(kafir|cina babi|pribumi bodoh|ras .* hina)\b/i,
 /\b(presiden|pemilu|partai politik|kampanye politik)\b/i,
 /\b(gendut banget|kurus banget|jelek banget|badan .* jelek)\b/i
 ],
 romantic:[/pacar|jadian|gebetan|cinta|sayang kamu|date|dating|romantis|ciuman|peluk mesra/i]
};
function kfNorm(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[0@]/g,m=>m==='0'?'o':'a').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t').replace(/[._*\\-]+/g,' ').replace(/(.)\1{3,}/g,'$1$1').replace(/\s+/g,' ').trim()}
function kfSafeText(s){const t=kfNorm(s);return !KF_MODERATION.block.some(r=>r.test(t))&&!KF_MODERATION.romantic.some(r=>r.test(t))}

const DEVICE_RUNTIME={backend:'cpu',tier:'low',fps:30,scale:.75,particles:false,shadows:false};
async function detectDeviceRuntime(){
 let backend='cpu';
 if(navigator.gpu)backend='webgpu';else{const c=document.createElement('canvas');if(c.getContext('webgl2'))backend='webgl2';else if(c.getContext('webgl'))backend='webgl';else backend='canvas'}
 const cores=navigator.hardwareConcurrency||2,mem=navigator.deviceMemory||2,pixels=innerWidth*innerHeight;
 let tier='low';if(cores>=8&&mem>=6&&pixels>=700000)tier='high';else if(cores>=4&&mem>=3)tier='medium';
 Object.assign(DEVICE_RUNTIME,{backend,tier,fps:tier==='high'?60:tier==='medium'?45:30,scale:tier==='high'?1:tier==='medium'?.85:.7,particles:tier!=='low',shadows:tier==='high'});
 document.documentElement.dataset.deviceTier=tier;return DEVICE_RUNTIME
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});

/* TEBAK — server-backed link flow, no manual code UX */
let kfActiveCode=null,kfParentCode=null,kfDeleteKey=null,kfRoundQuestions=[],kfRoundSelf=[],kfRoundFriend=[],kfRoundIndex=0,kfRoundMode='self',kfBusy=false;
function kfSampleQuestionsFinal(){const pool=[...BANK].filter(q=>q&&q.active!==false&&q.q&&Array.isArray(q.o)&&q.o.length>=4&&kfSafeText(q.q)&&q.o.slice(0,4).every(kfSafeText)).sort(()=>Math.random()-.5),out=[],seen=new Set();for(const q of pool){const key=kfNorm(q.q);if(!key||seen.has(key))continue;seen.add(key);out.push(q);if(out.length===7)break}if(out.length<7)return sampleQuestions();return out}
function startSelfFinal(){kfRoundQuestions=kfSampleQuestionsFinal();kfRoundSelf=[];kfRoundFriend=[];kfRoundIndex=0;kfRoundMode='self';showOnly('quiz');renderQuizFinal()}
function renderQuizFinal(){const q=kfRoundQuestions[kfRoundIndex];if(!q){goHome();return}$('step').textContent=(kfRoundMode==='self'?'Tentang kamu':'Tebak jawaban dia')+' · '+(kfRoundIndex+1)+'/7';$('bar').style.width=(kfRoundIndex/7*100)+'%';$('q').textContent=q.q;$('opts').innerHTML='';q.o.slice(0,4).forEach((opt,n)=>{const b=document.createElement('button');b.className='option';b.textContent=opt;b.onclick=()=>answerQuizFinal(n);$('opts').appendChild(b)})}
function answerQuizFinal(n){if(kfBusy)return;const a=kfRoundMode==='self'?kfRoundSelf:kfRoundFriend;if(a.length!==kfRoundIndex)return;a.push(n);kfRoundIndex++;if(kfRoundIndex<7)return renderQuizFinal();kfRoundMode==='self'?finishSelfFinal():finishFriendFinal()}
async function finishSelfFinal(){kfBusy=true;$('step').textContent='Membuat ronde…';try{const r=await fetch(KF_API.session,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questions:kfRoundQuestions.map(x=>({id:x.id||undefined,q:x.q,o:x.o.slice(0,4),category:x.category||'general'})),answers:kfRoundSelf,parent_code:kfParentCode,consent:true})});const d=await r.json();if(!r.ok)throw Error(d.error||'Gagal membuat ronde');kfActiveCode=d.code;kfDeleteKey=d.delete_key;localStorage.setItem('kf_delete_'+kfActiveCode,kfDeleteKey);$('shareUrl').textContent=inviteUrlFinal(kfActiveCode);kfLogActivity('tebak','Membuat ronde TEBAK');showOnly('handoff')}catch(e){alert(e.message||'Ronde belum bisa dibuat.');kfRoundIndex=6;kfRoundSelf=kfRoundSelf.slice(0,6);renderQuizFinal()}finally{kfBusy=false}}
function inviteUrlFinal(code){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('join',code);return u.toString()}
async function loadRoundFinal(code){const r=await fetch(KF_API.session+'/'+encodeURIComponent(String(code||'').toUpperCase()));const d=await r.json();if(!r.ok)throw Error(d.error||'Ronde tidak ditemukan');kfActiveCode=String(code).toUpperCase();kfParentCode=kfActiveCode;kfRoundQuestions=d.questions;kfRoundFriend=[];kfRoundIndex=0;kfRoundMode='friend';kfTrack('friend_started');showOnly('quiz');renderQuizFinal()}
async function joinFromLinkFinal(code){try{await loadRoundFinal(code)}catch(e){goHome();alert(e.message||'Link ronde sudah tidak berlaku.')}}
async function finishFriendFinal(){kfBusy=true;try{const r=await fetch(KF_API.guess+'/'+encodeURIComponent(kfActiveCode),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guesses:kfRoundFriend})});const d=await r.json();if(!r.ok)throw Error(d.error||'Gagal menghitung');$('score').textContent=d.score;const misses=d.misses||[];$('reaction').textContent=d.score>=6?'Tebakannya tajam.':d.score>=3?'Lumayan kena.':'Masih banyak plot twist.';$('miss').textContent=misses.length?'Yang berbeda: '+misses.slice(0,2).map(i=>kfRoundQuestions[i].q).join(' · '):'Semua hampir pas.';grantReward('tebak');kfAddKP(10,'TEBAK selesai');showOnly('result')}catch(e){alert(e.message||'Gagal menghitung hasil.');kfRoundIndex=6;kfRoundFriend=kfRoundFriend.slice(0,6);renderQuizFinal()}finally{kfBusy=false}}
async function shareInviteFinal(){if(!kfActiveCode)return;const url=inviteUrlFinal(kfActiveCode);try{if(navigator.share){await navigator.share({title:'Klikfun',text:'Coba tebak jawaban aku di Klikfun',url});kfTrack('invite_shared',{channel:'native'})}else{await navigator.clipboard.writeText(url);kfTrack('invite_copied');alert('Link disalin.')}}catch(e){}}
async function copyInviteFinal(){if(!kfActiveCode)return;try{await navigator.clipboard.writeText(inviteUrlFinal(kfActiveCode));kfTrack('invite_copied');alert('Link disalin.')}catch(e){}}
function startFriendLocalFinal(){kfRoundMode='friend';kfRoundIndex=0;kfRoundFriend=[];showOnly('quiz');renderQuizFinal()}
async function deleteRoundFinal(){if(!kfActiveCode)return;const key=localStorage.getItem('kf_delete_'+kfActiveCode);if(!key)return;try{const r=await fetch(KF_API.session+'/'+kfActiveCode+'/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete_key:key})});if(r.ok){localStorage.removeItem('kf_delete_'+kfActiveCode);kfActiveCode=null;goHome()}}catch(e){}}
startSelf=startSelfFinal;shareInvite=shareInviteFinal;copyInvite=copyInviteFinal;startFriendLocal=startFriendLocalFinal;joinFromLink=joinFromLinkFinal;

/* GROUP — 2–5, unique question assignments, per-participant links */
let kfGroupCode=null,kfGroupAdmin=null,kfGroupParticipantToken=null,kfGroupSlot=null,kfGroupQuestions=[],kfGroupAnswers=[],kfGroupIndex=0,kfGroupPoll=null;
function uniqueAssignments(size){const pool=[...BANK].filter(q=>q&&q.active!==false&&q.q&&Array.isArray(q.o)&&q.o.length>=4).sort(()=>Math.random()-.5),picked=[],seen=new Set();for(const q of pool){const key=kfNorm(q.q);if(!key||seen.has(key)||!kfSafeText(q.q)||q.o.some(x=>!kfSafeText(x)))continue;seen.add(key);picked.push({id:q.id||undefined,q:q.q,o:q.o.slice(0,4),category:q.category||'general'});if(picked.length>=size*7)break}if(picked.length<size*7)throw Error('Bank pertanyaan unik belum cukup.');return Array.from({length:size},(_,i)=>picked.slice(i*7,i*7+7))}
async function createGroupFinal(){const size=Math.max(2,Math.min(5,Number($('groupSize').value||2)));try{const assignments=uniqueAssignments(size),r=await fetch(KF_API.group,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size,assignments,consent:true})}),d=await r.json();if(!r.ok)throw Error(d.error||'Gagal membuat grup');kfGroupCode=d.code;kfGroupAdmin=d.admin_key;localStorage.setItem('kf_group_admin_'+kfGroupCode,kfGroupAdmin);localStorage.setItem('kf_group_links_'+kfGroupCode,JSON.stringify(d.participants||[]));renderGroupDashboardFinal(d,true);kfTrack('group_started',{mode:String(size)});kfLogActivity('group','Membuat grup '+size+' peserta')}catch(e){alert(e.message||'Grup belum bisa dibuat.')}}
function groupParticipantUrlFinal(code,slot,token){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('group',code);u.searchParams.set('slot',slot);u.searchParams.set('token',token);return u.toString()}
function renderGroupDashboardFinal(d,host){showOnly('groupRound');kfGroupCode=d.code||kfGroupCode;const people=d.participants||[];$('groupStatus').textContent=people.filter(x=>x.completed).length+'/'+people.length+' peserta selesai';const links=JSON.parse(localStorage.getItem('kf_group_links_'+kfGroupCode)||'[]');$('groupPeople').innerHTML=people.map(p=>{const l=links.find(x=>Number(x.slot)===Number(p.slot));return `<div class="metric"><span>Peserta ${p.slot}</span><b>${p.completed?'✓ selesai':'menunggu'}</b></div>${l?`<button class="btn ghost" onclick="shareGroupParticipantFinal(${p.slot},'${l.token}')">Kirim link peserta ${p.slot}</button>`:''}`}).join('');if(host){clearInterval(kfGroupPoll);kfGroupPoll=setInterval(refreshGroupFinal,8000)}}
async function shareGroupParticipantFinal(slot,token){const url=groupParticipantUrlFinal(kfGroupCode,slot,token);try{if(navigator.share)await navigator.share({title:'Klikfun Grup',text:'Masuk sebagai Peserta '+slot,url});else await navigator.clipboard.writeText(url)}catch(e){}}
async function refreshGroupFinal(){if(!kfGroupCode)return;const key=kfGroupAdmin||localStorage.getItem('kf_group_admin_'+kfGroupCode);if(!key)return;try{const r=await fetch(KF_API.group+'/'+kfGroupCode+'?admin_key='+encodeURIComponent(key)),d=await r.json();if(r.ok)renderGroupDashboardFinal(d,true)}catch(e){}}
async function joinGroupFromLinkFinal(code,slot,token){try{const r=await fetch(KF_API.group+'/'+encodeURIComponent(code)+'/participant/'+slot+'?token='+encodeURIComponent(token)),d=await r.json();if(!r.ok)throw Error(d.error||'Undangan grup tidak berlaku');kfGroupCode=code;kfGroupParticipantToken=token;kfGroupSlot=slot;kfGroupQuestions=d.questions;kfGroupAnswers=[];kfGroupIndex=0;if(d.completed){showOnly('groupRound');$('groupStatus').textContent='Jawabanmu sudah tersimpan.';$('groupPeople').innerHTML='';return}renderGroupPlayFinal()}catch(e){goHome();alert(e.message||'Undangan grup tidak berlaku.')}}
function renderGroupPlayFinal(){let sec=$('groupPlay');if(!sec){sec=document.createElement('section');sec.id='groupPlay';sec.className='card hidden';sec.innerHTML='<div class="progress"><div id="groupBarFinal" class="bar"></div></div><p id="groupStepFinal" class="small"></p><h2 id="groupQFinal"></h2><div id="groupOptsFinal"></div>';document.querySelector('main').appendChild(sec);ALL_SECTIONS.push('groupPlay')}showOnly('groupPlay');if(kfGroupIndex>=7)return submitGroupFinal();const q=kfGroupQuestions[kfGroupIndex];$('groupBarFinal').style.width=(kfGroupIndex/7*100)+'%';$('groupStepFinal').textContent='Pertanyaan '+(kfGroupIndex+1)+'/7';$('groupQFinal').textContent=q.q;$('groupOptsFinal').innerHTML='';q.o.forEach((x,n)=>{const b=document.createElement('button');b.className='option';b.textContent=x;b.onclick=()=>{kfGroupAnswers.push(n);kfGroupIndex++;renderGroupPlayFinal()};$('groupOptsFinal').appendChild(b)})}
async function submitGroupFinal(){try{const r=await fetch(KF_API.group+'/'+kfGroupCode+'/participant/'+kfGroupSlot,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:kfGroupParticipantToken,answers:kfGroupAnswers})}),d=await r.json();if(!r.ok)throw Error(d.error||'Gagal menyimpan');grantReward('group-personal');if(d.completed_count===d.size)sessionStorage.setItem('kf_group_shared_ready','1');kfAddKP(15,'GRUP selesai');showOnly('groupRound');$('groupStatus').textContent=d.completed_count+'/'+d.size+' peserta selesai · Reward Camera pribadi terbuka';$('groupPeople').innerHTML='<button class="btn primary" onclick="unlockReward(\'group-personal\')">Reward Camera pribadi</button>'+(d.completed_count===d.size?'<button class="btn soft" onclick="unlockReward(\'group-shared\')">Group Reward Camera</button>':'')}catch(e){alert(e.message||'Gagal menyimpan jawaban.')}}
createLocalGroup=createGroupFinal;

/* JANJI — controlled only, safe link, no free text */
function janjiToken(){const a=new Uint8Array(16);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function saveJanjiFinal(){if(!janjiActivity||!janjiTime){alert('Pilih kegiatan dan waktu.');return}if(!ACTIVITIES.includes(janjiActivity)||!TIMES.includes(janjiTime))return;const item={id:janjiToken(),activity:janjiActivity,time:janjiTime,status:'open',createdAt:Date.now()};const arr=JSON.parse(localStorage.getItem(KF_STORAGE.janji)||'[]');arr.unshift(item);localStorage.setItem(KF_STORAGE.janji,JSON.stringify(arr.slice(0,100)));window.kfCurrentJanji=item;$('janjiDoneText').textContent=item.activity+' · '+item.time;kfAddKP(5,'JANJI dibuat');showOnly('janjiDone')}
async function shareJanjiFinal(){const j=window.kfCurrentJanji;if(!j)return;const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('janji',j.id);u.searchParams.set('ja',String(ACTIVITIES.indexOf(j.activity)));u.searchParams.set('jt',String(TIMES.indexOf(j.time)));const text=`JANJI Klikfun: ${j.activity} · ${j.time}`;try{if(navigator.share)await navigator.share({title:'JANJI Klikfun',text,url:u.toString()});else await navigator.clipboard.writeText(text+'\n'+u.toString())}catch(e){}}
saveJanji=saveJanjiFinal;shareJanji=shareJanjiFinal;
function openJanjiFromLink(id){const arr=JSON.parse(localStorage.getItem(KF_STORAGE.janji)||'[]');let j=arr.find(x=>x.id===id);if(!j){const sp=new URLSearchParams(location.search),ai=Number(sp.get('ja')),ti=Number(sp.get('jt'));if(Number.isInteger(ai)&&Number.isInteger(ti)&&ACTIVITIES[ai]&&TIMES[ti])j={id,activity:ACTIVITIES[ai],time:TIMES[ti],status:'shared',createdAt:Date.now()}}if(!j){goHome();return}janjiActivity=j.activity;janjiTime=j.time;window.kfCurrentJanji=j;$('janjiDoneText').textContent=j.activity+' · '+j.time;showOnly('janjiDone')}

/* MEMBER architecture: capability-complete frontend, backend-gated */
function memberCapabilities(){return{passkey:!!window.PublicKeyCredential,recoveryCode:true,memberId:true,inbox:true,notifications:'Notification'in window,backendRequired:true}}
function showMemberGateFinal(){showOnly('memberGate');$('memberGate').innerHTML=`<h2>Member Klikfun</h2><p class="small">Buat akun baru atau masuk untuk menyimpan progres Klikfun.</p><button class="btn primary" disabled aria-disabled="true">Daftar · Segera tersedia</button><button class="btn ghost" disabled aria-disabled="true">Masuk · Segera tersedia</button><button class="btn ghost" onclick="showOnly('welcome')">Balik</button>`}
showMemberGate=showMemberGateFinal;

/* GAME — Portal-first Action-RPG + Arena 5v5. Database-driven, no generative map/monster runtime. */
const HERO_TARGET_ROSTER=window.HERO_TARGET_ROSTER;const HERO_ROLE_POLICY=window.HERO_ROLE_POLICY;
const HERO_ROSTER=window.HERO_ROSTER_DATA.map(window.hydrateHeroSkills);
const WEAPON_REGISTRY=[{id:'balanced-blade',name:'Balanced Blade',rarity:'Common',atk:18,systemKP:35},{id:'swift-edge',name:'Swift Edge',rarity:'Uncommon',atk:10,spd:14,crit:.03,systemKP:55},{id:'heavy-breaker',name:'Heavy Breaker',rarity:'Rare',atk:30,spd:-8,systemKP:90},{id:'arc-focus',name:'Arc Focus',rarity:'Rare',atk:24,crit:.02,systemKP:95},{id:'guardian-core',name:'Guardian Core',rarity:'Rare',atk:8,def:18,systemKP:95}];
const ITEM_REGISTRY=window.ARTIFACT_REGISTRY;
const SKILL_BOOK_REGISTRY=[{id:'book-s1',name:'Skill Book: Technique I',skillSlot:'s1',rarity:'Uncommon',systemKP:60},{id:'book-s2',name:'Skill Book: Technique II',skillSlot:'s2',rarity:'Rare',systemKP:100},{id:'book-ultimate',name:'Skill Book: Ultimate',skillSlot:'u',rarity:'Epic',systemKP:180},{id:'book-mastery',name:'Skill Book: Mastery',skillSlot:'mastery',rarity:'Epic',systemKP:200}];
const PORTAL_THEME_DATA={"Verdant":["Hutan Purba","Hutan Berkabut","Rawa Lumut","Hutan Malam","Hutan Batu","Kanopi Tinggi","Lembah Pakis","Hutan Hujan","Hutan Bambu","Hutan Jamur","Sungai Hutan","Hutan Berduri","Hutan Bunga Liar","Bukit Hijau","Hutan Angin","Hutan Akar Raksasa","Hutan Sunyi","Hutan Cahaya","Hutan Reruntuhan","Hutan Tak Dikenal"],"Abyss":["Gua Kristal","Gua Basalt","Jurang Dalam","Sungai Bawah Tanah","Cavern Gelap","Gua Kapur","Lorong Mineral","Ruang Batu Besar","Gua Kabut","Gua Panas","Gua Dingin","Terowongan Retak","Sumur Bawah Tanah","Gua Air","Gua Angin","Gua Lumut","Jurang Berlapis","Gua Resonansi","Lorong Terkunci","Abyss Tak Terpetakan"],"Frost":["Lembah Salju","Gua Es","Danau Beku","Badai Salju","Pegunungan Es","Hutan Beku","Sungai Es","Dataran Putih","Tebing Es","Gletser Retak","Reruntuhan Es","Kawah Beku","Terowongan Es","Kabut Dingin","Bukit Salju","Es Biru","Padang Kristal Es","Benteng Beku","Malam Kutub","Frost Tak Dikenal"],"Ember":["Gunung Api","Gua Lava","Tanah Terbakar","Lembah Abu","Kawah","Sungai Lava","Tebing Bara","Hutan Hangus","Batu Merah","Terowongan Panas","Reruntuhan Abu","Padang Vulkanik","Geyser Panas","Kawah Retak","Dataran Asap","Lembah Magma","Bukit Arang","Gua Sulfur","Jalur Bara","Ember Tak Dikenal"],"Desert":["Gurun Luas","Canyon","Oasis","Badai Pasir","Reruntuhan Gurun","Bukit Pasir","Lembah Kering","Gua Gurun","Kota Terkubur","Dataran Garam","Tebing Pasir","Sumur Tua","Padang Batu","Gurun Malam","Gurun Merah","Labirin Batu","Lembah Angin","Oasis Tersembunyi","Jalur Karavan Lama","Desert Tak Dikenal"],"Ruins":["Kota Runtuh","Kuil Tua","Benteng Runtuh","Lorong Batu","Kota Bawah Tanah","Menara Rusak","Jembatan Tua","Istana Kosong","Perpustakaan Runtuh","Plaza Terlantar","Terowongan Kota","Pabrik Tua","Stasiun Terbengkalai","Benteng Dalam","Reruntuhan Hujan","Kuil Kabut","Kota Malam","Lorong Rahasia","Ruang Segel","Ruins Tak Dikenal"],"Wildlands":["Savana","Pegunungan","Padang Batu","Lembah","Sungai Liar","Bukit Angin","Padang Rumput","Hutan Kering","Tebing Tinggi","Lembah Sungai","Tanah Berlumpur","Padang Bunga","Punggung Gunung","Cekungan Batu","Hujan Pegunungan","Dataran Tinggi","Lembah Kabut","Padang Petir","Jalur Binatang","Wildlands Tak Dikenal"],"Sunken":["Kota Tenggelam","Gua Air","Rawa Dalam","Reruntuhan Pantai","Pulau Terisolasi","Laguna","Terowongan Air","Karang Gelap","Hutan Mangrove","Pantai Badai","Danau Dalam","Reruntuhan Bawah Air","Pulau Kabut","Muara","Gua Pasang","Pantai Batu","Pulau Hujan","Danau Sunyi","Teluk Tersembunyi","Sunken Tak Dikenal"],"Twilight":["Hutan Senja","Lembah Gelap","Tanah Berkabut","Reruntuhan Malam","Cavern Bercahaya","Dataran Senja","Hutan Bayangan","Danau Malam","Bukit Bulan","Lorong Remang","Kota Kabut","Padang Cahaya","Lembah Bintang","Gua Senja","Rawa Malam","Hutan Hening","Jalan Bulan","Reruntuhan Cahaya","Zona Remang","Twilight Tak Dikenal"],"Unknown":["Zona Anomali","Pintu Tanpa Tanda","Koridor Asing","Ruang Bergeser","Lembah Tanpa Nama","Hutan Asing","Gua Tak Tercatat","Pulau Tak Dikenal","Reruntuhan Tersegel","Dataran Sunyi","Jalur Hilang","Ruang Berlapis","Lembah Retak","Zona Kabut","Gerbang Gelap","Area Tanpa Peta","Ruang Tersembunyi","Wilayah Terlarang","Portal Langka","Portal Tidak Teridentifikasi"]};
const PORTAL_TYPES=['combat','boss','exploration','loot','unknown'];
const ENV_MODIFIERS=['Normal','Hujan','Kabut','Malam','Angin Kencang','Banjir Lokal','Longsor','Panas Ekstrem','Dingin Ekstrem','Visibility Rendah'];
const MONSTER_REGISTRY=[
 {id:'moss-hound',name:'Moss Hound',family:'Beast',hp:90,atk:12,behavior:'rush',drops:['material-fang']},{id:'stone-crawler',name:'Stone Crawler',family:'Crawler',hp:130,atk:10,behavior:'guard',drops:['material-stone']},{id:'mist-wing',name:'Mist Wing',family:'Flying',hp:70,atk:14,behavior:'ranged',drops:['material-wing']},{id:'ember-shell',name:'Ember Shell',family:'Elemental',hp:150,atk:16,behavior:'slow-heavy',drops:['material-core']},{id:'frost-claw',name:'Frost Claw',family:'Beast',hp:105,atk:15,behavior:'flank',drops:['material-claw']},{id:'ruin-sentinel',name:'Ruin Sentinel',family:'Construct',hp:180,atk:13,behavior:'guard',drops:['material-plate']},{id:'sand-stalker',name:'Sand Stalker',family:'Beast',hp:95,atk:17,behavior:'ambush',drops:['material-hide']},{id:'deep-lurker',name:'Deep Lurker',family:'Aquatic',hp:120,atk:15,behavior:'ambush',drops:['material-scale']},{id:'twilight-wisp',name:'Twilight Wisp',family:'Wisp',hp:65,atk:18,behavior:'ranged',drops:['material-essence']},{id:'portal-brute',name:'Portal Brute',family:'Brute',hp:210,atk:20,behavior:'heavy',drops:['material-core']}
];
const BOSS_REGISTRY=[{id:'ancient-root',name:'Ancient Root',phases:2,hp:800,weakness:'burst'},{id:'crystal-maw',name:'Crystal Maw',phases:3,hp:900,weakness:'mobility'},{id:'frost-titan',name:'Frost Titan',phases:3,hp:980,weakness:'ranged'},{id:'ember-colossus',name:'Ember Colossus',phases:3,hp:1050,weakness:'timing'},{id:'dune-warden',name:'Dune Warden',phases:2,hp:850,weakness:'guard-break'},{id:'ruin-keeper',name:'Ruin Keeper',phases:3,hp:1000,weakness:'pattern'},{id:'wild-horn',name:'Wild Horn',phases:2,hp:880,weakness:'dodge'},{id:'sunken-giant',name:'Sunken Giant',phases:3,hp:1020,weakness:'position'},{id:'twilight-eye',name:'Twilight Eye',phases:3,hp:940,weakness:'interrupt'},{id:'unknown-warden',name:'Unknown Warden',phases:4,hp:1200,weakness:'unknown'}];
const NPC_CLUES=[
 'Jejak di depan masih baru. Siapkan role bertahan sebelum masuk ruang berikutnya.','Ada jalur samping yang lebih aman, tetapi kemungkinan loot-nya lebih kecil.','Monster di area ini sering menyerang setelah pemain berhenti terlalu lama.','Dengar suara dari balik dinding: mungkin ada ruang boss di jalur berikutnya.','Kabut menutup pandangan. Jangan terlalu jauh dari anggota party.','Tanda di lantai biasanya muncul sebelum serangan area.','Ada peti di area berikutnya, tetapi belum tentu Portal ini kosong dari ancaman.','Portal ini jarang tercatat. Informasi Archive belum lengkap.'
];
const PORTAL_BREAK_REGISTRY=[
 {id:'break-verdant',name:'Verdant Overflow',family:'Verdant',severity:2,objective:'Tutup 3 titik keluarnya monster'},{id:'break-abyss',name:'Abyss Surge',family:'Abyss',severity:3,objective:'Amankan jalur dan kalahkan elite'},{id:'break-frost',name:'Frost Spill',family:'Frost',severity:2,objective:'Bertahan sampai Portal stabil'},{id:'break-ember',name:'Ember Surge',family:'Ember',severity:4,objective:'Kalahkan boss sebelum area meluas'},{id:'break-unknown',name:'Unknown Portal Break',family:'Unknown',severity:5,objective:'Identifikasi ancaman lalu hentikan sumbernya'}
];
const BOT_NAMES=['Raka','Dimas','Naya','Fikri','Alya','Rafi','Sinta','Bima','Nadia','Rio','Maya','Arga','Tia','Reno','Lina','Dani','Rani','Bayu'];
const GAME_MODES={arena:{name:'Arena 5v5',teamSize:5,totalSlots:10,maxBotRatio:.60,seconds:300,competitive:true}};
function gameBotFill(humanCount){const m=GAME_MODES.arena,missing=Math.max(0,m.totalSlots-humanCount),maxBots=Math.floor(m.totalSlots*m.maxBotRatio);return{allowed:missing<=maxBots,bots:Math.min(missing,maxBots),humans:humanCount,minHumans:m.totalSlots-maxBots}}
function gameBotRoster(humanCount){const f=gameBotFill(humanCount);return Array.from({length:f.bots},(_,i)=>({name:BOT_NAMES[i%BOT_NAMES.length],isBot:true,difficulty:'adaptive'}))}
function gameBotDifficulty(playerLevel=1,recentWinRate=.5){const onboarding=Math.max(0,.18-(playerLevel-1)*.025),skill=Math.max(-.12,Math.min(.18,(recentWinRate-.5)*.5));return{reaction:Math.max(.25,.62+onboarding-skill),aim:Math.max(.45,Math.min(.90,.64-onboarding+skill)),mistakeRate:Math.max(.08,Math.min(.28,.20+onboarding-skill*.4))}}

const PORTAL_DB=[];let pIndex=0;
Object.entries(PORTAL_THEME_DATA).forEach(([family,subs],fi)=>subs.forEach((sub,si)=>{const seeded=(fi*20+si);const rare=/Tak Dikenal|Tak Terpetakan|Tak Tercatat|Tidak Teridentifikasi|Langka|Anomali|Asing|Tanpa/.test(sub);let type=rare?'unknown':PORTAL_TYPES[seeded%4];if(seeded%17===0)type='loot';if(seeded%19===0)type='boss';const party=type==='loot'?1:type==='exploration'?Math.min(3,1+(seeded%3)):type==='boss'?5:Math.min(5,2+(seeded%4));PORTAL_DB.push({id:'portal-'+String(++pIndex).padStart(3,'0'),family,subtheme:sub,type,party,level:1+(seeded%20),env:ENV_MODIFIERS[seeded%ENV_MODIFIERS.length],monsterIds:[MONSTER_REGISTRY[seeded%MONSTER_REGISTRY.length].id,MONSTER_REGISTRY[(seeded+3)%MONSTER_REGISTRY.length].id],bossId:BOSS_REGISTRY[fi%BOSS_REGISTRY.length].id,npcClue:NPC_CLUES[seeded%NPC_CLUES.length],vendorPromo:type==='loot'&&seeded%5===0,rare})}));
if(PORTAL_DB.length!==200)throw Error('Portal DB harus berisi 200 subtema awal.');
const PORTAL_STORAGE={archive:'kf_portal_archive_v1',inventory:'kf_game_inventory_v1',listings:'kf_market_listings_v1',hero:'kf_hero_progress_v2',unlock:'kf_hero_unlock_v2'};
const HERO_DISCOVERY_MILESTONES=[2,5,9,14,20,27,35,44,54,65,77,90];
const HERO_STARTER_VERSION=2;
const HERO_OLD_FIXED_STARTERS=['iron-vanguard','lumen-weaver'];
function getHeroProgress(){try{return JSON.parse(localStorage.getItem(PORTAL_STORAGE.hero)||'{}')}catch(_){return{}}}
function saveHeroProgress(x){localStorage.setItem(PORTAL_STORAGE.hero,JSON.stringify(x))}
function heroExpNeeded(level){const lv=Math.max(1,Number(level)||1);return lv<=5?70*lv:100*lv}
function kfRandomUint32(){
 if(globalThis.crypto&&typeof crypto.getRandomValues==='function'){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]>>>0}
 return ((Date.now()^(Math.floor((typeof performance!=='undefined'?performance.now():0)*1000)))>>>0)
}
function kfSeededRandom(seed){
 let a=seed>>>0;return function(){a=(a+0x6D2B79F5)|0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
}
function starterEligibleHeroes(){return HERO_ROSTER.filter(h=>h.difficulty!=='Expert')}
function heroCombatFunctions(h){
 const f=new Set();if(['Tank','Fighter','Rider'].includes(h.role))f.add('frontline');
 if(['Healer','Support'].includes(h.role)||/Healer|Medic|Guardian|Warden/.test(h.subrole+' '+h.secondary))f.add('sustain');
 if(['Mage','Ranger','Hunter','Summoner'].includes(h.role))f.add('ranged');
 if(['Assassin','Specialist','Rider'].includes(h.role)||/Teleport|Phase|Rider/.test(h.subrole))f.add('mobility');
 if(['Mage','Support','Specialist','Summoner'].includes(h.role)||/Controller|Mage/.test(h.secondary))f.add('control');
 return f
}
function starterPairScore(a,b){
 if(!a||!b||a.id===b.id||a.role===b.role||a.subrole===b.subrole)return-999;
 if(a.difficulty==='Hard'&&b.difficulty==='Hard')return-999;
 let score=6;
 const af=heroCombatFunctions(a),bf=heroCombatFunctions(b),all=new Set([...af,...bf]);
 score+=all.size*2;
 if(af.has('frontline')!==bf.has('frontline'))score+=2;
 if(af.has('ranged')!==bf.has('ranged'))score+=2;
 if(af.has('sustain')||bf.has('sustain'))score+=1;
 if(a.difficulty==='Easy'||b.difficulty==='Easy')score+=1;
 return score
}
function assignRandomStarterPair(seed=kfRandomUint32()){
 const pool=starterEligibleHeroes(),rnd=kfSeededRandom(seed),first=pool[Math.floor(rnd()*pool.length)];
 let candidates=pool.filter(h=>h.id!==first.id).map(h=>({h,score:starterPairScore(first,h)})).filter(x=>x.score>-100);
 if(!candidates.length)candidates=pool.filter(h=>h.id!==first.id).map(h=>({h,score:0}));
 const second=candidates[Math.floor(rnd()*candidates.length)].h;
 return{seed:seed>>>0,pair:[first.id,second.id]}
}
function starterPairIsValid(ids){
 if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])return false;
 const a=HERO_ROSTER.find(h=>h.id===ids[0]),b=HERO_ROSTER.find(h=>h.id===ids[1]);
 return!!a&&!!b&&starterPairScore(a,b)>-100
}
function freshHeroUnlockState(seed){
 const pick=assignRandomStarterPair(seed);
 return{unlocked:[...pick.pair],starterPair:[...pick.pair],starterSeed:pick.seed,starterVersion:HERO_STARTER_VERSION,starterAssignedAt:Date.now(),starterSource:'random-controlled',portalClears:0,breakClears:0,discoveries:0,pending:false,candidates:[],pity:0,lastDiscoveryAt:0}
}
function getHeroUnlockState(){
 let x;try{x=JSON.parse(localStorage.getItem(PORTAL_STORAGE.unlock)||'null')}catch(_){}
 if(!x||!Array.isArray(x.unlocked))x=freshHeroUnlockState();
 else{
  x.unlocked=x.unlocked.filter(id=>HERO_ROSTER.some(h=>h.id===id));
  const noProgress=(Number(x.portalClears)||0)===0&&(Number(x.discoveries)||0)===0;
  const isOldFixed=noProgress&&x.unlocked.length===2&&HERO_OLD_FIXED_STARTERS.every(id=>x.unlocked.includes(id));
  if(!starterPairIsValid(x.starterPair)){
   if(isOldFixed||x.unlocked.length<2){
    const fresh=freshHeroUnlockState();x.unlocked=[...fresh.unlocked];x.starterPair=[...fresh.starterPair];x.starterSeed=fresh.starterSeed;x.starterAssignedAt=fresh.starterAssignedAt;x.starterSource='v8-random-migration'
   }else{
    const preserved=x.unlocked.slice(0,2);if(starterPairIsValid(preserved)){x.starterPair=preserved;x.starterSeed=Number(x.starterSeed)||0;x.starterAssignedAt=Number(x.starterAssignedAt)||Date.now();x.starterSource='legacy-progress-preserved'}
    else{const fresh=freshHeroUnlockState();const extras=x.unlocked.filter(id=>!fresh.unlocked.includes(id));x.starterPair=[...fresh.starterPair];x.unlocked=[...fresh.unlocked,...extras];x.starterSeed=fresh.starterSeed;x.starterAssignedAt=fresh.starterAssignedAt;x.starterSource='legacy-repaired'}
   }
  }
  x.starterVersion=HERO_STARTER_VERSION
 }
 x.unlocked=[...new Set(x.unlocked)].filter(id=>HERO_ROSTER.some(h=>h.id===id));
 if(x.unlocked.length<2){const fresh=freshHeroUnlockState();x.unlocked=[...new Set([...fresh.unlocked,...x.unlocked])];x.starterPair=[...fresh.starterPair];x.starterSeed=fresh.starterSeed;x.starterSource='repaired-minimum'}
 x.portalClears=Math.max(0,Number(x.portalClears)||0);x.breakClears=Math.max(0,Number(x.breakClears)||0);x.discoveries=Math.max(0,Number(x.discoveries)||0);x.pity=Math.max(0,Number(x.pity)||0);
 x.candidates=Array.isArray(x.candidates)?x.candidates.filter(id=>HERO_ROSTER.some(h=>h.id===id)&&!x.unlocked.includes(id)):[];
 x.pending=!!x.pending&&x.candidates.length>0;
 localStorage.setItem(PORTAL_STORAGE.unlock,JSON.stringify(x));return x
}
function saveHeroUnlockState(x){localStorage.setItem(PORTAL_STORAGE.unlock,JSON.stringify(x));return x}function isHeroUnlocked(id){return getHeroUnlockState().unlocked.includes(id)}function unlockedHeroes(){const u=new Set(getHeroUnlockState().unlocked);return HERO_ROSTER.filter(h=>u.has(h.id))}function nextHeroDiscoveryAt(x=getHeroUnlockState()){const i=x.discoveries;return i<HERO_DISCOVERY_MILESTONES.length?HERO_DISCOVERY_MILESTONES[i]:HERO_DISCOVERY_MILESTONES.at(-1)+(i-HERO_DISCOVERY_MILESTONES.length+1)*14}
function heroProgressFor(id){const all=getHeroProgress(),p=all[id]||{level:1,exp:0,skills:{s1:0,s2:0,u:0,mastery:0},mastery:0};return{level:Math.max(1,Number(p.level)||1),exp:Math.max(0,Number(p.exp)||0),skills:{s1:0,s2:0,u:0,mastery:0,...(p.skills||{})},mastery:Math.max(0,Number(p.mastery)||0)}}function maxOwnedHeroLevel(){return Math.max(1,...unlockedHeroes().map(h=>heroProgressFor(h.id).level))}function heroCatchupMultiplier(id){const p=heroProgressFor(id),gap=Math.max(0,maxOwnedHeroLevel()-p.level);return Math.min(2.5,1+gap*.15+(p.level<=5?.20:0))}
function addHeroPortalExp(id,amount){if(!isHeroUnlocked(id))return{...heroProgressFor(id),leveled:0,applied:0,multiplier:0};const all=getHeroProgress(),p=all[id]||{level:1,exp:0,skills:{s1:0,s2:0,u:0,mastery:0},mastery:0},mult=heroCatchupMultiplier(id),applied=Math.max(0,Math.floor(amount*mult));p.exp=(Number(p.exp)||0)+applied;p.level=Math.max(1,Number(p.level)||1);p.skills={s1:0,s2:0,u:0,mastery:0,...(p.skills||{})};let leveled=0;while(p.exp>=heroExpNeeded(p.level)){p.exp-=heroExpNeeded(p.level);p.level++;leveled++}all[id]=p;saveHeroProgress(all);return{...p,leveled,applied,multiplier:mult}}
function discoveryCandidateIds(x=getHeroUnlockState()){const locked=HERO_ROSTER.filter(h=>!x.unlocked.includes(h.id));if(!locked.length)return[];const seed=(x.portalClears*17+x.discoveries*31+x.unlocked.length*13)%997,ordered=[...locked].sort((a,b)=>((a.id.length*11+seed+a.atk)%997)-((b.id.length*11+seed+b.atk)%997)),out=[],roles=new Set();for(const h of ordered){if(out.length>=3)break;if(!roles.has(h.role)){out.push(h.id);roles.add(h.role)}}for(const h of ordered){if(out.length>=3)break;if(!out.includes(h.id))out.push(h.id)}return out}
function createHeroDiscovery(reason='milestone'){const x=getHeroUnlockState();if(x.pending||x.unlocked.length>=HERO_ROSTER.length)return false;x.candidates=discoveryCandidateIds(x);x.pending=x.candidates.length>0;x.lastDiscoveryAt=x.portalClears;x.pity=0;x.reason=reason;saveHeroUnlockState(x);updateHeroDiscoveryShortcut();return x.pending}function recordHeroProgressionEvent(kind='portal-clear'){const x=getHeroUnlockState();if(kind==='portal-clear'){x.portalClears++;x.pity++}else if(kind==='portal-break'){x.breakClears++;x.pity+=.5}saveHeroUnlockState(x);if(!x.pending&&(x.portalClears>=nextHeroDiscoveryAt(x)||x.pity>=6))createHeroDiscovery(x.pity>=6?'pity-guarantee':'milestone');updateHeroDiscoveryShortcut();return getHeroUnlockState()}
function chooseHeroDiscovery(id){const x=getHeroUnlockState();if(!x.pending||!x.candidates.includes(id)||x.unlocked.includes(id))return false;x.unlocked.push(id);x.discoveries++;x.pending=false;x.candidates=[];x.pity=0;x.reason='';saveHeroUnlockState(x);const all=getHeroProgress();if(!all[id])all[id]={level:1,exp:0,skills:{s1:0,s2:0,u:0,mastery:0},mastery:0};saveHeroProgress(all);gameRefreshHeroSelect(id);return true}
function useSkillBook(uid){let inv=getInventory(),i=inv.findIndex(x=>x.uid===uid);if(i<0)return;const item=inv[i];if(item.kind!=='Skill Book')return;const heroId=$('heroSelect')?.value||unlockedHeroes()[0]?.id;if(!heroId||!isHeroUnlocked(heroId))return;const all=getHeroProgress(),p=all[heroId]||{level:1,exp:0,skills:{s1:0,s2:0,u:0,mastery:0},mastery:0};p.skills={s1:0,s2:0,u:0,mastery:0,...(p.skills||{})};const slot=item.skillSlot||'mastery';p.skills[slot]=(p.skills[slot]||0)+1;if(slot==='mastery')p.mastery=(p.mastery||0)+1;all[heroId]=p;saveHeroProgress(all);inv.splice(i,1);saveInventory(inv);renderMarketplace();gameApplyLoadout()}
function getPortalArchive(){try{return JSON.parse(localStorage.getItem(PORTAL_STORAGE.archive)||'{}')}catch(_){return{}}}
function savePortalArchive(x){localStorage.setItem(PORTAL_STORAGE.archive,JSON.stringify(x))}
function getGameKP(){return typeof kfGetKP==='function'?kfGetKP():Math.max(0,Number(localStorage.getItem(KF_STORAGE.kp)||0)||0)}
function setGameKP(n){const v=Math.max(0,Math.floor(Number(n)||0));localStorage.setItem(KF_STORAGE.kp,String(v));if($('marketKP'))$('marketKP').textContent=v+' KP';if(typeof renderProfileFinal==='function')renderProfileFinal();return v}
function getInventory(){try{return JSON.parse(localStorage.getItem(PORTAL_STORAGE.inventory)||'[]')}catch(_){return[]}}
function saveInventory(x){localStorage.setItem(PORTAL_STORAGE.inventory,JSON.stringify(x.slice(0,300)))}
function kfItemUid(){if(globalThis.crypto&&typeof crypto.randomUUID==='function')return 'itm-'+crypto.randomUUID();if(globalThis.crypto&&typeof crypto.getRandomValues==='function'){const a=new Uint32Array(4);crypto.getRandomValues(a);return 'itm-'+Array.from(a,x=>x.toString(36)).join('-')}return 'itm-'+Date.now().toString(36)+'-'+performance.now().toString(36).replace('.','-')+'-'+Math.random().toString(36).slice(2,10)}
function addInventory(item){const inv=getInventory();let uid=kfItemUid();const used=new Set(inv.map(x=>x.uid));while(used.has(uid))uid=kfItemUid();inv.unshift({uid,...item,acquiredAt:Date.now()});saveInventory(inv);return inv[0]}
function portalItemPool(){return[...WEAPON_REGISTRY.map(x=>({...x,kind:'Weapon',tradable:true})),...ITEM_REGISTRY.filter(x=>x.id!=='none').map(x=>({...x,tradable:true})),...SKILL_BOOK_REGISTRY.map(x=>({...x,kind:'Skill Book',tradable:true}))]}
function portalRewardFor(p){if(p.vendorPromo)return{id:'vendor-voucher-'+p.id,name:'Vendor Promo Voucher',kind:'Vendor Promo',rarity:'Promo',systemKP:0,tradable:false,vendorPromo:true};const pool=portalItemPool(),base=pool[(Number(p.id.slice(-3))*7)%pool.length];return{...base,systemKP:Math.max(10,Math.round((base.systemKP||40)*(1+p.level/50)))}}
function portalFamilyOptions(){$('portalFamilySelect').innerHTML=['Semua',...Object.keys(PORTAL_THEME_DATA)].map(x=>`<option value="${x}">${x}</option>`).join('')}
let selectedPortalId=null,portalState=null,portalRecruitState=null;
function showPortalHub(){showOnly('portalHub');if(!$('portalFamilySelect').options.length)portalFamilyOptions();renderPortalCatalog();updatePortalArchiveBadge()}
function updatePortalArchiveBadge(){const n=Object.keys(getPortalArchive()).length;$('portalArchiveCount').textContent='Archive '+n+'/200'}
function renderPortalCatalog(){const family=$('portalFamilySelect').value||'Semua',type=$('portalTypeFilter').value||'all';const list=PORTAL_DB.filter(p=>(family==='Semua'||p.family===family)&&(type==='all'||p.type===type)).slice(0,20);$('portalCatalog').innerHTML=list.map(p=>`<button type="button" class="portal-card ${selectedPortalId===p.id?'active':''}" onclick="selectPortal('${p.id}')"><b>${p.subtheme}</b><div class="small">${p.family} · Lv.${p.level}</div><div class="portal-meta"><span class="portal-tag">${p.type==='unknown'?'???':p.type}</span><span class="portal-tag">${p.env}</span><span class="portal-tag">Party ${p.party}</span>${p.vendorPromo?'<span class="portal-tag">Promo</span>':''}</div></button>`).join('')||'<div class="small">Tidak ada Portal pada filter ini.</div>';if(!selectedPortalId&&list[0])selectPortal(list[0].id)}
function selectPortal(id){selectedPortalId=id;const p=PORTAL_DB.find(x=>x.id===id);if(!p)return;const archive=getPortalArchive(),known=!!archive[id]||p.type!=='unknown';$('portalDetail').innerHTML=`<b>${p.subtheme}</b> · ${p.family}<br>Tipe: ${known?p.type:'Tidak teridentifikasi'} · Environment: ${known?p.env:'???'} · Recommended Lv.${p.level} · Archive: ${archive[id]?'diketahui':'belum lengkap'}`; $('portalPartyReq').textContent=p.party+' Hero';$('portalHumanCount').value=String(Math.min(p.party,Math.max(1,Number($('portalHumanCount').value)||1)));$('portalNpcPreview').textContent='NPC: '+(known?p.npcClue:'Portal ini jarang diketahui. Masuk dengan persiapan dan cari clue di dalam.');refreshPortalRecruitment();renderPortalCatalogSelectionOnly()}
function renderPortalCatalogSelectionOnly(){document.querySelectorAll('#portalCatalog .portal-card').forEach(b=>b.classList.toggle('active',b.getAttribute('onclick')?.includes(`'${selectedPortalId}'`)))}
function heroPartyRole(hero){
 if(!hero)return'DPS';
 if(hero.role==='Tank')return'Tank';
 if(hero.role==='Healer')return'Healer';
 if(hero.role==='Support'||hero.role==='Summoner')return'Support';
 if(hero.role==='Fighter'&&/Vanguard|Guardian/.test(hero.subrole+' '+hero.secondary))return'Tank';
 return'DPS'
}
function portalRequiredRoles(p){
 if(p.party<=1)return['Flexible'];
 if(p.party===2)return['Frontline/Flexible','Damage/Support'];
 if(p.party===3)return['Tank/Flexible','Healer/Support','DPS'];
 if(p.party===4)return['Tank','Healer/Support','DPS','DPS/Flexible'];
 return['Tank','Healer','DPS','DPS','Support']
}
function portalBotRoles(p,humanCount){
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),playerRole=heroPartyRole(load.hero),need=Math.max(0,p.party-humanCount),roles=[],essential=[];
 if(p.party>=3&&playerRole!=='Tank')essential.push('Tank');
 if(p.party>=3&&playerRole!=='Healer')essential.push('Healer');
 if(p.party>=5&&playerRole!=='Support')essential.push('Support');
 const fill=['DPS','DPS','Support','Tank','Healer'];
 for(const r of [...essential,...fill]){if(roles.length>=need)break;if(!roles.includes(r)||r==='DPS')roles.push(r)}
 return roles.slice(0,need)
}
function refreshPortalRecruitment(){
 const p=PORTAL_DB.find(x=>x.id===selectedPortalId);if(!p)return;
 const humans=Math.min(p.party,Math.max(1,Number($('portalHumanCount').value)||1)),bots=Math.max(0,p.party-humans),load=window.KF_GAME_LOADOUT||gameApplyLoadout(),myRole=heroPartyRole(load.hero),botRoles=portalBotRoles(p,humans);
 if($('portalBotFill'))$('portalBotFill').textContent='';
 const chips=[`Kamu · ${load.hero.name} · ${myRole}`];
 for(let i=1;i<humans;i++)chips.push(`Pemain ${i+1} · Hero masing-masing`);
 botRoles.forEach((r,i)=>chips.push(`Anggota ${i+1} · ${r}`));
 $('portalRecruitRoles').innerHTML=chips.map(t=>`<span class="tab">${t}</span>`).join('')
}
function publishPortalRecruitment(){
 const p=PORTAL_DB.find(x=>x.id===selectedPortalId);if(!p)return;
 const humans=Math.min(p.party,Math.max(1,Number($('portalHumanCount').value)||1)),bots=Math.max(0,p.party-humans),load=window.KF_GAME_LOADOUT||gameApplyLoadout(),botRoles=portalBotRoles(p,humans);
 portalRecruitState={portalId:p.id,humans,bots,roles:portalRequiredRoles(p),botRoles,heroId:load.hero.id,createdAt:Date.now()};
 $('recruitmentSummary').innerHTML=`<b>${p.subtheme}</b><br>Kamu memakai <b>${load.hero.name}</b> (${load.hero.subrole}). Tim ${p.party} pemain.`;
 const roster=[{name:'Kamu · '+load.hero.name,role:heroPartyRole(load.hero),isBot:false}];
 for(let i=1;i<humans;i++)roster.push({name:'Pemain '+(i+1),role:'Hero masing-masing',isBot:false});
 for(let i=0;i<bots;i++)roster.push({name:BOT_NAMES[(i*3+Number(p.id.slice(-3)))%BOT_NAMES.length],role:botRoles[i]||'DPS',isBot:true});
 $('recruitmentRoster').innerHTML=roster.map(x=>`<div class="inventory-item"><b>${x.name}</b><div class="small">${x.role}</div></div>`).join('');
 showOnly('portalRecruitment')
}
function startRecruitedPortal(){if(!portalRecruitState)return showPortalHub();selectedPortalId=portalRecruitState.portalId;enterSelectedPortal()}
function legacyEnterSelectedPortal(){const p=PORTAL_DB.find(x=>x.id===selectedPortalId);if(!p)return;const humans=Math.min(p.party,Math.max(1,Number($('portalHumanCount')?.value)||1)),bots=Math.max(0,p.party-humans);portalState={portal:p,step:0,total:5,hp:100,humans,bots,revealedType:p.type==='unknown'?(['combat','boss','exploration','loot'][(Number(p.id.slice(-3))+p.level)%4]):p.type,log:[],completed:false};showOnly('portalMission');renderPortalMission()}
function portalNodesFor(st){const t=st.revealedType;if(t==='loot')return['Entry','Clue','Cache','Loot','Exit'];if(t==='exploration')return['Entry','Clue','Path','Objective','Exit'];if(t==='boss')return['Entry','Monster','Clue','Boss','Exit'];return['Entry','Monster','Clue','Elite','Exit']}
function renderPortalMission(){const st=portalState,p=st.portal,nodes=portalNodesFor(st);$('portalMissionTitle').textContent=p.subtheme;$('portalMissionMeta').textContent=`${p.family} · ${p.env} · Tim ${p.party}`;$('portalMissionType').textContent=st.step===0&&p.type==='unknown'?'Unknown':st.revealedType;$('portalNpcClue').textContent='NPC: '+(st.step<2?(p.type==='unknown'?'Informasi Portal terbatas. Periksa area pertama sebelum menentukan pola ancaman.':p.npcClue):p.npcClue);$('portalMapNodes').innerHTML=nodes.map((n,i)=>`<div class="portal-node ${i<st.step?'done':i===st.step?'current':'locked'}">${n}</div>`).join('');$('portalProgressBar').style.width=(st.step/st.total*100)+'%';renderPortalEncounter();$('portalMissionLog').innerHTML=st.log.map(x=>`<div>${x}</div>`).join('')||'<div>Tim memasuki Portal.</div>'; $('portalActBtn').disabled=st.completed;$('portalActBtn').textContent=st.completed?'Portal selesai':'Lanjut'}
function renderPortalEncounter(){const st=portalState,p=st.portal,node=portalNodesFor(st)[st.step]||'Selesai';let text='';if(node==='Monster'||node==='Elite'){const m=MONSTER_REGISTRY.find(x=>x.id===p.monsterIds[node==='Monster'?0:1]);text=`<b>${node}</b> · ${m.name} · HP ${m.hp} · perilaku ${m.behavior}. <button type="button" class="btn soft" onclick="portalResolveCombat('${m.id}')">Lawan</button>`}else if(node==='Boss'){const b=BOSS_REGISTRY.find(x=>x.id===p.bossId);text=`<b>Boss</b> · ${b.name} · ${b.phases} fase · weakness: ${b.weakness}. <button type="button" class="btn soft" onclick="portalResolveBoss('${b.id}')">Lawan Boss</button>`}else if(node==='Loot'||node==='Cache')text=`<b>${node}</b> · area loot terdeteksi. <button type="button" class="btn soft" onclick="portalCollectLoot()">Ambil loot</button>`;else if(node==='Objective')text=`<b>Objective eksplorasi</b> · cari penanda dan aktifkan titik tujuan. <button type="button" class="btn soft" onclick="portalResolveObjective()">Selesaikan objective</button>`;else text=`<b>${node}</b> · ${node==='Clue'?'NPC memberi informasi kontekstual.':'Area aman untuk bergerak ke titik berikutnya.'}`;$('portalEncounter').innerHTML=text}
function portalAdvance(){const st=portalState;if(!st||st.completed)return;const node=portalNodesFor(st)[st.step];if(['Monster','Elite','Boss','Loot','Cache','Objective'].includes(node))return alert('Selesaikan encounter di titik ini terlebih dahulu.');portalStepDone('Bergerak melewati '+node+'.')}
function portalStepDone(msg){const st=portalState;st.log.push(msg);st.step++;if(st.step>=st.total)completePortal();else renderPortalMission()}
function portalResolveCombat(mid){const st=portalState,m=MONSTER_REGISTRY.find(x=>x.id===mid);const power=(window.KF_GAME_LOADOUT?.stats?.atk||100)+st.humans*18+st.bots*12,damage=Math.max(2,Math.round(m.atk*8-power/30));st.hp=Math.max(1,st.hp-damage);portalStepDone(`Mengalahkan ${m.name}. HP party ${st.hp}%.`)}
function portalResolveBoss(bid){const st=portalState,b=BOSS_REGISTRY.find(x=>x.id===bid);const power=(window.KF_GAME_LOADOUT?.stats?.atk||100)+st.humans*25+st.bots*16,damage=Math.max(6,Math.round(b.hp/30-power/25));st.hp=Math.max(1,st.hp-damage);portalStepDone(`Boss ${b.name} dikalahkan setelah ${b.phases} fase. HP party ${st.hp}%.`)}
function portalCollectLoot(){const st=portalState,item=portalRewardFor(st.portal);addInventory(item);portalStepDone(`Loot diperoleh: ${item.name} (${item.rarity||item.kind}).`)}
function portalResolveObjective(){portalStepDone('Objective eksplorasi selesai. Jalur keluar terbuka.')}
function completePortal(){const st=portalState,p=st.portal;if(st.completed)return;st.completed=true;const archive=getPortalArchive();archive[p.id]={clearedAt:Date.now(),type:st.revealedType,env:p.env};savePortalArchive(archive);if(st.revealedType!=='loot'){const item=portalRewardFor(p);addInventory(item);st.log.push('Clear reward: '+item.name+'.')}const exp=20+p.level*3,bonusKP=5+Math.floor(p.level/2),heroId=$('heroSelect')?.value||unlockedHeroes()[0]?.id,prog=addHeroPortalExp(heroId,exp);setGameKP(getGameKP()+bonusKP);const ux=recordHeroProgressionEvent('portal-clear');st.log.push(`Portal clear · +${prog.applied} EXP Portal · +${bonusKP} KP.`);if(ux.pending)st.log.push('Hero Discovery tersedia.');if(prog.leveled)st.log.push(`Hero naik ${prog.leveled} level → Lv.${prog.level}.`);$('portalProgressBar').style.width='100%';$('portalEncounter').innerHTML='<b>Portal berhasil di-clear.</b> Progression dan loot sudah disimpan.';$('portalActBtn').disabled=true;$('portalActBtn').textContent='Portal selesai';$('portalMissionLog').innerHTML=st.log.map(x=>`<div>${x}</div>`).join('');updatePortalArchiveBadge()}
function legacyLeavePortalMission(){portalState=null;showPortalHub()}
let activePortalBreak=null;function showPortalBreak(){const b=PORTAL_BREAK_REGISTRY[Math.floor(Date.now()/60000)%PORTAL_BREAK_REGISTRY.length],monsters=MONSTER_REGISTRY.filter((_,i)=>i%2===b.severity%2).slice(0,Math.min(4,1+b.severity));activePortalBreak={...b,monsters,resolved:false};$('portalBreakSeverity').textContent='Severity '+b.severity;$('portalBreakInfo').innerHTML=`<b>${b.name}</b><br>${b.family} · Objective: ${b.objective}`;$('portalBreakNpc').textContent='NPC: Portal tidak stabil. Prioritaskan objective dan jangan mengejar monster terlalu jauh.';$('portalBreakMonsters').innerHTML=monsters.map(m=>`<span class="tab">${m.name}</span>`).join('');$('portalBreakAct').disabled=false;$('portalBreakAct').textContent='Tangani Portal Break';showOnly('portalBreak')}function resolvePortalBreak(){const b=activePortalBreak;if(!b||b.resolved)return;b.resolved=true;const heroId=$('heroSelect')?.value||unlockedHeroes()[0]?.id,exp=25+b.severity*12,kp=5+b.severity*3,prog=addHeroPortalExp(heroId,exp);setGameKP(getGameKP()+kp);recordHeroProgressionEvent('portal-break');const reward=portalItemPool()[(b.severity*3)%portalItemPool().length];addInventory({...reward,systemKP:Math.round((reward.systemKP||40)*(1+b.severity*.1))});$('portalBreakInfo').innerHTML+=`<br><b>Selesai:</b> +${exp} EXP Portal · +${kp} KP · ${reward.name}.`+(prog.leveled?` Hero naik ke Lv.${prog.level}.`:'');$('portalBreakAct').disabled=true;$('portalBreakAct').textContent='Portal Break selesai'}

function showMarketplace(){showOnly('marketplace');renderMarketplace()}
function renderMarketplace(){setGameKP(getGameKP());const inv=getInventory();$('marketInventory').innerHTML=inv.length?inv.map(x=>`<div class="inventory-item"><b>${x.name}</b><div class="small">${x.kind||'Item'} · ${x.rarity||''} · System ${x.systemKP||0} KP</div><div class="row">${x.kind==='Skill Book'?`<button type="button" class="btn primary" onclick="useSkillBook('${x.uid}')">Pelajari</button>`:''}<button type="button" class="btn soft" ${x.vendorPromo?'disabled':''} onclick="sellItemSystem('${x.uid}')">Jual System</button><button type="button" class="btn ghost" ${x.tradable===false?'disabled':''} onclick="listItemPlayer('${x.uid}')">Listing</button></div></div>`).join(''):'<div class="small">Inventory kosong. Clear Portal untuk memperoleh loot.</div>';let listings=[];try{listings=JSON.parse(localStorage.getItem(PORTAL_STORAGE.listings)||'[]')}catch(_){}$('marketListings').innerHTML=listings.length?listings.map(x=>`<div class="inventory-item"><b>${x.name}</b><div class="small">Harga ${x.price} KP · seller: Kamu (demo lokal)</div><button type="button" class="btn ghost" onclick="cancelListing('${x.uid}')">Batalkan listing</button></div>`).join(''):'<div class="small">Belum ada listing.</div>'}
function sellItemSystem(uid){let inv=getInventory(),i=inv.findIndex(x=>x.uid===uid);if(i<0)return;const item=inv[i];if(item.vendorPromo)return alert('Vendor promo tidak dijual ke System.');setGameKP(getGameKP()+(item.systemKP||0));inv.splice(i,1);saveInventory(inv);renderMarketplace()}
function listItemPlayer(uid){let inv=getInventory(),i=inv.findIndex(x=>x.uid===uid);if(i<0)return;const item=inv[i];if(item.tradable===false)return;const minPlayerPrice=Math.max(2,(item.systemKP||0)+1),raw=prompt('Harga listing dalam KP (minimal '+minPlayerPrice+' KP)',String(Math.max(minPlayerPrice+9,20))),price=Math.floor(Number(raw));if(!Number.isFinite(price)||price<minPlayerPrice){alert('Harga listing pemain harus lebih tinggi dari harga beli System ('+(item.systemKP||0)+' KP).');return;}let listings=[];try{listings=JSON.parse(localStorage.getItem(PORTAL_STORAGE.listings)||'[]')}catch(_){}listings.unshift({...item,price,listedAt:Date.now()});localStorage.setItem(PORTAL_STORAGE.listings,JSON.stringify(listings.slice(0,100)));inv.splice(i,1);saveInventory(inv);renderMarketplace()}
function cancelListing(uid){let listings=[];try{listings=JSON.parse(localStorage.getItem(PORTAL_STORAGE.listings)||'[]')}catch(_){}const i=listings.findIndex(x=>x.uid===uid);if(i<0)return;const item=listings.splice(i,1)[0];delete item.price;delete item.listedAt;const inv=getInventory();inv.unshift(item);saveInventory(inv);localStorage.setItem(PORTAL_STORAGE.listings,JSON.stringify(listings));renderMarketplace()}

function gameRefreshHeroSelect(preferId){const el=$('heroSelect');if(!el)return;const hs=unlockedHeroes(),cur=preferId||el.value;el.innerHTML=hs.map(h=>`<option value="${h.id}">${h.name} · ${h.subrole}</option>`).join('');if(hs.some(h=>h.id===cur))el.value=cur;else if(hs[0])el.value=hs[0].id}
function heroArtifactEffects(items){const o={};items.forEach(x=>{if(x?.effect)o[x.effect]=(o[x.effect]||0)+1});return o}function heroSkillLevel(p,slot){return Math.max(0,Number(p.skills?.[slot])||0)}function heroSkillSpec(h,slot,p){const b=h.skills.find(x=>x.slot===slot);if(!b)return null;const lv=heroSkillLevel(p,slot);return{...b,level:lv,power:b.power*(1+lv*.07),cd:Math.max(1.2,b.cd*(1-lv*.025))}}
function gameInitRegistry(){if(!$('weaponSelect').options.length){$('weaponSelect').innerHTML=WEAPON_REGISTRY.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');const items=ITEM_REGISTRY.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');$('item1Select').innerHTML=items;$('item2Select').innerHTML=items;$('item2Select').value='guard-plate'}gameRefreshHeroSelect();gameApplyLoadout();updateHeroDiscoveryShortcut()}
function gameApplyLoadout(){const owned=unlockedHeroes(),hero=HERO_ROSTER.find(x=>x.id===$('heroSelect')?.value&&isHeroUnlocked(x.id))||owned[0]||HERO_ROSTER[0],progress=heroProgressFor(hero.id),weapon=WEAPON_REGISTRY.find(x=>x.id===$('weaponSelect')?.value)||WEAPON_REGISTRY[0],items=[$('item1Select'),$('item2Select')].map(el=>ITEM_REGISTRY.find(x=>x.id===el?.value)||ITEM_REGISTRY[0]),lb=Math.max(0,progress.level-1),stats={hp:hero.hp+lb*32,atk:hero.atk+lb*4,def:hero.def+lb*3,spd:hero.spd+Math.floor(lb*.3),crit:hero.crit,cooldown:0};[weapon,...items].forEach(x=>Object.keys(stats).forEach(k=>stats[k]+=Number(x?.[k]||0)));stats.cooldown=Math.max(0,Math.min(.35,stats.cooldown));const effects=heroArtifactEffects(items),skills={s1:heroSkillSpec(hero,'s1',progress),s2:heroSkillSpec(hero,'s2',progress),u:heroSkillSpec(hero,'u',progress)};window.KF_GAME_LOADOUT={hero,progress,weapon,items,effects,skills,stats};$('heroName').textContent=hero.name;$('heroAvatar').textContent=hero.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2);$('gameStats').textContent=`${hero.role} / ${hero.subrole} · Lv.${progress.level} · EXP ${progress.exp}/${heroExpNeeded(progress.level)} · HP ${stats.hp} · ATK ${stats.atk} · DEF ${stats.def} · SPD ${stats.spd} · CRIT ${Math.round(stats.crit*100)}%`;const unlockState=getHeroUnlockState(),starterLabel=(unlockState.starterPair||[]).includes(hero.id)?' · Random Starter':'';$('heroProfileDetail').innerHTML=`<b>${hero.name}${starterLabel}</b><div class="hero-tags">${[hero.role,hero.subrole,hero.secondary,hero.archetype,hero.difficulty].filter(Boolean).map(x=>`<span class="hero-tag">${x}</span>`).join('')}</div><div class="small"><b>Passive — ${hero.passive}</b><br>${hero.passiveText}</div><div class="hero-skill-list">${hero.skills.map(z=>{const q=heroSkillSpec(hero,z.slot,progress);return`<div class="hero-skill"><b>${z.slot.toUpperCase()} · ${z.name} · Lv.${q.level}</b><span class="small">${z.type} · power ${q.power.toFixed(2)} · CD ${q.cd.toFixed(1)}s · ${z.effect}</span></div>`}).join('')}</div>`;$('heroBuildDetail').innerHTML=`<b>Build</b><div class="small">${weapon.name}<br>${items.map(x=>x.name).join(' + ')}</div>${items.filter(x=>x.effectText).map(x=>`<div class="synergy-line">${x.name}: ${x.effectText}</div>`).join('')}<div class="synergy-line">Catch-up EXP: ×${heroCatchupMultiplier(hero.id).toFixed(2)}</div>`;updateBattleSkillTitles?.();return window.KF_GAME_LOADOUT}
let gameRAF=0,gameLast=0,gameState=null,joy={x:0,y:0,pointer:null};
function showGameModeFinal(mode){window.KF_GAME_ENTRY='arena';$('gameModeTitle').textContent='Arena 5v5';showOnly('gameMode');gameInitRegistry();const fill=gameBotFill(4),bots=gameBotRoster(4);$('matchInfo').textContent='Arena 5v5 · EXP dan level tidak bertambah selama pertandingan.';startGameDemo()}
showGameMode=showGameModeFinal;
function gamePos(el,x,y){el.style.left=(x*100)+'%';el.style.top=(y*100)+'%'}
function gameSetStatus(msg){const el=$('gameStatus');if(el)el.textContent=msg}
function gameRespawnDelay(st){const elapsed=180-st.t;return Math.min(12,5+Math.floor(elapsed/60)*2)}
function startGameDemo(){stopGameDemo();gameApplyLoadout();gameState={x:.18,y:.55,baseX:.12,baseY:.55,ex:.82,ey:.45,enemyBaseX:.88,enemyBaseY:.45,hp:100,ehp:100,shield:0,enemySlowUntil:0,t:180,mode:'arena',score:{player:0,enemy:0},cool:{a:0,s1:0,s2:0,u:0},alive:true,enemyAlive:true,respawnAt:0,enemyRespawnAt:0,invulnerableUntil:0,enemyInvulnerableUntil:0,recall:{active:false,start:0,end:0,startX:0,startY:0},started:performance.now()};gamePos($('playerUnit'),gameState.x,gameState.y);gamePos($('enemyUnit'),gameState.ex,gameState.ey);$('playerUnit').classList.remove('unit-dead','unit-invulnerable');$('enemyUnit').classList.remove('unit-dead','unit-invulnerable');$('respawnOverlay').classList.add('hidden');gameSetStatus('Arena dimulai · progression tidak bertambah dari farming');gameWireControls();gameLast=performance.now();gameRAF=requestAnimationFrame(gameFrame)}
function stopGameDemo(){if(gameRAF)cancelAnimationFrame(gameRAF);gameRAF=0;gameState=null;joy.x=joy.y=0}
function gameCancelRecall(reason){if(!gameState||!gameState.recall.active)return;gameState.recall.active=false;gameSetStatus('Recall batal'+(reason?' · '+reason:''))}
function gameStartRecall(){const st=gameState;if(!st||!st.alive||st.recall.active)return;st.recall={active:true,start:performance.now(),end:performance.now()+3000,startX:st.x,startY:st.y};joy.x=joy.y=0;const js=$('joyStick');if(js)js.style.transform='translate(0,0)';gameSetStatus('Recall 3 detik · jangan bergerak / terkena damage')}
function gameCompleteRecall(){const st=gameState;if(!st||!st.alive)return;st.recall.active=false;st.x=st.baseX;st.y=st.baseY;st.hp=100;gamePos($('playerUnit'),st.x,st.y);gameSetStatus('Recall selesai · kembali ke base')}
function legacyGameDamagePlayer(amount,now){const st=gameState;if(!st||!st.alive||now<st.invulnerableUntil)return;if(st.recall.active)gameCancelRecall('terkena damage');st.hp=Math.max(0,st.hp-amount);if(st.hp<=0)gameKillPlayer(now)}
function gameDamageEnemy(amount,now){const st=gameState;if(!st||!st.enemyAlive||now<st.enemyInvulnerableUntil)return;st.ehp=Math.max(0,st.ehp-amount);if(st.ehp<=0)gameKillEnemy(now)}
function gameKillPlayer(now){const st=gameState;if(!st||!st.alive)return;st.alive=false;st.hp=0;st.recall.active=false;st.score.enemy++;st.respawnAt=now+gameRespawnDelay(st)*1000;$('playerUnit').classList.add('unit-dead');gameSetStatus('Hero tumbang · menunggu respawn')}
function gameKillEnemy(now){const st=gameState;if(!st||!st.enemyAlive)return;st.enemyAlive=false;st.ehp=0;st.score.player++;st.enemyRespawnAt=now+gameRespawnDelay(st)*1000;$('enemyUnit').classList.add('unit-dead');gameSetStatus('Lawan tumbang')}
function gameRespawnPlayer(now){const st=gameState;if(!st)return;st.alive=true;st.hp=100;st.x=st.baseX;st.y=st.baseY;st.invulnerableUntil=now+2000;st.respawnAt=0;$('playerUnit').classList.remove('unit-dead');$('playerUnit').classList.add('unit-invulnerable');$('respawnOverlay').classList.add('hidden');gamePos($('playerUnit'),st.x,st.y);gameSetStatus('Respawn · proteksi 2 detik')}
function gameRespawnEnemy(now){const st=gameState;if(!st)return;st.enemyAlive=true;st.ehp=100;st.ex=st.enemyBaseX;st.ey=st.enemyBaseY;st.enemyInvulnerableUntil=now+1800;st.enemyRespawnAt=0;$('enemyUnit').classList.remove('unit-dead');$('enemyUnit').classList.add('unit-invulnerable');gamePos($('enemyUnit'),st.ex,st.ey)}
function gameFrame(now){if(!gameState)return;const dt=Math.min(.04,(now-gameLast)/1000||.016);gameLast=now;const st=gameState,load=window.KF_GAME_LOADOUT||gameApplyLoadout(),speed=.12*(load.stats.spd/90);if(st.alive){if(st.recall.active){const moved=Math.hypot(st.x-st.recall.startX,st.y-st.recall.startY)>.006||Math.hypot(joy.x,joy.y)>.08;if(moved)gameCancelRecall('bergerak');else if(now>=st.recall.end)gameCompleteRecall();else gameSetStatus('Recall '+Math.max(1,Math.ceil((st.recall.end-now)/1000))+'…')}if(!st.recall.active){st.x=Math.max(.04,Math.min(.96,st.x+joy.x*speed*dt));st.y=Math.max(.08,Math.min(.92,st.y+joy.y*speed*dt))}}else if(st.respawnAt){const left=Math.max(0,Math.ceil((st.respawnAt-now)/1000));$('respawnOverlay').textContent='Respawn '+left;$('respawnOverlay').classList.remove('hidden');if(now>=st.respawnAt)gameRespawnPlayer(now)}if(!st.enemyAlive&&st.enemyRespawnAt&&now>=st.enemyRespawnAt)gameRespawnEnemy(now);if(st.alive&&st.enemyAlive){const dx=st.x-st.ex,dy=st.y-st.ey,d=Math.hypot(dx,dy)||1,bot=gameBotDifficulty(3,.55);if(d>.13){const sl=now<(st.enemySlowUntil||0)?.62:1;st.ex+=dx/d*.035*bot.aim*sl*dt;st.ey+=dy/d*.035*bot.aim*sl*dt}else if(Math.random()>bot.mistakeRate)gameDamagePlayer(7*dt,now)}Object.keys(st.cool).forEach(k=>st.cool[k]=Math.max(0,st.cool[k]-dt));st.t=Math.max(0,180-(now-st.started)/1000);gamePos($('playerUnit'),st.x,st.y);gamePos($('enemyUnit'),st.ex,st.ey);$('gameHp').textContent='HP '+Math.round(st.hp)+'%';$('enemyHp').textContent='Lawan '+Math.round(st.ehp)+'%';$('gameScore').textContent=st.score.player+'–'+st.score.enemy;$('gameTimer').textContent=Math.floor(st.t/60).toString().padStart(2,'0')+':'+Math.floor(st.t%60).toString().padStart(2,'0');$('playerUnit').classList.toggle('unit-invulnerable',st.alive&&now<st.invulnerableUntil);$('enemyUnit').classList.toggle('unit-invulnerable',st.enemyAlive&&now<st.enemyInvulnerableUntil);gameUpdateSkillButtons();if(st.t<=0)return gameFinishDemo(st.score.player>=st.score.enemy);gameRAF=requestAnimationFrame(gameFrame)}
function battleSkillButtonText(kind,cool=0){
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout();
 if(kind==='a')return cool>0?`ATK\n${cool.toFixed(cool<1?1:0)}s`:'ATK\nREADY';
 const q=load.skills[kind],slot=kind==='u'?'ULT':kind.toUpperCase(),name=q?.name||slot;
 return cool>0?`${slot} · ${name}\n${cool.toFixed(cool<1?1:0)}s`:`${slot} · ${name}\nREADY`
}
function updateBattleSkillTitles(){
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout();
 [['skill1Btn','s1'],['skill2Btn','s2'],['ultimateBtn','u'],['portalSkill1Btn','s1'],['portalSkill2Btn','s2'],['portalUltBtn','u']].forEach(([id,k])=>{
  const b=$(id),q=load.skills[k];if(!b||!q)return;b.title=`${q.name} · ${q.type} · range ${q.range.toFixed(2)} · ${q.effect}`
 })
}
function gameUpdateSkillButtons(){
 if(!gameState)return;updateBattleSkillTitles();
 [['attackBtn','a'],['skill1Btn','s1'],['skill2Btn','s2'],['ultimateBtn','u']].forEach(([id,k])=>{
  const b=$(id),v=gameState.cool[k];b.disabled=!gameState.alive||v>0;b.textContent=battleSkillButtonText(k,v)
 })
}
function legacyGameAttack(kind){const st=gameState;if(!st||!st.alive||st.recall.active||st.cool[kind]>0)return;const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),dist=Math.hypot(st.x-st.ex,st.y-st.ey);if(dist>.30)return gameSetStatus('Target terlalu jauh');const mul={a:.18,s1:.32,s2:.42,u:.72}[kind],cd={a:.7,s1:5,s2:8,u:18}[kind]*(1-load.stats.cooldown);st.cool[kind]=cd;const crit=Math.random()<load.stats.crit?1.6:1;gameDamageEnemy(Math.max(3,load.stats.atk*mul*crit/10),performance.now());gameSetStatus((crit>1?'CRIT · ':'')+(kind==='a'?'Basic attack':kind.toUpperCase()))}
function gameWireControls(){if(window.KF_GAME_WIRED)return;window.KF_GAME_WIRED=true;const zone=$('joyZone'),stick=$('joyStick');function move(e){if(joy.pointer!==e.pointerId)return;const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.33,mag=Math.hypot(dx,dy)||1,scale=Math.min(1,max/mag);const px=dx*scale,py=dy*scale;joy.x=px/max;joy.y=py/max;stick.style.transform=`translate(${px}px,${py}px)`}zone.addEventListener('pointerdown',e=>{if(gameState&&!gameState.alive)return;joy.pointer=e.pointerId;zone.setPointerCapture(e.pointerId);move(e)});zone.addEventListener('pointermove',move);const up=e=>{if(joy.pointer!==e.pointerId)return;joy.pointer=null;joy.x=joy.y=0;stick.style.transform='translate(0,0)'};zone.addEventListener('pointerup',up);zone.addEventListener('pointercancel',up);$('attackBtn').addEventListener('click',()=>gameAttack('a'));$('skill1Btn').addEventListener('click',()=>gameAttack('s1'));$('skill2Btn').addEventListener('click',()=>gameAttack('s2'));$('ultimateBtn').addEventListener('click',()=>gameAttack('u'));$('recallBtn').addEventListener('click',()=>gameState&&gameState.recall.active?gameCancelRecall('dibatalkan pemain'):gameStartRecall());$('gameChatInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();gameSendChat()}})}
function gameChatAppend(sender,message,channel='team'){const log=$('gameChatLog'),row=document.createElement('div'),b=document.createElement('b');b.textContent=(channel==='all'?'[Semua] ':'[Tim] ')+sender+': ';row.appendChild(b);row.appendChild(document.createTextNode(message));log.appendChild(row);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight}
function gameSendChat(){const input=$('gameChatInput'),raw=(input.value||'').trim();if(!raw)return;if(raw.length>80){alert('Pesan maksimal 80 karakter.');return}if(typeof kfSafeText==='function'&&!kfSafeText(raw)){alert('Pesan ditolak oleh moderasi Klikfun.');return}gameChatAppend('Kamu',raw,$('gameChatChannel').value);input.value=''}
function gameQuickChat(message){gameChatAppend('Kamu',message,'team');gameSetStatus(message)}
function gameFinishDemo(win){if(!gameState)return;cancelAnimationFrame(gameRAF);gameRAF=0;const gain=win?25:10;kfAddKP(gain,'Arena '+(win?'menang':'selesai'));$('gameResult').querySelector('.metric b').textContent='+'+gain;$('gameResult').querySelectorAll('.metric')[1].querySelector('b').textContent='+0';grantReward('game');showOnly('gameResult')}
function showGameStore(){showOnly('gameStore')}
function simulateGameFinal(){startGameDemo()}
simulateGame=simulateGameFinal;
const REWARD_STYLE_FINAL=[
 ['natural','Natural Beauty','brightness(1.045) contrast(1.025) saturate(1.035)'],['soft-glow','Soft Glow','brightness(1.075) contrast(.985) saturate(1.04)'],['smooth','Smooth Portrait','brightness(1.05) contrast(.99) saturate(.99)'],['bright-face','Bright Face','brightness(1.10) contrast(1.00)'],['warm','Warm Beauty','sepia(.08) brightness(1.05) saturate(1.06)'],['cool','Cool Beauty','brightness(1.03) saturate(.92) hue-rotate(4deg)'],['elegant','Elegant','brightness(1.03) contrast(1.065) saturate(.94)'],['charming','Charming','brightness(1.045) contrast(1.04) saturate(1.09)'],['confident','Confident','brightness(1.015) contrast(1.09) saturate(1.02)'],['sweet','Sweet','brightness(1.07) contrast(.98) saturate(1.07)'],['gentleman','Gentleman','brightness(1.015) contrast(1.075) saturate(.9)'],['poker','Poker Face','brightness(.995) contrast(1.08) saturate(.83)'],['dreamy','Dreamy','brightness(1.065) contrast(.96) saturate(1.035)'],['classy','Classy','brightness(1.025) contrast(1.06) saturate(.88)'],['cute','Cute','brightness(1.07) contrast(1.01) saturate(1.10)'],['cinematic-beauty','Cinematic Beauty','brightness(1.01) contrast(1.10) saturate(.91)'],
 ['natural-scene','Natural Scene','brightness(1.02) contrast(1.02) saturate(1.02)'],['vivid-scene','Vivid Scene','saturate(1.18) contrast(1.04)'],['food-pop','Food Pop','saturate(1.22) brightness(1.04)'],['nature','Nature','saturate(1.12) contrast(1.02)'],['product-clean','Product Clean','contrast(1.05) brightness(1.06) saturate(.95)'],['cinematic-scene','Cinematic Scene','contrast(1.14) saturate(.88) brightness(.97)'],
 ['tembem','Tembem','saturate(1.10) brightness(1.03)'],['cekung','Cekung','contrast(1.10) saturate(.90)'],['kepala-besar','Kepala Besar','saturate(1.08)'],['dahi-lebar','Dahi Lebar','brightness(1.02)'],['muka-gepeng','Muka Gepeng','contrast(.95)'],['muka-panjang','Muka Panjang','contrast(1.03)'],['pusing','Pusing','saturate(.85) contrast(1.04)'],['cemberut','Cemberut','saturate(.75) contrast(1.08)'],['kaget','Kaget','contrast(1.08) brightness(1.03)']
].map(([id,name,filter])=>({id,name,filter,hint:name+' · diproses lokal di perangkat'}));

const SUBJECT_STYLE_MAP={face:['natural-beauty','smooth-portrait','cinematic-beauty','elegant','charming'],multi_face:['natural-beauty','bright-face','cinematic-beauty'],food:['food-pop','vivid-scene','warm-beauty'],product:['product-clean','cinematic-scene','cool-beauty'],nature:['nature','vivid-scene','cinematic-scene'],vehicle:['cinematic-scene','vivid-scene','product-clean'],object:['product-clean','cinematic-scene','vivid-scene'],scene:['natural-scene','vivid-scene','cinematic-scene'],unknown:['natural-scene','cinematic-scene','natural-beauty']};
let rewardSubject={type:'unknown',faces:0,confidence:.4};
async function detectRewardSubject(canvas){let faces=[];try{if('FaceDetector' in window){const d=new FaceDetector({fastMode:true,maxDetectedFaces:5});faces=await d.detect(canvas)}}catch(_){faces=[]}if(faces.length){rewardSubject={type:faces.length>1?'multi_face':'face',faces:faces.length,confidence:.95};return rewardSubject}const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=Math.min(96,canvas.width),h=Math.min(96,canvas.height),tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;tmp.getContext('2d').drawImage(canvas,0,0,w,h);const data=tmp.getContext('2d').getImageData(0,0,w,h).data;let sat=0,green=0,warm=0,bright=0;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);sat+=(mx-mn);green+=g>r*1.05&&g>b*1.08;warm+=r>g*1.05&&g>b*.85;bright+=(r+g+b)/3>205}const n=data.length/4,landscape=canvas.width>canvas.height*1.2;if(green/n>.24)rewardSubject={type:'nature',faces:0,confidence:.62};else if(warm/n>.32&&sat/n>45)rewardSubject={type:'food',faces:0,confidence:.55};else if(bright/n>.52&&!landscape)rewardSubject={type:'product',faces:0,confidence:.52};else rewardSubject={type:landscape?'scene':'object',faces:0,confidence:.48};return rewardSubject}
function subjectLabel(s){return({face:'wajah',multi_face:'beberapa wajah',food:'makanan',product:'produk',nature:'alam',vehicle:'kendaraan',object:'objek',scene:'scene',unknown:'belum pasti'})[s.type]||s.type}
async function refreshRewardSubject(){if(!rewardShot)return;const s=await detectRewardSubject($('camCanvas'));$('subjectHint').textContent=`Subjek: ${subjectLabel(s)}${s.faces?' · '+s.faces+' wajah':''}. STYLE menyesuaikan subjek.`;renderStyleOptionsFinal(true)}
function rewardStyleObjectEffect(ctx,src,id,w,h,subject){const type=(subject||rewardSubject).type;ctx.clearRect(0,0,w,h);if(type==='face'||type==='multi_face')return drawDeformationFallback(ctx,src,id,w,h);ctx.save();if(['food','product','object','vehicle'].includes(type)){const zoom=id==='product-clean'?1.08:id==='food-pop'?1.12:1.05;ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);ctx.translate(-w/2,-h/2);ctx.drawImage(src,0,0,w,h);ctx.restore();return}if(['nature','scene'].includes(type)){ctx.drawImage(src,0,0,w,h);if(id==='cinematic-scene'){ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(0,0,w,h*.12);ctx.fillRect(0,h*.88,w,h*.12)}ctx.restore();return}ctx.drawImage(src,0,0,w,h);ctx.restore()}
async function loadRewardFile(ev){const f=ev.target.files&&ev.target.files[0];if(!f||rewardFixed)return;const img=new Image(),url=URL.createObjectURL(f);await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});const c=$('camCanvas'),ratio=img.width/img.height;c.width=360;c.height=480;const sc=Math.max(c.width/img.width,c.height/img.height),dw=img.width*sc,dh=img.height*sc;c.getContext('2d').drawImage(img,(c.width-dw)/2,(c.height-dh)/2,dw,dh);URL.revokeObjectURL(url);rewardShot=true;rewardDataUrl=c.toDataURL('image/jpeg',.9);$('camVideo').classList.add('hidden');$('camCanvas').classList.remove('hidden');$('rewardEdit').classList.remove('hidden');await refreshRewardSubject();applyStylePreviewFinal()}
const AI_THEME_FINAL={
 beauty:['Natural Photogenic','Korean Look','Japanese Look','Chinese Look','Middle Eastern Look','Eastern European Look','European Classic','Slavic Glam','Elegant','Charming / Confident','Soft Editorial','Studio Beauty','Natural Grooming','Classic Portrait','Luxury Portrait'],
 fantasy:['Fantasy Royal','Fantasy Being','Fantasy Warrior','Fantasy World','Elf Queen','Elf King','Aurora Queen','Crystal Palace','Future Queen','Cloud Kingdom','Moon Realm','Forest Guardian','Dragon Court','Sky Palace','Mystic Garden'],
 geographic:['Asia 1','Asia 2','Asia 3','Eropa 1','Eropa 2','Amerika 1','Amerika 2'],
 ninja:['Shadow Ninja','Forest Ninja','Royal Ninja','Future Ninja','City Ninja','Snow Ninja','Desert Ninja','Temple Ninja'],
 cartoon:['Cartoon Hero','Anime Hero','Fantasy Cartoon','Comic Style','Cel Shaded Hero','Animated Royal','Animated Ninja','Animated Sport'],
 sport:['Football Star','Football Striker','Football Goalkeeper','Football Captain','Football Champion','Football Street','Futsal Star','Futsal Goalkeeper','Basketball Star','Basketball Point Guard','Basketball Slam Dunk','Basketball Shooter','Basketball All-Star','Basketball Street','Badminton Star','Badminton Singles','Badminton Doubles','Tennis Star','Volleyball Star','Runner','Sprinter','Marathon Runner','Swimmer','Cyclist','Racing Driver','Motorcycle Racer','Boxer','Martial Artist','Archery Athlete','Baseball Star','American Football Star','Golf Player','Table Tennis Star','Skateboarder','Surfing Athlete'],
 fun:['Tembem','Cekung','Kepala Besar','Dahi Lebar','Muka Gepeng','Muka Panjang','Pusing','Cemberut','Kaget','Bergelayur','Retro Fun','Toy Hero'],
 visual:['Cinematic','Retro','Royal','Misterius','Gothic','Studio Editorial','Neon City','Golden Hour','Black & White','Film Grain','High Fashion','Poster Hero']
};
function grantReward(source){const ent={source,grantedAt:Date.now(),expiresAt:Date.now()+24*3600000,used:false,downloaded:false};localStorage.setItem(KF_STORAGE.reward,JSON.stringify(ent));return ent}
function rewardEntitlement(source){try{const e=JSON.parse(localStorage.getItem(KF_STORAGE.reward)||'null');return e&&!e.used&&e.expiresAt>Date.now()&&(source==='group-shared'||e.source===source||source==='tebak'||source==='game')?e:null}catch(_){return null}}
function unlockRewardFinal(source){let e=rewardEntitlement(source);const sharedReady=source==='group-shared'&&sessionStorage.getItem('kf_group_shared_ready')==='1';if(!e&&!sharedReady){alert('Reward Camera belum terbuka untuk aktivitas ini.');return}rewardUnlockSource=source;$('rewardSource').textContent=source==='group-shared'?'Reward grup bersama · maksimal 5 wajah':'Reward pribadi · '+source;rewardShot=false;rewardFixed=false;rewardDataUrl=null;rewardDownloaded=false;renderStyleOptionsFinal();renderAiThemesFinal();$('rewardEdit').classList.add('hidden');$('rewardFixed').classList.add('hidden');$('camVideo').classList.remove('hidden');$('camCanvas').classList.add('hidden');showOnly('rewardCamera')}
function renderStyleOptionsFinal(subjectAware=false){const preferred=new Set(SUBJECT_STYLE_MAP[rewardSubject.type]||[]),list=[...REWARD_STYLE_FINAL].sort((a,b)=>(preferred.has(b.id)?1:0)-(preferred.has(a.id)?1:0));$('rewardStyle').innerHTML=list.map(x=>`<option value="${x.id}">${preferred.has(x.id)?'★ ':''}${x.name}</option>`).join('');applyStylePreviewFinal()}
function renderAiThemesFinal(){const cat=$('aiCategory').value==='geo'?'geographic':$('aiCategory').value,list=AI_THEME_FINAL[cat]||[];$('aiTheme').innerHTML=list.map(x=>`<option>${x}</option>`).join('')}
function currentStyleFinal(){return REWARD_STYLE_FINAL.find(x=>x.id===$('rewardStyle').value)||REWARD_STYLE_FINAL[0]}
function applyStylePreviewFinal(){const x=currentStyleFinal();$('camCanvas').style.filter=x.filter;$('styleHint').textContent=x.hint+' · efek objek/scene aktif saat FIX'}
async function aiTransformFinal(){if(!rewardShot||rewardFixed)return;const c=$('camCanvas'),theme=$('aiTheme').value,cat=$('aiCategory').value,tmp=document.createElement('canvas');tmp.width=480;tmp.height=480;const side=Math.min(c.width,c.height),sx=(c.width-side)/2,sy=(c.height-side)/2;tmp.getContext('2d').drawImage(c,sx,sy,side,side,0,0,480,480);let blob;try{blob=await new Promise((res,rej)=>tmp.toBlob(b=>b?res(b):rej(Error('Gagal memproses foto')),'image/jpeg',.86));const form=new FormData();form.append('image',blob,'klikfun.jpg');form.append('theme',cat);form.append('subtheme',buildIdentitySafePrompt(theme));form.append('mode',rewardUnlockSource==='group-shared'?'group':'solo');form.append('subject_type',rewardSubject.type);const r=await fetch(KF_API.rewardAI,{method:'POST',body:form});if(!r.ok){let d={};try{d=await r.json()}catch(_){ }throw Error(d.error||'Transform sedang tidak tersedia. STYLE tetap bisa digunakan.')}const out=await r.blob();if(!out.type.startsWith('image/'))throw Error('Hasil AI tidak valid.');const url=URL.createObjectURL(out),img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});c.width=360;c.height=480;c.style.filter='none';c.getContext('2d').drawImage(img,0,0,360,480);URL.revokeObjectURL(url);rewardDataUrl=c.toDataURL('image/jpeg',.9);rewardFixed=true;finalizeRewardUI();kfTrack('reward_fixed',{theme:theme.slice(0,80)})}catch(e){alert(e.message||'Transform belum tersedia. STYLE tetap bisa digunakan.')}}
function buildIdentitySafePrompt(theme){const elf=/elf/i.test(theme)?' very beautiful graceful elegant high-fantasy elf styling, not chibi, not cutesy;':'';const subject=rewardSubject.type;const adaptive=(subject==='face'||subject==='multi_face')?' if female-presenting, make the subject look beautiful, captivating and elegant while preserving identity; if male-presenting, make the subject look heroic, capable and charismatic while preserving identity;':` no direct face detected; adapt transformation to the actual ${subject} content and do not invent a human portrait;`;return `${theme};${elf}${adaptive} preserve recognizable physical identity when a face exists; preserve natural facial structure; modest age-appropriate clothing; do not make clothing more revealing; if subject wears hijab/kerudung keep it fully present and closed; never remove hijab; for elf styling, elf ears must not protrude through hijab; no romance, no erotic styling, no body sexualization; family-safe; avoid copyrighted characters, trademarks and distinctive protected designs`}
function drawDeformationFallback(ctx,src,id,w,h){const geom=new Set(['tembem','cekung','kepala-besar','dahi-lebar','muka-gepeng','muka-panjang']);if(!geom.has(id)){ctx.drawImage(src,0,0,w,h);return}ctx.save();ctx.clearRect(0,0,w,h);if(id==='muka-gepeng'){ctx.translate(w*.08,0);ctx.scale(.84,1);ctx.drawImage(src,0,0,w,h)}else if(id==='muka-panjang'){ctx.translate(0,-h*.06);ctx.scale(1,1.12);ctx.drawImage(src,0,0,w,h)}else{ctx.drawImage(src,0,0,w,h);const y0=h*.18,y1=h*.68,step=4;for(let y=y0;y<y1;y+=step){const p=(y-y0)/(y1-y0),bell=Math.sin(Math.PI*p),factor=id==='tembem'?1+.16*bell:id==='cekung'?1-.12*bell:id==='kepala-besar'?1+.10*Math.sin(Math.PI*Math.min(1,p*1.25)):id==='dahi-lebar'?1+.14*Math.max(0,1-p*1.8):1;const sw=w,sh=Math.min(step+1,h-y),dw=w*factor,dx=(w-dw)/2;ctx.drawImage(src,0,y,sw,sh,dx,y,dw,sh)}}ctx.restore()}
function fixRewardFinal(){if(!rewardShot||rewardFixed)return;const c=$('camCanvas'),o=document.createElement('canvas');o.width=360;o.height=480;const x=o.getContext('2d');x.filter=currentStyleFinal().filter;rewardStyleObjectEffect(x,c,currentStyleFinal().id,360,480,rewardSubject);x.filter='none';rewardDataUrl=o.toDataURL('image/jpeg',.9);rewardFixed=true;finalizeRewardUI();kfTrack('reward_fixed',{theme:currentStyleFinal().id,subject:rewardSubject.type})}
function finalizeRewardUI(){$('rewardEdit').classList.add('hidden');$('rewardFixed').classList.remove('hidden');const e=JSON.parse(localStorage.getItem(KF_STORAGE.reward)||'{}');e.used=true;e.fixedAt=Date.now();localStorage.setItem(KF_STORAGE.reward,JSON.stringify(e));stopCamera()}
function downloadRewardFinal(){if(!rewardFixed||!rewardDataUrl||rewardDownloaded)return;const a=document.createElement('a');a.href=rewardDataUrl;a.download='klikfun-reward-final.jpg';document.body.appendChild(a);a.click();a.remove();rewardDownloaded=true;rewardDataUrl=null;$('downloadBtn').disabled=true;$('downloadBtn').textContent='Sudah didownload · terkunci';const e=JSON.parse(localStorage.getItem(KF_STORAGE.reward)||'{}');e.downloaded=true;e.downloadedAt=Date.now();localStorage.setItem(KF_STORAGE.reward,JSON.stringify(e));kfTrack('reward_downloaded');kfLogActivity('reward','Reward Camera selesai')}
unlockReward=unlockRewardFinal;renderStyleOptions=renderStyleOptionsFinal;renderAiThemes=renderAiThemesFinal;applyStylePreview=applyStylePreviewFinal;fakeAiTransform=aiTransformFinal;fixReward=fixRewardFinal;downloadReward=downloadRewardFinal;


/* === Hero Collection / Discovery / combat interaction v7 === */
function updateHeroDiscoveryShortcut(){const x=getHeroUnlockState(),b=$('heroDiscoveryShortcut');if(!b)return;b.textContent=x.pending?'Hero Discovery · READY':`Hero Discovery · ${x.portalClears}/${nextHeroDiscoveryAt(x)}`}
function renderHeroCollection(){
 const x=getHeroUnlockState(),next=nextHeroDiscoveryAt(x),owned=new Set(x.unlocked),remain=Math.max(0,next-x.portalClears),pct=x.pending?100:Math.min(100,x.portalClears/Math.max(1,next)*100);
 const starterNames=(x.starterPair||[]).map(id=>HERO_ROSTER.find(h=>h.id===id)?.name).filter(Boolean);
 $('heroOwnedBadge').textContent=`${x.unlocked.length}/${HERO_ROSTER.length} Hero · target ${HERO_TARGET_ROSTER}`;
 $('heroUnlockProgress').innerHTML=`<b>${x.pending?'Hero Discovery tersedia':'Progress Hero berikutnya'}</b><div class="hero-progress-track"><i style="width:${pct}%"></i></div><div class="small"><b>Starter random permanen:</b> ${starterNames.join(' + ')||'belum ditetapkan'} · Tidak ada reroll otomatis.<br>${x.pending?'Pilih 1 dari 3 kandidat.':remain+' Portal clear lagi menuju milestone.'} · Total clear ${x.portalClears} · Guarantee ${Math.floor(x.pity)}/6</div>`;
 $('heroRosterGrid').innerHTML=HERO_ROSTER.map(h=>{const p=heroProgressFor(h.id),open=owned.has(h.id),starter=(x.starterPair||[]).includes(h.id);return`<div class="hero-roster-card ${open?'':'locked'}"><b>${h.name}${starter?' · STARTER':''}</b><div class="hero-tags"><span class="hero-tag">${h.role}</span><span class="hero-tag">${h.subrole}</span></div><div class="small">${h.archetype} · ${h.difficulty}<br>${open?'Lv.'+p.level+' · '+p.exp+'/'+heroExpNeeded(p.level)+' EXP':'Terkunci · Hero Discovery'}<br>${h.passive}: ${h.passiveText}</div>${open?`<button class="btn soft" onclick="selectOwnedHero('${h.id}')">Pakai Hero</button>`:''}</div>`}).join('')
}
function showHeroCollection(){showOnly('heroCollection');renderHeroCollection()}function renderHeroDiscovery(){const x=getHeroUnlockState();$('heroDiscoveryBadge').textContent=x.pending?'READY':'Belum tersedia';if(!x.pending){$('heroDiscoveryInfo').innerHTML=`Main Portal untuk membuka Hero baru.<br><span class="small">Progress ${x.portalClears}/${nextHeroDiscoveryAt(x)} · guarantee ${Math.floor(x.pity)}/6. Dua starter random tetap permanen.</span>`;$('heroDiscoveryChoices').innerHTML='';return}$('heroDiscoveryInfo').innerHTML='<b>Pilih 1 dari 3.</b><div class="small">Hero lain tetap bisa muncul lagi. Hero baru membuka gaya bermain, bukan tier kemenangan otomatis.</div>';$('heroDiscoveryChoices').innerHTML=x.candidates.map(id=>{const h=HERO_ROSTER.find(y=>y.id===id);return`<div class="hero-discovery-choice"><b>${h.name}</b><div class="hero-tags"><span class="hero-tag">${h.role}</span><span class="hero-tag">${h.subrole}</span><span class="hero-tag">${h.secondary}</span></div><div class="small">${h.archetype}<br><b>${h.passive}</b> — ${h.passiveText}<br>${h.skills.map(q=>q.name).join(' · ')}</div><button class="btn primary" onclick="chooseHeroDiscoveryUI('${h.id}')">Unlock ${h.name}</button></div>`}).join('')}function showHeroDiscovery(){showOnly('heroDiscovery');renderHeroDiscovery()}function chooseHeroDiscoveryUI(id){if(chooseHeroDiscovery(id)){gameRefreshHeroSelect(id);renderHeroDiscovery();showHeroCollection()}}function selectOwnedHero(id){if(!isHeroUnlocked(id))return;showOnly('gameMode');gameRefreshHeroSelect(id);$('heroSelect').value=id;gameApplyLoadout()}
function combatArtifactMultiplier(load,isBoss=false,dist=.3,hpPct=1){let m=1;if(isBoss&&load.effects['boss-hunter'])m*=1.18;if(load.effects['low-hp-fury']&&hpPct<.40)m*=1.14;if(load.effects['duel']&&dist<.20)m*=1.08;return m}
function combatSkillUtility(load,slot,ctx){const q=load.skills[slot];if(!q)return;const ef=q.effect||'',heal=load.effects['healing']?1.20:1;if(/shield/.test(ef))ctx.self.shield=(ctx.self.shield||0)+(ef.includes('strong')?22:12)*heal;if(/heal/.test(ef))ctx.self.hp=Math.min(100,ctx.self.hp+14*heal);if(/blink|dash|phase/.test(ef)){const dx=ctx.target.x-ctx.self.x,dy=ctx.target.y-ctx.self.y,d=Math.hypot(dx,dy)||1,step=Math.min(.13,Math.max(0,d-.11));ctx.self.x=Math.max(.04,Math.min(.96,ctx.self.x+dx/d*step));ctx.self.y=Math.max(.08,Math.min(.92,ctx.self.y+dy/d*step));if(load.effects['blink-shield'])ctx.self.shield=(ctx.self.shield||0)+12}if(/slow|freeze|pull/.test(ef))ctx.target.slowUntil=performance.now()+1200;if(/summon|army|clone/.test(ef))ctx.bonusDamage=(ctx.bonusDamage||0)+load.stats.atk*(ef.includes('army')?.18:.08)}
function gameDamagePlayer(amount,now){const st=gameState;if(!st||!st.alive||now<st.invulnerableUntil)return;if(st.recall.active)gameCancelRecall('terkena damage');let d=amount;if(st.shield>0){const a=Math.min(st.shield,d);st.shield-=a;d-=a}st.hp=Math.max(0,st.hp-d);if(st.hp<=0)gameKillPlayer(now)}
function gameAttack(kind){const st=gameState;if(!st||!st.alive||st.recall.active||st.cool[kind]>0)return;const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),dist=Math.hypot(st.x-st.ex,st.y-st.ey),q=kind==='a'?{name:'Basic Attack',power:.18,cd:.7,range:.20,effect:''}:load.skills[kind];if(!q)return;if(dist>q.range)return gameSetStatus('Target terlalu jauh');st.cool[kind]=q.cd*(1-load.stats.cooldown);const crit=Math.random()<load.stats.crit?1.6:1,ctx={self:st,target:{x:st.ex,y:st.ey,slowUntil:st.enemySlowUntil||0},bonusDamage:0};if(kind!=='a')combatSkillUtility(load,kind,ctx);st.enemySlowUntil=ctx.target.slowUntil||st.enemySlowUntil;let dmg=Math.max(3,load.stats.atk*q.power*crit/10+ctx.bonusDamage/10)*combatArtifactMultiplier(load,false,dist,st.hp/100);if(q.effect==='execute'&&st.ehp<35)dmg*=1.25;gameDamageEnemy(dmg,performance.now());if(kind==='s1'&&load.effects['echo-refund']&&Math.floor(performance.now()/1000)%4===0)st.cool[kind]*=.65;gameSetStatus((crit>1?'CRIT · ':'')+(kind==='a'?'Basic attack':q.name)+(st.shield?' · Shield '+Math.round(st.shield):''))}

/* === Portal full action runtime v5: database-driven, offline-capable === */
let portalAction=null,portalActionRAF=0,portalActionLast=0;
const portalJoy={x:0,y:0,pointer:null};
const PORTAL_BIOME_RULES={
 'Verdant Portal':{speed:.96,hazard:'akar dan semak memperlambat area tertentu'},
 'Abyss Portal':{speed:.90,hazard:'jarak pandang pendek dan lorong sempit'},
 'Frost Portal':{speed:.88,hazard:'permukaan licin memperlambat gerak'},
 'Ember Portal':{speed:.93,hazard:'zona panas memberi damage periodik'},
 'Desert Portal':{speed:.95,hazard:'angin pasir mengurangi jangkauan'},
 'Ruins Portal':{speed:.94,hazard:'puing membuat jalur sempit'},
 'Wildlands Portal':{speed:1.02,hazard:'medan terbuka mempercepat pergerakan'},
 'Sunken Portal':{speed:.86,hazard:'genangan memperlambat gerak'},
 'Twilight Portal':{speed:.92,hazard:'kabut senja mengurangi jangkauan'},
 'Unknown Portal':{speed:.91,hazard:'kondisi belum teridentifikasi'}
};
function portalActionStop(){if(portalActionRAF)cancelAnimationFrame(portalActionRAF);portalActionRAF=0;portalAction=null;portalJoy.x=portalJoy.y=0}
function portalActionSetStatus(t){const e=$('portalActionStatus');if(e)e.textContent=t}
function portalActionLog(t){if(!portalAction)return;portalAction.log.push(t);portalAction.log=portalAction.log.slice(-30);$('portalMissionLog').innerHTML=portalAction.log.map(x=>`<div>${x}</div>`).join('')}
function portalActionUnitPos(el,x,y){if(!el)return;el.style.left=(x*100)+'%';el.style.top=(y*100)+'%'}
function portalActionSpawnEnemy(src,i,boss=false){
 const scale=1+(portalAction.portal.level-1)*.045;
 return {id:'pa-e-'+i,sourceId:src.id,name:src.name,x:.62+(i%3)*.09,y:.28+(i%2)*.34,
 hp:Math.round((src.hp||100)*scale*(boss?2.2:1)),maxHp:Math.round((src.hp||100)*scale*(boss?2.2:1)),
 atk:(src.atk||12)*scale,spd:boss?.018:.026,range:boss?.18:.12,alive:true,boss,phase:1,lastAttack:0,target:null};
}
function portalActionBuildEncounter(){
 const st=portalAction,p=st.portal,type=st.type;
 st.enemies=[];st.loot=[];
 if(type==='loot'){st.objective='Temukan dan ambil loot';st.loot=[{id:'loot-main',x:.73,y:.45,taken:false,item:portalRewardFor(p)}];return}
 if(type==='exploration'){st.objective='Capai titik penanda dan interaksi';st.interact={x:.78,y:.52,done:false};const m=MONSTER_REGISTRY.find(x=>x.id===p.monsterIds[0]);st.enemies=[portalActionSpawnEnemy(m,0,false)];return}
 if(type==='boss'){st.objective='Kalahkan Boss Portal';const b=BOSS_REGISTRY.find(x=>x.id===p.bossId);st.enemies=[portalActionSpawnEnemy({id:b.id,name:b.name,hp:b.hp,atk:20+(b.phases||2)*3},0,true)];return}
 st.objective='Bersihkan semua monster';p.monsterIds.forEach((id,i)=>{const m=MONSTER_REGISTRY.find(x=>x.id===id);if(m)st.enemies.push(portalActionSpawnEnemy(m,i,false))});
 const extra=MONSTER_REGISTRY[(Number(p.id.slice(-3))+4)%MONSTER_REGISTRY.length];st.enemies.push(portalActionSpawnEnemy(extra,2,false));
}
function portalActionBuildParty(){
 const p=portalAction.portal,humans=portalAction.humans,bots=Math.max(0,p.party-humans),roles=portalBotRoles(p,humans),party=[];
 for(let i=0;i<bots;i++){
  party.push({id:'pa-b-'+i,name:BOT_NAMES[(Number(p.id.slice(-3))+i*2)%BOT_NAMES.length],role:roles[i]||'DPS',x:.18+(i%2)*.05,y:.42+(i%3)*.08,hp:100,maxHp:100,alive:true,lastAttack:0})
 }
 portalAction.bots=party
}
function portalActionRender(){
 const st=portalAction;if(!st)return;
 const layer=$('portalActionUnits'),loot=$('portalLootLayer');let out=`<div id="portalHeroUnit" class="portal-unit" style="left:${st.x*100}%;top:${st.y*100}%">K<div class="mini-hp"><i style="width:${st.hp}%"></i></div></div>`;
 out+=st.bots.map(b=>`<div id="${b.id}" class="portal-unit bot ${b.alive?'':'dead'}" style="left:${b.x*100}%;top:${b.y*100}%">${b.name.slice(0,1)}<div class="mini-hp"><i style="width:${Math.max(0,b.hp)}%"></i></div></div>`).join('');
 out+=st.enemies.map(e=>`<div id="${e.id}" class="portal-unit monster ${e.boss?'boss':''} ${e.alive?'':'dead'}" style="left:${e.x*100}%;top:${e.y*100}%">${e.boss?'B':'M'}<div class="mini-hp"><i style="width:${Math.max(0,e.hp/e.maxHp*100)}%"></i></div></div>`).join('');
 if(st.interact&&!st.interact.done)out+=`<div class="portal-loot-drop" style="left:${st.interact.x*100}%;top:${st.interact.y*100}%">!</div>`;
 layer.innerHTML=out;
 loot.innerHTML=st.loot.filter(x=>!x.taken).map(x=>`<div class="portal-loot-drop" style="left:${x.x*100}%;top:${x.y*100}%">L</div>`).join('');
 $('portalActionHp').textContent='HP '+Math.round(st.hp)+'%';
 $('portalActionObjective').textContent=st.objective;
 $('portalActionEnemies').textContent='Musuh '+st.enemies.filter(x=>x.alive).length;
 $('portalProgressBar').style.width=(st.completed?100:Math.min(95,st.progress))+'%';
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout();updateBattleSkillTitles();
 [['portalAttackBtn','a'],['portalSkill1Btn','s1'],['portalSkill2Btn','s2'],['portalUltBtn','u']].forEach(([id,k])=>{const b=$(id),v=st.cool[k]||0;b.disabled=!st.started||!st.alive||st.completed||v>0;b.textContent=battleSkillButtonText(k,v)});
 $('portalActBtn').disabled=st.started&&!st.completed;$('portalActBtn').textContent=st.completed?'Portal selesai':st.started?'Sedang bermain':'Mulai Portal';
 $('portalEncounter').innerHTML=`<b>${st.portal.subtheme}</b> · ${st.type} · ${st.portal.env}<br>${st.objective}<br><span class="small">Environment: ${(PORTAL_BIOME_RULES[st.portal.family]||PORTAL_BIOME_RULES['Unknown Portal']).hazard}</span>`;
}
function enterSelectedPortal(){
 const p=PORTAL_DB.find(x=>x.id===selectedPortalId);if(!p)return;
 const humans=Math.min(p.party,Math.max(1,Number($('portalHumanCount')?.value)||1)),bots=Math.max(0,p.party-humans);
 const type=p.type==='unknown'?(['combat','boss','exploration','loot'][(Number(p.id.slice(-3))+p.level)%4]):p.type;
 portalActionStop();portalAction={portal:p,type,humans,botCount:bots,x:.13,y:.52,hp:100,maxHp:100,shield:0,alive:true,respawnAt:0,invulnerableUntil:0,
  cool:{a:0,s1:0,s2:0,u:0},started:false,completed:false,progress:0,objective:'Persiapan',log:['Tim memasuki '+p.subtheme+'.'],enemies:[],bots:[],loot:[],interact:null,startTime:0};
 portalActionBuildParty();portalActionBuildEncounter();showOnly('portalMission');
 $('portalMissionTitle').textContent=p.subtheme;$('portalMissionMeta').textContent=`${p.family} · ${p.env} · Tim ${p.party}`;
 $('portalMissionType').textContent=p.type==='unknown'?'Unknown → '+type:type;$('portalNpcClue').textContent='NPC: '+p.npcClue;
 $('portalActionField').dataset.family=PORTAL_THEME_DATA[p.family]?p.family:'Unknown Portal';
 portalActionRender();portalActionLog('NPC memberi clue: '+p.npcClue);portalActionWire();
}
function portalActionStart(){
 const st=portalAction;if(!st||st.started||st.completed)return;st.started=true;st.startTime=performance.now();portalActionLast=performance.now();
 portalActionSetStatus(st.type==='loot'?'Portal tenang · tidak ada monster terdeteksi':'Encounter dimulai');
 portalActionLog(st.type==='loot'?'Tidak ada monster. Sinyal loot terdeteksi.':'Combat dimulai.');
 portalActionRAF=requestAnimationFrame(portalActionFrame);portalActionRender();
}
function portalActionNearestEnemy(x=portalAction.x,y=portalAction.y){
 const live=portalAction.enemies.filter(e=>e.alive);live.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));return live[0]||null;
}
function portalActionDamageEnemy(e,dmg){
 if(!e||!e.alive)return;e.hp=Math.max(0,e.hp-dmg);
 if(e.boss){const ratio=e.hp/e.maxHp,newPhase=ratio<.33?3:ratio<.66?2:1;if(newPhase!==e.phase){e.phase=newPhase;e.atk*=1.16;e.spd*=1.08;portalActionLog(`${e.name} memasuki fase ${newPhase}.`);portalActionSetStatus('Boss Phase '+newPhase)}}
 if(e.hp<=0){e.alive=false;portalAction.progress=Math.min(90,portalAction.progress+25);portalActionLog(e.name+' dikalahkan.');portalActionCheckClear()}
}
function portalActionDamagePlayer(dmg,now){
 const st=portalAction;if(!st.alive||now<st.invulnerableUntil)return;let damage=dmg;if(st.shield>0){const a=Math.min(st.shield,damage);st.shield-=a;damage-=a}st.hp=Math.max(0,st.hp-damage);
 if(st.hp<=0){st.alive=false;st.respawnAt=now+5000;portalActionSetStatus('Hero tumbang · respawn 5 detik');portalActionLog('Hero tumbang. Pertarungan berlanjut.')}
}
function portalActionDamageBot(b,dmg){if(!b.alive)return;b.hp=Math.max(0,b.hp-dmg);if(b.hp<=0){b.alive=false;portalActionLog(b.name+' tumbang.')}}
function portalActionRespawn(now){const st=portalAction;st.alive=true;st.hp=100;st.x=.13;st.y=.52;st.respawnAt=0;st.invulnerableUntil=now+2000;portalActionSetStatus('Respawn · proteksi 2 detik')}
function portalActionAttack(kind){const st=portalAction;if(!st||!st.started||!st.alive||st.completed||st.cool[kind]>0)return;const target=portalActionNearestEnemy();if(!target)return portalActionInteract();const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),dist=Math.hypot(st.x-target.x,st.y-target.y),q=kind==='a'?{name:'Basic Attack',power:.20,cd:.65,range:.18,effect:''}:load.skills[kind];if(!q)return;if(dist>q.range)return portalActionSetStatus(`${q.name}: target terlalu jauh · range ${q.range.toFixed(2)}`);st.cool[kind]=q.cd*(1-load.stats.cooldown);const crit=Math.random()<load.stats.crit?1.6:1,ctx={self:st,target,bonusDamage:0};if(kind!=='a')combatSkillUtility(load,kind,ctx);let damage=Math.max(5,load.stats.atk*q.power*crit/7+ctx.bonusDamage/7)*combatArtifactMultiplier(load,target.boss,dist,st.hp/100);if(load.hero.subrole==='Dragon Slayer'&&target.boss)damage*=1.16;if(q.effect==='boss-execute'&&target.boss&&target.hp/target.maxHp<.35)damage*=1.30;portalActionDamageEnemy(target,damage);if(kind==='s1'&&load.effects['echo-refund']&&Math.floor(performance.now()/1000)%4===0)st.cool[kind]*=.65;portalActionSetStatus((crit>1?'CRIT · ':'')+(kind==='a'?'Attack':q.name)+' → '+target.name)}
function portalActionInteract(){
 const st=portalAction;if(!st||!st.started||st.completed)return;
 const nearLoot=st.loot.find(l=>!l.taken&&Math.hypot(st.x-l.x,st.y-l.y)<.14);
 if(nearLoot){nearLoot.taken=true;addInventory(nearLoot.item);portalActionLog('Loot diperoleh: '+nearLoot.item.name+'.');st.progress=90;return portalActionCheckClear()}
 if(st.interact&&!st.interact.done&&Math.hypot(st.x-st.interact.x,st.y-st.interact.y)<.14){st.interact.done=true;st.progress=90;portalActionLog('Objective eksplorasi diaktifkan.');return portalActionCheckClear()}
 portalActionSetStatus('Tidak ada objek interaksi dalam jangkauan');
}
function portalActionCheckClear(){
 const st=portalAction;if(!st||st.completed)return;
 const enemiesDone=st.enemies.every(e=>!e.alive),lootDone=st.loot.every(l=>l.taken),interactDone=!st.interact||st.interact.done;
 if(enemiesDone&&lootDone&&interactDone)portalActionComplete();
}
function portalActionComplete(){
 const st=portalAction;if(!st||st.completed)return;st.completed=true;st.progress=100;if(portalActionRAF)cancelAnimationFrame(portalActionRAF);portalActionRAF=0;
 const p=st.portal,archive=getPortalArchive(),firstClear=!archive[p.id];archive[p.id]={clearedAt:Date.now(),type:st.type,env:p.env};savePortalArchive(archive);
 if(st.type!=='loot'){const reward=portalRewardFor(p);addInventory(reward);portalActionLog('Clear reward: '+reward.name+'.')}
 const heroId=$('heroSelect')?.value||unlockedHeroes()[0]?.id,load=window.KF_GAME_LOADOUT||gameApplyLoadout(),baseExp=20+p.level*3,archiveBonus=(load.hero.subrole==='Portal Hunter'&&firstClear?Math.ceil(baseExp*.10):0),exp=baseExp+archiveBonus,kp=5+Math.floor(p.level/2),prog=addHeroPortalExp(heroId,exp);setGameKP(getGameKP()+kp);const ux=recordHeroProgressionEvent('portal-clear');
 portalActionLog(`Portal clear · +${prog.applied} EXP Portal${prog.multiplier>1?' (catch-up ×'+prog.multiplier.toFixed(2)+')':''} · +${kp} KP.`);if(archiveBonus)portalActionLog(`Portal Hunter Archive Sense: +${archiveBonus} base EXP.`);if(prog.leveled)portalActionLog(`Hero naik ${prog.leveled} level → Lv.${prog.level}.`);if(ux.pending)portalActionLog('Hero Discovery tersedia: pilih 1 dari 3 Hero baru.');
 portalActionSetStatus('Portal berhasil di-clear');updatePortalArchiveBadge();portalActionRender();
}
function portalActionFrame(now){
 const st=portalAction;if(!st||!st.started||st.completed)return;const dt=Math.min(.04,(now-portalActionLast)/1000||.016);portalActionLast=now;
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),biome=PORTAL_BIOME_RULES[st.portal.family]||PORTAL_BIOME_RULES['Unknown Portal'],speed=.14*(load.stats.spd/90)*biome.speed;
 if(st.alive){st.x=Math.max(.035,Math.min(.965,st.x+portalJoy.x*speed*dt));st.y=Math.max(.07,Math.min(.93,st.y+portalJoy.y*speed*dt))}
 else if(st.respawnAt&&now>=st.respawnAt)portalActionRespawn(now);
 Object.keys(st.cool).forEach(k=>st.cool[k]=Math.max(0,st.cool[k]-dt));
 /* Bot Hero: follow player, acquire nearest enemy, attack with human-like cadence. */
 st.bots.forEach((b,i)=>{if(!b.alive)return;const e=portalActionNearestEnemy(b.x,b.y);if(e){const dx=e.x-b.x,dy=e.y-b.y,d=Math.hypot(dx,dy)||1;if(d>.17){b.x+=dx/d*.055*dt;b.y+=dy/d*.055*dt}else if(now-b.lastAttack>850+i*110){b.lastAttack=now;portalActionDamageEnemy(e,8+(st.portal.level*.7)+(b.role==='DPS'?4:b.role==='Tank'?1:2))}}else{const tx=st.x-.04-(i%2)*.035,ty=st.y+(i%3-1)*.05;b.x+=(tx-b.x)*.8*dt;b.y+=(ty-b.y)*.8*dt}});
 /* Monster AI: target closest living party member; boss gains pressure by phase. */
 st.enemies.forEach((e,ei)=>{if(!e.alive)return;let targets=[];if(st.alive)targets.push({kind:'player',x:st.x,y:st.y,obj:st});st.bots.filter(b=>b.alive).forEach(b=>targets.push({kind:'bot',x:b.x,y:b.y,obj:b}));if(!targets.length)return;
  targets.sort((a,b)=>Math.hypot(e.x-a.x,e.y-a.y)-Math.hypot(e.x-b.x,e.y-b.y));const t=targets[0],dx=t.x-e.x,dy=t.y-e.y,d=Math.hypot(dx,dy)||1;
  if(d>e.range){e.x+=dx/d*e.spd*(e.boss?1+(.08*(e.phase-1)):1)*dt;e.y+=dy/d*e.spd*(e.boss?1+(.08*(e.phase-1)):1)*dt}
  else if(now-e.lastAttack>900+(ei*90)){e.lastAttack=now;const dmg=e.atk*(e.boss?1+.15*(e.phase-1):1)*.18;if(t.kind==='player')portalActionDamagePlayer(dmg,now);else portalActionDamageBot(t.obj,dmg)}
 });
 /* Ember hazard: deterministic periodic chip damage based on elapsed seconds. */
 if(st.portal.family==='Ember Portal'&&st.alive&&Math.floor((now-st.startTime)/3000)!==Math.floor((now-st.startTime-dt*1000)/3000))portalActionDamagePlayer(2,now);
 st.progress=Math.max(st.progress,Math.min(80,((now-st.startTime)/45000)*35));portalActionRender();portalActionRAF=requestAnimationFrame(portalActionFrame);
}
function portalActionWire(){
 if(window.KF_PORTAL_ACTION_WIRED)return;window.KF_PORTAL_ACTION_WIRED=true;
 const zone=$('portalJoyZone'),stick=$('portalJoyStick');function move(e){if(portalJoy.pointer!==e.pointerId)return;const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,mag=Math.hypot(dx,dy)||1,s=Math.min(1,max/mag),px=dx*s,py=dy*s;portalJoy.x=px/max;portalJoy.y=py/max;stick.style.transform=`translate(${px}px,${py}px)`}
 zone.addEventListener('pointerdown',e=>{portalJoy.pointer=e.pointerId;zone.setPointerCapture(e.pointerId);move(e)});zone.addEventListener('pointermove',move);const up=e=>{if(portalJoy.pointer!==e.pointerId)return;portalJoy.pointer=null;portalJoy.x=portalJoy.y=0;stick.style.transform='translate(0,0)'};zone.addEventListener('pointerup',up);zone.addEventListener('pointercancel',up);
 $('portalAttackBtn').addEventListener('click',()=>portalActionAttack('a'));$('portalSkill1Btn').addEventListener('click',()=>portalActionAttack('s1'));$('portalSkill2Btn').addEventListener('click',()=>portalActionAttack('s2'));$('portalUltBtn').addEventListener('click',()=>portalActionAttack('u'));$('portalInteractBtn').addEventListener('click',portalActionInteract);
}
function leavePortalMission(){portalActionStop();showPortalHub()}


try{getHeroUnlockState();updateHeroDiscoveryShortcut()}catch(e){console.error('Hero progression init',e)}
/* Counter: public only if strictly > 5000. Raw count never requested/displayed here. */
async function loadPublicCountFinal(){$('publicCount').classList.add('hidden');try{const r=await fetch(KF_API.config,{cache:'no-store'}),d=await r.json();const n=Number(d.public_user_count);if(Number.isFinite(n)&&n>KF_POLICY.publicCounterThreshold){$('publicCount').textContent=n.toLocaleString('id-ID')+' pengguna';$('publicCount').classList.remove('hidden')}}catch(e){}}
loadPublicCount=loadPublicCountFinal;

/* Public home compact, no standalone Reward Camera */
function enterGuestFinal(){sessionStorage.setItem('kf_guest','1');kfInstallId();kfUpdateStreak();renderProfileFinal();showOnly('home');loadPublicCountFinal()}
enterGuest=enterGuestFinal;
function showGameFinal(){showOnly('game')}
showGame=showGameFinal;

/* Report current round from result, no manual-code report flow */
function ensureReportButton(){const result=$('result');if(result&&!result.querySelector('[data-report]')){const b=document.createElement('button');b.className='btn ghost';b.dataset.report='1';b.textContent='Laporkan ronde';b.onclick=()=>{if(!kfActiveCode)return;window.kfReportCode=kfActiveCode;$('reportModal').classList.remove('hidden');kfTrack('report_open')};result.appendChild(b)}}
async function submitReportFinal(){const code=window.kfReportCode;if(!code)return closeReport();const reasonMap={'Spam / ganggu':'spam','Pelecehan':'harassment','Konten tidak pantas':'suspicious','Mencurigakan':'suspicious'};try{await fetch(KF_API.report+'/'+code,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:reasonMap[$('reportReason').value]||'other'})})}catch(e){}closeReport()}

/* Final init */
async function initFinal(){await detectDeviceRuntime();kfInstallId();renderJanjiChips();renderStyleOptionsFinal();renderAiThemesFinal();renderProfileFinal();ensureReportButton();const sp=new URLSearchParams(location.search),g=sp.get('group'),slot=sp.get('slot'),token=sp.get('token'),join=sp.get('join'),janji=sp.get('janji');if(g&&slot&&token&&/^[1-5]$/.test(slot)){enterGuestFinal();return joinGroupFromLinkFinal(g,Number(slot),token)}if(join){enterGuestFinal();return joinFromLinkFinal(join)}if(janji){enterGuestFinal();return openJanjiFromLink(janji)}showOnly('welcome')}
window.addEventListener('load',()=>{initFinal().catch(()=>showOnly('welcome'))},{once:true});
