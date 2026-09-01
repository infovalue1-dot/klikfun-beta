const MEMBER_SESSION_SECONDS=30*24*60*60;
const MEMBER_COOKIE="kf_member_session";
const USERNAME_RE=/^[a-z0-9._-]{3,24}$/;
const STATE_KEYS=new Set(["kf_kp_v2","kf_streak_v2","kf_activity_v2","kf_janji_v2","kf_reward_entitlement_v2","kf_portal_archive_v1","kf_game_inventory_v1","kf_market_listings_v1","kf_hero_progress_v2","kf_hero_unlock_v2"]);

function nowSec(){return Math.floor(Date.now()/1000)}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",...headers}})}
function token(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function sha256(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function unb64url(s){const p=String(s).replace(/-/g,"+").replace(/_/g,"/");const r=atob(p+"=".repeat((4-p.length%4)%4));return Uint8Array.from(r,c=>c.charCodeAt(0))}
function salt(){const b=new Uint8Array(16);crypto.getRandomValues(b);return b64url(b)}
async function passhash(password,s){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64url(s),iterations:210000,hash:"SHA-256"},key,256);
 return[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")
}
function safeEq(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
function username(v){return String(v||"").trim().toLowerCase()}
function display(v){v=String(v||"").trim().replace(/\s+/g," ");return v.length>=1&&v.length<=40?v:null}
function validPassword(v){return typeof v==="string"&&v.length>=10&&v.length<=128}
async function actor(request,env,scope=""){
 const ip=request.headers.get("CF-Connecting-IP")||"unknown",ua=String(request.headers.get("user-agent")||"").slice(0,160),pepper=env.RATE_SALT||"klikfun-member-rate-v1";
 return(await sha256(`${pepper}|${ip}|${ua}|${scope}`)).slice(0,40)
}
async function limit(request,env,name,max,windowSec,scope=""){
 const n=nowSec(),bucket=`${name}:${Math.floor(n/windowSec)}`,who=await actor(request,env,scope),expires=(Math.floor(n/windowSec)+1)*windowSec;
 const r=await env.DB.prepare(`SELECT count,expires_at FROM member_rate_limits WHERE bucket=? AND actor=?`).bind(bucket,who).first();
 if(r&&r.expires_at>n&&r.count>=max)return json({error:"Terlalu banyak percobaan. Coba lagi nanti."},429,{"Retry-After":String(Math.max(1,r.expires_at-n))});
 await env.DB.prepare(`INSERT INTO member_rate_limits(bucket,actor,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket,actor) DO UPDATE SET count=count+1,expires_at=excluded.expires_at`).bind(bucket,who,expires).run();
 return null
}
function sanitizeState(state){
 if(!state||typeof state!=="object"||Array.isArray(state)||state.version!==1||!state.values||typeof state.values!=="object"||Array.isArray(state.values))return null;
 const values={};for(const [key,value] of Object.entries(state.values)){if(STATE_KEYS.has(key)&&typeof value==="string"&&value.length<=40000)values[key]=value}
 return{version:1,values}
}
async function body(request,max=96*1024){
 const t=String(request.headers.get("content-type")||"").toLowerCase();
 if(!t.includes("application/json"))throw Error("Content-Type harus application/json");
 const len=Number(request.headers.get("content-length")||0);if(len&&len>max)throw Error("Payload terlalu besar");
 const s=await request.text();if(new TextEncoder().encode(s).byteLength>max)throw Error("Payload terlalu besar");
 try{return s?JSON.parse(s):{}}catch{throw Error("JSON tidak valid")}
}
function cookieRead(request,name){
 for(const p of String(request.headers.get("cookie")||"").split(";")){
  const i=p.indexOf("=");if(i>0&&p.slice(0,i).trim()===name)return decodeURIComponent(p.slice(i+1).trim())
 }return null
}
function cookieSet(v,age=MEMBER_SESSION_SECONDS){return`${MEMBER_COOKIE}=${encodeURIComponent(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`}
function cookieClear(){return`${MEMBER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
async function schema(db){
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS members(member_id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS member_sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_member_sessions_exp ON member_sessions(expires_at)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS member_state(member_id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS member_rate_limits(bucket TEXT NOT NULL,actor TEXT NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(bucket,actor))`),
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_member_rate_limits_exp ON member_rate_limits(expires_at)`)
 ])
}
async function maybeCleanup(db){const b=new Uint8Array(1);crypto.getRandomValues(b);if((b[0]&63)!==0)return;const n=nowSec();await db.batch([db.prepare(`DELETE FROM member_sessions WHERE expires_at<=?`).bind(n),db.prepare(`DELETE FROM member_rate_limits WHERE expires_at<=?`).bind(n)])}
async function session(db,memberId){
 const raw=token(),hash=await sha256(raw),n=nowSec(),exp=n+MEMBER_SESSION_SECONDS;
 await db.prepare(`INSERT INTO member_sessions(token_hash,member_id,created_at,expires_at) VALUES(?,?,?,?)`).bind(hash,memberId,n,exp).run();
 return raw
}
async function me(request,db){
 const raw=cookieRead(request,MEMBER_COOKIE);if(!raw)return null;
 const h=await sha256(raw);
 return db.prepare(`SELECT m.member_id,m.username,m.display_name,m.created_at FROM member_sessions s JOIN members m ON m.member_id=s.member_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(h,nowSec()).first()
}
function memberId(){
 const a=new Uint8Array(8);crypto.getRandomValues(a);
 return"KF-"+[...a].map(x=>x.toString(36).padStart(2,"0")).join("").toUpperCase()
}

export async function handleMember(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
 if(!path.startsWith("/api/member/"))return null;
 if(!env.DB)return json({error:"Layanan akun belum terhubung."},503);
 await schema(env.DB);
 await maybeCleanup(env.DB);
 try{
  if(path==="/api/member/register"&&method==="POST"){
   const x=await body(request,8192),u=username(x.username),d=display(x.display_name),p=x.password;
   const limited=await limit(request,env,"register",5,3600);if(limited)return limited;
   if(!USERNAME_RE.test(u))return json({error:"Username harus 3–24 karakter: huruf, angka, titik, garis bawah, atau strip."},400);
   if(!d)return json({error:"Nama tampilan tidak valid."},400);
   if(!validPassword(p))return json({error:"Kata sandi minimal 10 karakter."},400);
   if(await env.DB.prepare(`SELECT 1 ok FROM members WHERE username=? LIMIT 1`).bind(u).first())return json({error:"Username sudah digunakan."},409);
   const s=salt(),h=await passhash(p,s),recovery=token(20),rh=await sha256(recovery),id=memberId(),n=nowSec();
   try{await env.DB.prepare(`INSERT INTO members(member_id,username,display_name,password_salt,password_hash,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,u,d,s,h,rh,n,n).run()}
   catch(e){if(String(e?.message||e).toLowerCase().includes("unique"))return json({error:"Username sudah digunakan."},409);throw e}
   const st=await session(env.DB,id);
   return json({ok:true,member:{member_id:id,username:u,display_name:d},recovery_code:recovery},201,{"Set-Cookie":cookieSet(st)})
  }

  if(path==="/api/member/login"&&method==="POST"){
   const x=await body(request,8192),u=username(x.username),p=x.password;
   const limited=await limit(request,env,"login",12,600,u);if(limited)return limited;
   const r=await env.DB.prepare(`SELECT member_id,username,display_name,password_salt,password_hash FROM members WHERE username=? LIMIT 1`).bind(u).first();
   if(!r||!validPassword(p)||!safeEq(await passhash(p,r.password_salt),r.password_hash))return json({error:"Username atau kata sandi tidak cocok."},401);
   const st=await session(env.DB,r.member_id);
   return json({ok:true,member:{member_id:r.member_id,username:r.username,display_name:r.display_name}},200,{"Set-Cookie":cookieSet(st)})
  }

  if(path==="/api/member/me"&&method==="GET"){
   const m=await me(request,env.DB);return m?json({member:m}):json({error:"Belum masuk."},401)
  }

  if(path==="/api/member/logout"&&method==="POST"){
   const raw=cookieRead(request,MEMBER_COOKIE);
   if(raw)await env.DB.prepare(`DELETE FROM member_sessions WHERE token_hash=?`).bind(await sha256(raw)).run();
   return json({ok:true},200,{"Set-Cookie":cookieClear()})
  }

  if(path==="/api/member/recover"&&method==="POST"){
   const x=await body(request,8192),u=username(x.username),rc=String(x.recovery_code||""),p=x.new_password;
   const limited=await limit(request,env,"recover",5,3600,u);if(limited)return limited;
   if(!USERNAME_RE.test(u)||rc.length<16||!validPassword(p))return json({error:"Data pemulihan tidak valid."},400);
   const r=await env.DB.prepare(`SELECT member_id,recovery_hash FROM members WHERE username=? LIMIT 1`).bind(u).first();
   if(!r||!safeEq(await sha256(rc),r.recovery_hash))return json({error:"Kode pemulihan tidak cocok."},403);
   const s=salt(),h=await passhash(p,s),next=token(20),rh=await sha256(next),n=nowSec();
   await env.DB.batch([
    env.DB.prepare(`UPDATE members SET password_salt=?,password_hash=?,recovery_hash=?,updated_at=? WHERE member_id=?`).bind(s,h,rh,n,r.member_id),
    env.DB.prepare(`DELETE FROM member_sessions WHERE member_id=?`).bind(r.member_id)
   ]);
   const st=await session(env.DB,r.member_id);
   return json({ok:true,recovery_code:next},200,{"Set-Cookie":cookieSet(st)})
  }

  if(path==="/api/member/state"&&method==="GET"){
   const m=await me(request,env.DB);if(!m)return json({error:"Belum masuk."},401);
   const r=await env.DB.prepare(`SELECT state,updated_at FROM member_state WHERE member_id=? LIMIT 1`).bind(m.member_id).first();
   return json({state:r?JSON.parse(r.state):null,updated_at:r?.updated_at||null})
  }

  if(path==="/api/member/state"&&method==="PUT"){
   const m=await me(request,env.DB);if(!m)return json({error:"Belum masuk."},401);
   const limited=await limit(request,env,"state_write",120,3600,m.member_id);if(limited)return limited;
   const x=await body(request),state=sanitizeState(x.state);
   if(!state)return json({error:"Data progres tidak valid."},400);
   const s=JSON.stringify(state);if(new TextEncoder().encode(s).byteLength>80*1024)return json({error:"State terlalu besar."},413);
   const n=nowSec();
   await env.DB.prepare(`INSERT INTO member_state(member_id,state,updated_at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at`).bind(m.member_id,s,n).run();
   return json({ok:true,updated_at:n})
  }

  return json({error:"Rute Member tidak ditemukan."},404)
 }catch(e){
  console.error("Member API error",e);
  const msg=String(e?.message||"");
  if(["Content-Type harus application/json","Payload terlalu besar","JSON tidak valid"].includes(msg))return json({error:msg},400);
  return json({error:"Terjadi gangguan pada layanan akun."},500)
 }
}
