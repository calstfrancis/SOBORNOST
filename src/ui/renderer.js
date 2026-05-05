// ── SOBORNOST ENGINE — ui/renderer.js ─────────────────────────

import { G } from '../core/state.js';
import { _registries, allCharisms, findCharism, noteLabel, getScene, getInitialScene } from '../systems/registries.js';
import { setMood, refreshAtmosMods } from '../systems/atmosphere.js';
import { _audioOn, toggleAudio } from '../systems/audio.js';
import { LITURGICAL_HOURS } from '../systems/theosis.js';
import { isRitualActive, renderRitual } from '../systems/rituals.js';
import { isChoiceLocked } from '../systems/conditions.js';
import { processText, getSceneText, resolveLayeredText, injectMicroLines, injectGhostText, applyPastLifeLines } from '../systems/text.js';
import { startRoll, performRoll } from '../systems/roll.js';
import { hasFlag, setFlag, addNote, showToast, processConsequenceQueue } from '../systems/mechanics.js';
import { offerSounding, MAX_SOUNDINGS } from '../systems/soundings.js';
import { resetIdleTimer, clearIdleTimer } from '../systems/idle.js';
import { saveGameLegacy, loadGameLegacy, SAVE_KEY_PREFIX } from '../systems/save.js';
import { navigate, applyChoice, newPlay, openPanel, doRestart } from '../systems/navigation.js';
import { getUiOpacity, renderCoverMeter } from './widgets.js';
import { setRenderFn } from '../systems/schedule.js';
import { renderDialogue } from '../systems/dialogue.js';
import { renderJournalPanel } from '../systems/journal.js';
import { renderEventLogPanel } from '../systems/eventlog.js';
import { renderCoverChallengeOverlay, startCoverChallenge, hasCoverChallenges, getRegisteredChallengeFields } from '../systems/cover.js';
// Bug 10 fix: emit is now a static import used directly in beginGame
import { emit } from '../core/events.js';

setRenderFn(render);

// ── Dispatcher ────────────────────────────────────────────────
export function render() {
  const root = document.getElementById('root');
  if (!root) { console.error('[SOBORNOST] No #root element found'); return; }
  root.innerHTML = '';
  if (typeof IS_DEMO !== 'undefined' && IS_DEMO) {
    const b = document.createElement('div'); b.className = 'demo-banner';
    b.textContent = '\u2693 DEMO \u2014 ' + (window.GAME_TITLE || 'Game');
    root.appendChild(b);
  }
  if      (G.phase === 'title')    renderTitle(root);
  else if (G.phase === 'mode')     renderMode(root);
  else if (G.phase === 'charism')  renderCharism(root);
  else if (G.phase === 'game')     renderGame(root);
  else if (G.phase === 'memorial') renderMemorial(root);
}

