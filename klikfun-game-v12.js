/* Klikfun GAME v12 — balanced 25-Hero role roster + Hero Visual + Full Skill Effect Engine
   Loaded after the v9 inline runtime and intentionally overrides combat/render helpers.
*/
(()=>{
'use strict';

const now=()=>performance.now();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0));
const live=(x)=>x && x.alive!==false && (x.hp==null || x.hp>0);

const HERO_VISUAL_SPEC={
 'iron-vanguard':['IV','vanguard','shield','Kinetic Armor'],
 'lumen-weaver':['LW','lumen','orb','Photonic Weaving'],
 'astral-fold':['AF','space','rings','Spatial Folding'],
 'null-hexer':['NH','void','hex','Null Energy'],
 'gate-runner':['GR','portal','gate','Micro Portals'],
 'gear-strider':['GS','mecha','visor','Modular Exosuit'],
 'wyrm-breaker':['WB','hunter','spear','Colossus Hunter'],
 'umbra-marshal':['UM','shadow','crown','Echo Legion'],
 'storm-circuit':['SC','storm','bolt','Electro Field'],
 'frost-thread':['FT','frost','crystal','Cryo Weaving'],
 'rune-forge':['RF','rune','blade','Combat Runes'],
 'phase-stalker':['PS','phase','daggers','Density Shift'],
 'crystal-bastion':['CB','crystal','tower','Prismatic Armor'],
 'wild-form':['WF','wild','claw','Adaptive Morph'],
 'gravity-hand':['GH','gravity','orbit','Mass Control'],
 'chrona-skip':['CS','time','clock','Temporal Windows'],
 'aero-rider':['AR','sky','wing','Glide Harness'],
 'beast-conductor':['BC','beast','fang','Bonded Creatures'],
 'drone-architect':['DA','tech','drone','Autonomous Drones'],
 'sonic-weaver':['SW','sonic','wave','Resonance Control'],
 'magnet-archer':['MA','magnet','bow','Magnetic Projectiles'],
 'bio-crest':['BCr','bio','crest','Adaptive Bio Armor'],
 'sun-mender':['SM','solar','cross','Solar Medicine'],
 'portal-scout':['PoS','portalhunter','compass','Portal Resonance'],
 'barrier-scribe':['BS','barrier','glyph','Geometric Barriers']
};

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function heroVisualSvg(hero,size='card'){
 const spec=HERO_VISUAL_SPEC[hero.id]||[hero.name.slice(0,2),'hero','core',hero.archetype];
 const [monogram,theme,sigil]=spec;
 const glyphs={
  shield:'M20 14 L32 9 L44 14 V29 C44 39 38 46 32 50 C26 46 20 39 20 29Z',
  orb:'M32 12 A20 20 0 1 0 32.1 12',
  rings:'M12 32 A20 8 0 1 0 52 32 A20 8 0 1 0 12 32 M32 8 V56',
  hex:'M32 9 L49 19 V45 L32 55 L15 45 V19Z',
  gate:'M17 52 V25 C17 12 47 12 47 25 V52 M24 52 V28 C24 21 40 21 40 28 V52',
  visor:'M15 23 L49 20 L44 34 L20 35Z M18 39 L46 39',
  spear:'M14 51 L47 13 M40 12 L50 10 L47 20',
  crown:'M14 44 L18 20 L28 31 L32 15 L37 31 L48 20 L51 44Z',
  bolt:'M36 8 L19 35 H30 L26 56 L47 27 H36Z',
  crystal:'M32 7 L48 26 L40 53 H24 L16 26Z',
  blade:'M16 48 L42 12 L48 16 L24 52Z M14 50 L26 54',
  daggers:'M17 49 L31 17 M47 49 L33 17',
  tower:'M18 52 V18 L25 12 H39 L46 18 V52 M24 29 H40',
  claw:'M16 48 C21 34 22 24 19 13 M29 50 C33 35 34 24 31 11 M42 48 C45 34 46 25 44 15',
  orbit:'M13 32 C13 18 51 18 51 32 C51 46 13 46 13 32 M32 10 V54',
  clock:'M32 11 A21 21 0 1 0 32 53 A21 21 0 1 0 32 11 M32 32 L32 19 M32 32 L43 38',
  wing:'M31 36 C20 20 13 17 9 17 C13 29 18 39 31 45 M33 36 C44 20 51 17 55 17 C51 29 46 39 33 45',
  fang:'M18 12 C21 27 24 38 31 51 C38 38 42 27 46 12 C39 17 34 18 31 27 C28 18 23 17 18 12',
  drone:'M13 28 H51 V40 H13Z M20 24 V15 M44 24 V15 M9 34 H3 M55 34 H61',
  wave:'M8 35 C14 18 20 52 26 35 C32 18 38 52 44 35 C50 18 56 52 60 35',
  bow:'M20 11 C45 20 45 44 20 53 M20 11 L44 32 L20 53 M44 32 H55',
  crest:'M12 42 C20 17 29 15 32 6 C35 15 44 17 52 42 C43 36 38 39 32 55 C26 39 21 36 12 42',
  cross:'M27 11 H37 V27 H53 V37 H37 V53 H27 V37 H11 V27 H27Z',
  compass:'M32 8 L40 27 L56 32 L40 37 L32 56 L24 37 L8 32 L24 27Z',
  glyph:'M13 17 H51 V47 H13Z M21 25 H43 V39 H21Z M32 9 V55'
 };
 const path=glyphs[sigil]||glyphs.orb;
 const role=esc(hero.role),sub=esc(hero.subrole);
 return `<svg class="kf-hero-art kf-theme-${theme} kf-size-${size}" viewBox="0 0 120 150" role="img" aria-label="${esc(hero.name)}">
  <defs>
   <linearGradient id="g-${hero.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity=".03"/></linearGradient>
  </defs>
  <rect x="2" y="2" width="116" height="146" rx="20" fill="url(#g-${hero.id})" stroke="currentColor" stroke-opacity=".35"/>
  <circle cx="60" cy="44" r="19" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="2"/>
  <path d="M31 118 C35 82 43 70 60 70 C77 70 85 82 89 118 Z" fill="currentColor" fill-opacity=".13" stroke="currentColor" stroke-width="2"/>
  <g transform="translate(28 25) scale(.50)" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g>
  <text x="60" y="126" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor">${esc(monogram)}</text>
  <text x="60" y="139" text-anchor="middle" font-size="7" fill="currentColor" opacity=".8">${role} · ${sub}</text>
 </svg>`
}
window.heroVisualSvg=heroVisualSvg;
window.HERO_VISUAL_SPEC=HERO_VISUAL_SPEC;

