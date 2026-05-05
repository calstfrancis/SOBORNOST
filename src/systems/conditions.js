// ── SOBORNOST ENGINE — systems/conditions.js ──────────────────

import { G } from '../core/state.js';
import { hasFlag, hasItem, getReputation, getQuestState, believes, knows, getStance } from './mechanics.js';
import { hasCompanion } from './companions.js';

export function evaluateCondition(cond) {
  if(!cond)return true;
  if(Array.isArray(cond))return cond.every(c=>evaluateCondition(c));
  switch(cond.type){
    case 'flag':return hasFlag(cond.id)===(cond.state!==false);
    case 'stat':return(G.stats[cond.name]||0)>=(cond.min||0);
    case 'charism':return G.charisms.includes(cond.id);
    case 'item':return hasItem(cond.id);
    case 'playcount':return G.playCount>=(cond.min||0);
    case 'awareness':return(G.awareness||0)>=(cond.min||0);
    case 'belief':return believes(cond.id);
    case 'knowledge':return knows(cond.id);
    case 'stance':return getStance(cond.npc,cond.key)>=(cond.min||0);
    case 'past_flag':return G.pastLifeFlags.has(cond.id);
    case 'liturgical_hour':return G.liturgicalHour===cond.hour;
    case 'companion':return hasCompanion(cond.id);
    case 'theosis':return G.theosis>=(cond.min||0);
    // Note: empty arrays — 'and':[] → true, 'or':[] → false (standard JS Array.every/some behaviour)
    case 'or':return cond.conditions.some(c=>evaluateCondition(c));
    case 'and':return cond.conditions.every(c=>evaluateCondition(c));
    case 'not':return!evaluateCondition(cond.condition);
    default:return true;
  }
}

export function isChoiceLocked(ch) {
  if(ch.condition)return!evaluateCondition(ch.condition);
  if(ch.requires_theosis&&G.theosis<ch.requires_theosis)return true;
  if(ch.requires_companion&&!hasCompanion(ch.requires_companion))return true;
  if(ch.requires_past_flag&&!G.pastLifeFlags.has(ch.requires_past_flag))return true;
  if(ch.requires_flag&&!hasFlag(ch.requires_flag))return true;
  if(ch.requires_stat){const[s,m]=ch.requires_stat;if((G.stats[s]||0)<m)return true;}
  if(ch.requires_charism&&!G.charisms.includes(ch.requires_charism))return true;
  if(ch.requires_playcount!==undefined&&G.playCount<ch.requires_playcount)return true;
  if(ch.requires_item&&!hasItem(ch.requires_item))return true;
  if(ch.requires_time_from){const[h]=ch.requires_time_from.split(':');if(G.time.hour<h)return true;}
  if(ch.requires_reputation_min){for(const[id,min]of Object.entries(ch.requires_reputation_min))if(getReputation(id)<min)return true;}
  if(ch.requires_quest_state){for(const[id,state]of Object.entries(ch.requires_quest_state))if(getQuestState(id)!==state)return true;}
  if(ch.requires_belief&&!believes(ch.requires_belief))return true;
  if(ch.requires_knowledge&&!knows(ch.requires_knowledge))return true;
  return false;
}
