// ── SOBORNOST ENGINE — systems/rituals.js ─────────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { _registries } from './registries.js';
import { applyEffect, setFlag } from './mechanics.js';
import { evaluateCondition } from './conditions.js';
import { processText, applyLinguisticToggle, applyPostEventShifts } from './text.js';
import { scheduleRender } from './schedule.js';

export function navigateToPool(poolId) {
  const pool=_registries.scenePools[poolId];
  if(!pool||!pool.length){console.warn(`Scene pool "${poolId}" empty or missing.`);return;}
  const avail=pool.filter(e=>!e.condition||evaluateCondition(e.condition));
  if(!avail.length){console.warn(`No scenes available in pool "${poolId}".`);return;}
  let total=0;for(const e of avail)total+=e.weight||1;
  let r=Math.random()*total;
  for(const e of avail){const w=e.weight||1;if(r<w){import('./navigation.js').then(m=>m.navigate(e.sceneId));return;}r-=w;}
  import('./navigation.js').then(m=>m.navigate(avail[0].sceneId));
}

let _activeRitual=null;
export function startRitual(ritualId,startingScene,nextScene) {
  const ritual=_registries.rituals[ritualId];
  if(!ritual){console.warn(`Ritual "${ritualId}" not found.`);return false;}
  _activeRitual={id:ritualId,phaseIndex:0,startingScene,nextScene};
  emit('ritualStarted',ritualId);scheduleRender();return true;
}
export function ritualNextPhase() {
  if(!_activeRitual)return;
  const ritual=_registries.rituals[_activeRitual.id];
  _activeRitual.phaseIndex++;
  if(_activeRitual.phaseIndex>=ritual.phases.length){
    const next=_activeRitual.nextScene||_activeRitual.startingScene;
    _activeRitual=null;emit('ritualCompleted',ritual.id);
    import('./navigation.js').then(m=>m.navigate(next));
  }else{emit('ritualPhaseChanged',{ritualId:ritual.id,phaseIndex:_activeRitual.phaseIndex});scheduleRender();}
}
export function getCurrentRitualPhase() {
  if(!_activeRitual)return null;
  return _registries.rituals[_activeRitual.id].phases[_activeRitual.phaseIndex];
}
export function isRitualActive() { return _activeRitual!==null; }

export function renderRitual(root) {
  const phase=getCurrentRitualPhase();
  if(!phase){_activeRitual=null;scheduleRender();return;}
  const wrap=document.createElement('div');wrap.className='game';
  const hdr=document.createElement('div');hdr.className='game-header';
  const lb=document.createElement('div');lb.className='location-bar';
  lb.textContent=`${_activeRitual.id} \u2014 ${phase.title||'Phase '+(_activeRitual.phaseIndex+1)}`;
  hdr.appendChild(lb);wrap.appendChild(hdr);
  const body=document.createElement('div');body.className='game-body';
  if(phase.text){
    let raw=Array.isArray(phase.text)?phase.text:[phase.text];
    raw=raw.map(applyLinguisticToggle).map(applyPostEventShifts);
    raw.forEach(line=>{const p=document.createElement('p');p.className='sp';p.innerHTML=processText(line);body.appendChild(p);});
  }
  const cd=document.createElement('div');cd.className='choices';
  if(phase.choices){
    phase.choices.forEach(ch=>{
      const btn=document.createElement('button');btn.className='choice';btn.textContent=processText(ch.text);
      btn.onclick=()=>{if(ch.effect)applyEffect(ch.effect);if(ch.set_flag)setFlag(ch.set_flag);ritualNextPhase();};
      cd.appendChild(btn);
    });
  }else{
    const cont=document.createElement('button');cont.className='choice';cont.textContent='Continue';
    cont.onclick=()=>ritualNextPhase();cd.appendChild(cont);
  }
  body.appendChild(cd);wrap.appendChild(body);root.appendChild(wrap);
}