function ensureStatus(obj){
 if(!obj)return obj;
 obj.status??={};
 obj.buffs??={};
 obj.shield=Number(obj.shield)||0;
 return obj
}
function setStatus(target,key,duration,value=true){ensureStatus(target);target.status[key]={until:now()+duration,value};return target.status[key]}
function hasStatus(target,key,t=now()){return !!target?.status?.[key] && target.status[key].until>t}
function statusValue(target,key,fallback=0,t=now()){return hasStatus(target,key,t)?target.status[key].value:fallback}
function buff(self,key,duration,value=true){ensureStatus(self);self.buffs[key]={until:now()+duration,value};return self.buffs[key]}
function hasBuff(self,key,t=now()){return !!self?.buffs?.[key]&&self.buffs[key].until>t}
function buffValue(self,key,fallback=0,t=now()){return hasBuff(self,key,t)?self.buffs[key].value:fallback}

function moveToward(a,b,amount){
 const dx=(b.x||0)-(a.x||0),dy=(b.y||0)-(a.y||0),d=Math.hypot(dx,dy)||1;
 a.x=clamp((a.x||0)+dx/d*amount,.03,.97);a.y=clamp((a.y||0)+dy/d*amount,.06,.94)
}
function moveAway(a,b,amount){
 const dx=(a.x||0)-(b.x||0),dy=(a.y||0)-(b.y||0),d=Math.hypot(dx,dy)||1;
 a.x=clamp((a.x||0)+dx/d*amount,.03,.97);a.y=clamp((a.y||0)+dy/d*amount,.06,.94)
}

