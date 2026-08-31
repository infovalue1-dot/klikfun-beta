import { handleMember } from "./klikfun-member-api.js";
const SESSION_TTL_SECONDS = 48 * 60 * 60;
const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const ALLOWED_REPORT_REASONS = new Set(["spam","harassment","suspicious","other"]);
const ALLOWED_EVENTS = new Set([
  "consent_ok","friend_started","became_next","ayo_open","plan_created","plan_done",
  "report_open","invite_shared","invite_copied","reward_fixed","reward_downloaded","group_started"
]);
let schemaReady=null;
function securityHeaders(){return{"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(self), microphone=(), geolocation=(), payment=(), usb=()","Strict-Transport-Security":"max-age=31536000; includeSubDomains","Content-Security-Policy":"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"}}
function json(data,status=200,extraHeaders={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...securityHeaders(),...extraHeaders}})}
function nowSec(){return Math.floor(Date.now()/1000)}
function randomCode(length=6){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);let out="";for(const b of bytes)out+=CODE_ALPHABET[b%CODE_ALPHABET.length];return out}
function randomToken(bytesLength=24){const bytes=new Uint8Array(bytesLength);crypto.getRandomValues(bytes);let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function sha256Hex(value){const data=new TextEncoder().encode(value),digest=await crypto.subtle.digest("SHA-256",data);return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function safeCode(value){const c=String(value||"").trim().toUpperCase();return CODE_RE.test(c)?c:null}
function isIntArray7(arr){return Array.isArray(arr)&&arr.length===7&&arr.every(Number.isInteger)}
function normalizeText(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/(.)\1{3,}/g,"$1$1").replace(/[._*~-]+/g," ").replace(/\s+/g," ").trim()}
const BLOCK_PATTERNS=[/\b(porno|pornografi|bokep|ngentot|ngewe|kontol|memek)\b/i,/\b(perkosa|memperkosa|bunuh\s+dia|membunuh\s+dia)\b/i,/\b(goblok|tolol|bangsat)\b/i];
const BODY_SHAME_PATTERNS=[/\b(gendut\s+banget|kurus\s+banget|jelek\s+banget|badan\s+.*jelek)\b/i];
function unsafeText(value){const t=normalizeText(value);if(!t)return false;return BLOCK_PATTERNS.some(r=>r.test(t))||BODY_SHAME_PATTERNS.some(r=>r.test(t))}
function validateQuestions(qs){if(!Array.isArray(qs)||qs.length!==7)return false;return qs.every(q=>q&&typeof q==="object"&&typeof q.q==="string"&&q.q.length>=2&&q.q.length<=260&&Array.isArray(q.o)&&q.o.length===4&&!unsafeText(q.q)&&q.o.every(opt=>typeof opt==="string"&&opt.length>=1&&opt.length<=160&&!unsafeText(opt)))}
function validateAnswers(qs,answers){return isIntArray7(answers)&&answers.every((a,i)=>a>=0&&a<qs[i].o.length)}
async function readJson(request,maxBytes=32*1024){const type=String(request.headers.get("content-type")||"").toLowerCase();if(!type.includes("application/json"))throw new Error("Content-Type harus application/json");const len=Number(request.headers.get("content-length")||0);if(len&&len>maxBytes)throw new Error("Payload terlalu besar");const text=await request.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw new Error("Payload terlalu besar");if(!text)return{};try{return JSON.parse(text)}catch{throw new Error("JSON tidak valid")}}
async function ensureSchema(db){if(!schemaReady){schemaReady=db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS sessions (code TEXT PRIMARY KEY,questions TEXT NOT NULL,answers TEXT NOT NULL,parent_code TEXT,delete_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL,reason TEXT NOT NULL,reporter_key TEXT,created_at INTEGER NOT NULL)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_reports_code ON reports(code)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT NOT NULL,code TEXT,parent_code TEXT,meta TEXT,created_at INTEGER NOT NULL)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT NOT NULL,actor TEXT NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(bucket,actor))`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS groups (code TEXT PRIMARY KEY,size INTEGER NOT NULL,admin_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_groups_expires ON groups(expires_at)`),
 db.prepare(`CREATE TABLE IF NOT EXISTS group_participants (group_code TEXT NOT NULL,slot INTEGER NOT NULL,token_hash TEXT NOT NULL,questions TEXT NOT NULL,answers TEXT,status TEXT NOT NULL DEFAULT 'waiting',completed_at INTEGER,PRIMARY KEY(group_code,slot))`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(group_code)`)
]).catch(err=>{schemaReady=null;throw err})}return schemaReady}
async function cleanup(db){const now=nowSec(),cutoff=now-RETENTION_SECONDS;await db.batch([db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now),db.prepare(`DELETE FROM events WHERE created_at < ?`).bind(cutoff),db.prepare(`DELETE FROM reports WHERE created_at < ?`).bind(cutoff),db.prepare(`DELETE FROM rate_limits WHERE expires_at <= ?`).bind(now),db.prepare(`DELETE FROM group_participants WHERE group_code IN (SELECT code FROM groups WHERE expires_at <= ? OR status != 'active')`).bind(now),db.prepare(`DELETE FROM groups WHERE expires_at <= ? OR status != 'active'`).bind(now)])}
function maybeCleanup(db){const b=new Uint8Array(1);crypto.getRandomValues(b);return((b[0]&63)===0)?cleanup(db).catch(()=>{}):Promise.resolve()}
async function actorKey(request,env){const ip=request.headers.get("CF-Connecting-IP")||"unknown",salt=env.RATE_SALT||"klikfun-rate-v1",ua=String(request.headers.get("user-agent")||"").slice(0,180);return(await sha256Hex(`${salt}|${ip}|${ua}`)).slice(0,32)}
async function rateLimit(request,env,db,name,limit,windowSec){const actor=await actorKey(request,env),now=nowSec(),bucket=`${name}:${Math.floor(now/windowSec)}`;const row=await db.prepare(`SELECT count,expires_at FROM rate_limits WHERE bucket=? AND actor=?`).bind(bucket,actor).first();if(row&&row.expires_at>now&&row.count>=limit)return json({error:"Terlalu banyak percobaan. Coba lagi sebentar."},429,{"Retry-After":String(Math.max(1,row.expires_at-now))});const expires=(Math.floor(now/windowSec)+1)*windowSec;await db.prepare(`INSERT INTO rate_limits(bucket,actor,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket,actor) DO UPDATE SET count=count+1,expires_at=excluded.expires_at`).bind(bucket,actor,expires).run();return null}
function sanitizeMeta(meta){if(!meta||typeof meta!=="object"||Array.isArray(meta))return{};const allowed=new Set(["channel","theme","source","mode"]),out={};for(const[k,v]of Object.entries(meta)){if(!allowed.has(k))continue;if(typeof v==="string")out[k]=v.slice(0,80);else if(typeof v==="number"&&Number.isFinite(v))out[k]=v;else if(typeof v==="boolean")out[k]=v}return out}
function constantTimeEqualHex(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function createSession(request,env,db){const limited=await rateLimit(request,env,db,"create_session",10,600);if(limited)return limited;const body=await readJson(request),questions=body.questions,answers=body.answers;if(body.consent!==true)return json({error:"Persetujuan diperlukan"},400);if(!validateQuestions(questions))return json({error:"Pertanyaan ronde tidak valid"},400);if(!validateAnswers(questions,answers))return json({error:"Jawaban ronde tidak valid"},400);const parentCode=body.parent_code?safeCode(body.parent_code):null,deleteKey=randomToken(),deleteHash=await sha256Hex(deleteKey),created=nowSec(),expires=created+SESSION_TTL_SECONDS;await maybeCleanup(db);for(let attempt=0;attempt<12;attempt++){const code=randomCode();try{await db.prepare(`INSERT INTO sessions(code,questions,answers,parent_code,delete_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,'active',?,?)`).bind(code,JSON.stringify(questions),JSON.stringify(answers),parentCode,deleteHash,created,expires).run();return json({code,delete_key:deleteKey,expires_at:expires,expires_in_seconds:SESSION_TTL_SECONDS},201)}catch(e){if(!String(e?.message||e).toLowerCase().includes("unique"))throw e}}return json({error:"Gagal membuat kode unik. Coba lagi."},503)}
async function getSession(request,env,code,db){const limited=await rateLimit(request,env,db,"get_session",60,600);if(limited)return limited;const row=await db.prepare(`SELECT code,questions,parent_code,created_at,expires_at FROM sessions WHERE code=? AND status='active' AND expires_at>?`).bind(code,nowSec()).first();if(!row)return json({error:"Kode tidak ditemukan atau sudah kedaluwarsa"},404);return json({code:row.code,questions:JSON.parse(row.questions),parent_code:row.parent_code||null,created_at:row.created_at,expires_at:row.expires_at})}
async function submitGuess(request,env,code,db){const limited=await rateLimit(request,env,db,"guess",60,600);if(limited)return limited;const body=await readJson(request,8192),guesses=body.guesses;if(!isIntArray7(guesses))return json({error:"Tebakan harus berisi 7 jawaban"},400);const row=await db.prepare(`SELECT questions,answers FROM sessions WHERE code=? AND status='active' AND expires_at>?`).bind(code,nowSec()).first();if(!row)return json({error:"Ronde tidak ditemukan atau sudah kedaluwarsa"},404);const questions=JSON.parse(row.questions),answers=JSON.parse(row.answers);if(!validateAnswers(questions,guesses))return json({error:"Format tebakan tidak valid"},400);let score=0;const misses=[];for(let i=0;i<7;i++){if(guesses[i]===answers[i])score++;else misses.push(i)}return json({score,misses})}
async function deleteSession(request,env,code,db){const limited=await rateLimit(request,env,db,"delete",12,3600);if(limited)return limited;const body=await readJson(request,4096),key=String(body.delete_key||"");if(!key||key.length>128)return json({error:"Kunci hapus diperlukan"},400);const row=await db.prepare(`SELECT delete_hash,status FROM sessions WHERE code=?`).bind(code).first();if(!row||row.status!=="active")return json({error:"Ronde tidak ditemukan"},404);if(!constantTimeEqualHex(await sha256Hex(key),row.delete_hash))return json({error:"Kunci hapus tidak cocok"},403);await db.prepare(`UPDATE sessions SET status='deleted',questions='[]',answers='[]',expires_at=? WHERE code=?`).bind(nowSec(),code).run();return json({ok:true})}
async function submitReport(request,env,code,db){const limited=await rateLimit(request,env,db,"report",5,3600);if(limited)return limited;const body=await readJson(request,4096),reason=String(body.reason||"");if(!ALLOWED_REPORT_REASONS.has(reason))return json({error:"Alasan laporan tidak valid"},400);const exists=await db.prepare(`SELECT 1 AS ok FROM sessions WHERE code=? LIMIT 1`).bind(code).first();if(!exists)return json({error:"Ronde tidak ditemukan"},404);const reporter=await actorKey(request,env),recent=await db.prepare(`SELECT 1 AS ok FROM reports WHERE code=? AND reporter_key=? AND created_at>? LIMIT 1`).bind(code,reporter,nowSec()-86400).first();if(recent)return json({ok:true});await db.prepare(`INSERT INTO reports(code,reason,reporter_key,created_at) VALUES(?,?,?,?)`).bind(code,reason,reporter,nowSec()).run();return json({ok:true},201)}
async function submitEvent(request,env,db){const limited=await rateLimit(request,env,db,"event",120,600);if(limited)return limited;const body=await readJson(request,4096),event=String(body.event||"");if(!ALLOWED_EVENTS.has(event))return json({error:"Event tidak diizinkan"},400);const code=body.code?safeCode(body.code):null,parentCode=body.parent_code?safeCode(body.parent_code):null;await db.prepare(`INSERT INTO events(event,code,parent_code,meta,created_at) VALUES(?,?,?,?,?)`).bind(event,code,parentCode,JSON.stringify(sanitizeMeta(body.meta)),nowSec()).run();return json({ok:true},201)}
async function createGroup(request,env,db){const limited=await rateLimit(request,env,db,"create_group",6,600);if(limited)return limited;const body=await readJson(request,64*1024),size=Number(body.size),assignments=body.assignments;if(body.consent!==true)return json({error:"Persetujuan diperlukan"},400);if(!Number.isInteger(size)||size<2||size>5)return json({error:"Grup harus 2–5 orang"},400);if(!Array.isArray(assignments)||assignments.length!==size||!assignments.every(validateQuestions))return json({error:"Pertanyaan grup tidak valid"},400);const all=assignments.flat().map(q=>normalizeText(q.q));if(new Set(all).size!==all.length)return json({error:"Pertanyaan antar peserta harus berbeda"},400);const adminKey=randomToken(),adminHash=await sha256Hex(adminKey),created=nowSec(),expires=created+SESSION_TTL_SECONDS;await maybeCleanup(db);for(let attempt=0;attempt<12;attempt++){const code=randomCode();try{await db.prepare(`INSERT INTO groups(code,size,admin_hash,status,created_at,expires_at) VALUES(?,?,?,'active',?,?)`).bind(code,size,adminHash,created,expires).run();const participants=[];for(let slot=1;slot<=size;slot++){const token=randomToken(),tokenHash=await sha256Hex(token);await db.prepare(`INSERT INTO group_participants(group_code,slot,token_hash,questions,answers,status) VALUES(?,?,?,?,NULL,'waiting')`).bind(code,slot,tokenHash,JSON.stringify(assignments[slot-1])).run();participants.push({slot,token,completed:false})}return json({code,admin_key:adminKey,participants,expires_at:expires},201)}catch(e){if(!String(e?.message||e).toLowerCase().includes("unique"))throw e}}return json({error:"Gagal membuat grup. Coba lagi."},503)}
async function getGroupAdmin(request,env,code,db){const limited=await rateLimit(request,env,db,"group_status",90,600);if(limited)return limited;const url=new URL(request.url),key=String(url.searchParams.get("admin_key")||"");if(!TOKEN_RE.test(key))return json({error:"Kunci grup tidak valid"},403);const g=await db.prepare(`SELECT size,admin_hash,expires_at FROM groups WHERE code=? AND status='active' AND expires_at>?`).bind(code,nowSec()).first();if(!g)return json({error:"Grup tidak ditemukan atau sudah kedaluwarsa"},404);if(!constantTimeEqualHex(await sha256Hex(key),g.admin_hash))return json({error:"Kunci grup tidak cocok"},403);const rows=await db.prepare(`SELECT slot,status,completed_at FROM group_participants WHERE group_code=? ORDER BY slot`).bind(code).all();return json({code,size:g.size,expires_at:g.expires_at,participants:(rows.results||[]).map(r=>({slot:r.slot,completed:r.status==="completed",completed_at:r.completed_at||null}))})}
async function getGroupParticipant(request,env,code,slot,db){const limited=await rateLimit(request,env,db,"group_join",90,600);if(limited)return limited;const token=String(new URL(request.url).searchParams.get("token")||"");if(!TOKEN_RE.test(token))return json({error:"Undangan grup tidak valid"},403);const g=await db.prepare(`SELECT size,expires_at FROM groups WHERE code=? AND status='active' AND expires_at>?`).bind(code,nowSec()).first();if(!g)return json({error:"Grup tidak ditemukan atau sudah kedaluwarsa"},404);const p=await db.prepare(`SELECT token_hash,questions,status FROM group_participants WHERE group_code=? AND slot=?`).bind(code,slot).first();if(!p||!constantTimeEqualHex(await sha256Hex(token),p.token_hash))return json({error:"Undangan peserta tidak valid"},403);return json({code,slot,size:g.size,questions:JSON.parse(p.questions),completed:p.status==="completed",expires_at:g.expires_at})}
async function submitGroupParticipant(request,env,code,slot,db){const limited=await rateLimit(request,env,db,"group_submit",30,600);if(limited)return limited;const body=await readJson(request,8192),token=String(body.token||""),answers=body.answers;if(!TOKEN_RE.test(token))return json({error:"Token peserta tidak valid"},403);const g=await db.prepare(`SELECT size FROM groups WHERE code=? AND status='active' AND expires_at>?`).bind(code,nowSec()).first();if(!g)return json({error:"Grup tidak ditemukan atau sudah kedaluwarsa"},404);const p=await db.prepare(`SELECT token_hash,questions,status FROM group_participants WHERE group_code=? AND slot=?`).bind(code,slot).first();if(!p||!constantTimeEqualHex(await sha256Hex(token),p.token_hash))return json({error:"Token peserta tidak cocok"},403);if(p.status==="completed"){const c=await db.prepare(`SELECT COUNT(*) AS n FROM group_participants WHERE group_code=? AND status='completed'`).bind(code).first();return json({ok:true,completed_count:Number(c.n||0),size:g.size})}const qs=JSON.parse(p.questions);if(!validateAnswers(qs,answers))return json({error:"Jawaban grup tidak valid"},400);await db.prepare(`UPDATE group_participants SET answers=?,status='completed',completed_at=? WHERE group_code=? AND slot=? AND status='waiting'`).bind(JSON.stringify(answers),nowSec(),code,slot).run();const c=await db.prepare(`SELECT COUNT(*) AS n FROM group_participants WHERE group_code=? AND status='completed'`).bind(code).first();return json({ok:true,completed_count:Number(c.n||0),size:g.size})}
async function rewardAI(request,env,db){
  if(!env.AI){
    return json({error:"Workers AI belum terhubung. Binding harus bernama AI."},503);
  }

  const limited=await rateLimit(request,env,db,"reward_ai",10,3600);
  if(limited)return limited;

  const type=String(request.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("multipart/form-data")){
    return json({error:"Foto harus dikirim sebagai multipart/form-data"},400);
  }

  const form=await request.formData();
  const image=form.get("image");
  const theme=String(form.get("theme")||"cinematic").toLowerCase().slice(0,30);
  const subtheme=String(form.get("subtheme")||"").slice(0,80);
  const mode=String(form.get("mode")||"solo")==="group"?"group":"solo";

  if(!(image instanceof File)){
    return json({error:"Foto tidak ditemukan"},400);
  }

  if(image.size>2*1024*1024){
    return json({error:"Ukuran foto terlalu besar"},413);
  }

  const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);
  if(!allowedTypes.has(image.type)){
    return json({error:"Format foto harus JPG, PNG, atau WEBP"},400);
  }

  const prompts={
    pusing:
      "Transform the people in the reference image into a funny dizzy character scene, exaggerated confused expression, playful swirling visual elements, polished portrait photography.",
    cemberut:
      "Transform the people in the reference image into a humorous dramatic sulking character, expressive face, playful cinematic scene.",
    wibawa:
      "Transform the people in the reference image into a confident distinguished character portrait, authoritative expression, elegant clothing, premium cinematic lighting.",
    executive:
      "Transform the people in the reference image into stylish senior executives, sophisticated business wardrobe, premium office atmosphere, cinematic portrait.",
    gothic:
      "Transform the people in the reference image into elegant gothic characters, dramatic dark wardrobe, mysterious atmospheric scene, cinematic lighting.",
    komedi:
      "Transform the people in the reference image into funny comedy characters, expressive faces, playful costumes and props, polished humorous scene.",
    misterius:
      "Transform the people in the reference image into mysterious cinematic characters, dramatic shadows, subtle fog, intriguing expression and atmosphere.",
    royal:
      "Transform the people in the reference image into elegant royal characters, luxurious ceremonial clothing, palace-inspired setting, cinematic portrait.",
    retro:
      "Transform the people in the reference image into stylish retro characters, authentic vintage wardrobe and environment, polished period photography.",
    cinematic:
      "Transform the people in the reference image into dramatic movie characters, cinematic wardrobe, expressive face, film-quality lighting and environment."
  };

  const basePrompt=prompts[theme]||prompts.cinematic;

  const identityRule=mode==="group"
    ?"Preserve every person's recognizable facial identity, approximate age, skin tone, and position. Keep all people visible."
    :"Preserve the person's recognizable facial identity, approximate age, skin tone, and key facial features.";

  const safeVariation=String(subtheme||"").split(";")[0].slice(0,80);

const cartoonMode=theme==="cartoon";

const finalPrompt=
  identityRule+
  (
    cartoonMode
      ?" Create a family-friendly illustrated transformation based on the reference photo. "
      :" Edit the reference photo as a photorealistic photograph. Keep the same real person and the same recognizable face. Do not turn the person into a cartoon, anime, illustration, painting, drawing, 3D character, or avatar. "
  )+
  (safeVariation?`Theme: ${safeVariation}. `:"")+
  "Apply the selected theme to clothing, setting, atmosphere, and appropriate accessories while preserving the person's facial identity. "+
  "For sport themes, show a realistic athlete appropriate to the selected sport. "+
  "Keep clothing modest and age-appropriate. Preserve head coverings exactly when present. "+
  "Do not add text, logos, trademarks, watermarks, extra people, duplicate faces, or distorted hands.";
  const aiForm=new FormData();
  aiForm.append("input_image_0",image,image.name||"klikfun.jpg");
  aiForm.append("prompt",finalPrompt);
  aiForm.append("width","512");
  aiForm.append("height","512");

  const serialized=new Response(aiForm);
  const result=await env.AI.run(
    "@cf/black-forest-labs/flux-2-klein-4b",
    {
      multipart:{
        body:serialized.body,
        contentType:serialized.headers.get("content-type")
      }
    }
  );

  if(!result||!result.image){
    console.error("Reward AI invalid result",result);
    return json({error:"AI belum berhasil membuat gambar. Coba lagi."},502);
  }

  const binary=atob(result.image);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);

  return new Response(bytes,{
    status:200,
    headers:{
      "Content-Type":"image/png",
      "Cache-Control":"no-store",
      ...securityHeaders()
    }
  });
  }

async function api(request,env){const memberResponse=await handleMember(request,env);
if(memberResponse)return memberResponse;if(!env.DB)return json({error:"Database belum terhubung. Tambahkan D1 binding dengan nama DB pada project Cloudflare Pages."},503);await ensureSchema(env.DB);const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
                                if(path==="/api/reward-ai"&&method==="POST")return rewardAI(request,env,env.DB);
                                if(path==="/api/config"&&method==="GET")return json({session_ttl_hours:48,telemetry_retention_days:30,max_group_people:5,public_reward_themes:10,photo_ttl_hours:5,group_sync:true});if(path==="/api/session"&&method==="POST")return createSession(request,env,env.DB);if(path==="/api/group"&&method==="POST")return createGroup(request,env,env.DB);let m=path.match(/^\/api\/group\/([A-Z2-9]{6})$/i);if(m&&method==="GET"){const c=safeCode(m[1]);return c?getGroupAdmin(request,env,c,env.DB):json({error:"Kode tidak valid"},400)}m=path.match(/^\/api\/group\/([A-Z2-9]{6})\/participant\/([1-5])$/i);if(m&&method==="GET"){const c=safeCode(m[1]);return c?getGroupParticipant(request,env,c,Number(m[2]),env.DB):json({error:"Kode tidak valid"},400)}if(m&&method==="POST"){const c=safeCode(m[1]);return c?submitGroupParticipant(request,env,c,Number(m[2]),env.DB):json({error:"Kode tidak valid"},400)}m=path.match(/^\/api\/session\/([A-Z2-9]{6})$/i);if(m&&method==="GET"){const c=safeCode(m[1]);return c?getSession(request,env,c,env.DB):json({error:"Kode tidak valid"},400)}m=path.match(/^\/api\/session\/([A-Z2-9]{6})\/delete$/i);if(m&&method==="POST"){const c=safeCode(m[1]);return c?deleteSession(request,env,c,env.DB):json({error:"Kode tidak valid"},400)}m=path.match(/^\/api\/guess\/([A-Z2-9]{6})$/i);if(m&&method==="POST"){const c=safeCode(m[1]);return c?submitGuess(request,env,c,env.DB):json({error:"Kode tidak valid"},400)}m=path.match(/^\/api\/report\/([A-Z2-9]{6})$/i);if(m&&method==="POST"){const c=safeCode(m[1]);return c?submitReport(request,env,c,env.DB):json({error:"Kode tidak valid"},400)}if(path==="/api/event"&&method==="POST")return submitEvent(request,env,env.DB);if(path.startsWith("/api/"))return json({error:"Endpoint tidak ditemukan"},404);return null}
function withSecurityHeaders(response){const headers=new Headers(response.headers);for(const[k,v]of Object.entries(securityHeaders()))headers.set(k,v);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(request,env){try{const url=new URL(request.url);if(url.pathname.startsWith("/api/")){const response=await api(request,env);if(response)return response}const assetResponse=await env.ASSETS.fetch(request);return withSecurityHeaders(assetResponse)}catch(e){
  if(new URL(request.url).pathname==="/api/reward-ai"){return json({error:"AI ERROR: "+String(e?.message||e)},500);}
  console.error("Klikfun worker error",e);const msg=String(e?.message||"");if(msg==="Payload terlalu besar"||msg==="JSON tidak valid"||msg==="Content-Type harus application/json")return json({error:msg},400);return json({error:"Terjadi gangguan server. Coba lagi."},500)}}};