// ── Title ─────────────────────────────────────────────────────
export function renderTitle(root) {
  clearIdleTimer();
  setMood('neutral');
  const replay  = G.playCount > 0;
  const hasSave = !!localStorage.getItem(SAVE_KEY_PREFIX + 'legacy');
  const isDemo  = typeof IS_DEMO !== 'undefined' && IS_DEMO;
  const d = document.createElement('div'); d.className = 'title-screen';
  d.innerHTML = `
    <div class="title-cyrillic">${window.GAME_TITLE || 'GAME'}</div>
    <div style="font-size:.72rem;color:var(--dim);letter-spacing:.3em;text-transform:uppercase;margin-bottom:.2rem">${window.GAME_SUBTITLE || ''}</div>
    <div style="font-size:.68rem;color:var(--amber-dim);letter-spacing:.18em;font-style:italic;margin-bottom:${isDemo?'1.2':'3.5'}rem">${window.GAME_MOTTO || 'Thank You'}</div>
    ${isDemo?'<div style="font-size:.8rem;color:var(--amber);border:1px solid var(--amber-dim);padding:.5rem 1.2rem;margin-bottom:2.5rem">DEMO VERSION \u2014 Act One Only</div>':''}
    <pre style="font-size:.62rem;color:var(--border-mid);white-space:pre;line-height:1.3;margin-bottom:3rem">
            ___
       ____/ | \\____
  ~~~~|______________|~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~</pre>
    <div style="font-size:.78rem;color:${replay?'var(--cold-dim)':'var(--dim)'};letter-spacing:.12em;font-style:italic;margin-bottom:2rem">${replay?'another crossing.':'a crossing.'}</div>
    <div style="display:flex;flex-direction:column;gap:.6rem;align-items:center">
      ${hasSave
        ?`<button class="btn" id="tc">Continue crossing</button><button class="btn btn-sm" id="tn">New crossing</button>`
        :`<button class="btn" id="tb">Begin the crossing</button>`}
    </div>
    ${replay?`<div style="margin-top:.8rem;font-size:.66rem;color:var(--dim)">crossing ${G.playCount+1}</div>`:''}
    <div style="margin-top:2.5rem;display:flex;gap:.8rem;justify-content:center">
      <button class="btn btn-sm" id="tm" style="color:var(--cold-dim)">the memorial</button>
      <button class="btn btn-sm" id="tr" style="color:var(--border-mid);font-size:.6rem">reset all</button>
    </div>`;
  root.appendChild(d);
  d.querySelector('#tc')?.addEventListener('click', _continueGame);
  d.querySelector('#tn')?.addEventListener('click', () => { G.phase='mode'; render(); });
  d.querySelector('#tb')?.addEventListener('click', () => { G.phase='mode'; render(); });
  d.querySelector('#tm')?.addEventListener('click', () => { G.phase='memorial'; render(); });
  d.querySelector('#tr')?.addEventListener('click', doRestart);
}
function _continueGame() { if (loadGameLegacy()) render(); else { G.phase='mode'; render(); } }

// ── Stubs ─────────────────────────────────────────────────────
export function renderMode(root)     { clearIdleTimer(); _stub(root, 'renderMode'); }
export function renderCharism(root)  { clearIdleTimer(); _stub(root, 'renderCharism'); }
export function selCharism(_id)      { /* TODO */ }
export function renderMemorial(root) { clearIdleTimer(); /* TODO */ }
function _stub(root, name) {
  const d = document.createElement('div'); d.className = 'title-screen';
  d.innerHTML = `<p style="padding:2rem;color:var(--amber)">${name} \u2014 port from your v3.1 source</p>`;
  root.appendChild(d);
}

export function dismissTutorial() { G.tutorialDone = true; saveGameLegacy(); render(); }

export function beginGame() {
  if (!G.charisms.length) return;
  G.charisms.forEach(id => addNote('charism_' + id));
  G.phase = 'game';
  G.scene = getInitialScene();
  if (!G.scene) console.error('[SOBORNOST] No initial scene set — call SOBORNOST.setInitialScene()');
  G.mode = 'open';
  // Bug 10 fix: both atmosphere.js and events.js are statically imported.
  // Dynamic imports here were pointless and caused emit('gameStarted') to fire
  // asynchronously — after render() returned — meaning any gameStarted listener
  // that set G state (flags, quests, theosis) would miss the first render.
  refreshAtmosMods();
  render();
  emit('gameStarted');
}