function runtimeTargets(ctx){
 if(Array.isArray(ctx.allTargets))return ctx.allTargets.filter(live);
 return ctx.target?[ctx.target]:[]
}
function addSummon(ctx,type,power,duration=7000,count=1){
 const st=ctx.world;if(!st)return;
 st.summons??=[];
 for(let i=0;i<count;i++){
  st.summons.push({
   id:'sum-'+Math.random().toString(36).slice(2,8),type,
   name:type==='army'?'Legion Echo':type==='clone'?'Mist Clone':type==='drone'?'Combat Drone':'Companion',
   x:clamp((ctx.self.x||.2)+(i-.5)*.04,.04,.96),y:clamp((ctx.self.y||.5)+(i%2?.04:-.04),.08,.92),
   hp:35,maxHp:35,alive:true,power,expires:now()+duration,lastAttack:0
  })
 }
}
function applyDot(target,type,total,duration=3500){
 ensureStatus(target);target.status[type]={until:now()+duration,value:{remaining:total,last:now(),duration}}
}
function tickDots(target,t,damageFn){
 if(!target?.status)return;
 for(const key of ['burn','bleed']){
  const s=target.status[key];if(!s||s.until<=t||!s.value?.remaining)continue;
  if(t-s.value.last>=500){
   const ticks=Math.max(1,Math.floor((t-s.value.last)/500)),d=Math.min(s.value.remaining,s.value.remaining*(500*ticks/Math.max(500,s.until-t+500)));
   s.value.last=t;s.value.remaining-=d;if(d>0)damageFn(d,key)
  }
 }
 if(target.status.delay?.until<=t && target.status.delay?.value?.damage){
  const d=target.status.delay.value.damage;delete target.status.delay;damageFn(d,'delay')
 }
}

