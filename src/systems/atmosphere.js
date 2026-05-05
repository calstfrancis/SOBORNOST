// ── SOBORNOST ENGINE — systems/atmosphere.js ──────────────────

import{G}from'../core/state.js';
import{_registries}from'./registries.js';

let _audioMoodCallback=(_m)=>{};
export function setAudioMoodCallback(fn){_audioMoodCallback=fn;}

export const canvas=document.getElementById('atmos');
export const ctx=canvas.getContext('2d');
export let mood='neutral',targetMood='neutral',moodLerp=1;
let fogParts=[],rainDrops=[],T=0,animationFrameId=null,canvasVisible=true;
export const atmosMods={fogMult:1.0,lampWarm:0,lampFlicker:true,soboWarm:false,goldIntensity:0,goldGlow:false};
const _atmosModifiers=[];
export function registerAtmosModifier(soundingId,effectFn){_atmosModifiers.push({soundingId,effectFn});}

function resize(){canvas.width=innerWidth;canvas.height=innerHeight;initRain();}
resize();addEventListener('resize',resize);
window.addEventListener('blur',()=>{canvasVisible=false;});
window.addEventListener('focus',()=>{canvasVisible=true;drawAtmos();});

function initFog(){fogParts=[];for(let i=0;i<22;i++)fogParts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:80+Math.random()*140,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.08,ph:Math.random()*Math.PI*2,base:.025+Math.random()*.05});}
initFog();
function initRain(){const p=porthole();rainDrops=[];for(let i=0;i<24;i++)rainDrops.push({x:p.x+(Math.random()-.5)*p.r*2,y:p.y+(Math.random()-.5)*p.r*2,len:5+Math.random()*9,spd:1.2+Math.random()*2});}
function porthole(){const r=Math.min(canvas.width,canvas.height)*.085;return{x:canvas.width-r-28,y:r+28,r};}

export const MOOD={neutral:[130,170,190,6,8,12],tense:[140,90,70,10,6,4],uncanny:[60,130,170,4,8,14],revelation:[200,190,140,12,14,10]};

export function setMood(m){
  if(!m||m===targetMood)return;
  targetMood=m;moodLerp=0;
  _audioMoodCallback(m); // pass mood directly — no dynamic import needed in audio.js
}
export function lerpN(a,b,t){return a+(b-a)*t;}

export function refreshAtmosMods(){
  const s=G.soundings.settled;
  atmosMods.fogMult=1.0;atmosMods.lampWarm=0;atmosMods.lampFlicker=true;atmosMods.soboWarm=false;
  for(const mod of _atmosModifiers)if(s.includes(mod.soundingId))mod.effectFn(atmosMods,_registries.soundings[mod.soundingId]);
  const t=G.theosis||0;
  if(t>=71)atmosMods.goldIntensity=0.6;
  else if(t>=33)atmosMods.goldIntensity=0.2+(t-33)/38*0.4;
  else atmosMods.goldIntensity=0;
  atmosMods.goldGlow=atmosMods.goldIntensity>0;
}