// ── Tutorial ──────────────────────────────────────────────────
function _renderTutorial(root) {
  const div = document.createElement('div'); div.className = 'tutorial-overlay';
  if (_registries.tutorialContent)
    div.innerHTML = `<div class="tutorial-box">${_registries.tutorialContent}<button class="btn" style="margin-top:1.5rem;width:100%" id="dt">Board the ship</button></div>`;
  else
    div.innerHTML = `<div class="tutorial-box">
      <div class="tutorial-h">Before you board</div>
      <div class="tutorial-item"><strong>Status bar</strong> \u2014 top of screen. Vigilance, Composure, Communion, Doubt.</div>
      <div class="tutorial-item"><strong>The Breviary</strong> <span class="key">breviary</span> \u2014 centre bottom. Soundings settle through choices.</div>
      <div class="tutorial-item"><strong>Observations</strong> <span class="key">observations</span> \u2014 right bottom.</div>
      <div class="tutorial-item"><strong>Status</strong> <span class="key">status</span> \u2014 left bottom.</div>
      <div class="tutorial-item"><strong>Abandon crossing</strong> \u2014 bottom of each scene.</div>
      <button class="btn" style="margin-top:1.5rem;width:100%" id="dt">Board the ship</button>
    </div>`;
  div.querySelector('#dt').addEventListener('click', dismissTutorial);
  root.appendChild(div);
}

// ── Roll box ──────────────────────────────────────────────────
function _renderRollBox(root) {
  const { choice, rollDef, result } = G.pendingRoll;
  const outCls = result.outcome==='success'?'roll-success':result.outcome==='partial'?'roll-partial':'roll-fail';
  const box = document.createElement('div');
  box.className = `roll-box ${result.outcome==='partial'?'roll-box-partial':result.outcome==='failure'?'roll-box-fail':''}`;
  let oHtml='',cHtml='';
  if(result.opposed){const o=result.opposed;oHtml=`<div class="roll-opposed">Opposed (${o.stat}): ${o.roll}+${o.bonus}=${o.total}</div>`;}
  if(result.crit==='success')cHtml='<div class="roll-crit success">\u2726 CRITICAL SUCCESS \u2726</div>';
  else if(result.crit==='failure')cHtml='<div class="roll-crit failure">\u2717 FATAL FUMBLE \u2717</div>';
  box.innerHTML=`
    <div class="roll-label">${rollDef.stat.toUpperCase()} CHECK</div>
    <div class="roll-math">[${result.d1}]+[${result.d2}]=${result.d1+result.d2}+${result.statValue}(${rollDef.stat})${result.charismBonus?`+${result.charismBonus}`:''}=${result.total} vs ${result.difficulty}</div>
    ${result.charismNote?`<div class="roll-charism">${result.charismNote}</div>`:''}
    ${oHtml}${cHtml}
    <div class="roll-result ${outCls}">\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 ${result.outcome.toUpperCase()}</div>`;
  const cont=document.createElement('button');cont.className='btn btn-pri';
  cont.textContent=`Continue (${result.outcome})`;
  cont.onclick=()=>{
    const next=result.outcome==='success'?rollDef.successNext:result.outcome==='partial'?rollDef.partialNext:rollDef.failNext;
    G.rollResult=null;G.pendingRoll=null;applyChoice({...choice,next});
  };
  box.appendChild(cont);
  const hasMort=G.charisms.includes('mortification');
  const canSpend=hasMort&&(G.stats.composure||0)>=2&&!G._mortificationSpent&&result.outcome!=='success'&&G.mode==='attended'&&!result.voidGazeUsed;
  if(canSpend){
    const mb=document.createElement('button');mb.className='btn mort-btn';mb.textContent='Mortification: spend 1 Composure for +2 (reroll)';
    mb.onclick=()=>{
      G.stats.composure=Math.max((G.stats.composure||1)-1,1);G._mortificationSpent=true;
      const nr=performRoll(rollDef.stat,rollDef.difficulty,{awarenessBonus:rollDef.awarenessBonus||false,docCheck:rollDef.docCheck||false,social:rollDef.social||false,corporate:rollDef.corporate||false,threshold:rollDef.threshold||false,advantage:rollDef.advantage||false,critical:rollDef.critical||false,tempBonus:(rollDef.tempBonus||0)+2,opposed:rollDef.opposed||null});
      G.rollResult=nr;G.pendingRoll.result=nr;render();
    };
    box.appendChild(mb);
  }
  root.appendChild(box);
}