function effectResult(){return{damageMult:1,flatBonus:0,ignoreDefense:0,areaMult:0,notes:[]}}
function applySkillEffect(load,skill,ctx){
 const r=effectResult(),ef=skill.effect||'',self=ensureStatus(ctx.self),target=ensureStatus(ctx.target),t=now();
 const healBoost=load.effects?.healing?1.20:1;
 const power=Math.max(1,load.stats.atk*skill.power);
 const targets=runtimeTargets(ctx);

 // common status-driven preconditions
 if(hasStatus(target,'mark'))r.damageMult*=1.12;
 if(hasStatus(target,'armorBreak'))r.ignoreDefense+=.25;
 if(hasBuff(self,'fury'))r.damageMult*=buffValue(self,'fury',1.12);

 switch(ef){
  case 'mark': setStatus(target,'mark',5000,1);r.notes.push('Marked');break;
  case 'pierce': r.ignoreDefense+=.35;r.damageMult*=1.08;r.notes.push('Pierce');break;
  case 'anti-shield': target.shield=Math.max(0,(target.shield||0)-30);setStatus(target,'shieldBreak',4500,.25);r.notes.push('Shield Break');break;
  case 'guard-break': setStatus(target,'armorBreak',4500,.25);r.damageMult*=1.06;r.notes.push('Guard Break');break;
  case 'burst': r.damageMult*=1.14;r.notes.push('Burst');break;
  case 'chain': {
   const extra=targets.filter(x=>x!==target).sort((a,b)=>dist(target,a)-dist(target,b)).slice(0,2);
   ctx.secondaryHits=extra.map((x,i)=>({target:x,mult:.55-i*.12}));r.notes.push(`Chain ${1+extra.length}`);
   break;
  }
  case 'slow': setStatus(target,'slow',1800,.42);r.notes.push('Slow');break;
  case 'freeze': setStatus(target,'freeze',1100,1);setStatus(target,'slow',2600,.7);r.notes.push('Freeze');break;
  case 'push': moveAway(target,self,.10);r.notes.push('Push');break;
  case 'pull': moveToward(target,self,.11);r.notes.push('Pull');break;
  case 'pull-slow': moveToward(target,self,.09);setStatus(target,'slow',2200,.55);r.notes.push('Pull + Slow');break;
  case 'area-pull': targets.filter(x=>dist(self,x)<=skill.range+.10).forEach(x=>{moveToward(x,self,.08);setStatus(x,'slow',1800,.45)});r.areaMult=.58;r.notes.push('Area Pull');break;
  case 'blink': moveToward(self,target,.14);r.notes.push('Blink');break;
  case 'blink-shield': moveToward(self,target,.13);self.shield+=16*healBoost;r.notes.push('Blink + Shield');break;
  case 'blink-strike': moveToward(self,target,.15);r.damageMult*=1.12;r.notes.push('Blink Strike');break;
  case 'multi-blink': moveToward(self,target,.18);r.damageMult*=1.18;setStatus(target,'confuse',900,.3);r.notes.push('Multi Blink');break;
  case 'dash': moveToward(self,target,.12);r.notes.push('Dash');break;
  case 'dash-shield': moveToward(self,target,.12);self.shield+=18*healBoost;r.notes.push('Dash + Shield');break;
  case 'dash-stun': moveToward(self,target,.14);setStatus(target,'stun',700,1);r.damageMult*=1.08;r.notes.push('Stun');break;
  case 'phase': moveToward(self,target,.12);buff(self,'phase',1700,.35);r.notes.push('Phase');break;
  case 'shield': self.shield+=18*healBoost;r.notes.push('Shield');break;
  case 'shield-strong': self.shield+=32*healBoost;r.notes.push('Strong Shield');break;
  case 'team-shield': self.shield+=24*healBoost;(ctx.allies||[]).filter(live).forEach(a=>ensureStatus(a).shield+=18*healBoost);r.notes.push('Team Shield');break;
  case 'heal': self.hp=Math.min(self.maxHp||100,(self.hp||0)+18*healBoost);r.notes.push('Heal');break;
  case 'heal-shield': self.hp=Math.min(self.maxHp||100,(self.hp||0)+14*healBoost);self.shield+=16*healBoost;r.notes.push('Heal + Shield');break;
  case 'area-heal': self.hp=Math.min(self.maxHp||100,(self.hp||0)+16*healBoost);(ctx.allies||[]).filter(live).forEach(a=>a.hp=Math.min(a.maxHp||100,(a.hp||0)+12*healBoost));r.areaMult=.45;r.notes.push('Area Heal');break;
  case 'shield-haste': self.shield+=18*healBoost;buff(self,'haste',5000,.18);r.notes.push('Shield + Haste');break;
  case 'haste': buff(self,'haste',5500,.22);if(ctx.cooldowns)Object.keys(ctx.cooldowns).forEach(k=>ctx.cooldowns[k]=Math.max(0,ctx.cooldowns[k]*.78));r.notes.push('Haste');break;
  case 'slow-haste': setStatus(target,'slow',2300,.55);buff(self,'haste',5000,.16);r.notes.push('Slow + Haste');break;
  case 'speed': buff(self,'speed',4200,.22);r.damageMult*=1.04;r.notes.push('Speed');break;
  case 'move-shot': buff(self,'speed',2400,.14);moveAway(self,target,.035);r.notes.push('Move Shot');break;
  case 'overdrive': buff(self,'overdrive',6500,{damage:1.18,speed:.18,defensePenalty:.10});r.damageMult*=1.12;r.notes.push('Overdrive');break;
  case 'transform': buff(self,'transform',7000,{damage:1.16,defense:.15,speed:.10});self.hp=Math.min(self.maxHp||100,(self.hp||0)+6);r.notes.push('Transform');break;
  case 'transform-heal': buff(self,'transform',7000,{damage:1.13,defense:.12,speed:.07});self.hp=Math.min(self.maxHp||100,(self.hp||0)+20*healBoost);r.notes.push('Transform + Heal');break;
  case 'area-buff': buff(self,'runeBuff',7000,{damage:1.12,defense:.10});(ctx.allies||[]).forEach(a=>buff(a,'runeBuff',5000,{damage:1.06,defense:.06}));r.areaMult=.50;r.notes.push('Area Buff');break;
  case 'area': r.areaMult=.62;r.notes.push('Area');break;
  case 'summon': addSummon(ctx,'summon',load.stats.atk*.10,6500,1);r.notes.push('Summon');break;
  case 'summon-slow': addSummon(ctx,'summon',load.stats.atk*.085,7000,1);setStatus(target,'slow',1800,.45);r.notes.push('Summon + Slow');break;
  case 'army': addSummon(ctx,'army',load.stats.atk*.075,8500,3);r.areaMult=.35;r.notes.push('Army');break;
  case 'bleed': applyDot(target,'bleed',power*.22,4000);r.notes.push('Bleed');break;
  case 'boss-bonus': if(target.boss){r.damageMult*=1.30;r.notes.push('Giantbane')}else r.notes.push('Hunter Strike');break;
  case 'boss-execute': if(target.boss&&target.hp/target.maxHp<.35){r.damageMult*=1.42;r.notes.push('Boss Execute')}else if(target.boss){r.damageMult*=1.16;r.notes.push('Boss Mark')}break;
  case 'execute': if((target.hp||100)/(target.maxHp||100)<.35){r.damageMult*=1.38;r.notes.push('Execute')}break;
  case 'delay': setStatus(target,'delay',900,{damage:power*.18});r.notes.push('Delayed Hit');break;
  case 'reveal-burst': setStatus(target,'reveal',5000,1);r.damageMult*=1.15;r.notes.push('Reveal');break;
  case 'root-slow': setStatus(target,'root',900,1);setStatus(target,'slow',2600,.65);r.notes.push('Root + Slow');break;
  case 'burn': applyDot(target,'burn',power*.20,3500);r.notes.push('Burn');break;
  case 'duel': if(dist(self,target)<.24)r.damageMult*=1.22;buff(self,'duelGuard',1800,.12);r.notes.push('Duel');break;
  case 'adaptive': {
    const kind=hasStatus(target,'slow')?'control':target.shield>0?'anti-shield':'power';
    if(kind==='control')setStatus(target,'slow',1600,.45);
    if(kind==='anti-shield')target.shield=Math.max(0,target.shield-18);
    if(kind==='power')r.damageMult*=1.12;
    buff(self,'adaptive',4000,kind);r.notes.push(`Adapt: ${kind}`);break;
  }
  case 'adaptive-defense':
    self.shield+=14;buff(self,'adaptiveGuard',4200,.16);r.notes.push('Adaptive Guard');break;
  case 'adaptive-area':
    r.areaMult=.55;buff(self,'adaptive',4200,'area');r.notes.push('Adaptive Area');break;
  case 'confuse-slow':
    setStatus(target,'confuse',1600,.45);setStatus(target,'slow',2200,.45);r.notes.push('Confuse + Slow');break;
  case 'multi-clone':
    addSummon(ctx,'clone',load.stats.atk*.07,7000,3);r.damageMult*=1.08;r.notes.push('Multi Clone');break;
  case 'area-heal-slow':
    self.hp=Math.min(self.maxHp||100,(self.hp||0)+14*healBoost);
    (ctx.allies||[]).filter(live).forEach(a=>a.hp=Math.min(a.maxHp||100,(a.hp||0)+10*healBoost));
    targets.filter(x=>dist(self,x)<=skill.range+.10).forEach(x=>setStatus(x,'slow',1900,.42));
    r.areaMult=.40;r.notes.push('Heal Field + Slow');break;
  }
  return r
}