export function drawAtmos(){
  if(!canvasVisible){if(animationFrameId)cancelAnimationFrame(animationFrameId);animationFrameId=null;return;}
  T+=.008;
  if(moodLerp<1){moodLerp=Math.min(1,moodLerp+.008);if(moodLerp>=1)mood=targetMood;}
  const cm=MOOD[mood]||MOOD.neutral,tm=MOOD[targetMood]||MOOD.neutral,t=moodLerp;
  const fr=lerpN(cm[0],tm[0],t),fg=lerpN(cm[1],tm[1],t),fb=lerpN(cm[2],tm[2],t);
  const br=lerpN(cm[3],tm[3],t),bg=lerpN(cm[4],tm[4],t),bb=lerpN(cm[5],tm[5],t);
  ctx.fillStyle=`rgb(${br|0},${bg|0},${bb|0})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  const mf=mood==='tense'?2.5:mood==='uncanny'?0.6:mood==='revelation'?0.3:1;
  const ef=mf*atmosMods.fogMult,gi=atmosMods.goldIntensity;
  if(gi>0){ctx.shadowColor=`rgba(212,175,55,${gi*0.8})`;ctx.shadowBlur=12;}else{ctx.shadowColor='transparent';ctx.shadowBlur=0;}
  for(const p of fogParts){
    p.x+=p.vx;p.y+=p.vy;p.ph+=.004;
    if(p.x<-p.r)p.x=canvas.width+p.r;if(p.x>canvas.width+p.r)p.x=-p.r;
    if(p.y<-p.r)p.y=canvas.height+p.r;if(p.y>canvas.height+p.r)p.y=-p.r;
    const op=(p.base+Math.sin(p.ph)*.012)*ef;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
    let rv=fr,gv=fg,bv=fb;
    if(gi>0){rv=lerpN(fr,212,gi*.5);gv=lerpN(fg,175,gi*.5);bv=lerpN(fb,55,gi*.3);}
    g.addColorStop(0,`rgba(${rv|0},${gv|0},${bv|0},${op.toFixed(3)})`);
    g.addColorStop(1,`rgba(${rv|0},${gv|0},${bv|0},0)`);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowColor='transparent';
  const lx=canvas.width*.12,ly=canvas.height*.08;
  const lg=ctx.createRadialGradient(lx,ly,0,lx,ly,Math.min(canvas.width,canvas.height)*.28);
  let li=0.09+Math.sin(T*.4)*.008;
  if(mood==='tense'&&atmosMods.lampFlicker)li+=Math.sin(T*4.5)*.03;
  if(mood==='revelation')li=.28;if(mood==='uncanny')li=.04;
  let lR=176+Math.round(atmosMods.lampWarm*40),lG=120-Math.round(atmosMods.lampWarm*20),lB=40;
  if(gi>0){lR=lerpN(lR,212,gi);lG=lerpN(lG,175,gi);lB=lerpN(lB,55,gi);}
  lg.addColorStop(0,`rgba(${lR},${lG},${lB},${li.toFixed(3)})`);
  lg.addColorStop(1,`rgba(${lR},${lG},${lB},0)`);
  ctx.fillStyle=lg;ctx.fillRect(0,0,canvas.width,canvas.height);
  _drawPorthole();
  animationFrameId=requestAnimationFrame(drawAtmos);
}

function _drawPorthole(){
  const{x,y,r}=porthole();
  ctx.strokeStyle='#1c2830';ctx.lineWidth=r*.18;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#243038';
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;ctx.beginPath();ctx.arc(x+Math.cos(a)*(r+r*.1),y+Math.sin(a)*(r+r*.1),r*.045,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.beginPath();ctx.arc(x,y,r*.87,0,Math.PI*2);ctx.clip();
  const sc=mood==='uncanny'?'#060e18':mood==='revelation'?'#202810':'#0e1820';
  const sg=ctx.createLinearGradient(x,y-r,x,y+r);sg.addColorStop(0,sc);sg.addColorStop(1,'#182430');
  ctx.fillStyle=sg;ctx.fillRect(x-r,y-r,r*2,r*2);
  const sw=atmosMods.soboWarm;
  ctx.strokeStyle=`rgba(${sw?80:60},${sw?110:100},${sw?120:130},${mood==='uncanny'?0.5:0.25})`;ctx.lineWidth=.8;
  for(let i=0;i<6;i++){const wy=y+r*.2+i*r*.12+Math.sin(T*.6+i*1.2)*2;ctx.beginPath();ctx.moveTo(x-r,wy);ctx.quadraticCurveTo(x,wy+Math.sin(T+i)*3,x+r,wy);ctx.stroke();}
  ctx.strokeStyle=`rgba(100,150,180,${mood==='tense'?0.35:0.18})`;ctx.lineWidth=.6;
  for(const d of rainDrops){d.y+=d.spd;if(d.y>y+r){d.y=y-r;d.x=x+(Math.random()-.5)*r*2;}ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-1,d.y+d.len);ctx.stroke();}
  ctx.restore();ctx.strokeStyle='#2a3c48';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r*.87,0,Math.PI*2);ctx.stroke();
}
drawAtmos();