// ── Main game scene ───────────────────────────────────────────
export function renderGame(root) {
  if (!G.tutorialDone && G.scene === getInitialScene()) { _renderTutorial(root); return; }
  if (G.rollResult && G.pendingRoll) { _renderRollBox(root); return; }
  if (isRitualActive()) { renderRitual(root); return; }

  if (G._coverChallenge) {
    const scene = getScene(G.scene);
    if (scene) {
      const wrap = document.createElement('div'); wrap.className = 'game';
      wrap.appendChild(_buildHeader(scene));
      const body = document.createElement('div'); body.className = 'game-body';
      renderCoverChallengeOverlay(body, processText);
      body.appendChild(_buildRestartBar()); wrap.appendChild(body); root.appendChild(wrap);
    } else {
      renderCoverChallengeOverlay(root, processText);
    }
    _appendAudioBtn(root); _appendBottomNav(root);
    return;
  }

  processConsequenceQueue();
  resetIdleTimer();

  const scene = getScene(G.scene);
  if (!scene) { _registries.sceneNotFound(G.scene, root); return; }

  const liturgical = LITURGICAL_HOURS[G.liturgicalHour];
  if (liturgical) setMood(liturgical.mood); else setMood(scene.mood || 'neutral');
  saveGameLegacy();

  const visitKey = 'visited_' + G.scene, firstVisit = !hasFlag(visitKey);
  if (firstVisit) {
    setFlag(visitKey);
    if (scene.on_enter) {
      if (scene.on_enter.note)    addNote(scene.on_enter.note);
      if (scene.on_enter.flag)    setFlag(scene.on_enter.flag);
      if (scene.on_enter.thought) offerSounding(scene.on_enter.thought);
    }
  }

  const wrap = document.createElement('div'); wrap.className = 'game';
  const uiOp = getUiOpacity(); if (uiOp < 1) wrap.style.opacity = uiOp;
  wrap.appendChild(_buildHeader(scene));

  const body = document.createElement('div'); body.className = 'game-body';
  if (scene.art && _registries.art[scene.art]) {
    const art=document.createElement('pre');art.className='art-block';art.textContent=_registries.art[scene.art];body.appendChild(art);
  }
  if (G.lastReaction) {
    const rp=document.createElement('p');rp.className='sp sp-reaction';rp.textContent=G.lastReaction;body.appendChild(rp);G.lastReaction=null;
  }

  let rawText = scene.iconLayers ? resolveLayeredText(scene) : getSceneText(scene);
  rawText = injectMicroLines(rawText, scene);
  rawText = injectGhostText(rawText, G.scene);
  rawText = applyPastLifeLines(rawText, G.scene);

  const stxt = document.createElement('div');
  const wakingC = ['anamnesis','kenosis','tathagatagarbha','apophasis'];
  const isHalo  = scene.mood==='revelation' || G.charisms.some(id=>wakingC.includes(id));
  stxt.className = 'stxt' + (isHalo?' stxt-halo':'');
  const showAnam = G.playCount > 0 && scene.anamnesis;
  rawText.forEach((raw, idx) => {
    if (typeof raw==='string' && raw.startsWith('__GHOST__:')) {
      const gp=document.createElement('p');gp.className='sp sp-ghost';gp.textContent=raw.replace('__GHOST__:','');stxt.appendChild(gp);return;
    }
    const p=document.createElement('p');p.className='sp';p.innerHTML=processText(raw);stxt.appendChild(p);
    if (showAnam&&scene.anamnesis&&scene.anamnesis.after===idx) {
      const ap=document.createElement('p');ap.className='sp sp-anamnesis';ap.innerHTML=processText(scene.anamnesis.text);stxt.appendChild(ap);
      if (scene.anamnesis.note) addNote(scene.anamnesis.note);
    }
  });
  body.appendChild(stxt);

  if (G._dialogue) {
    renderDialogue(body, processText);
    body.appendChild(_buildRestartBar()); wrap.appendChild(body); root.appendChild(wrap);
    _appendAudioBtn(root); _appendBottomNav(root);
    return;
  }

  const cd = document.createElement('div'); cd.className='choices';
  if (scene.return_to) {
    const rb=document.createElement('button');rb.className='choice choice-return';rb.textContent=scene.return_label||'Return.';rb.onclick=()=>navigate(scene.return_to);cd.appendChild(rb);
  }
  if (scene.choices) {
    scene.choices.forEach(ch => {
      if (ch.hide_if && hasFlag(ch.hide_if)) return;
      if (ch.show_if && !hasFlag(ch.show_if)) return;
      if (ch.once && ch.next && hasFlag('visited_'+ch.next)) return;
      const btn = document.createElement('button');
      const locked = isChoiceLocked(ch);
      if (locked) {
        if (G.mode==='open') return;
        btn.className='choice choice-locked'; btn.disabled=true;
        let hint = processText(ch.text);
        if(ch.requires_stat)hint+=` [${ch.requires_stat[0]} ${ch.requires_stat[1]}+]`;
        if(ch.requires_charism)hint+=` [charism: ${ch.requires_charism}]`;
        if(ch.requires_playcount!==undefined)hint+=` [crossing ${ch.requires_playcount+1}+]`;
        if(ch.requires_item)hint+=` [requires: ${ch.requires_item}]`;
        if(ch.requires_theosis)hint+=` [theosis ${ch.requires_theosis}+]`;
        if(ch.requires_companion)hint+=` [companion: ${ch.requires_companion}]`;
        if(ch.requires_reputation_min)for(const[id,min]of Object.entries(ch.requires_reputation_min))hint+=` [${id}\u2265${min}]`;
        if(ch.requires_quest_state)for(const[id,state]of Object.entries(ch.requires_quest_state))hint+=` [${id}=${state}]`;
        if(ch.requires_belief)hint+=` [belief: ${ch.requires_belief}]`;
        if(ch.requires_knowledge)hint+=` [knowledge: ${ch.requires_knowledge}]`;
        if(ch.requires_past_flag)hint+=` [past: ${ch.requires_past_flag}]`;
        btn.textContent = hint;
      } else {
        const tv = ch.next && hasFlag('visited_'+ch.next) && scene.hub;
        let cls='choice';
        if(ch.type==='silence')cls+=' choice-silence';if(ch.style==='cold')cls+=' choice-cold';
        if(ch.style==='return')cls+=' choice-return';if(ch.style==='vespers')cls+=' choice-vespers';
        if(ch.cover_set)cls+=' choice-cover';if(ch.requires_charism)cls+=' choice-charism';
        if(tv)cls+=' choice-visited';if(ch.dialogue)cls+=' choice-dialogue';
        btn.className=cls;
        btn.innerHTML=(tv?'\u25e6 ':'')+processText(ch.text);
        if(ch.cover_set&&!hasFlag('cover_'+ch.cover_set.key+'_set')){const l=document.createElement('span');l.className='cover-label';l.textContent='\u2b25 establishing cover';btn.appendChild(l);}
        if(ch.requires_charism){const l=document.createElement('span');l.className='charism-label';l.textContent='\u25c8 '+ch.requires_charism;btn.appendChild(l);}
        if(ch.give_item){const l=document.createElement('span');l.className='item-label';l.textContent='+ '+ch.give_item;btn.appendChild(l);}
        if(ch.take_item){const l=document.createElement('span');l.className='item-label';l.textContent='- '+ch.take_item;btn.appendChild(l);}
        if(ch.advance_time){const l=document.createElement('span');l.className='time-label';l.textContent=`\u23f1 +${ch.advance_time}h`;btn.appendChild(l);}
        if(ch.mod_reputation){const l=document.createElement('span');l.className='reputation-label';l.textContent=Object.entries(ch.mod_reputation).map(([id,d])=>`${id} ${d>0?'+'+d:d}`).join(', ');btn.appendChild(l);}
        if(ch.set_quest_state){const l=document.createElement('span');l.className='quest-label';l.textContent=Object.entries(ch.set_quest_state).map(([id,s])=>`${id}\u2192${s}`).join(', ');btn.appendChild(l);}
        btn.onclick=(ch.roll&&typeof ch.roll==='object')?()=>startRoll(ch):()=>applyChoice(ch);
      }
      cd.appendChild(btn);
    });
  }
  body.appendChild(cd);

  if (G.notes.length) {
    const od=document.createElement('div');od.className='obs-section';
    const ot=document.createElement('div');ot.className='obs-title';ot.textContent='observations';od.appendChild(ot);
    const cats=[{label:'People',test:k=>k.startsWith('met_')},{label:'Cover',test:k=>k.startsWith('cover_')},{label:'Events',test:k=>!k.startsWith('met_')&&!k.startsWith('cover_')&&!k.startsWith('charism_')}];
    const shown=new Set();
    cats.forEach(cat=>{
      const items=[...G.notes].reverse().filter(k=>cat.test(k)&&!shown.has(k)).slice(0,3);if(!items.length)return;
      const sec=document.createElement('div');sec.style.cssText='font-size:.6rem;color:var(--amber-dim);letter-spacing:.12em;text-transform:uppercase;margin:.4rem 0 .2rem';sec.textContent=cat.label;od.appendChild(sec);
      items.forEach(k=>{shown.add(k);const d=document.createElement('div');d.className='obs-item';d.textContent='\u2022 '+noteLabel(k);od.appendChild(d);});
    });
    body.appendChild(od);
  }

  body.appendChild(_buildRestartBar()); wrap.appendChild(body); root.appendChild(wrap);
  _appendAudioBtn(root); _appendBottomNav(root);

  if(G.panelOpen==='notes')    _renderNotesPanel(root);
  if(G.panelOpen==='status')   _renderStatusPanel(root);
  if(G.panelOpen==='breviary') _renderBreviaryPanel(root);
  if(G.panelOpen==='glossary') _renderGlossaryPanel(root);
  if(G.panelOpen==='map')      _renderMapPanelSide(root);
  if(G.panelOpen==='journal')  renderJournalPanel(root, openPanel);
  if(G.panelOpen==='log')      renderEventLogPanel(root, openPanel);
}