function outgoingBuffMultiplier(self){
 let m=1;
 if(hasBuff(self,'overdrive'))m*=buffValue(self,'overdrive',{}).damage||1;
 if(hasBuff(self,'transform'))m*=buffValue(self,'transform',{}).damage||1;
 if(hasBuff(self,'runeBuff'))m*=buffValue(self,'runeBuff',{}).damage||1;
 return m
}
function incomingDamageMultiplier(self){
 let m=1;
 if(hasBuff(self,'phase'))m*=1-buffValue(self,'phase',.35);
 if(hasBuff(self,'transform'))m*=1-(buffValue(self,'transform',{}).defense||0);
 if(hasBuff(self,'runeBuff'))m*=1-(buffValue(self,'runeBuff',{}).defense||0);
 if(hasBuff(self,'duelGuard'))m*=1-buffValue(self,'duelGuard',.12);if(hasBuff(self,'adaptiveGuard'))m*=1-buffValue(self,'adaptiveGuard',.16);
 if(hasBuff(self,'overdrive'))m*=1+(buffValue(self,'overdrive',{}).defensePenalty||0);
 return clamp(m,.45,1.25)
}
function movementMultiplier(self){
 let m=1;if(hasBuff(self,'speed'))m*=1+buffValue(self,'speed',.2);if(hasBuff(self,'haste'))m*=1+buffValue(self,'haste',.12);
 if(hasBuff(self,'overdrive'))m*=1+(buffValue(self,'overdrive',{}).speed||0);if(hasBuff(self,'transform'))m*=1+(buffValue(self,'transform',{}).speed||0);return m
}
function targetMovementMultiplier(target,t=now()){
 if(hasStatus(target,'freeze',t)||hasStatus(target,'stun',t)||hasStatus(target,'root',t))return 0;
 if(hasStatus(target,'slow',t))return clamp(1-statusValue(target,'slow',.4,t),.20,1);
 return 1
}
function targetAttackMultiplier(target,t=now()){
 if(hasStatus(target,'freeze',t)||hasStatus(target,'stun',t))return 0;
 if(hasStatus(target,'confuse',t))return .45;
 return 1
}

window.KF_V12_SKILL_ENGINE={applySkillEffect,targetMovementMultiplier,targetAttackMultiplier,movementMultiplier,incomingDamageMultiplier,outgoingBuffMultiplier,tickDots};

