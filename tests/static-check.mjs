import {execFileSync} from "node:child_process";
import {readFileSync,existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(resolve(root,file),"utf8");
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const activeScripts=[
  "klikfun-db.js","klikfun-extra.js","klikfun-heroes-v12.js",
  "klikfun-skills-artifacts-v12.js","klikfun-core-v15.js",
  "klikfun-member.js","klikfun-game-v12.js","klikfun-reward.js"
];
const checkedScripts=[...activeScripts,"klikfun-member-api.js","_worker.js","sw.js"];

for(const file of checkedScripts){
  assert(existsSync(resolve(root,file)),`File JavaScript tidak ada: ${file}`);
  execFileSync(process.execPath,["--check",resolve(root,file)],{stdio:"pipe"});
}

const html=read("index.html");
const scriptRefs=[...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/gi)].map(x=>x[1].replace(/^\.\//,""));
assert(JSON.stringify(scriptRefs)===JSON.stringify(activeScripts),`Urutan script aktif berubah: ${scriptRefs.join(", ")}`);
assert(!html.includes("klikfun-core-v13.js"),"Core legacy termuat oleh index.html");
assert(!html.includes("index-fixed-loading.html"),"Halaman legacy direferensikan index.html");

const ids=[...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(x=>x[1]);
const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
assert(duplicateIds.length===0,`ID HTML duplikat: ${duplicateIds.join(", ")}`);

const assets=[...scriptRefs,...[...html.matchAll(/<link\s+[^>]*href=["']([^"']+)["']/gi)].map(x=>x[1])];
for(const asset of assets){
  if(/^https?:/i.test(asset))continue;
  assert(existsSync(resolve(root,asset.replace(/^\.\//,"").replace(/^\//,""))),`Aset tidak ada: ${asset}`);
}

const browserCode=activeScripts.slice(4).map(read).join("\n");
const functions=new Set([
  ...[...browserCode.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]),
  ...[...browserCode.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(x=>x[1])
]);
const handlers=[...html.matchAll(/\s(?:onclick|onchange)=["']([^"']+)["']/gi)].map(x=>x[1]);
const handlerCalls=new Set(handlers.flatMap(value=>[...value.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1])));
const missingHandlers=[...handlerCalls].filter(name=>!functions.has(name));
assert(missingHandlers.length===0,`Handler tanpa fungsi: ${missingHandlers.join(", ")}`);

const sections=[...html.matchAll(/<section\s+[^>]*id=["']([^"']+)["']/gi)].map(x=>x[1]);
const core=read("klikfun-core-v15.js");
const sectionDeclaration=core.match(/const ALL_SECTIONS=\[(.*?)\];/s);
assert(sectionDeclaration,"ALL_SECTIONS tidak ditemukan");
const declaredSections=[...sectionDeclaration[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
assert(sections.length===declaredSections.length&&sections.every(id=>declaredSections.includes(id)),"Daftar layar tidak sama dengan section HTML");

for(const forbidden of ["OWNER_KEY_HASH","KF_OWNER","installHiddenTrigger","kf_owner_reward"]){
  assert(!browserCode.includes(forbidden),`Akses owner bocor ke browser: ${forbidden}`);
}
for(const forbidden of ["Segera tersedia","Database belum terhubung","D1 binding","debug_code","debug_type","Endpoint tidak ditemukan","Bot Hero"]){
  assert(![html,core,read("klikfun-member.js"),read("klikfun-game-v12.js"),read("klikfun-reward.js"),read("_worker.js")].join("\n").includes(forbidden),`Bahasa internal/palsu ditemukan: ${forbidden}`);
}

const memberApi=read("klikfun-member-api.js"),memberUi=read("klikfun-member.js");
for(const route of ["register","login","me","logout","recover","state"]){
  assert(memberApi.includes(`/api/member/${route}`)&&memberUi.includes(`/api/member/${route}`),`Kontrak member tidak lengkap: ${route}`);
}
for(const marker of ["x-klikfun-admin-key","x-klikfun-participant-token","await db.batch(statements)"]){
  assert(read("_worker.js").includes(marker),`Pengamanan grup hilang: ${marker}`);
}
for(const marker of ["rewardGrantStore","updateRewardEntitlement","clearRewardMedia","f.size>8*1024*1024"]){
  assert(core.includes(marker),`Lifecycle Reward hilang: ${marker}`);
}

const manifest=JSON.parse(read("manifest.webmanifest"));
assert(manifest.display==="standalone"&&manifest.start_url==="/","Manifest aplikasi tidak valid");
for(const icon of manifest.icons||[])assert(existsSync(resolve(root,String(icon.src).replace(/^\//,""))),`Ikon manifest tidak ada: ${icon.src}`);
JSON.parse(read("_routes.json"));

console.log(`STATIC_CHECK_OK scripts=${checkedScripts.length} sections=${sections.length} handlers=${handlers.length} assets=${assets.length}`);
