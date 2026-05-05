// ── SOBORNOST ENGINE — systems/roll.js ────────────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { _registries } from './registries.js';
import { scheduleRender } from './schedule.js';

export function performRoll(statKey, difficulty, options = {}) {
  const baseStat = G.stats[statKey] || 1;
  let charismBonus = 0, charismNote = '', voidGazeUsed = false;
  for (const mod of _registries.rollModifiers)
    if (mod.condition(statKey, options, G)) {
      const b = mod.bonusCallback(statKey, options, G);
      if (b !== 0) { charismBonus += b; charismNote += `${mod.statKey}+${b} `; }
    }
  const awareMod = options.awarenessBonus ? Math.floor((G.awareness || 0) / 2) : 0;
  const effectiveDiff = Math.max(difficulty - awareMod, 3);
  const tempBonus = options.tempBonus || 0;
  let d1, d2, rollSum;
  if (options.advantage) {
    const r1a=Math.floor(Math.random()*6)+1,r1b=Math.floor(Math.random()*6)+1;
    const r2a=Math.floor(Math.random()*6)+1,r2b=Math.floor(Math.random()*6)+1;
    const s1=r1a+r1b,s2=r2a+r2b;
    if(s1>=s2){d1=r1a;d2=r1b;rollSum=s1;charismNote+='advantage ';}
    else{d1=r2a;d2=r2b;rollSum=s2;charismNote+='advantage ';}
  } else { d1=Math.floor(Math.random()*6)+1;d2=Math.floor(Math.random()*6)+1;rollSum=d1+d2; }
  let total = rollSum + baseStat + charismBonus + tempBonus;
  let opposedResult = null, outcome = 'failure';
  if (options.threshold && G.charisms.includes('void_gaze') && (G.awareness||0)>=3 && !options.advantage && !options.opposed) {
    const a=Math.floor(Math.random()*6)+1+Math.floor(Math.random()*6)+1+baseStat+charismBonus;
    if(a>total){total=a;charismNote+='void gaze ';voidGazeUsed=true;}
  }
  if (options.opposed) {
    const os=options.opposed.stat,or_=Math.floor(Math.random()*6)+1+Math.floor(Math.random()*6)+1;
    const ob=G.stats[os]||0,ot=or_+ob;
    opposedResult={stat:os,roll:or_,bonus:ob,total:ot};
    outcome=total>=ot?'success':'failure';
  } else {
    if(total>=effectiveDiff)outcome='success';
    else if(total>=effectiveDiff-2)outcome='partial';
    else outcome='failure';
  }
  let crit=false;
  if(options.critical&&!options.opposed){
    if(rollSum===12){crit='success';outcome='success';charismNote+='CRIT! ';}
    else if(rollSum===2){crit='failure';outcome='failure';charismNote+='FUMBLE! ';}
  }
  emit('rollPerformed',{statKey,difficulty,options,result:{outcome,total,rollSum,crit,voidGazeUsed}});
  return{outcome,total,roll:rollSum,d1,d2,statValue:baseStat,charismBonus,charismNote:charismNote.trim(),
    difficulty:effectiveDiff,rawDifficulty:difficulty,awareMod,crit,opposed:opposedResult,tempBonus,voidGazeUsed};
}

export function startRoll(choice) {
  const rd=choice.roll;
  const res=performRoll(rd.stat,rd.difficulty,{
    awarenessBonus:rd.awarenessBonus||false,docCheck:rd.docCheck||false,
    social:rd.social||false,corporate:rd.corporate||false,
    threshold:rd.threshold||false,advantage:rd.advantage||false,
    critical:rd.critical||false,tempBonus:rd.tempBonus||0,opposed:rd.opposed||null,
  });
  G.rollResult=res;G.pendingRoll={choice,rollDef:rd,result:res};
  emit('rollStarted',{choice,result:res});
  scheduleRender();
}