function v10DamagePortalEnemy(target,amount,source='skill'){
 if(!target||!live(target))return;
 let dmg=Math.max(0,amount);
 if(hasStatus(target,'shieldBreak'))dmg*=1.08;
 window.portalActionDamageEnemy(target,dmg);
}
function v10HitSecondary(ctx,base){
 (ctx.secondaryHits||[]).forEach(h=>v10DamagePortalEnemy(h.target,base*h.mult,'chain'));
 if(ctx.effect?.areaMult>0){
  runtimeTargets(ctx).filter(x=>x!==ctx.target&&dist(ctx.self,x)<=ctx.skill.range+.12).forEach(x=>v10DamagePortalEnemy(x,base*ctx.effect.areaMult,'area'))
 }
}
function v10SkillContextPortal(st,target,load,q){
 return{self:st,target,allTargets:st.enemies||[],allies:st.bots||[],world:st,cooldowns:st.cool,skill:q}
}
window.portalActionAttack=function(kind){
 const st=portalAction;if(!st||!st.started||!st.alive||st.completed||st.cool[kind]>0)return;
 const target=portalActionNearestEnemy();if(!target)return portalActionInteract();
 const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),q=kind==='a'?{name:'Basic Attack',power:.20,cd:.65,range:.18,effect:''}:load.skills[kind],d0=dist(st,target);
 if(!q)return;if(d0>q.range)return portalActionSetStatus(`${q.name}: target terlalu jauh · range ${q.range.toFixed(2)}`);
 const haste=hasBuff(st,'haste')?1-buffValue(st,'haste',.18):1;
 st.cool[kind]=q.cd*(1-load.stats.cooldown)*haste;
 const crit=Math.random()<load.stats.crit?1.6:1,ctx=v10SkillContextPortal(st,target,load,q),effect=kind==='a'?effectResult():applySkillEffect(load,q,ctx);ctx.effect=effect;
 let damage=Math.max(5,load.stats.atk*q.power*crit/7+effect.flatBonus/7)*effect.damageMult*outgoingBuffMultiplier(st)*combatArtifactMultiplier(load,target.boss,d0,st.hp/Math.max(1,st.maxHp||100));
 if(load.hero.subrole==='Dragon Slayer'&&target.boss)damage*=1.16;
 v10DamagePortalEnemy(target,damage,kind);v10HitSecondary(ctx,damage);
 if(kind==='s1'&&load.effects['echo-refund']&&Math.floor(now()/1000)%4===0)st.cool[kind]*=.65;
 portalActionSetStatus(`${crit>1?'CRIT · ':''}${q.name}${effect.notes.length?' · '+effect.notes.join(' / '):''}`)
};

const originalPortalFrame=window.portalActionFrame;
window.portalActionFrame=function(t){
 if(portalAction){
  const st=portalAction,dt=Math.min(.05,Math.max(0,(t-(portalActionLast||t))/1000));
  ensureStatus(st);
  // status DoTs/delayed hits
  (st.enemies||[]).filter(live).forEach(e=>tickDots(e,t,(d)=>v10DamagePortalEnemy(e,d,'dot')));
  // real summons: visible entities that seek and damage enemies periodically
  st.summons=(st.summons||[]).filter(s=>s.expires>t&&s.alive);
  for(const s of st.summons){
   const target=(st.enemies||[]).filter(live).sort((a,b)=>dist(s,a)-dist(s,b))[0];if(!target)continue;
   const d=dist(s,target);if(d>.15)moveToward(s,target,.06*dt);else if(t-s.lastAttack>900){s.lastAttack=t;v10DamagePortalEnemy(target,s.power,'summon')}
  }
 }
 originalPortalFrame(t)
};

// Modify Portal monster movement/attacks by wrapping statuses after original calculations on the next frame.
// For true freeze/root behavior, override the enemy speed property transiently before original frame.
const portalFrameWithStatus=window.portalActionFrame;
window.portalActionFrame=function(t){
 if(portalAction){
  for(const e of portalAction.enemies||[]){
   if(e._baseSpd==null)e._baseSpd=e.spd;
   e.spd=e._baseSpd*targetMovementMultiplier(e,t);
   if(hasStatus(e,'freeze',t)||hasStatus(e,'stun',t))e.lastAttack=t;
  }
 }
 portalFrameWithStatus(t)
};

window.portalActionDamagePlayer=function(dmg,t){
 const st=portalAction;if(!st||!st.alive||t<st.invulnerableUntil)return;
 let damage=dmg*incomingDamageMultiplier(st);
 if(st.shield>0){const absorb=Math.min(st.shield,damage);st.shield-=absorb;damage-=absorb}
 st.hp=Math.max(0,st.hp-damage);
 if(st.hp<=0){st.alive=false;st.respawnAt=t+5000;portalActionSetStatus('Hero tumbang · respawn 5 detik');portalActionLog('Hero tumbang. Pertarungan tetap berlanjut.')}
};

