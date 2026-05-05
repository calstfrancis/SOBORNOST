// ── SOBORNOST ENGINE — systems/companions.js ──────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { saveGameLegacy } from './save.js';

export function addCompanion(id,data) {
  if(!G.companions.find(c=>c.id===id)){G.companions.push({id,...data});saveGameLegacy();emit('companionAdded',id);}
}
export function removeCompanion(id) {
  G.companions=G.companions.filter(c=>c.id!==id);saveGameLegacy();emit('companionRemoved',id);
}
export function hasCompanion(id)  { return G.companions.some(c=>c.id===id); }
export function getCompanion(id)  { return G.companions.find(c=>c.id===id); }
export function modCompanionStat(id,stat,delta) {
  const comp=getCompanion(id);
  if(comp&&comp.stats){comp.stats[stat]=(comp.stats[stat]||0)+delta;emit('companionStatChanged',{id,stat,delta});}
}
export function setCompanionCharism(id,charismId) {
  const comp=getCompanion(id);
  if(comp){if(!comp.charisms)comp.charisms=[];if(!comp.charisms.includes(charismId))comp.charisms.push(charismId);emit('companionCharismAdded',{id,charismId});}
}