// ── Shared UI helpers ─────────────────────────────────────────
function _buildHeader(scene) {
  const hdr = document.createElement('div'); hdr.className='game-header';
  const si  = document.createElement('div'); si.className='save-indicator'; si.textContent='\u25e6 autosaved'; si.style.display='none'; hdr.appendChild(si);
  const moodCls = scene.mood==='uncanny'?' uncanny':scene.mood==='revelation'?' revelation':'';
  const lb = document.createElement('div'); lb.className='location-bar'+moodCls; lb.textContent=scene.location; hdr.appendChild(lb);
  const sb = document.createElement('div'); sb.className='sbar';
  const STAT_TIPS = _registries.statTips;
  Object.entries(G.stats).forEach(([k,v])=>{
    const d=document.createElement('div');d.className='stat';
    d.innerHTML=k+' <span class="stat-val">'+v+'</span>'+(STAT_TIPS[k]?'<span class="stat-tip">'+STAT_TIPS[k]+'</span>':'');
    sb.appendChild(d);
  });
  hdr.appendChild(sb);
  const tags=[];
  G.charisms.forEach(id=>{const c=findCharism(id);if(c)tags.push(`<span class="ctag" title="${c.desc}">${c.name}</span>`);});
  const cc=Object.values(G.cover).filter(Boolean).length;
  if(cc>0)tags.push('<span class="cover-tag">cover '+cc+'/5</span>');
  if(G.coverIntegrity<3){const ci=G.coverIntegrity===0?'blown':G.coverIntegrity===1?'thin':'questioned';tags.push(`<span class="cover-tag" style="border-color:var(--rust);color:var(--rust)">cover ${ci}</span>`);}
  const tc=G.soundings.taken.length+G.soundings.settled.length,ta=G.soundings.available.length;
  if(tc>0||ta>0)tags.push(`<span class="breviary-tag">\u2693 ${tc}/${MAX_SOUNDINGS}${ta?' +'+ta:''}</span>`);
  if(G.journal&&G.journal.length)tags.push(`<span class="journal-tag">\u2021 ${G.journal.length}</span>`);
  if(tags.length){const cb=document.createElement('div');cb.className='cbar';cb.innerHTML=tags.join('');hdr.appendChild(cb);}
  return hdr;
}