function arenaTargetProxy(st){return ensureStatus({x:st.ex,y:st.ey,hp:st.ehp,maxHp:100,shield:st.enemyShield||0,status:st.enemyStatus||{}})}
function syncArenaTarget(st,tg){st.ex=tg.x;st.ey=tg.y;st.ehp=tg.hp;st.enemyShield=tg.shield;st.enemyStatus=tg.status}
window.gameAttack=function(kind){
 const st=gameState;if(!st||!st.alive||st.recall.active||st.cool[kind]>0)return;
 ensureStatus(st);const load=window.KF_GAME_LOADOUT||gameApplyLoadout(),tg=arenaTargetProxy(st),q=kind==='a'?{name:'Basic Attack',power:.18,cd:.7,range:.20,effect:''}:load.skills[kind],d0=dist(st,tg);
 if(!q)return;if(d0>q.range)return gameSetStatus(`${q.name}: target terlalu jauh · range ${q.range.toFixed(2)}`);
 const haste=hasBuff(st,'haste')?1-buffValue(st,'haste',.18):1;st.cool[kind]=q.cd*(1-load.stats.cooldown)*haste;
 const crit=Math.random()<load.stats.crit?1.6:1,ctx={self:st,target:tg,allTargets:[tg],allies:[],world:st,cooldowns:st.cool,skill:q},effect=kind==='a'?effectResult():applySkillEffect(load,q,ctx);
 let damage=Math.max(3,load.stats.atk*q.power*crit/10+effect.flatBonus/10)*effect.damageMult*outgoingBuffMultiplier(st)*combatArtifactMultiplier(load,false,d0,st.hp/100);
 tg.hp=Math.max(0,tg.hp-damage);syncArenaTarget(st,tg);
 if(kind==='s1'&&load.effects['echo-refund']&&Math.floor(now()/1000)%4===0)st.cool[kind]*=.65;
 gameSetStatus(`${crit>1?'CRIT · ':''}${q.name}${effect.notes.length?' · '+effect.notes.join(' / '):''}`)
};

const oldGameDamagePlayer=window.gameDamagePlayer;
window.gameDamagePlayer=function(amount,t){
 const st=gameState;if(!st||!st.alive||t<st.invulnerableUntil)return;if(st.recall.active)gameCancelRecall('terkena damage');
 let d=amount*incomingDamageMultiplier(st);if(st.shield>0){const a=Math.min(st.shield,d);st.shield-=a;d-=a}st.hp=Math.max(0,st.hp-d);if(st.hp<=0)gameKillPlayer(t)
};

// Hero visual UI
function applyHeroVisuals(){
 const load=window.KF_GAME_LOADOUT;if(!load)return;
 const h=load.hero;
 const av=$('heroAvatar');if(av){av.innerHTML=heroVisualSvg(h,'avatar');av.classList.add('hero-avatar-art')}
 const profile=$('heroProfileDetail');if(profile&&!profile.querySelector('.hero-profile-visual'))profile.insertAdjacentHTML('afterbegin',`<div class="hero-profile-visual">${heroVisualSvg(h,'profile')}</div>`)
 const pu=$('playerUnit');if(pu){pu.innerHTML=`<div class="battle-hero-mini">${heroVisualSvg(h,'battle')}</div>`;pu.title=h.name}
 const ppu=$('portalPlayerUnit');if(ppu){ppu.innerHTML=`<div class="battle-hero-mini">${heroVisualSvg(h,'battle')}</div>`;ppu.title=h.name}
}
const oldGameApplyLoadout=window.gameApplyLoadout;
window.gameApplyLoadout=function(){
 const r=oldGameApplyLoadout();
 // remove stale profile image before inserting new one
 const profile=$('heroProfileDetail');profile?.querySelector('.hero-profile-visual')?.remove();
 applyHeroVisuals();return r
};

window.renderHeroCollection=function(){
 const x=getHeroUnlockState(),next=nextHeroDiscoveryAt(x),owned=new Set(x.unlocked),remain=Math.max(0,next-x.portalClears),pct=x.pending?100:Math.min(100,x.portalClears/Math.max(1,next)*100);
 const starterNames=(x.starterPair||[]).map(id=>HERO_ROSTER.find(h=>h.id===id)?.name).filter(Boolean);
 $('heroOwnedBadge').textContent=`${x.unlocked.length}/${HERO_ROSTER.length} Hero · target ${typeof HERO_TARGET_ROSTER==='number'?HERO_TARGET_ROSTER:62}`;
 $('heroUnlockProgress').innerHTML=`<b>${x.pending?'Hero Discovery tersedia':'Progress Hero berikutnya'}</b><div class="hero-progress-track"><i style="width:${pct}%"></i></div><div class="small"><b>Starter random permanen:</b> ${starterNames.join(' + ')||'belum ditetapkan'} · Tidak ada reroll otomatis.<br>${x.pending?'Pilih 1 dari 3 kandidat.':remain+' Portal clear lagi menuju milestone.'} · Total clear ${x.portalClears} · Guarantee ${Math.floor(x.pity)}/6</div>`;
 $('heroRosterGrid').innerHTML=HERO_ROSTER.map(h=>{const p=heroProgressFor(h.id),open=owned.has(h.id),starter=(x.starterPair||[]).includes(h.id);return`<div class="hero-roster-card ${open?'':'locked'}"><div class="hero-card-art">${heroVisualSvg(h,'card')}</div><b>${esc(h.name)}${starter?' · STARTER':''}</b><div class="hero-tags"><span class="hero-tag">${esc(h.role)}</span><span class="hero-tag">${esc(h.subrole)}</span></div><div class="small">${esc(h.archetype)} · ${esc(h.difficulty)}<br>${open?'Lv.'+p.level+' · '+p.exp+'/'+heroExpNeeded(p.level)+' EXP':'Terkunci · Hero Discovery'}<br>${esc(h.passive)}: ${esc(h.passiveText)}</div>${open?`<button class="btn soft" onclick="selectOwnedHero('${h.id}')">Pakai Hero</button>`:''}</div>`}).join('')
};
window.renderHeroDiscovery=function(){
 const x=getHeroUnlockState();$('heroDiscoveryBadge').textContent=x.pending?'READY':'Belum tersedia';
 if(!x.pending){$('heroDiscoveryInfo').innerHTML=`Main Portal untuk membuka Hero baru.<br><span class="small">Progress ${x.portalClears}/${nextHeroDiscoveryAt(x)} · guarantee ${Math.floor(x.pity)}/6. Dua starter random tetap permanen.</span>`;$('heroDiscoveryChoices').innerHTML='';return}
 $('heroDiscoveryInfo').innerHTML='<b>Pilih 1 dari 3.</b><div class="small">Hero lain tetap bisa muncul lagi. Hero baru membuka gaya bermain, bukan tier kemenangan otomatis.</div>';
 $('heroDiscoveryChoices').innerHTML=x.candidates.map(id=>{const h=HERO_ROSTER.find(y=>y.id===id);return`<div class="hero-discovery-choice"><div class="hero-card-art">${heroVisualSvg(h,'discovery')}</div><b>${esc(h.name)}</b><div class="hero-tags"><span class="hero-tag">${esc(h.role)}</span><span class="hero-tag">${esc(h.subrole)}</span><span class="hero-tag">${esc(h.secondary)}</span></div><div class="small">${esc(h.archetype)}<br><b>${esc(h.passive)}</b> — ${esc(h.passiveText)}<br>${h.skills.map(q=>esc(q.name)).join(' · ')}</div><button class="btn primary" onclick="chooseHeroDiscoveryUI('${h.id}')">Unlock ${esc(h.name)}</button></div>`}).join('')
};

// render summons and visual statuses after original portal render
const oldPortalRender=window.portalActionRender;
window.portalActionRender=function(){
 oldPortalRender();
 if(!portalAction)return;
 const layer=$('portalActionUnits');if(layer){
  for(const s of portalAction.summons||[]){
   const el=document.createElement('div');el.className='portal-unit summon-unit';el.style.left=(s.x*100)+'%';el.style.top=(s.y*100)+'%';el.innerHTML=`<span>${s.type==='army'?'✦':s.type==='clone'?'◇':'●'}</span><small>${esc(s.name)}</small>`;layer.appendChild(el)
  }
 }
 const st=portalAction,load=window.KF_GAME_LOADOUT;
 const statuses=[];
 if(st.shield>0)statuses.push(`Shield ${Math.round(st.shield)}`);
 for(const [k,label] of [['haste','Haste'],['speed','Speed'],['phase','Phase'],['overdrive','Overdrive'],['transform','Transform'],['runeBuff','Rune Buff']])if(hasBuff(st,k))statuses.push(label);
 const e=$('portalActionStatus');if(e&&statuses.length)e.textContent+=(e.textContent?' · ':'')+statuses.join(' · ')
};

// Initial visual upgrade after v9 has initialized.
setTimeout(()=>{try{gameApplyLoadout();renderHeroCollection?.()}catch(e){console.error('Klikfun v10 init',e)}},0);
})();