function _buildRestartBar() {
  const rb=document.createElement('div');rb.className='restart-bar';
  if(G.confirmRestart){
    const msg=document.createElement('span');msg.className='confirm-msg';msg.textContent='End this crossing?';rb.appendChild(msg);
    const yes=document.createElement('button');yes.className='btn confirm-yes';yes.textContent='Yes \u2014 return to shore';yes.onclick=doRestart;rb.appendChild(yes);
    const no=document.createElement('button');no.className='btn confirm-no';no.textContent='No \u2014 continue';no.onclick=()=>{G.confirmRestart=false;render();};rb.appendChild(no);
  }else{
    const rbt=document.createElement('button');rbt.className='btn restart-btn';rbt.textContent='abandon crossing';rbt.onclick=()=>{G.confirmRestart=true;render();};rb.appendChild(rbt);
  }
  return rb;
}

function _appendAudioBtn(root) {
  const ab=document.createElement('button');ab.id='audio-btn';
  ab.style.cssText="position:fixed;top:.55rem;right:.8rem;background:none;border:none;font-family:'Courier Prime',monospace;font-size:.7rem;color:var(--dim);cursor:pointer;z-index:200;letter-spacing:.08em;padding:.2rem .4rem";
  ab.textContent=_audioOn?'\u266a on':'\u266a off';ab.onclick=toggleAudio;root.appendChild(ab);
}

function _appendBottomNav(root) {
  const bnav=document.createElement('div');bnav.id='bottom-nav';
  bnav.style.cssText='position:fixed;bottom:0;left:0;width:100%;z-index:100;display:flex;justify-content:center;background:rgba(6,8,12,0.96);border-top:1px solid var(--border)';
  const navItems = [
    { label:'observations', fn:()=>openPanel('notes') },
    { label:'status',       fn:()=>openPanel('status') },
    { label:'breviary'+(G.soundings.available.length?' \u2691':''), fn:()=>openPanel('breviary'), cls:G.soundings.available.length?' has-available':'' },
    { label:'glossary',     fn:()=>openPanel('glossary') },
    ...(G.journal&&G.journal.length ? [{ label:'journal', fn:()=>openPanel('journal') }] : []),
    ...(G.mode!=='witnessed'        ? [{ label:'log',     fn:()=>openPanel('log')     }] : []),
    { label:'map',          fn:()=>openPanel('map') },
  ];
  navItems.forEach(({label,fn,cls=''})=>{
    const b=document.createElement('button');
    b.style.cssText="flex:1;background:none;border:none;border-right:1px solid var(--border);font-family:'Courier Prime',monospace;font-size:.66rem;letter-spacing:.07em;padding:.55rem .3rem;cursor:pointer;color:var(--dim)";
    b.className=cls;b.textContent=label;b.onclick=fn;bnav.appendChild(b);
  });
  root.appendChild(bnav);
}

// ── Panel stubs ───────────────────────────────────────────────
function _renderNotesPanel(root)    { /* TODO: port from v3.1 */ }
function _renderStatusPanel(root)   { /* TODO: port from v3.1 */ }
function _renderBreviaryPanel(root) { /* TODO: port from v3.1 */ }
function _renderGlossaryPanel(root) { /* TODO: port from v3.1 */ }
function _renderMapPanelSide(root)  { /* TODO: port from v3.1 */ }
