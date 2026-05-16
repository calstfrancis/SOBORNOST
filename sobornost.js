// ============================================================
// SOBORNOST ENGINE — sobornost.js
// Single-file build. v3.3.1
// Section order (dependency graph):
//   debug → events → state → schedule → registries →
//   mechanics → conditions → soundings → theosis →
//   atmosphere → audio → history → save → journal →
//   companions → roll → rituals → navigation → ambient →
//   codex → cover → dialogue → endings → eventlog →
//   devmode → validate → text → idle → widgets → renderer →
//   public API
// ============================================================

'use strict';

// ============================================================
// SECTION: core/debug.js
// ============================================================

let DEBUG = false;
function setDebug(e) { DEBUG = e; console.log(`Debug mode ${e ? 'enabled' : 'disabled'}`); }
function debugLog(...a) { if (DEBUG) console.log('[DEBUG]', ...a); }


// ============================================================
// SECTION: core/events.js
// NOTE: recordEvent is defined later in eventlog section but
// hoisted via var — we forward-declare it here for emit().
// In a single file, functions are hoisted so emit() calling
// recordEvent() is safe as long as recordEvent is declared
// before first emit() is actually called (which happens only
// after all code runs).
// ============================================================

const _bus = {};

function on(event, callback) {
  if (!_bus[event]) _bus[event] = [];
  _bus[event].push(callback);
}

function off(event, callback) {
  if (!_bus[event]) return;
  _bus[event] = _bus[event].filter(cb => cb !== callback);
}

function emit(event, data) {
  // Direct call — recordEvent defined in eventlog section below
  recordEvent(event, data);
  if (!_bus[event]) { debugLog('emit (no listeners):', event, data); return; }
  _bus[event].forEach(cb => cb(data));
  debugLog('emit:', event, data);
}


// ============================================================
// SECTION: core/state.js
// ============================================================

const G = {
  phase: 'title', mode: 'attended',
  stats: { vigilance: 0, composure: 0, communion: 0, doubt: 0 },
  charisms: [],
  cover: { posting: null, background: null, denomination: null, connection: null, left: null },
  coverIntegrity: 5,
  soundings: { available: [], taken: [], settled: [], released: [] }, soundingPending: null,
  notes: [], flags: new Set(), scene: null, lastReaction: null,
  panelOpen: null, confirmRestart: false, tutorialDone: false, playCount: 0, pastFlags: [],
  inventory: [],
  time: { day: 1, hour: 8, maxDays: 3 }, reputation: {}, quests: {}, crossingLog: [],
  pendingRoll: null, rollResult: null, awareness: 0,
  _poaAbsorbedThisScene: false, _mortificationSpent: false,
  beliefs: new Set(), knowledge: new Set(),
  consequenceQueue: [], npcStance: {}, eventQueue: [],
  pastLifeFlags: new Set(), _kenosisProgress: 0,
  liturgicalHour: 4, metaUnlocks: {}, _analyticsLog: [],
  companions: [], theosis: 0, _theosisFlashTimer: null,
  _dialogue: null,
  journal: [],
  eventLog: [],
  _sceneCount: 0,
  _coverChallenge: null,
  deadlines: [],
  choiceHistory: {},
  codexUnlocked: new Set(),
  ambientTriggered: new Set(),
  magneticDeviation: 0.0,  // 0.0 = true north, 1.0 = maximum anomaly
};

function resetG(preserve = {}) {
  if (G._theosisFlashTimer) { clearTimeout(G._theosisFlashTimer); G._theosisFlashTimer = null; }
  G.phase = 'title'; G.mode = 'attended';
  G.stats = { vigilance: 0, composure: 0, communion: 0, doubt: 0 };
  G.charisms = [];
  G.cover = { posting: null, background: null, denomination: null, connection: null, left: null };
  G.coverIntegrity = 5;
  G.soundings = { available: [], taken: [], settled: [], released: [] }; G.soundingPending = null;
  G.notes = []; G.flags = new Set(); G.scene = null; G.lastReaction = null;
  G.panelOpen = null; G.confirmRestart = false; G.tutorialDone = false;
  G.playCount = 0; G.pastFlags = []; G.inventory = [];
  G.time = { day: 1, hour: 8, maxDays: 3 }; G.reputation = {}; G.quests = {}; G.crossingLog = [];
  G.pendingRoll = null; G.rollResult = null; G.awareness = 0;
  G._poaAbsorbedThisScene = false; G._mortificationSpent = false;
  G.beliefs = new Set(); G.knowledge = new Set();
  G.consequenceQueue = []; G.npcStance = {}; G.eventQueue = [];
  G.pastLifeFlags = new Set(); G._kenosisProgress = 0;
  G.liturgicalHour = 4; G.metaUnlocks = {}; G._analyticsLog = [];
  G.companions = []; G.theosis = 0;
  G._dialogue = null; G.journal = []; G.eventLog = [];
  G._sceneCount = 0; G._coverChallenge = null;
  G.deadlines = []; G.choiceHistory = {};
  G.codexUnlocked = new Set(); G.ambientTriggered = new Set();
  G.magneticDeviation = 0.0; // will be adjusted post-reset by anomaly-grows system
  Object.assign(G, preserve);
}


// ============================================================
// SECTION: systems/schedule.js
// ============================================================

let _renderFn  = null;
let _scheduled = false;

function setRenderFn(fn) { _renderFn = fn; }


// ─────────────────────────────────────────────────────────────────
// KEYBOARD NAVIGATION
// ─────────────────────────────────────────────────────────────────
function _initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Escape: close open panel
    if (e.key === 'Escape' && G.panelOpen) { openPanel(null); return; }
    // Escape: dismiss cover challenge
    if (e.key === 'Escape' && G._coverChallenge && !G._coverChallenge.resolved) return; // can't escape challenge
    // Number keys 1-9: activate nth choice
    if (e.key >= '1' && e.key <= '9' && !G.panelOpen && !G._coverChallenge) {
      const n = parseInt(e.key) - 1;
      const choices = document.querySelectorAll('.choices .choice:not([disabled])');
      if (choices[n]) { choices[n].click(); e.preventDefault(); }
      return;
    }
    // Enter/Space on focused choice: activate
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('choice')) {
      document.activeElement.click(); e.preventDefault();
    }
    // Arrow keys for panel navigation when panel open
    if (G.panelOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const items = document.querySelectorAll('.panel-body .obs-note, .panel-body .codex-entry, .panel-body .map-node');
      if (!items.length) return;
      const focused = Array.from(items).findIndex(el => el === document.activeElement);
      const next = e.key === 'ArrowDown' ? Math.min(focused + 1, items.length - 1) : Math.max(focused - 1, 0);
      items[next]?.focus();
      e.preventDefault();
    }
  });
}

let _lastScrolledScene = null;
function scheduleRender() {
  if (_scheduled) return;
  if (!_renderFn) { console.warn('[SOBORNOST] scheduleRender() called before renderer registered'); return; }
  _scheduled = true;
  const _sceneAtSchedule = G.scene;
  queueMicrotask(() => {
    _scheduled = false; _renderFn();
    // Only scroll when the scene actually changed — prevents disorienting
    // scroll-snapping during panel opens, stat updates, dialogue advances
    if (_sceneAtSchedule !== _lastScrolledScene) {
      _lastScrolledScene = _sceneAtSchedule;
      // Scroll every possible container — belt, suspenders, and a third belt
      const _doScroll = () => {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          const root = document.getElementById('root');
          if (root) { root.scrollTop = 0; root.scrollLeft = 0; }
          // If root is the scroll container (iOS common pattern), find first text element
          const firstP = document.querySelector('.game-body .sp, .game-body p');
          if (firstP) firstP.scrollIntoView({ block: 'start', behavior: 'instant' });
        } catch(e) {}
      };
      requestAnimationFrame(() => { requestAnimationFrame(_doScroll); });
    }
  });
}


// ============================================================
// SECTION: systems/registries.js
// ============================================================

const _registries = {
  charisms: { sleeping: [], waking: [] },
  soundings: {}, notes: {}, art: {}, glossary: [], statTips: {},
  iconWordFn: null, harbourWordFn: null, shipWordFn: null, objectDescriptionFn: null,
  rollModifiers: [], availableModes: ['attended', 'open', 'witnessed'],
  scenePools: {}, rituals: {}, translations: {}, postEventShifts: [], pastLifeLines: {},
  sfxLibrary: {}, mapNodes: {}, items: {}, tutorialContent: null,
  scenes: {},
  sceneNotFound: (sceneId, root) => {
    console.error(`[SOBORNOST] Scene not found: "${sceneId}"`);
    const p = document.createElement('p');
    p.style.cssText = 'padding:2rem;color:var(--rust,#c06060);font-family:monospace;font-size:.9rem;';
    p.textContent = `Scene not found: "${sceneId}" — check registerScenes() call`;
    root.appendChild(p);
  },
};

let _initialScene = null;
function setInitialScene(sceneId) {
  if (!sceneId || typeof sceneId !== 'string') { console.error('[SOBORNOST] setInitialScene() requires a non-empty scene ID string'); return; }
  _initialScene = sceneId;
}
function getInitialScene() { return _initialScene; }

function registerScenes(obj)         { Object.assign(_registries.scenes, obj); }
function getScene(id)                { return _registries.scenes[id] ?? null; }
function setSceneNotFoundHandler(fn) { _registries.sceneNotFound = fn; }

function registerCharisms(sleepingList, wakingList) {
  if (sleepingList) _registries.charisms.sleeping = sleepingList;
  if (wakingList)   _registries.charisms.waking   = wakingList;
}
function allCharisms()   { return [..._registries.charisms.sleeping, ..._registries.charisms.waking]; }
function findCharism(id) { return allCharisms().find(c => c.id === id); }

function registerSounding(id, data)      { _registries.soundings[id] = data; }
function registerNote(key, value)         { _registries.notes[key] = value; }
function registerArt(id, ascii)           { _registries.art[id] = ascii; }
function registerGlossaryEntry(term, def) { _registries.glossary.push({ term, def }); }
function registerStatTip(stat, tip)       { _registries.statTips[stat] = tip; }
function noteLabel(k) { const n = _registries.notes[k]; if (!n) return k; return typeof n === 'function' ? n() : n; }

function setIconWordFunction(fn)          { _registries.iconWordFn = fn; }
function setHarbourWordFunction(fn)       { _registries.harbourWordFn = fn; }
function setShipWordFunction(fn)          { _registries.shipWordFn = fn; }
function setObjectDescriptionFunction(fn) { _registries.objectDescriptionFn = fn; }

function registerRollModifier(statKey, condition, bonusCallback) { _registries.rollModifiers.push({ statKey, condition, bonusCallback }); }
function setAvailableModes(modeArray)       { _registries.availableModes = modeArray; }
function setModeDescriptions(descs)          { _registries.modeDescriptions = descs || {}; }
function getModeDescription(id)              { return (_registries.modeDescriptions||{})[id] || null; }
function registerScenePool(poolId, entries) { _registries.scenePools[poolId] = entries; }
function addToScenePool(poolId, entry) {
  if (!_registries.scenePools[poolId]) _registries.scenePools[poolId] = [];
  _registries.scenePools[poolId].push(entry);
}
function registerRitual(ritual)                               { _registries.rituals[ritual.id] = ritual; }
function registerTranslation(original, translated)            { _registries.translations[original] = translated; }
function registerPostEventShift(triggerFlag, patterns)        { _registries.postEventShifts.push({ triggerFlag, patterns }); }
function registerPastLifeLine(sceneId, pattern, replacement, index) {
  if (!_registries.pastLifeLines[sceneId]) _registries.pastLifeLines[sceneId] = [];
  _registries.pastLifeLines[sceneId].push({ pattern, replacement, index });
}
function registerMapNode(nodeId, connections) { _registries.mapNodes[nodeId] = { connections, visited: false }; }
function registerSfx(name, playFunction)      { _registries.sfxLibrary[name] = playFunction; }
function registerItem(id, data)               { _registries.items[id] = data; }
function setTutorialContent(contentHtml)      { _registries.tutorialContent = contentHtml; }


// ============================================================
// SECTION: systems/mechanics.js
// ============================================================

let _toastQueue = [], _toastActive = false;
function showToast(msg, type='note') {
  _toastQueue.push({ msg, type });
  if (!_toastActive) _flushToast();
}
function _flushToast() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type } = _toastQueue.shift();
  const old = document.querySelector('.toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'note');
  t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); _flushToast(); }, 3500);
}

function hasFlag(f) { return G.flags.has(f); }
function setFlag(f) { if (f) G.flags.add(f); emit('flagSet', f); }

function addNote(key) {
  if (!key || G.notes.includes(key)) return;
  G.notes.push(key);
  const l = noteLabel(key);
  showToast(l.length > 52 ? l.slice(0, 52) + '\u2026' : l, 'note');
  emit('noteAdded', key);
}

function applyEffect(e) {
  if (!e) return;
  const hasPoa = G.charisms.includes('presence_of_absence');
  for (const [k, v] of Object.entries(e)) {
    if (G.stats[k] !== undefined) {
      if (k === 'composure' && v > 0 && G.mode === 'witnessed') continue;
      if (v < 0 && hasPoa) { if (!G._poaAbsorbedThisScene) { G._poaAbsorbedThisScene = true; showToast('\u2014', 'note'); } continue; }
      G.stats[k] = Math.max(0, G.stats[k] + v);
      emit('statChanged', { stat: k, delta: v });
    }
  }
}

function setCover(key, value) { G.cover[key] = value; setFlag('cover_' + key + '_set'); }
function rollCover(difficulty) {
  const roll = Math.ceil(Math.random() * 6), bonus = Math.floor(G.stats.composure / 2), total = roll + bonus;
  if (total >= difficulty + 2) return 'success'; if (total >= difficulty) return 'partial'; return 'failure';
}
function degradeCover(amount) { G.coverIntegrity = Math.max(0, G.coverIntegrity - amount); emit('coverIntegrityChanged', G.coverIntegrity); }

function advanceTime(hours) {
  G.time.hour += hours;
  while (G.time.hour >= 24) { G.time.hour -= 24; G.time.day++; }
  processEventQueue();
  const deadlineFired = checkDeadlines();
  saveGameLegacy(); // direct call — no dynamic import
  emit('timeAdvanced', { hours, day: G.time.day, hour: G.time.hour });
  scheduleRender();
  return { deadlineFired };
}

function modReputation(id, delta) {
  if (!G.reputation[id]) G.reputation[id] = 0; G.reputation[id] += delta;
  emit('reputationChanged', { id, delta, new: G.reputation[id] }); scheduleRender();
}
function getReputation(id) { return G.reputation[id] || 0; }
function setReputation(id, val) { G.reputation[id] = val; emit('reputationSet', { id, val }); scheduleRender(); }

function setQuestState(id, state) { G.quests[id] = state; emit('questStateChanged', { id, state }); }
function getQuestState(id)        { return G.quests[id] || 'inactive'; }
function isQuestActive(id)        { return getQuestState(id) === 'active'; }
function isQuestCompleted(id)     { return getQuestState(id) === 'completed'; }

let _heldBonuses = {};
function recalculateHeldEffects() {
  const oldBonuses = { ..._heldBonuses }; _heldBonuses = {};
  for (const itemId of G.inventory) {
    const item = _registries.items[itemId];
    if (item && item.effectWhileHeld)
      for (const [stat, delta] of Object.entries(item.effectWhileHeld))
        _heldBonuses[stat] = (_heldBonuses[stat] || 0) + delta;
  }
  const allStats = new Set([...Object.keys(oldBonuses), ...Object.keys(_heldBonuses)]);
  for (const stat of allStats) {
    const delta = (_heldBonuses[stat] || 0) - (oldBonuses[stat] || 0);
    if (delta !== 0) { G.stats[stat] = Math.max(0, (G.stats[stat] || 0) + delta); emit('statChanged', { stat, delta }); }
  }
}
function hasItem(id) { return G.inventory.includes(id); }
function addItem(id) { if (!hasItem(id)) { G.inventory.push(id); recalculateHeldEffects(); const it=_registries.items?_registries.items[id]:null; showToast('Carried: '+(it&&it.name?it.name:id)+'.', 'note'); emit('itemAdded', id); scheduleRender(); } }
function removeItem(id) { G.inventory = G.inventory.filter(i => i !== id); recalculateHeldEffects(); emit('itemRemoved', id); scheduleRender(); }

function _ensureStance(npcId) { if (!G.npcStance[npcId]) G.npcStance[npcId] = { trust: 0, suspicion: 0, solidarity: 0, memories: [] }; }
function getStance(npcId, key) { _ensureStance(npcId); return G.npcStance[npcId][key] || 0; }
function setStance(npcId, key, value) {
  _ensureStance(npcId); const old = G.npcStance[npcId][key]; G.npcStance[npcId][key] = value;
  if (old !== value) emit('stanceChanged', { npcId, key, old, new: value });
}
function modStance(npcId, key, delta) {
  const cur = getStance(npcId, key); setStance(npcId, key, cur + delta);
  // Reputation changes are silent — tracked in observations panel
}
function recordNpcMemory(npcId, memory) {
  _ensureStance(npcId);
  const entry = { text: memory, timestamp: Date.now(), scene: G.scene, crossing: G.playCount };
  G.npcStance[npcId].memories = G.npcStance[npcId].memories || [];
  G.npcStance[npcId].memories.push(entry);
  emit('npcMemoryRecorded', { npcId, memory: entry });
}
function getNpcMemories(npcId) { _ensureStance(npcId); return G.npcStance[npcId].memories || []; }
function hasNpcMemory(npcId, pattern) { return getNpcMemories(npcId).some(m => m.text.includes(pattern)); }

function learn(flag)         { G.knowledge.add(flag); G.beliefs.add(flag); emit('learned', flag); }
function comeToBelieve(flag) { if (!G.knowledge.has(flag)) G.beliefs.add(flag); emit('believed', flag); }
function contradict(flag)    { G.beliefs.delete(flag); emit('contradicted', flag); }
function knows(flag)         { return G.knowledge.has(flag); }
function believes(flag)      { return G.beliefs.has(flag); }

let _processingConsequences = false;

function pushConsequence(consequence) { G.consequenceQueue.push(consequence); emit('consequencePushed', consequence); }

function _fireConsequence(c) {
  if (c.flagsToSet) c.flagsToSet.forEach(f => setFlag(f));
  if (c.effect)     applyEffect(c.effect);
  if (c.sceneToRun) { G.scene = c.sceneToRun; return true; }
  return false;
}

function processConsequenceQueue() {
  if (_processingConsequences) return;
  _processingConsequences = true;
  let sceneChanged = false;
  for (let i = 0; i < G.consequenceQueue.length; i++) {
    const c = G.consequenceQueue[i];
    if (c.delay_scenes !== undefined || c.on_next_choice) continue;
    if (c.condition && !c.condition()) continue;
    if (_fireConsequence(c)) sceneChanged = true;
    G.consequenceQueue.splice(i, 1); i--;
    emit('consequenceProcessed', c);
  }
  _processingConsequences = false;
  if (sceneChanged) scheduleRender();
}

function tickDelayedConsequences() {
  let sceneChanged = false;
  for (let i = 0; i < G.consequenceQueue.length; i++) {
    const c = G.consequenceQueue[i];
    if (c.delay_scenes === undefined) continue;
    c.delay_scenes--;
    if (c.delay_scenes <= 0) {
      if (_fireConsequence(c)) sceneChanged = true;
      G.consequenceQueue.splice(i, 1); i--;
      emit('consequenceProcessed', c);
    }
  }
  if (sceneChanged) scheduleRender();
}

function fireNextChoiceConsequences() {
  const toFire = G.consequenceQueue.filter(c => c.on_next_choice);
  G.consequenceQueue = G.consequenceQueue.filter(c => !c.on_next_choice);
  let sceneChanged = false;
  for (const c of toFire) { if (_fireConsequence(c)) sceneChanged = true; emit('consequenceProcessed', c); }
  return sceneChanged;
}

function scheduleEvent(event) {
  G.eventQueue.push(event);
  saveGameLegacy(); // direct call — no dynamic import
  emit('eventScheduled', event);
}

function setDeadline(id, day, hour, sceneId, options = {}) {
  G.deadlines = G.deadlines.filter(d => d.id !== id);
  G.deadlines.push({ id, day, hour, sceneId, fired: false, condition: options.condition || null, once: options.once !== false });
  emit('deadlineSet', { id, day, hour, sceneId });
}
function removeDeadline(id) {
  const before = G.deadlines.length; G.deadlines = G.deadlines.filter(d => d.id !== id);
  if (G.deadlines.length < before) emit('deadlineRemoved', id);
}
function checkDeadlines() {
  let fired = false; const toRemove = [];
  for (const d of G.deadlines) {
    if (d.fired) continue;
    if (!(G.time.day > d.day || (G.time.day === d.day && G.time.hour >= d.hour))) continue;
    if (d.condition && !evaluateCondition(d.condition)) continue;
    d.fired = true;
    if (d.sceneId) { G.scene = d.sceneId; emit('deadlineFired', { id: d.id, sceneId: d.sceneId }); fired = true; }
    if (d.once) toRemove.push(d.id);
  }
  G.deadlines = G.deadlines.filter(d => !toRemove.includes(d.id));
  return fired;
}

function processEventQueue() {
  const pending = [];
  for (let i = G.eventQueue.length - 1; i >= 0; i--) {
    const ev = G.eventQueue[i];
    const { triggerTime, sceneId, conditions, once = true } = ev;
    if (G.time.day === triggerTime.day && G.time.hour === triggerTime.hour) pending.push({ ev, idx: i, sceneId, conditions, once });
  }
  if (!pending.length) return;
  const indicesToRemove = pending.filter(p => p.once).map(p => p.idx).sort((a, b) => b - a);
  indicesToRemove.forEach(idx => G.eventQueue.splice(idx, 1));
  let processed = false;
  for (const { ev, sceneId, conditions } of pending) {
    if (conditions && !evaluateCondition(conditions)) continue;
    if (sceneId) { G.scene = sceneId; emit('eventTriggered', ev); processed = true; }
  }
  if (processed) scheduleRender();
}

// ============================================================
// SECTION: systems/conditions.js
// ============================================================

function evaluateCondition(cond) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every(c => evaluateCondition(c));
  switch (cond.type) {
    case 'flag':            return hasFlag(cond.id) === (cond.state !== false);
    case 'mode':          return G.mode === cond.mode;
    case 'stat': {
      // Support both G.stats and special values like coverIntegrity
      let val = 0;
      if (cond.stat === 'coverIntegrity' || cond.name === 'coverIntegrity') val = G.coverIntegrity !== undefined ? G.coverIntegrity : 5;
      else val = G.stats[cond.stat||cond.name] || 0;
      const minOk = cond.min === undefined || val >= cond.min;
      const maxOk = cond.max === undefined || val <= cond.max;
      return minOk && maxOk;
    }
    case 'charism':         return G.charisms.includes(cond.id);
    case 'hour':            return G.liturgicalHour !== undefined && G.liturgicalHour === cond.value;
    case 'hour_gte':        return G.liturgicalHour !== undefined && G.liturgicalHour >= cond.value;
    case 'hour_lte':        return G.liturgicalHour !== undefined && G.liturgicalHour <= cond.value;
    case 'believes':        return G.beliefs && G.beliefs.has(cond.id);
    case 'knows':           return G.knowledge && G.knowledge.has(cond.id);
    case 'not_believes':    return !G.beliefs || !G.beliefs.has(cond.id);
    case 'item':            return hasItem(cond.id);
    case 'playcount':       return G.playCount >= (cond.min || 0);
    case 'awareness':       return (G.awareness || 0) >= (cond.min || 0);
    case 'belief':          return believes(cond.id);
    case 'knowledge':       return knows(cond.id);
    case 'stance':          return getStance(cond.npc, cond.key) >= (cond.min || 0);
    case 'past_flag':       return G.pastLifeFlags.has(cond.id);
    case 'liturgical_hour': return G.liturgicalHour === cond.hour;
    case 'companion':       return hasCompanion(cond.id);
    case 'theosis':         return G.theosis >= (cond.min || 0);
    case 'or':              return (cond.conditions || []).some(c => evaluateCondition(c));
    case 'and':             return (cond.conditions || []).every(c => evaluateCondition(c));
    case 'not':             return !evaluateCondition(cond.condition);
    default:                return true;
  }
}

function isChoiceLocked(ch) {
  if (ch.condition) return !evaluateCondition(ch.condition);
  if (ch.requires_theosis && G.theosis < ch.requires_theosis) return true;
  if (ch.requires_companion && !hasCompanion(ch.requires_companion)) return true;
  if (ch.requires_past_flag && !G.pastLifeFlags.has(ch.requires_past_flag)) return true;
  if (ch.requires_flag && !hasFlag(ch.requires_flag)) return true;
  if (ch.requires_stat) { const [s, m] = ch.requires_stat; if ((G.stats[s] || 0) < m) return true; }
  if (ch.requires_charism && !G.charisms.includes(ch.requires_charism)) return true;
  if (ch.requires_playcount !== undefined && G.playCount < ch.requires_playcount) return true;
  if (ch.requires_item && !hasItem(ch.requires_item)) return true;
  if (ch.requires_time_from) { const [h] = ch.requires_time_from.split(':'); if (G.time.hour < h) return true; }
  if (ch.requires_reputation_min) { for (const [id, min] of Object.entries(ch.requires_reputation_min)) if (getReputation(id) < min) return true; }
  if (ch.requires_quest_state) { for (const [id, state] of Object.entries(ch.requires_quest_state)) if (getQuestState(id) !== state) return true; }
  if (ch.requires_belief && !believes(ch.requires_belief)) return true;
  if (ch.requires_knowledge && !knows(ch.requires_knowledge)) return true;
  return false;
}


// ============================================================
// SECTION: systems/soundings.js
// ============================================================

const MAX_SOUNDINGS      = 4;
const SOUNDING_THRESHOLD = 6; // reachable naturally with tagged choices

function soundingSlotsFull() { return G.soundings.taken.length + G.soundings.settled.length >= MAX_SOUNDINGS; }

function offerSounding(id) {
  if (!id || !_registries.soundings[id]) return;
  if (G.soundings.available.includes(id) || G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  G.soundings.available.push(id);
  const _snd = _registries.soundings[id];
  showToast('Sounding available: ' + (_snd ? _snd.name : id) + '.', 'sounding');
  emit('soundingOffered', id);
}

function settleSounding(soundingId) {
  const idx = G.soundings.taken.findIndex(t => t.id === soundingId);
  if (idx !== -1) {
    G.soundings.taken.splice(idx, 1);
    if (!G.soundings.settled.includes(soundingId)) {
      G.soundings.settled.push(soundingId);
      const snd = _registries.soundings[soundingId];
      // Apply effects
      if (snd && snd.theosis) incrementTheosis(snd.theosis);
      if (snd && snd.stat && snd.statDelta) applyEffect({ [snd.stat]: snd.statDelta });
      if (snd && snd.effect) applyEffect(snd.effect);
      if (snd && snd.onSettle) { try { snd.onSettle(); } catch(e) { console.error('onSettle error:', e); } }
      playSfx('sounding_settle');
      // Restore 1 cover integrity on settle (groundedness shores up the performance)
      if (G.coverIntegrity !== undefined && G.coverIntegrity < 5) {
        G.coverIntegrity = Math.min(5, G.coverIntegrity + 1);
      }
      refreshAtmosMods(); emit('soundingSettled', soundingId);
      // Show settle overlay — extended meditation on what was found
      if (snd && (snd.settleText || snd.settleTitle)) {
        _showSoundingSettleOverlay(snd);
      } else {
        showToast((snd ? snd.name : soundingId) + ' — settled.', 'theosis');
      }
    }
  }
}

function _showSoundingSettleOverlay(snd) {
  // Remove any existing overlay
  document.querySelectorAll('.sounding-settle-overlay').forEach(el => el.remove());
  const ov = document.createElement('div');
  ov.className = 'sounding-settle-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'Sounding settled');

  const inner = document.createElement('div');
  inner.className = 'sounding-settle-inner';

  // Header label
  const label = document.createElement('div');
  label.className = 'sounding-settle-label';
  label.textContent = 'settled';
  inner.appendChild(label);

  // Sounding name
  const name = document.createElement('div');
  name.className = 'sounding-settle-name';
  name.textContent = snd.name || '';
  inner.appendChild(name);

  // Divider
  const div1 = document.createElement('div');
  div1.className = 'sounding-settle-divider';
  inner.appendChild(div1);

  // Extended settle text — the meditation
  if (snd.settleText) {
    const paras = Array.isArray(snd.settleText) ? snd.settleText : snd.settleText.split('\n\n');

    paras.forEach(para => {
      const p = document.createElement('p');
      p.className = 'sounding-settle-para';
      p.textContent = para.trim();
      inner.appendChild(p);
    });
  }

  // What has changed
  if (snd.settleDesc) {
    const div2 = document.createElement('div');
    div2.className = 'sounding-settle-divider';
    inner.appendChild(div2);
    const desc = document.createElement('div');
    desc.className = 'sounding-settle-desc';
    desc.textContent = snd.settleDesc;
    inner.appendChild(desc);
  }

  // Continue button
  const btn = document.createElement('button');
  btn.className = 'btn sounding-settle-btn';
  btn.textContent = 'Continue.';
  btn.onclick = () => { ov.remove(); scheduleRender(); };
  inner.appendChild(btn);

  ov.appendChild(inner);
  ov.onclick = (e) => { if (e.target === ov) { ov.remove(); scheduleRender(); } };
  document.body.appendChild(ov);

  // Animate in
  requestAnimationFrame(() => ov.classList.add('open'));
}

function applySoundingProgress(soundingId, delta) {
  const entry = G.soundings.taken.find(t => t.id === soundingId); if (!entry) return;
  const old = entry.progress;
  entry.progress = Math.min(Math.max(entry.progress + delta, 0), SOUNDING_THRESHOLD);
  if (entry.progress >= SOUNDING_THRESHOLD && old < SOUNDING_THRESHOLD) settleSounding(soundingId);
  if (delta !== 0) {
    // Only toast at halfway and near-complete thresholds, not every increment
    const half = Math.floor(SOUNDING_THRESHOLD / 2);
    if ((old < half && entry.progress >= half) || (old < SOUNDING_THRESHOLD - 1 && entry.progress >= SOUNDING_THRESHOLD - 1)) {
      const snd = _registries.soundings[soundingId];
      const pct = entry.progress >= SOUNDING_THRESHOLD - 1 ? 'almost settled' : 'halfway';
      showToast((snd ? snd.name : soundingId) + ': ' + pct + '.', 'sounding');
    }
    emit('soundingProgress', { soundingId, progress: entry.progress, delta });
  }
}

function applyAutoAlignment(tags) {
  if (!tags || !tags.length) return;
  for (const entry of G.soundings.taken) {
    const snd = _registries.soundings[entry.id];
    if (snd && snd.alignmentTags && snd.alignmentTags.some(tag => tags.includes(tag))) applySoundingProgress(entry.id, 1);
  }
}

// Ship state helpers
function getShipState(key) { return (G.shipState||{})[key]||0; }
function modShipState(key, delta) {
  if (!G.shipState) G.shipState={morale:5,paranoia:0,exhaustion:0,saturation:0};
  G.shipState[key] = Math.max(0, Math.min(10, (G.shipState[key]||0)+delta));
  // Apply body classes for paranoia and exhaustion
  document.body.classList.toggle('ship-paranoid',  G.shipState.paranoia >= 4);
  document.body.classList.toggle('ship-exhausted', G.shipState.exhaustion >= 5);
  document.body.classList.toggle('ship-low-morale',G.shipState.morale <= 3);
  emit('shipStateChanged', { key, value: G.shipState[key] });
}

function progressSounding(soundingId, delta) {
  // Advance a sounding by a specific amount — called when player acts in alignment
  const entry = G.soundings.taken.find(s => s.id === soundingId);
  if (!entry) return;
  const old = entry.progress;
  entry.progress = Math.min(Math.max(entry.progress + delta, 0), SOUNDING_THRESHOLD);
  if (entry.progress >= SOUNDING_THRESHOLD && old < SOUNDING_THRESHOLD) settleSounding(soundingId);
  else if (entry.progress !== old) {
    // Toast only on meaningful milestones
    const half = Math.floor(SOUNDING_THRESHOLD/2);
    const snd = _registries.soundings[soundingId];
    if (old < half && entry.progress >= half) showToast((snd?snd.name:soundingId)+' — deepening.','sounding');
    emit('soundingProgress',{soundingId,progress:entry.progress,delta});
  }
  scheduleRender();
}

function takeSounding(id) {
  if (G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  if (soundingSlotsFull()) { G.soundingPending = id; G.panelOpen = 'breviary'; scheduleRender(); return; }
  G.soundings.available = G.soundings.available.filter(x => x !== id);
  G.soundings.taken.push({ id, progress: 0 }); G.soundingPending = null;
  const _takenSnd = _registries.soundings[id];
  showToast((_takenSnd ? _takenSnd.name : id) + ' — sounding begun.', 'sounding');
  emit('soundingTaken', id); scheduleRender();
}

function suspendSounding(id) {
  if (!G.soundings.taken.find(t => t.id === id)) return;
  G.soundings.taken = G.soundings.taken.filter(t => t.id !== id);
  G.soundings.available.push(id); emit('soundingSuspended', id); scheduleRender();
}

function releaseSounding(id) {
  G.soundings.taken = G.soundings.taken.filter(t => t.id !== id);
  if (!G.soundings.released) G.soundings.released = [];
  if (!G.soundings.released.includes(id)) G.soundings.released.push(id);
  const pending = G.soundingPending; G.soundingPending = null;
  if (pending) setTimeout(() => takeSounding(pending), 50); else scheduleRender();
  emit('soundingReleased', id);
}

function tickSoundings() {
  const settled = [];
  G.soundings.taken = G.soundings.taken.map(t => {
    const p = t.progress + 1;
    if (p >= SOUNDING_THRESHOLD) { settled.push(t.id); return null; }
    return { id: t.id, progress: p };
  }).filter(Boolean);
  settled.forEach(id => {
    G.soundings.settled.push(id);
    const s = _registries.soundings[id];
    if (s && s.effect) applyEffect(s.effect);
    showToast(s.name + ' — settled.', 'theosis'); playSfx('sounding_settle');
    refreshAtmosMods(); emit('soundingSettled', id);
  });
}

function soundingBar(p) {
  const f = Math.round((p / SOUNDING_THRESHOLD) * 8);
  return '\u2588'.repeat(f) + '\u2591'.repeat(8 - f);
}


// ============================================================
// SECTION: systems/theosis.js
// ============================================================

const LITURGICAL_HOURS = [
  { name: 'Lauds',    mood: 'neutral',    timeDesc: 'dawn' },
  { name: 'Prime',    mood: 'neutral',    timeDesc: 'early morning' },
  { name: 'Terce',    mood: 'neutral',    timeDesc: 'mid-morning' },
  { name: 'Sext',     mood: 'tense',      timeDesc: 'noon' },
  { name: 'None',     mood: 'uncanny',    timeDesc: 'afternoon' },
  { name: 'Vespers',  mood: 'revelation', timeDesc: 'evening' },
  { name: 'Compline', mood: 'uncanny',    timeDesc: 'night' },
];

function setLiturgicalHour(n) {
  G.liturgicalHour = Math.max(0, Math.min(LITURGICAL_HOURS.length - 1, Math.round(n)));
  emit('liturgicalHourChanged', G.liturgicalHour); scheduleRender();
}

let _theosisTiers = [
  { max: 32,  word: 'icon',  wordPlural: 'icons',  cyrillic: null },
  { max: 65,  word: 'ikon',  wordPlural: 'ikons',  cyrillic: null },
  { max: 100, word: '\u0418\u043a\u043e\u043d', wordPlural: '\u0418\u043a\u043e\u043d\u044b', cyrillic: '\u0418\u043a\u043e\u043d' },
];
function setTheosisTiers(tiers) { _theosisTiers = tiers; }
function getCurrentTier() {
  for (let i = 0; i < _theosisTiers.length; i++) if (G.theosis <= _theosisTiers[i].max) return _theosisTiers[i];
  return _theosisTiers[_theosisTiers.length - 1];
}
function iconWord(plural = false) { const t = getCurrentTier(); return plural ? t.wordPlural : t.word; }
function harbourWord()       { return iconWord(); }
function shipWord()          { return iconWord(); }
function objectDescription() { return iconWord(); }

const _theosisTagValues = {};
function registerTheosisTagValue(tag, value) { _theosisTagValues[tag] = value; }
function getTheosisTagValues() { return _theosisTagValues; }

function incrementTheosis(amount) {
  if (amount === 0) return;
  const oldValue = G.theosis;
  const oldTier = oldValue <= 32 ? 0 : oldValue <= 65 ? 1 : 2;
  G.theosis = Math.min(Math.max(G.theosis + amount, 0), 100);
  const newTier = G.theosis <= 32 ? 0 : G.theosis <= 65 ? 1 : 2;
  if (newTier > oldTier) {
    const tierMsg = ['Asleep', 'Waking', 'Illumined'];
    setTimeout(() => { showToast(tierMsg[newTier] + '.', 'theosis'); playSfx('theosis_moment'); }, 500);
  }
  refreshAtmosMods();
  checkJournalThresholds(G.theosis, oldValue);
  emit('theosisChanged', G.theosis);
  scheduleRender();
}

// Magnetic deviation: 0.0 = true north, 1.0 = maximum anomaly
function setMagneticDeviation(val) {
  G.magneticDeviation = Math.max(0, Math.min(1, val));
  // UI opacity fades slightly at high deviation (anomaly distortion)
  const baseOpacity = 1 - (Math.max(0, val - 0.5) * 0.3);
  setUiOpacity(Math.max(0.72, baseOpacity));
  emit('magneticDeviationChanged', G.magneticDeviation);
  // Apply diegetic CSS filter to game body
  const dev = G.magneticDeviation;
  const body = document.getElementById('root');
  if (body) {
    if (dev > 0.7) {
      body.dataset.deviation = 'high';
    } else if (dev > 0.4) {
      body.dataset.deviation = 'mid';
    } else {
      body.dataset.deviation = 'low';
    }
  }
  scheduleRender();
}
function getMagneticDeviation() { return G.magneticDeviation || 0; }

function flashTheosisLight(intensity = 1.0, duration = 2000) {
  atmosMods.goldIntensity = Math.max(atmosMods.goldIntensity, intensity * 0.9);
  atmosMods.goldGlow = true; scheduleRender();
  G._theosisFlashTimer = setTimeout(() => { refreshAtmosMods(); scheduleRender(); G._theosisFlashTimer = null; }, duration);
}

const _nameMappings = {};
function registerNameMapping(original, tier1, tier2, cyrillic, earlyCyrillic) { _nameMappings[original] = { tier1, tier2, cyrillic, earlyCyrillic: !!earlyCyrillic }; }
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function applyNameMapping(text) {
  if (!text) return text;
  const tier = getCurrentTier(); let result = text;
  for (const [original, mapping] of Object.entries(_nameMappings)) {
    let replacement = original;
    const earlyC = mapping.earlyCyrillic; // flag for names that go Cyrillic at tier 2
    if (tier.max <= 32) {
      replacement = original;
    } else if (tier.max <= 65) {
      replacement = (earlyC && mapping.cyrillic) ? mapping.cyrillic : (mapping.tier1 || original);
    } else {
      replacement = mapping.cyrillic || mapping.tier2 || mapping.tier1 || original;
    }
    if (replacement !== original) result = result.replace(new RegExp(_escapeRe(original), 'g'), replacement);
  }
  return result;
}

// ============================================================
// SECTION: systems/atmosphere.js
// ============================================================

let _audioMoodCallback = (_m) => {};
function setAudioMoodCallback(fn) { _audioMoodCallback = fn; }

const canvas = document.getElementById('atmos');
const ctx = canvas.getContext('2d');
let mood = 'neutral', targetMood = 'neutral', moodLerp = 1;
let fogParts = [], rainDrops = [], T = 0, animationFrameId = null, canvasVisible = true;
const atmosMods = { fogMult: 1.0, lampWarm: 0, lampFlicker: true, soboWarm: false, goldIntensity: 0, goldGlow: false };
const _atmosModifiers = [];
function registerAtmosModifier(soundingId, effectFn) { _atmosModifiers.push({ soundingId, effectFn }); }

function _resize() { canvas.width = innerWidth; canvas.height = innerHeight; _initRain(); }
_resize(); addEventListener('resize', _resize);
window.addEventListener('blur',  () => { canvasVisible = false; });
window.addEventListener('focus', () => { canvasVisible = true; drawAtmos(); });

function _initFog() {
  fogParts = [];
  for (let i = 0; i < 22; i++) fogParts.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: 80+Math.random()*140, vx: (Math.random()-.5)*.25, vy: (Math.random()-.5)*.08, ph: Math.random()*Math.PI*2, base: .025+Math.random()*.05 });
}
_initFog();
function _porthole() { const r = Math.min(canvas.width,canvas.height)*.14; return { x: canvas.width-r-36, y: r+36, r }; }
function _initRain() {
  const p = _porthole(); rainDrops = [];
  for (let i = 0; i < 24; i++) rainDrops.push({ x: p.x+(Math.random()-.5)*p.r*2, y: p.y+(Math.random()-.5)*p.r*2, len: 5+Math.random()*9, spd: 1.2+Math.random()*2 });
}

const MOOD = { neutral:[130,170,190,6,8,12], tense:[140,90,70,10,6,4], uncanny:[60,130,170,4,8,14], revelation:[200,190,140,12,14,10] };

function setMood(m) { if (!m||m===targetMood) return; targetMood=m; moodLerp=0; _audioMoodCallback(m); }
function lerpN(a,b,t) { return a+(b-a)*t; }

function refreshAtmosMods() {
  const s = G.soundings.settled;
  atmosMods.fogMult=1.0; atmosMods.lampWarm=0; atmosMods.lampFlicker=true; atmosMods.soboWarm=false;
  for (const mod of _atmosModifiers) if (s.includes(mod.soundingId)) mod.effectFn(atmosMods, _registries.soundings[mod.soundingId]);
  const t = G.theosis||0;
  if (t>=85)      atmosMods.goldIntensity=0.92;
  else if (t>=66) atmosMods.goldIntensity=0.60+(t-66)/19*0.30;
  else if (t>=33) atmosMods.goldIntensity=0.10+(t-33)/33*0.30;
  else            atmosMods.goldIntensity=0;
  atmosMods.goldGlow=atmosMods.goldIntensity>0;
}

function drawAtmos() {
  if (!canvasVisible) { if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId=null; return; }
  T+=.008;
  if (moodLerp<1) { moodLerp=Math.min(1,moodLerp+.008); if (moodLerp>=1) mood=targetMood; }
  const cm=MOOD[mood]||MOOD.neutral, tm=MOOD[targetMood]||MOOD.neutral, t=moodLerp;
  const fr=lerpN(cm[0],tm[0],t), fg=lerpN(cm[1],tm[1],t), fb=lerpN(cm[2],tm[2],t);
  const br=lerpN(cm[3],tm[3],t), bg_=lerpN(cm[4],tm[4],t), bb=lerpN(cm[5],tm[5],t);
  ctx.fillStyle=`rgb(${br|0},${bg_|0},${bb|0})`; ctx.fillRect(0,0,canvas.width,canvas.height);
  const mf=mood==='tense'?2.5:mood==='uncanny'?0.6:mood==='revelation'?0.3:1;
  const ef=mf*atmosMods.fogMult, gi=atmosMods.goldIntensity;
  if (gi>0) { ctx.shadowColor=`rgba(212,175,55,${gi*0.8})`; ctx.shadowBlur=12; } else { ctx.shadowColor='transparent'; ctx.shadowBlur=0; }
  for (const p of fogParts) {
    p.x+=p.vx; p.y+=p.vy; p.ph+=.004;
    if (p.x<-p.r) p.x=canvas.width+p.r; if (p.x>canvas.width+p.r) p.x=-p.r;
    if (p.y<-p.r) p.y=canvas.height+p.r; if (p.y>canvas.height+p.r) p.y=-p.r;
    const op=(p.base+Math.sin(p.ph)*.012)*ef;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
    let rv=fr, gv=fg, bv=fb;
    if (gi>0) { rv=lerpN(fr,212,gi*.5); gv=lerpN(fg,175,gi*.5); bv=lerpN(fb,55,gi*.3); }
    g.addColorStop(0,`rgba(${rv|0},${gv|0},${bv|0},${op.toFixed(3)})`);
    g.addColorStop(1,`rgba(${rv|0},${gv|0},${bv|0},0)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }
  ctx.shadowColor='transparent';
  const lx=canvas.width*.12, ly=canvas.height*.08;
  const lg=ctx.createRadialGradient(lx,ly,0,lx,ly,Math.min(canvas.width,canvas.height)*.28);
  let li=0.09+Math.sin(T*.4)*.008;
  if (mood==='tense'&&atmosMods.lampFlicker) li+=Math.sin(T*4.5)*.03;
  if (mood==='revelation') li=.28; if (mood==='uncanny') li=.04;
  let lR=176+Math.round(atmosMods.lampWarm*40), lG=120-Math.round(atmosMods.lampWarm*20), lB=40;
  if (gi>0) { lR=lerpN(lR,212,gi); lG=lerpN(lG,175,gi); lB=lerpN(lB,55,gi); }
  lg.addColorStop(0,`rgba(${lR},${lG},${lB},${li.toFixed(3)})`);
  lg.addColorStop(1,`rgba(${lR},${lG},${lB},0)`);
  ctx.fillStyle=lg; ctx.fillRect(0,0,canvas.width,canvas.height);
  _drawPorthole();
  animationFrameId=requestAnimationFrame(drawAtmos);
}

function _drawPorthole() {
  const {x,y,r}=_porthole();
  const gi=atmosMods.goldIntensity;
  // Outer brass ring — thick and visible
  const brassR = gi>0 ? `rgba(${Math.round(lerpN(100,180,gi))},${Math.round(lerpN(80,140,gi))},${Math.round(lerpN(40,60,gi))},0.9)` : 'rgba(95,78,42,0.88)';
  // Outer glow halo at high goldIntensity
  if(gi>0.5){
    ctx.save();
    ctx.shadowColor=`rgba(212,175,55,${(gi-0.5)*0.9})`;
    ctx.shadowBlur=r*(gi*0.4);
    ctx.strokeStyle=brassR; ctx.lineWidth=r*.22;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle=brassR; ctx.lineWidth=r*.22;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
  }
  // Bolts around ring
  ctx.fillStyle=gi>0?`rgba(160,130,60,0.95)`:'rgba(80,65,35,0.9)';
  for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; ctx.beginPath(); ctx.arc(x+Math.cos(a)*(r+r*.06),y+Math.sin(a)*(r+r*.06),r*.052,0,Math.PI*2); ctx.fill(); }
  // Glass interior
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*.86,0,Math.PI*2); ctx.clip();
  // Sky gradient — changes with mood and theosis
  let skyTop, skyBot, horizY;
  if (mood==='revelation'||gi>0.5) {
    skyTop=`rgba(${Math.round(lerpN(8,40,gi))},${Math.round(lerpN(20,55,gi))},${Math.round(lerpN(35,25,gi))},1)`;
    skyBot=`rgba(${Math.round(lerpN(10,60,gi))},${Math.round(lerpN(25,45,gi))},${Math.round(lerpN(40,20,gi))},1)`;
  } else if (mood==='uncanny') {
    skyTop='rgba(4,8,20,1)'; skyBot='rgba(6,14,28,1)';
  } else if (mood==='tense') {
    skyTop='rgba(14,16,22,1)'; skyBot='rgba(18,22,28,1)';
  } else {
    skyTop='rgba(8,18,32,1)'; skyBot='rgba(12,26,40,1)';
  }
  horizY = y + r*0.08 + Math.sin(T*0.15)*r*0.06;
  const sg=ctx.createLinearGradient(x,y-r,x,y+r);
  sg.addColorStop(0,skyTop); sg.addColorStop(0.5,skyBot);
  // Water
  let waterDeep, waterSurf;
  if (gi>0.4) { waterDeep=`rgba(${Math.round(20+gi*30)},${Math.round(30+gi*20)},${Math.round(15+gi*10)},1)`; waterSurf=`rgba(${Math.round(30+gi*40)},${Math.round(50+gi*30)},${Math.round(30+gi*15)},1)`; }
  else if (mood==='uncanny') { waterDeep='rgba(2,6,18,1)'; waterSurf='rgba(4,12,24,1)'; }
  else { waterDeep='rgba(4,14,28,1)'; waterSurf='rgba(8,22,40,1)'; }
  sg.addColorStop(0.52,waterSurf); sg.addColorStop(1,waterDeep);
  ctx.fillStyle=sg; ctx.fillRect(x-r,y-r,r*2,r*2);
  // Horizon glow
  const hg=ctx.createLinearGradient(x-r,horizY-r*.08,x+r,horizY+r*.08);
  let hAlpha = mood==='revelation'?0.18:mood==='uncanny'?0.04:0.08;
  if(gi>0) hAlpha=lerpN(hAlpha,0.25,gi);
  const hR=gi>0?Math.round(lerpN(120,200,gi)):100, hG=gi>0?Math.round(lerpN(140,170,gi)):140, hB=gi>0?Math.round(lerpN(160,80,gi)):160;
  hg.addColorStop(0,`rgba(${hR},${hG},${hB},0)`);
  hg.addColorStop(0.5,`rgba(${hR},${hG},${hB},${hAlpha.toFixed(3)})`);
  hg.addColorStop(1,`rgba(${hR},${hG},${hB},0)`);
  ctx.fillStyle=hg; ctx.fillRect(x-r,horizY-r*.08,r*2,r*.16);
  // Wave lines — slowly animated with phase offset per wave
  const wAlpha = mood==='uncanny'?0.55:mood==='tense'?0.42:mood==='revelation'?0.28:0.35;
  const wR=gi>0?Math.round(lerpN(50,100,gi)):45;
  const wG=gi>0?Math.round(lerpN(100,140,gi)):90;
  const wB=gi>0?Math.round(lerpN(130,80,gi)):130;
  for (let i=0;i<8;i++) {
    // Each wave has its own speed and phase
    const speed = 0.18 + i * 0.06;
    const phase = i * 1.1;
    const wy = horizY + r*0.1 + i*r*0.09 + Math.sin(T*0.3 + phase)*r*0.018;
    const amp = r * 0.028 * (1 - i*0.08);
    // Wave opacity fades deeper
    const wop = wAlpha * (1 - i*0.09);
    ctx.strokeStyle=`rgba(${wR},${wG},${wB},${wop.toFixed(3)})`; 
    ctx.lineWidth = i < 2 ? 1.2 : 0.8;
    ctx.beginPath(); ctx.moveTo(x-r*.88, wy);
    for(let xi=-r*.88; xi<=r*.88; xi+=3) {
      const localAmp = amp * (1 - Math.abs(xi)/(r*.88)*0.3);
      ctx.lineTo(x+xi, wy + Math.sin(T*speed + xi*0.038 + phase)*localAmp);
    }
    ctx.stroke();
  }
  // Surface shimmer — tiny bright crests at high theosis
  if(gi > 0.2) {
    ctx.fillStyle=`rgba(${Math.round(lerpN(180,220,gi))},${Math.round(lerpN(200,220,gi))},${Math.round(lerpN(210,200,gi))},${(gi*0.06).toFixed(3)})`;
    for(let i=0;i<6;i++) {
      const cx2 = x + Math.sin(T*0.4+i*1.7)*r*0.35;
      const cy2 = horizY + r*0.08 + i*r*0.06 + Math.sin(T*0.5+i)*r*0.02;
      ctx.beginPath(); ctx.arc(cx2, cy2, 1.5+gi, 0, Math.PI*2); ctx.fill();
    }
  }
  // Rain when tense
  if(mood==='tense') {
    ctx.strokeStyle='rgba(120,160,200,0.3)'; ctx.lineWidth=0.5;
    for (const d of rainDrops) { d.y+=d.spd; if (d.y>y+r) { d.y=y-r; d.x=x+(Math.random()-.5)*r*2; } ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-1,d.y+d.len); ctx.stroke(); }
  }
  // Gold shimmer for high theosis
  if(gi>0.3) {
    const shimmer=ctx.createRadialGradient(x,horizY,0,x,horizY,r*.6);
    shimmer.addColorStop(0,`rgba(212,175,55,${(gi*0.12).toFixed(3)})`);
    shimmer.addColorStop(1,'rgba(212,175,55,0)');
    ctx.fillStyle=shimmer; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  ctx.restore();
  // Inner ring shadow
  ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,r*.86,0,Math.PI*2); ctx.stroke();
  // Gleam highlight
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*.86,0,Math.PI*2); ctx.clip();
  const gleam=ctx.createLinearGradient(x-r*.4,y-r*.7,x+r*.1,y-r*.2);
  gleam.addColorStop(0,'rgba(255,255,255,0.06)'); gleam.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gleam; ctx.fillRect(x-r,y-r,r*2,r*2);
  ctx.restore();
}
drawAtmos();


// ============================================================
// SECTION: systems/audio.js
// ============================================================

let _actx=null, _gainNode=null;
let _audioOn=false;
let _oscNodes=[], _filterNode=null, _reverbGain=null, _currentMoodRef='neutral';

setAudioMoodCallback((newMood) => { _updateAudioMood(newMood); });

function _makeReverb(ctx,dur=1.8,dec=2.2) {
  const len=ctx.sampleRate*dur, buf=ctx.createBuffer(2,len,ctx.sampleRate);
  for (let c=0;c<2;c++) { const d=buf.getChannelData(c); for (let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,dec); }
  const conv=ctx.createConvolver(); conv.buffer=buf; return conv;
}
function _initAudio() {
  if (_actx) return;
  try {
    _actx=new(window.AudioContext||window.webkitAudioContext)();
    const master=_actx.createGain(); master.gain.value=0; master.connect(_actx.destination); _gainNode=master;
    const rev=_makeReverb(_actx); _reverbGain=_actx.createGain(); _reverbGain.gain.value=0.18; rev.connect(_reverbGain); _reverbGain.connect(master);
    // Sea sounds: layered filtered noise (deep swell + surface chop)
    const sr=_actx.sampleRate;
    // Deep swell noise buffer (4 seconds, looped)
    const swellBuf=_actx.createBuffer(2,sr*4,sr);
    for(let c=0;c<2;c++){const d=swellBuf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.5;}
    const swell=_actx.createBufferSource();swell.buffer=swellBuf;swell.loop=true;
    _filterNode=_actx.createBiquadFilter();_filterNode.type='lowpass';_filterNode.frequency.value=120;
    const swellHigh=_actx.createBiquadFilter();swellHigh.type='highpass';swellHigh.frequency.value=20;
    const swellGain=_actx.createGain();swellGain.gain.value=0.06;
    swell.connect(_filterNode);_filterNode.connect(swellHigh);swellHigh.connect(swellGain);swellGain.connect(master);swell.start();
    // Surface chop noise (higher frequency, quieter)
    const chopBuf=_actx.createBuffer(1,sr*2,sr);
    const cd2=chopBuf.getChannelData(0);for(let i=0;i<cd2.length;i++)cd2[i]=(Math.random()*2-1);
    const chop=_actx.createBufferSource();chop.buffer=chopBuf;chop.loop=true;
    const chopF=_actx.createBiquadFilter();chopF.type='bandpass';chopF.frequency.value=600;chopF.Q.value=0.4;
    const chopGain=_actx.createGain();chopGain.gain.value=0.012;
    chop.connect(chopF);chopF.connect(chopGain);chopGain.connect(master);chop.start();
    // LFO for swell modulation (slow wave rhythm ~0.08Hz)
    _oscNodes=[_actx.createOscillator(),_actx.createOscillator()];
    _oscNodes[0].type='sine';_oscNodes[0].frequency.value=0.08;
    _oscNodes[1].type='sine';_oscNodes[1].frequency.value=0.13;
    const lfoGain0=_actx.createGain();lfoGain0.gain.value=0.025;
    const lfoGain1=_actx.createGain();lfoGain1.gain.value=0.015;
    _oscNodes[0].connect(lfoGain0);lfoGain0.connect(swellGain.gain);_oscNodes[0].start();
    _oscNodes[1].connect(lfoGain1);lfoGain1.connect(chopGain.gain);_oscNodes[1].start();
  } catch(e) { console.warn('Audio:',e); }
}
function _gain() { return _currentMoodRef==='tense'?0.22:_currentMoodRef==='revelation'?0.18:_currentMoodRef==='uncanny'?0.14:0.18; }
function _applyMood(m) {
  if (!_actx||!_audioOn) return;
  const t=_actx.currentTime;
  // Sea mood: modulate filter cutoff and reverb to change wave character
  // neutral: deep ocean swell; tense: choppier higher freqs; uncanny: muffled below surface; revelation: bright open water
  const cfg={neutral:{filter:120,rv:0.18,lfo:0.08},tense:{filter:800,rv:0.06,lfo:0.22},uncanny:{filter:55,rv:0.45,lfo:0.04},revelation:{filter:2200,rv:0.55,lfo:0.11}}[m]||{filter:120,rv:0.18,lfo:0.08};
  if(_filterNode)_filterNode.frequency.setTargetAtTime(cfg.filter,t,3.0);
  if(_reverbGain)_reverbGain.gain.setTargetAtTime(cfg.rv,t,3.0);
  if(_oscNodes&&_oscNodes[0])_oscNodes[0].frequency.setTargetAtTime(cfg.lfo,t,4.0);
}
function _updateAudioMood(newMood) {
  _currentMoodRef=newMood;
  if(_audioOn&&_gainNode&&_actx){_gainNode.gain.setTargetAtTime(_gain(),_actx.currentTime,2.5);_applyMood(newMood);}
}
function toggleAudio() {
  _initAudio(); if(!_actx) return;
  if(_actx.state==='suspended')_actx.resume();
  _audioOn=!_audioOn;
  if(_gainNode)_gainNode.gain.setTargetAtTime(_audioOn?_gain():0,_actx.currentTime,1.2);
  if(_audioOn){_applyMood(mood);setTimeout(()=>playSfx('ship_ambient_start',0.5),500);}
  else{playSfx('ship_ambient_stop');}
  const btn=document.getElementById('audio-btn');
  if(btn){btn.textContent=_audioOn?'\u266a on':'\u266a off';btn.style.color=_audioOn?'var(--amber)':'var(--dim)';}
  emit('audioToggled',_audioOn);
}
function playSfx(name,volume=0.5) {
  const sfx=_registries.sfxLibrary[name];if(sfx){sfx(volume);emit('sfxPlayed',name);return;}
  if(!_actx){_initAudio();if(!_actx)return;}
  const c=_actx;
  const _osc=(freq,type,gain,dur)=>{const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.value=volume*gain;o.connect(g);g.connect(c.destination);o.start();g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);o.stop(c.currentTime+dur);};
  if(name==='click')_osc(800,'sine',0.15,0.2);
  else if(name==='chime')_osc(440,'sine',0.2,1.0);
  else if(name==='beep')_osc(660,'square',0.1,0.15);
  else console.warn(`SFX "${name}" not registered.`);
}
function initBuiltinSfx() {
  // Sounding settle: a warm, brief sine tone that fades — spiritual resolution
  registerSfx('sounding_settle', (vol=0.8) => {
    if (!_actx) return;
    const g = _actx.createGain(); g.gain.setValueAtTime(0, _actx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.5, _actx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 2.2);
    g.connect(_gainNode);
    // Fundamental + overtone for warmth
    [220, 440, 660].forEach((freq, i) => {
      const o = _actx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const og = _actx.createGain(); og.gain.value = i === 0 ? 1 : 1/(i*3);
      o.connect(og); og.connect(g); o.start(); o.stop(_actx.currentTime + 2.5);
    });
  });

  // Cover fail: a brief descending dissonance — tension, something broken
  registerSfx('cover_fail', (vol=0.7) => {
    if (!_actx) return;
    const g = _actx.createGain(); g.gain.setValueAtTime(vol * 0.4, _actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 0.8);
    g.connect(_gainNode);
    [[340, 0], [290, 0.05], [240, 0.15]].forEach(([freq, delay]) => {
      const o = _actx.createOscillator();
      o.type = 'triangle'; o.frequency.value = freq;
      const og = _actx.createGain(); og.gain.value = 0.6;
      o.connect(og); og.connect(g);
      o.start(_actx.currentTime + delay); o.stop(_actx.currentTime + delay + 0.6);
    });
  });

  // Transmission: radio crackle — filtered noise bursts
  registerSfx('transmission', (vol=0.9) => {
    if (!_actx) return;
    const dur = 1.8;
    const buf = _actx.createBuffer(1, _actx.sampleRate * dur, _actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() > 0.85 ? 1 : 0.1);
    const src = _actx.createBufferSource(); src.buffer = buf;
    const band = _actx.createBiquadFilter(); band.type = 'bandpass';
    band.frequency.value = 1800; band.Q.value = 3;
    const g = _actx.createGain(); g.gain.setValueAtTime(vol * 0.6, _actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + dur);
    src.connect(band); band.connect(g); g.connect(_gainNode); src.start();
  });

  // Anomaly drone: a very low, sustained presence — the field
  registerSfx('anomaly_drone', (vol=0.6) => {
    if (!_actx) return;
    const g = _actx.createGain(); g.gain.setValueAtTime(0, _actx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.3, _actx.currentTime + 1.5);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 5);
    g.connect(_gainNode);
    [40, 47, 53].forEach(freq => {
      const o = _actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const og = _actx.createGain(); og.gain.value = 0.5;
      o.connect(og); og.connect(g); o.start(); o.stop(_actx.currentTime + 5.5);
    });
  });

  // Theosis moment: rising harmonic — spiritual ascent
  registerSfx('theosis_moment', (vol=0.75) => {
    if (!_actx) return;
    const g = _actx.createGain(); g.gain.setValueAtTime(0, _actx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.4, _actx.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 3);
    g.connect(_gainNode);
    [330, 440, 550, 660].forEach((freq, i) => {
      const o = _actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const og = _actx.createGain(); og.gain.value = 1 / (i + 1);
      o.connect(og); og.connect(g);
      o.start(_actx.currentTime + i * 0.12); o.stop(_actx.currentTime + 3.5);
    });
  });
  // Ship ambient: low creaking/drone that runs continuously when audio on
  registerSfx('ship_ambient_start', (vol=0.5) => {
    if (!_actx) return;
    // Low ship hum — two detuned sines + filtered noise
    const ambGain = _actx.createGain();
    ambGain.gain.setValueAtTime(0, _actx.currentTime);
    ambGain.gain.linearRampToValueAtTime(vol * 0.35, _actx.currentTime + 3);
    ambGain.connect(_gainNode);
    window._ambientNodes = window._ambientNodes || [];
    // Fundamental hum
    [55, 58, 110].forEach((freq, i) => {
      const o = _actx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const og = _actx.createGain(); og.gain.value = i === 2 ? 0.15 : 0.5;
      o.connect(og); og.connect(ambGain); o.start();
      window._ambientNodes.push(o);
    });
    // Wind noise layer
    const buf = _actx.createBuffer(1, _actx.sampleRate * 4, _actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const src = _actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = _actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const wg = _actx.createGain(); wg.gain.value = 0.08;
    src.connect(lp); lp.connect(wg); wg.connect(ambGain); src.start();
    window._ambientNodes.push(src);
    window._ambientGain = ambGain;
  });

  registerSfx('ship_ambient_stop', (vol=0) => {
    if (!_actx || !window._ambientGain) return;
    window._ambientGain.gain.linearRampToValueAtTime(0, _actx.currentTime + 2);
    setTimeout(() => {
      (window._ambientNodes || []).forEach(n => { try { n.stop(); } catch(e) {} });
      window._ambientNodes = [];
      window._ambientGain = null;
    }, 2500);
  });

  // Anomaly pulse: a rhythmic sub-bass throb that intensifies with deviation
  registerSfx('anomaly_pulse', (vol=0.5) => {
    if (!_actx) return;
    const dev = typeof G !== 'undefined' ? (G.magneticDeviation || 0) : 0;
    const freq = 28 + dev * 15;
    const g = _actx.createGain();
    g.gain.setValueAtTime(0, _actx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.4 * (0.3 + dev * 0.7), _actx.currentTime + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 3.5);
    g.connect(_gainNode);
    const o = _actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = _actx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 1.5;
    const og2 = _actx.createGain(); og2.gain.value = 0.3;
    o.connect(g); o2.connect(og2); og2.connect(g);
    o.start(); o.stop(_actx.currentTime + 4);
    o2.start(); o2.stop(_actx.currentTime + 4);
  });

  // Radio static: Landstorm's channel
  registerSfx('radio_static', (vol=0.6) => {
    if (!_actx) return;
    const dur = 0.6;
    const buf = _actx.createBuffer(1, _actx.sampleRate * dur, _actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (i/d.length < 0.1 || i/d.length > 0.85 ? 0.05 : 0.9);
    const src = _actx.createBufferSource(); src.buffer = buf;
    const band = _actx.createBiquadFilter(); band.type = 'bandpass';
    band.frequency.value = 2200; band.Q.value = 5;
    const g = _actx.createGain(); g.gain.setValueAtTime(vol * 0.7, _actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + dur);
    src.connect(band); band.connect(g); g.connect(_gainNode); src.start();
  });

}

// ============================================================
// SECTION: systems/history.js
// ============================================================

const HISTORY_MAX = 50;
let _history = [], _historyIndex = -1;

function _serialise(state) { return JSON.stringify(state, (_k, v) => v instanceof Set ? { __set__: [...v] } : v); }
function _deserialise(json) { return JSON.parse(json, (_k, v) => (v && typeof v === 'object' && Array.isArray(v.__set__)) ? new Set(v.__set__) : v); }

function _captureSnapshot() {
  const snap = _serialise(G);
  if (!_history.length) { _history.push(snap); _historyIndex = 0; debugLog('Snapshot (initial)'); return; }
  if (_history[_historyIndex] === snap) return;
  _history = _history.slice(0, _historyIndex + 1);
  _history.push(snap);
  if (_history.length > HISTORY_MAX) _history.shift(); else _historyIndex++;
  debugLog('Snapshot captured, depth:', _history.length);
}

function _restoreSnapshot(snap) {
  const restored = _deserialise(snap);
  const timer = G._theosisFlashTimer;
  if (timer) clearTimeout(timer);
  Object.keys(G).forEach(k => delete G[k]);
  Object.assign(G, restored);
  G._theosisFlashTimer = null;
}

function undo() {
  if (_historyIndex <= 0) return false;
  _historyIndex--;
  _restoreSnapshot(_history[_historyIndex]);
  scheduleRender(); emit('undo'); return true;
}

function redo() {
  if (_historyIndex >= _history.length - 1) return false;
  _historyIndex++;
  _restoreSnapshot(_history[_historyIndex]);
  scheduleRender(); emit('redo'); return true;
}


// ============================================================
// SECTION: systems/save.js
// ============================================================

const VERSION         = '3.3.1';
const SAVE_KEY_PREFIX = 'sobornost_save_';
const META_KEY        = 'spasibo_meta';
const ANALYTICS_KEY   = 'spasibo_analytics';

function _serialisableConsequences(queue) {
  return queue.filter(c => {
    if (typeof c.condition === 'function') {
      console.warn('[SOBORNOST] save: consequence with function condition dropped', c);
      return false;
    }
    return true;
  });
}

function saveGameSlot(slotId) {
  try {
    const state = {
      engineVersion: VERSION,
      playCount: G.playCount, pastFlags: G.pastFlags,
      stats: G.stats, charisms: G.charisms,
      soundings: G.soundings, cover: G.cover,
      coverIntegrity: G.coverIntegrity, notes: G.notes,
      flags: [...G.flags], scene: G.scene,
      mode: G.mode, lastReaction: G.lastReaction,
      tutorialDone: G.tutorialDone, crossingLog: G.crossingLog,
      inventory: G.inventory, time: G.time,
      reputation: G.reputation, quests: G.quests,
      awareness: G.awareness, beliefs: [...G.beliefs],
      knowledge: [...G.knowledge],
      consequenceQueue: _serialisableConsequences(G.consequenceQueue),
      npcStance: G.npcStance, eventQueue: G.eventQueue,
      pastLifeFlags: [...G.pastLifeFlags],
      _kenosisProgress: G._kenosisProgress, liturgicalHour: G.liturgicalHour,
      companions: G.companions, theosis: G.theosis,
      _sceneCount: G._sceneCount,
      deadlines: G.deadlines, choiceHistory: G.choiceHistory,
      codexUnlocked: [...G.codexUnlocked],
      ambientTriggered: [...G.ambientTriggered],
      magneticDeviation: G.magneticDeviation || 0,
      audioOn: _audioOn,
      gameMode: G.mode,
      worldState: G.worldState || { shipStability: 5, sanctity: 0, socialTrust: 5 },
      shipState: G.shipState || { morale: 5, paranoia: 0, exhaustion: 0, saturation: 0 },
    };
    try { localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(state)); } catch(e) { console.warn('Save write failed:', e); showToast('Save failed — storage full?', 'warning'); return; }
    saveJournal(slotId);
    if(slotId!=='legacy') showToast('Saved.', 'note');
    emit('saveSlot', slotId);
  } catch (e) { console.warn('Save failed:', e); }
}

function loadGameSlot(slotId) {
  try {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slotId); if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.engineVersion && s.engineVersion !== VERSION)
      console.warn(`[SOBORNOST] Save version ${s.engineVersion} loaded into engine ${VERSION}`);
    G.playCount        = s.playCount         !== undefined ? s.playCount         : 0;
    G.pastFlags        = s.pastFlags         || [];
    G.stats            = s.stats             || G.stats;
    G.charisms         = s.charisms          || [];
    G.soundings        = s.soundings         || { available: [], taken: [], settled: [], released: [] };
    if (!G.soundings.released) G.soundings.released = [];
    G.cover            = s.cover             || G.cover;
    G.coverIntegrity   = s.coverIntegrity    !== undefined ? s.coverIntegrity : 3;
    G.notes            = s.notes             || [];
    G.flags            = new Set(s.flags     || []);
    G.scene            = s.scene             || null;
    G.mode             = s.mode              || 'attended';
    G.lastReaction     = s.lastReaction      || null;
    G.tutorialDone     = s.tutorialDone      || false;
    G.crossingLog      = s.crossingLog       || [];
    G.inventory        = s.inventory         || [];
    G.time             = s.time              || { day: 1, hour: 8, maxDays: 3 };
    G.reputation       = s.reputation        || {};
    G.quests           = s.quests            || {};
    G.awareness        = s.awareness         !== undefined ? s.awareness : 0;
    G.beliefs          = new Set(s.beliefs   || []);
    G.knowledge        = new Set(s.knowledge || []);
    G.consequenceQueue = s.consequenceQueue  || [];
    G.npcStance        = s.npcStance         || {};
    G.eventQueue       = s.eventQueue        || [];
    G.pastLifeFlags    = new Set(s.pastLifeFlags || []);
    G._kenosisProgress = s._kenosisProgress  || 0;
    G.liturgicalHour   = s.liturgicalHour    !== undefined ? s.liturgicalHour : 4;
    G.companions       = s.companions        || [];
    G.theosis          = s.theosis           !== undefined ? s.theosis : 0;
    G._sceneCount      = s._sceneCount       || 0;
    G.deadlines        = s.deadlines         || [];
    G.choiceHistory    = s.choiceHistory     || {};
    G.codexUnlocked    = new Set(s.codexUnlocked   || []);
    G.ambientTriggered = new Set(s.ambientTriggered || []);
    G.magneticDeviation = s.magneticDeviation !== undefined ? s.magneticDeviation : 0;
    if (s.audioOn !== undefined) { _audioOn = s.audioOn; }
    if (s.gameMode) { G.mode = s.gameMode; }
    G.worldState = s.worldState || { shipStability: 5, sanctity: 0, socialTrust: 5 };
    G.shipState  = s.shipState  || { morale: 5, paranoia: 0, exhaustion: 0, saturation: 0 };
    loadJournal(slotId);
    refreshAtmosMods();
    scheduleRender();
    emit('loadSlot', slotId);
    return true;
  } catch (e) { console.warn('Load failed:', e); return false; }
}

function listSaveSlots() {
  const slots = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SAVE_KEY_PREFIX)) slots.push(k.slice(SAVE_KEY_PREFIX.length));
  }
  return slots.sort();
}

function saveGameLegacy() { saveGameSlot('legacy'); }
function loadGameLegacy() { return loadGameSlot('legacy'); }

function loadMetaUnlocks() { try { const r = localStorage.getItem(META_KEY); G.metaUnlocks = r ? JSON.parse(r) : {}; } catch (e) { G.metaUnlocks = {}; } }
function saveMetaUnlocks() { try { localStorage.setItem(META_KEY, JSON.stringify(G.metaUnlocks)); } catch (e) {} }
function unlockMeta(id) {
  if (!G.metaUnlocks[id]) { G.metaUnlocks[id] = true; saveMetaUnlocks(); showToast(`Meta-achievement unlocked: ${id}`, 'note'); emit('metaUnlocked', id); }
}
function hasMeta(id) { return !!G.metaUnlocks[id]; }

function logChoice(choice, sceneId) {
  G._analyticsLog.push({ timestamp: Date.now(), scene: sceneId, choiceText: choice.text, next: choice.next, playCount: G.playCount });
  if (G._analyticsLog.length > 200) G._analyticsLog.shift();
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(G._analyticsLog)); } catch (e) {}
}
function exportAnalytics() {
  const blob = new Blob([JSON.stringify(G._analyticsLog, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `analytics_${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
}


// ============================================================
// SECTION: systems/journal.js
// ============================================================

const JOURNAL_KEY_PREFIX = 'sobornost_journal_';
const _thresholdEntries = new Map();

function registerJournalEntry(threshold, text) {
  if (typeof threshold !== 'number' || !text) { console.error('[SOBORNOST] registerJournalEntry(threshold, text) — both arguments required'); return; }
  _thresholdEntries.set(threshold, text);
}
function addJournalEntry(entry) {
  G.journal.push({ timestamp: Date.now(), crossing: G.playCount, scene: G.scene, theosis: G.theosis, hour: G.liturgicalHour, ...entry });
  if (G.journal.length > 200) G.journal.shift();
}
function checkJournalThresholds(newValue, oldValue) {
  for (const [threshold, text] of _thresholdEntries) {
    if (oldValue < threshold && newValue >= threshold) {
      const flagKey = `__journal_threshold_${threshold}_c${G.playCount}`;
      if (!G.flags.has(flagKey)) { G.flags.add(flagKey); addJournalEntry({ type: 'threshold', text }); }
    }
  }
  [33, 66, 100].filter(t => oldValue < t && newValue >= t && !_thresholdEntries.has(t)).forEach(t => {
    const flagKey = `__journal_auto_${t}_c${G.playCount}`;
    if (!G.flags.has(flagKey)) {
      G.flags.add(flagKey);
      addJournalEntry({ type: 'threshold', text: `Theosis ${t}. ${LITURGICAL_HOURS[G.liturgicalHour]?.name || 'the hour'}.` });
    }
  });
}
function addCrossingEntry() {
  const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name || '';
  addJournalEntry({ type: 'crossing', text: `Crossing ${G.playCount} concluded. Theosis: ${G.theosis}.${hourName ? ' ' + hourName + '.' : ''}` });
}
function saveJournal(slotId) { try { localStorage.setItem(JOURNAL_KEY_PREFIX + slotId, JSON.stringify(G.journal)); } catch (e) {} }
function loadJournal(slotId) {
  try { const raw = localStorage.getItem(JOURNAL_KEY_PREFIX + slotId); G.journal = raw ? JSON.parse(raw) : []; }
  catch (e) { G.journal = []; }
}
function renderJournalPanel(root, openPanelFn) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanelFn(null); };
  const panel = document.createElement('div'); panel.className = 'panel';
  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const title = document.createElement('div'); title.className = 'panel-title'; title.textContent = 'the journal';
  const close = document.createElement('button'); close.className = 'panel-close'; close.textContent = '\u00d7'; close.onclick = () => openPanelFn(null);
  hdr.appendChild(title); hdr.appendChild(close); panel.appendChild(hdr);
  const body = document.createElement('div'); body.className = 'panel-body';
  if (!G.journal.length) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-size:.75rem;font-style:italic;padding:.5rem 0';
    empty.textContent = 'The journal is empty. It fills as you cross.'; body.appendChild(empty);
  } else {
    let lastCrossing = -1;
    [...G.journal].reverse().forEach(entry => {
      if (entry.crossing !== lastCrossing) {
        lastCrossing = entry.crossing;
        const ch = document.createElement('div');
        ch.style.cssText = 'font-size:.6rem;color:var(--amber-dim);letter-spacing:.15em;text-transform:uppercase;margin:1rem 0 .4rem;border-top:1px solid var(--border);padding-top:.6rem';
        ch.textContent = entry.crossing === 0 ? 'First crossing' : `Crossing ${entry.crossing + 1}`; body.appendChild(ch);
      }
      const row = document.createElement('div'); row.style.cssText = 'margin-bottom:.8rem';
      const meta = document.createElement('div'); meta.style.cssText = 'font-size:.6rem;color:var(--dim);letter-spacing:.08em;margin-bottom:.15rem';
      meta.textContent = [LITURGICAL_HOURS[entry.hour]?.name || '', entry.theosis !== undefined ? `\u25cf ${entry.theosis}` : ''].filter(Boolean).join('  ');
      const text = document.createElement('p'); text.style.cssText = 'font-size:.78rem;color:var(--fg);line-height:1.5;margin:0'; text.textContent = entry.text;
      row.appendChild(meta); row.appendChild(text); body.appendChild(row);
    });
  }
  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}


// ============================================================
// SECTION: systems/companions.js
// ============================================================

function addCompanion(id, data) {
  if (!G.companions.find(c => c.id === id)) { G.companions.push({ id, ...data }); emit('companionAdded', id); }
}
function removeCompanion(id) { G.companions = G.companions.filter(c => c.id !== id); emit('companionRemoved', id); }
function hasCompanion(id) { return G.companions.some(c => c.id === id); }
function getCompanion(id) { return G.companions.find(c => c.id === id); }
function modCompanionStat(id, stat, delta) {
  const comp = getCompanion(id);
  if (comp && comp.stats) { comp.stats[stat] = (comp.stats[stat] || 0) + delta; emit('companionStatChanged', { id, stat, delta }); }
}
function setCompanionCharism(id, charismId) {
  const comp = getCompanion(id);
  if (comp) { if (!comp.charisms) comp.charisms = []; if (!comp.charisms.includes(charismId)) comp.charisms.push(charismId); emit('companionCharismAdded', { id, charismId }); }
}


// ============================================================
// SECTION: systems/roll.js
// ============================================================

function performRoll(statKey, difficulty, options = {}) {
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
    const r1a=Math.floor(Math.random()*6)+1, r1b=Math.floor(Math.random()*6)+1;
    const r2a=Math.floor(Math.random()*6)+1, r2b=Math.floor(Math.random()*6)+1;
    const s1=r1a+r1b, s2=r2a+r2b;
    if (s1>=s2) { d1=r1a; d2=r1b; rollSum=s1; charismNote+='advantage '; }
    else        { d1=r2a; d2=r2b; rollSum=s2; charismNote+='advantage '; }
  } else { d1=Math.floor(Math.random()*6)+1; d2=Math.floor(Math.random()*6)+1; rollSum=d1+d2; }
  let total = rollSum + baseStat + charismBonus + tempBonus;
  let opposedResult = null, outcome = 'failure';
  if (options.threshold && G.charisms.includes('void_gaze') && (G.awareness||0)>=3 && !options.advantage && !options.opposed) {
    const a = Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1 + baseStat + charismBonus;
    if (a > total) { total=a; charismNote+='void gaze '; voidGazeUsed=true; }
  }
  if (options.opposed) {
    const os=options.opposed.stat, or_=Math.floor(Math.random()*6)+1+Math.floor(Math.random()*6)+1;
    const ob=G.stats[os]||0, ot=or_+ob;
    opposedResult={stat:os,roll:or_,bonus:ob,total:ot};
    outcome=total>=ot?'success':'failure';
  } else {
    if (total>=effectiveDiff) outcome='success';
    else if (total>=effectiveDiff-2) outcome='partial';
  }
  let crit = false;
  if (options.critical && !options.opposed) {
    if (rollSum===12) { crit='success'; outcome='success'; charismNote+='CRIT! '; }
    else if (rollSum===2) { crit='failure'; outcome='failure'; charismNote+='FUMBLE! '; }
  }
  emit('rollPerformed', { statKey, difficulty, options, result: { outcome, total, rollSum, crit, voidGazeUsed } });
  return { outcome, total, roll: rollSum, d1, d2, statValue: baseStat, charismBonus, charismNote: charismNote.trim(), difficulty: effectiveDiff, rawDifficulty: difficulty, awareMod, crit, opposed: opposedResult, tempBonus, voidGazeUsed };
}

function startRoll(choice) {
  const rd = choice.roll;
  const res = performRoll(rd.stat, rd.difficulty, {
    awarenessBonus: rd.awarenessBonus||false, docCheck: rd.docCheck||false,
    social: rd.social||false, corporate: rd.corporate||false,
    threshold: rd.threshold||false, advantage: rd.advantage||false,
    critical: rd.critical||false, tempBonus: rd.tempBonus||0, opposed: rd.opposed||null,
  });
  G.rollResult = res; G.pendingRoll = { choice, rollDef: rd, result: res };
  emit('rollStarted', { choice, result: res }); scheduleRender();
}


// ============================================================
// SECTION: systems/rituals.js
// NOTE: dynamic import('./navigation.js') replaced with direct navigate() calls
// ============================================================

function navigateToPool(poolId) {
  const pool = _registries.scenePools[poolId];
  if (!pool||!pool.length) { console.warn(`Scene pool "${poolId}" empty or missing.`); return; }
  const avail = pool.filter(e => !e.condition || evaluateCondition(e.condition));
  if (!avail.length) { console.warn(`No scenes available in pool "${poolId}".`); return; }
  let total=0; for (const e of avail) total+=e.weight||1;
  let r=Math.random()*total;
  for (const e of avail) { const w=e.weight||1; if (r<w) { navigate(e.sceneId); return; } r-=w; }
  navigate(avail[0].sceneId);
}

let _activeRitual = null;
function startRitual(ritualId, startingScene, nextScene) {
  const ritual = _registries.rituals[ritualId];
  if (!ritual) { console.warn(`Ritual "${ritualId}" not found.`); return false; }
  const phasePath = ritual.phases || (ritual.branches ? ritual.branches._entry : []);
  _activeRitual = { id: ritualId, phaseIndex: 0, startingScene, nextScene, phasePath, choicesMade: [] };
  emit('ritualStarted', ritualId); scheduleRender(); return true;
}
function ritualNextPhase(branchId=null) {
  if (!_activeRitual) return;
  const ritual = _registries.rituals[_activeRitual.id];
  _activeRitual.phaseIndex++;
  if (branchId && ritual.branches && ritual.branches[branchId]) {
    _activeRitual.phasePath = ritual.branches[branchId];
    _activeRitual.phaseIndex = 0;
    emit('ritualBranched', { ritualId: ritual.id, branch: branchId });
  }
  if (_activeRitual.phaseIndex >= _activeRitual.phasePath.length) {
    const next = _activeRitual.nextScene || _activeRitual.startingScene;
    _activeRitual = null; emit('ritualCompleted', ritual.id);
    navigate(next); // was: import('./navigation.js').then(m => m.navigate(next))
  } else {
    emit('ritualPhaseChanged', { ritualId: ritual.id, phaseIndex: _activeRitual.phaseIndex }); scheduleRender();
  }
}
function getCurrentRitualPhase() { if (!_activeRitual) return null; return _activeRitual.phasePath[_activeRitual.phaseIndex]; }
function isRitualActive() { return _activeRitual !== null; }

function renderRitual(root) {
  const phase = getCurrentRitualPhase();
  if (!phase) { _activeRitual=null; scheduleRender(); return; }
  const wrap=document.createElement('div'); wrap.className='game';
  const hdr=document.createElement('div'); hdr.className='game-header';
  const lb=document.createElement('div'); lb.className='location-bar';
  lb.textContent=`${_activeRitual.id} \u2014 ${phase.title||'Phase '+(_activeRitual.phaseIndex+1)}`;
  hdr.appendChild(lb); wrap.appendChild(hdr);
  const body=document.createElement('div'); body.className='game-body';
  if (phase.text) {
    let raw=Array.isArray(phase.text)?phase.text:[phase.text];
    raw=raw.map(applyLinguisticToggle).map(applyPostEventShifts);
    const _ml=injectMicroLines(raw,G.scene); _ml.forEach(line=>{const p=document.createElement('p');p.className='sp';p.innerHTML=processText(injectGhostText(line,G.scene));body.appendChild(p);});
  }
  const cd=document.createElement('div'); cd.className='choices';
  if (phase.ritualChoices) {
    phase.ritualChoices.forEach(ch=>{
      const btn=document.createElement('button'); btn.className='choice'+(ch.style==='sacrifice'?' choice-sacrifice':'');
      const _chNum=++_choiceIdx;
      btn.textContent=processText(ch.text);
      if(_chNum<=9){btn.setAttribute('data-key',_chNum);btn.setAttribute('aria-keyshortcuts',String(_chNum));}
      btn.onclick=()=>{if(ch.effect)applyEffect(ch.effect);if(ch.set_flag)setFlag(ch.set_flag);_activeRitual.choicesMade.push({phase:_activeRitual.phaseIndex,choice:ch.text,branch:ch.branch});ritualNextPhase(ch.branch);};
      cd.appendChild(btn);
    });
  } else if (phase.choices) {
    phase.choices.forEach(ch=>{
      const btn=document.createElement('button');btn.className='choice';btn.textContent=processText(ch.text);
      btn.onclick=()=>{if(ch.effect)applyEffect(ch.effect);if(ch.set_flag)setFlag(ch.set_flag);ritualNextPhase();};
      cd.appendChild(btn);
    });
  } else {
    const cont=document.createElement('button');cont.className='choice';cont.textContent='Continue';
    cont.onclick=()=>ritualNextPhase(); cd.appendChild(cont);
  }
  body.appendChild(cd); wrap.appendChild(body); root.appendChild(wrap);
}


// ============================================================
// SECTION: systems/navigation.js
// ============================================================

function navigate(id) {
  G.scene       = id;
  G._sceneCount = (G._sceneCount || 0) + 1;
  markMapNodeVisited(id);
  G._poaAbsorbedThisScene = false;
  G._mortificationSpent   = false;
  G._dialogue             = null;
  G._coverChallenge       = null;
  // tickSoundings removed from navigate — progress only via progressSounding()
  _captureSnapshot();
  tickDelayedConsequences();
  scheduleRender();
  // Re-apply persistent UI classes from ship state
  if(G.shipState){
    document.body.classList.toggle('ship-paranoid',  (G.shipState.paranoia||0)>=4);
    document.body.classList.toggle('ship-exhausted', (G.shipState.exhaustion||0)>=5);
    document.body.classList.toggle('ship-low-morale',(G.shipState.morale||5)<=3);
  }
  // Close panel immediately on navigation (no animation — scene change takes priority)
  if (G.panelOpen) {
    G.panelOpen = null;
    const _ov = document.querySelector('.panel-overlay');
    if (_ov) { _ov.classList.remove('open'); _ov.remove(); }
  }
  emit('sceneChanged', id);
}

function openPanel(w) {
  const prev = G.panelOpen;
  G.panelOpen = (w && prev === w) ? null : w;
  // If closing: animate out first, then remove
  if (!G.panelOpen && prev) {
    const ov = document.querySelector('.panel-overlay');
    if (ov) {
      ov.classList.remove('open');
      setTimeout(() => { ov.remove(); }, 250);
    }
  } else {
    // Remove any existing overlay immediately before opening new one
    document.querySelectorAll('.panel-overlay').forEach(el => el.remove());
    if (G.panelOpen) {
      const _root = document.getElementById('root');
      if (_root) _renderPanel(G.panelOpen, _root);
    }
  }
  scheduleRender(); // update nav active states
}
function _renderPanel(po, root) {
  if(po==='notes')    _renderNotesPanel(root);
  else if(po==='status')   _renderStatusPanel(root);
  else if(po==='breviary') _renderBreviaryPanel(root);
  else if(po==='glossary') _renderNotesPanel(root);
  else if(po==='map')      _renderMapPanelSide(root);
  else if(po==='calendar') _renderCalendarPanel(root);
  else if(po==='journal')  renderJournalPanel(root, openPanel);
  else if(po==='log')      renderEventLogPanel(root, openPanel);
  else if(po==='codex')    renderCodexPanel(root, openPanel);
  // Trigger CSS transition: add 'open' class after one frame
  requestAnimationFrame(() => {
    const ov = document.querySelector('.panel-overlay');
    if (ov) ov.classList.add('open');
  });
}
function returnToTitle() { G.phase = 'title'; scheduleRender(); }

let _processingChoice = false;

function applyChoice(ch) {
  if (_processingChoice) return;
  _processingChoice = true;
  try {
    const consequenceRedirected = fireNextChoiceConsequences();
    if (ch.tags && Array.isArray(ch.tags)) {
      const tagValues = getTheosisTagValues(); let total=0;
      for (const tag of ch.tags) total += tagValues[tag]||0;
      if (total !== 0) incrementTheosis(total);
      applyAutoAlignment(ch.tags);
    }
    if (ch.theosis)      incrementTheosis(ch.theosis);
    if (ch.theosisFlash) flashTheosisLight(typeof ch.theosisFlash==='number'?ch.theosisFlash:1.0, ch.theosisFlashDuration||2000);
    // Spasibo shorthand: bare stat keys directly on choice object
    { const statKeys = Object.keys(G.stats); const bareEffect = {}; let hasBare = false; for (const k of statKeys) { if (typeof ch[k] === 'number') { bareEffect[k] = ch[k]; hasBare = true; } } if (hasBare) applyEffect(bareEffect); }
    if (ch.spend_composure && G.stats.composure >= ch.spend_composure) {
      G.stats.composure -= ch.spend_composure;
      emit('statChanged', { stat: 'composure', delta: -ch.spend_composure });
      showToast(`Spent ${ch.spend_composure} Composure for certainty`, 'note');
    }
    applyEffect(ch.effect);
    if (ch.set_flag) setFlag(ch.set_flag);
    if (ch.flags) [].concat(ch.flags).forEach(f => setFlag(f));
    if (ch.set_note) addNote(ch.set_note);
    if (ch.set_cover) { const covers = Array.isArray(ch.set_cover) ? ch.set_cover : [ch.set_cover]; covers.forEach(c => setCover(c.key, c.value)); }
    if (ch.degrade_cover !== undefined) degradeCover(ch.degrade_cover);
    if (ch.thought)   offerSounding(ch.thought);
    if (ch.give_item) addItem(ch.give_item);
    if (ch.take_item) removeItem(ch.take_item);
    let deadlineRedirect = false;
    if (ch.advance_time) { const result = advanceTime(ch.advance_time); deadlineRedirect = result?.deadlineFired; }
    if (ch.set_deadline) setDeadline(ch.set_deadline.id, ch.set_deadline.day, ch.set_deadline.hour, ch.set_deadline.scene, { condition: ch.set_deadline.condition });
    if (ch.mod_reputation)  for (const [id, delta] of Object.entries(ch.mod_reputation))  modReputation(id, delta);
    if (ch.set_quest_state) for (const [id, state] of Object.entries(ch.set_quest_state)) setQuestState(id, state);
    if (ch.mod_stance)    for (const [npc, stances] of Object.entries(ch.mod_stance))    for (const [key, delta] of Object.entries(stances)) modStance(npc, key, delta);
    if (ch.record_memory) for (const [npc, memory] of Object.entries(ch.record_memory)) recordNpcMemory(npc, memory);
    if (ch.learn)           [].concat(ch.learn).forEach(f => learn(f));
    if (ch.come_to_believe) [].concat(ch.come_to_believe).forEach(f => comeToBelieve(f));
    if (ch.contradict)      [].concat(ch.contradict).forEach(f => contradict(f));
    if (ch.add_companion)    addCompanion(ch.add_companion.id, ch.add_companion);
    if (ch.remove_companion) removeCompanion(ch.remove_companion);
    if (ch.push_consequence) pushConsequence(ch.push_consequence);
    if (ch.schedule_event)   scheduleEvent(ch.schedule_event);
    if (checkEndings()) { emit('choiceApplied', ch); return; }
    if (ch.dialogue) { startDialogue(ch.dialogue); emit('choiceApplied', ch); return; }
    if (G.scene && ch.text) G.choiceHistory[G.scene] = { text: ch.text, timestamp: Date.now(), crossing: G.playCount };
    if (consequenceRedirected || deadlineRedirect) { emit('choiceApplied', ch); return; }
    if (ch.next === '__new_play__') { newPlay(); return; }
    if (ch.start_ritual) { const [rid,sscene,nscene] = ch.start_ritual; startRitual(rid, sscene, nscene); return; }
    if (ch.next) {
    _lastScrolledScene = null; // force scroll even if scene id is unchanged
    navigate(ch.next);
  }
    emit('choiceApplied', ch);
  } finally { _processingChoice = false; }
}

function newPlay() {
  addCrossingEntry();
  const currentFlags = [...G.flags];
  const carriedTheosis = Math.max(5, Math.min(85, G.theosis - 15));

  // ── META PERSISTENCE ─────────────────────────────────────────
  // Store the waking charism carried from this crossing
  const wakingCharisms = (_registries.charisms.waking || []).map(c => c.id);
  const lastWakingCharism = G.charisms.find(c => wakingCharisms.includes(c));
  if (lastWakingCharism) G.metaUnlocks['lastCharism_' + G.playCount] = lastWakingCharism;

  // Increment transmission count for anomaly-grows arc
  if (currentFlags.includes('archive_transmitted')) {
    G.metaUnlocks.transmissionCount = (G.metaUnlocks.transmissionCount || 0) + 1;
  }

  // Store which Lena fragment was seen
  for (let i = 1; i <= 5; i++) {
    if (currentFlags.includes('lena_fragment_' + i + '_seen')) {
      G.metaUnlocks['lena_fragment_' + i] = true;
    }
  }

  // Pick crew variant for next crossing (cycles through available variants)
  const nextVariant = ((G.metaUnlocks.crewVariant || 0) + 1) % 3;
  G.metaUnlocks.crewVariant = nextVariant;

  const preserve = {
    theosis: carriedTheosis,
    metaUnlocks: G.metaUnlocks,
    playCount: G.playCount + 1,
    pastFlags: currentFlags,
    journal: G.journal
  };
  resetG(preserve);
  G.pastLifeFlags = new Set(currentFlags);
  // On second+ crossing, wake scene is the crossing tax lived experience
  G.scene = G.playCount > 1 ? 'crossing_tax_lived' : getInitialScene();
  G.phase = 'charism';
  refreshAtmosMods(); _captureSnapshot(); emit('newPlay'); scheduleRender();
}

function absoluteReset() {
  if (!confirm('Reset all crossings to zero? This cannot be undone.')) return;
  try {
    for (let i = localStorage.length-1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SAVE_KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch (e) { console.warn('Reset clear failed:', e); }
  resetG(); emit('gameReset'); scheduleRender();
}

function doRestart() { absoluteReset(); }
function mkOverlay(fn) { const o = document.createElement('div'); o.className='overlay-bg'; o.onclick=fn; return o; }

// ============================================================
// SECTION: systems/ambient.js
// ============================================================

const _ambientEvents = [];

function registerAmbientEvent(event) {
  if (!event.id || !event.text) { console.error('[SOBORNOST] registerAmbientEvent requires id and text'); return; }
  _ambientEvents.push({ id: event.id, text: event.text, scenes: event.scenes||[], condition: event.condition||null, weight: event.weight||1, oncePerCrossing: event.oncePerCrossing!==false, minAwareness: event.minAwareness||0, maxAwareness: event.maxAwareness||100 });
}
function unregisterAmbientEvent(id) { const i=_ambientEvents.findIndex(e=>e.id===id); if(i!==-1)_ambientEvents.splice(i,1); }
function checkAmbientEvents(sceneId) {
  const scene=_registries.scenes[sceneId];
  if(!scene||!scene.hub) return null;
  const available=[];
  for (const ev of _ambientEvents) {
    if(ev.oncePerCrossing&&G.ambientTriggered?.has(`${ev.id}_${G.playCount}`)) continue;
    if(ev.scenes.length&&!ev.scenes.includes(sceneId)) continue;
    if((G.awareness||0)<ev.minAwareness) continue;
    if((G.awareness||0)>ev.maxAwareness) continue;
    if(ev.condition&&!evaluateCondition(ev.condition)) continue;
    available.push(ev);
  }
  if(!available.length) return null;
  const total=available.reduce((s,e)=>s+e.weight,0);
  let r=Math.random()*total;
  for (const ev of available) {
    if(r<ev.weight){ G.ambientTriggered=G.ambientTriggered||new Set(); G.ambientTriggered.add(`${ev.id}_${G.playCount}`); emit('ambientEventTriggered',ev.id); return ev; }
    r-=ev.weight;
  }
  return available[available.length-1];
}
function getAmbientText(sceneId) { const ev=checkAmbientEvents(sceneId); return ev?ev.text:null; }


// ============================================================
// SECTION: systems/codex.js
// ============================================================

const _codexEntries = new Map();

function registerCodexEntry(id, { category, title, content, unlockCondition, hiddenUntilFound=true }) {
  if(!id||!title||!content){console.error('[SOBORNOST] registerCodexEntry requires id, title, and content');return;}
  _codexEntries.set(id,{id,category:category||'General',title,content,unlockCondition:unlockCondition||null,hiddenUntilFound,order:_codexEntries.size});
}
function getCodexEntry(id) { return _codexEntries.get(id)||null; }
function checkCodexUnlocks() {
  const newlyUnlocked=[];
  for(const[id,entry]of _codexEntries){
    if(G.codexUnlocked?.has(id))continue;
    if(!entry.unlockCondition)continue;
    if(evaluateCondition(entry.unlockCondition)){unlockCodexEntry(id);newlyUnlocked.push(id);}
  }
  return newlyUnlocked;
}
function unlockCodexEntry(id) {
  if(!_codexEntries.has(id)){console.warn(`[SOBORNOST] unlockCodexEntry: unknown entry "${id}"`);return;}
  G.codexUnlocked=G.codexUnlocked||new Set();
  if(!G.codexUnlocked.has(id)){G.codexUnlocked.add(id);emit('codexUnlocked',id);}
}
function isCodexUnlocked(id) { return G.codexUnlocked?.has(id)||false; }
function getUnlockedCodex() {
  const entries=[];
  for(const[id,entry]of _codexEntries)
    if(isCodexUnlocked(id)||!entry.hiddenUntilFound) entries.push({...entry,isLocked:!isCodexUnlocked(id)});
  return entries.sort((a,b)=>a.order-b.order);
}
function getCodexCategories() {
  const cats=new Set();
  for(const entry of _codexEntries.values()) if(!entry.hiddenUntilFound||isCodexUnlocked(entry.id)) cats.add(entry.category);
  return [...cats].sort();
}
function renderCodexPanel(root,openPanelFn) {
  const overlay=document.createElement('div');overlay.className='panel-overlay';
  overlay.onclick=(e)=>{if(e.target===overlay)openPanelFn(null);};
  const panel=document.createElement('div');panel.className='panel';
  const hdr=document.createElement('div');hdr.className='panel-header';
  const title=document.createElement('div');title.className='panel-title';title.textContent='the codex';
  const close=document.createElement('button');close.className='panel-close';close.textContent='\u00d7';close.onclick=()=>openPanelFn(null);
  hdr.appendChild(title);hdr.appendChild(close);panel.appendChild(hdr);
  const body=document.createElement('div');body.className='panel-body';
  const entries=getUnlockedCodex();
  if(!entries.length){const empty=document.createElement('p');empty.style.cssText='color:var(--dim);font-size:.75rem;font-style:italic;padding:.5rem 0';empty.textContent='The codex is empty. Discoveries await.';body.appendChild(empty);}
  else {
    getCodexCategories().forEach(cat=>{
      const catEntries=entries.filter(e=>e.category===cat);if(!catEntries.length)return;
      const ch=document.createElement('div');ch.style.cssText='font-size:.6rem;color:var(--amber-dim);letter-spacing:.15em;text-transform:uppercase;margin:1rem 0 .4rem;border-top:1px solid var(--border);padding-top:.6rem';ch.textContent=cat;body.appendChild(ch);
      catEntries.forEach(entry=>{
        const row=document.createElement('div');row.style.cssText='margin-bottom:1rem';
        const t=document.createElement('div');t.style.cssText='font-size:.8rem;color:var(--fg);margin-bottom:.2rem';t.textContent=entry.isLocked?'???':entry.title;row.appendChild(t);
        if(!entry.isLocked){const c=document.createElement('p');c.style.cssText='font-size:.75rem;color:var(--dim);line-height:1.4;margin:0';c.textContent=entry.content;row.appendChild(c);}
        body.appendChild(row);
      });
    });
  }
  panel.appendChild(body);overlay.appendChild(panel);document.body.appendChild(overlay);
}


// ============================================================
// SECTION: systems/cover.js
// ============================================================

const _challenges  = {};
const _fieldLabels = { posting:'Posting', background:'Background', denomination:'Denomination', connection:'Connection', left:'Left' };

function registerCoverChallenge(field,prompts) {
  if(!Array.isArray(prompts)||!prompts.length){console.error(`[SOBORNOST] registerCoverChallenge("${field}", prompts) — prompts must be a non-empty array`);return;}
  _challenges[field]=prompts;
}
function hasCoverChallenges(field) { return !!(field?_challenges[field]:Object.keys(_challenges).length); }
function getRegisteredChallengeFields() { return Object.keys(_challenges); }

const BASE_DIFFICULTY=8, PRESSURE_PENALTY=2;

function startCoverChallenge(field) {
  const prompts=_challenges[field];
  if(!prompts||!prompts.length){console.warn(`[SOBORNOST] No challenges registered for field "${field}"`);return;}
  if(!G.cover[field]){showToast(`Cover field "${field}" not yet established.`,'note');return;}
  const prompt=prompts[Math.floor(Math.random()*prompts.length)];
  const pressured=G.flags.has(`__cover_pressured_${field}`);
  const difficulty=BASE_DIFFICULTY+(pressured?PRESSURE_PENALTY:0);
  G._coverChallenge={field,prompt,difficulty,pressured};
  emit('coverChallengeStarted',{field,prompt,difficulty});scheduleRender();
}
function visibleRollHtml(result) {
  const cls = result.outcome === 'success' ? 'roll-success' : result.outcome === 'partial' ? 'roll-partial' : 'roll-fail';
  const labels = { success: 'holds', partial: 'holds — at cost', failure: 'fails' };
  return `<span class="visible-roll ${cls}">[${result.d1}·${result.d2}] + ${result.statValue} = ${result.total} — ${labels[result.outcome]||result.outcome}</span>`;
}

function resolveCoverChallenge(action) {
  if(!G._coverChallenge)return;
  const{field,difficulty}=G._coverChallenge;
  if(action==='deflect'){
    G.flags.add(`__cover_pressured_${field}`);showToast('You deflect the question. But it will come up again.','note');
    emit('coverChallengeDeflected',{field});G._coverChallenge=null;scheduleRender();return;
  }
  const result=performRoll('composure',difficulty,{});
  if(result.outcome==='success'){
    G.flags.delete(`__cover_pressured_${field}`);showToast(`Cover holds. ${_fieldLabels[field]||field} is secure.`,'note');emit('coverChallengeSuccess',{field,result});
  }else if(result.outcome==='partial'){
    G.flags.delete(`__cover_pressured_${field}`); // partial clears pressure — it cost something but holds
    const before=G.stats.composure||0;G.stats.composure=Math.max(0,before-1);
    if(G.stats.composure!==before)emit('statChanged',{stat:'composure',delta:-1});
    showToast(`You hold \u2014 barely. ${_fieldLabels[field]||field} costs you.`,'note');emit('coverChallengePartial',{field,result});
  }else{
    degradeCover(1);G.flags.add(`__cover_pressured_${field}`);
    showToast(`Cover questioned. ${_fieldLabels[field]||field} is under suspicion.`,'note');playSfx('cover_fail');emit('coverChallengeFailure',{field,result});
  }
  G._coverChallenge={...G._coverChallenge,result,resolved:true};scheduleRender();
}
function dismissCoverChallenge(){
  const ch = G._coverChallenge;
  G._coverChallenge = null;
  if (ch && ch.resolved && ch.result) {
    const key = `_cover_outcome_${ch.field}_${ch.result.outcome}`;
    if (G.flags.has(key)) { scheduleRender(); return; }
    G.flags.add(key);
    // Navigate to field-specific outcome scene if registered
    const outcomeScene = `cover_${ch.field}_${ch.result.outcome}`;
    if (_registries.scenes && _registries.scenes[outcomeScene]) {
      navigate(outcomeScene); return;
    }
    // Fallback to generic outcome scene
    const genericScene = `cover_challenge_${ch.result.outcome}`;
    if (_registries.scenes && _registries.scenes[genericScene]) {
      navigate(genericScene); return;
    }
  }
  saveGameLegacy();
  scheduleRender();
}

function renderCoverChallengeOverlay(root,processTextFn) {
  if(!G._coverChallenge)return false;
  const{field,prompt,difficulty,pressured,result,resolved}=G._coverChallenge;
  const label=_fieldLabels[field]||field,coverValue=G.cover[field];
  const overlay=document.createElement('div');overlay.className='cover-challenge-overlay';
  const box=document.createElement('div');box.className='cover-challenge-box';
  const hdr=document.createElement('div');hdr.className='cover-challenge-header';hdr.textContent=`Cover questioned \u2014 ${label}`;box.appendChild(hdr);
  if(coverValue){const cv=document.createElement('div');cv.className='cover-challenge-value';cv.textContent=`Your stated ${label.toLowerCase()}: ${coverValue}`;box.appendChild(cv);}
  if(pressured){const pn=document.createElement('div');pn.className='cover-challenge-pressure';pn.textContent='\u26a0 This field is under pressure. Difficulty increased.';box.appendChild(pn);}
  const promptEl=document.createElement('p');promptEl.className='cover-challenge-prompt sp';promptEl.textContent=`\u201c${prompt}\u201d`;box.appendChild(promptEl);
  const diffEl=document.createElement('div');diffEl.className='cover-challenge-diff';
  diffEl.textContent=`Composure roll vs difficulty ${difficulty} (your Composure: ${G.stats.composure||0})`;box.appendChild(diffEl);
  if(!resolved){
    const actions=document.createElement('div');actions.className='cover-challenge-actions';
    const rollBtn=document.createElement('button');rollBtn.className='btn btn-pri';rollBtn.textContent='Hold your cover (Composure roll)';rollBtn.onclick=()=>resolveCoverChallenge('roll');
    const deflectBtn=document.createElement('button');deflectBtn.className='btn';deflectBtn.textContent='Deflect \u2014 change the subject';deflectBtn.onclick=()=>resolveCoverChallenge('deflect');
    actions.appendChild(rollBtn);actions.appendChild(deflectBtn);box.appendChild(actions);
  }else if(result){
    const res=document.createElement('div');
    res.className=`cover-challenge-result ${result.outcome==='success'?'roll-success':result.outcome==='partial'?'roll-partial':'roll-fail'}`;
    // Dice display
    const diceRow = document.createElement('div'); diceRow.className='challenge-dice';
    diceRow.innerHTML = `<span class="die">${result.d1}</span><span class="die">${result.d2}</span> + ${result.statValue} = ${result.total}`;
    box.appendChild(diceRow);
    // Outcome narrative
    // Logbook notation: "bearing · total 14 · holds"
    const outcomeLabels = {
      success: 'holds',
      partial:  'holds — at cost',
      failure:  'does not hold',
    };
    const fieldLabel = field ? (field.charAt(0).toUpperCase()+field.slice(1)) : 'Cover';
    const integrityText = G.coverIntegrity !== undefined ? `  ◈ ${G.coverIntegrity}` : '';
    res.textContent = `${fieldLabel} · total ${result.total} · ${outcomeLabels[result.outcome]||result.outcome}${integrityText}`;
    if (result.charismNote) { const cn=document.createElement('div');cn.className='challenge-charism';cn.textContent=result.charismNote;box.appendChild(cn); }
    box.appendChild(res);
    const cont=document.createElement('button');cont.className='btn';cont.style.cssText='margin-top:1rem;width:100%';
    cont.textContent='Continue'; cont.onclick=dismissCoverChallenge; box.appendChild(cont);
  }
  overlay.appendChild(box);root.appendChild(overlay);return true;
}


// ============================================================
// SECTION: systems/dialogue.js
// ============================================================

function startDialogue(beats) {
  if(!beats||!beats.length)return;
  G._dialogue={beats,beatIndex:0,pendingReply:null,pendingNext:null};
  scheduleRender();emit('dialogueStarted');
}
function advanceDialogue() {
  if(!G._dialogue)return;
  const{beats,beatIndex,pendingReply,pendingNext}=G._dialogue;
  if(pendingReply){G._dialogue=null;if(pendingNext)navigate(pendingNext);else scheduleRender();emit('dialogueEnded');return;}
  const next=beatIndex+1;
  if(next>=beats.length){G._dialogue=null;scheduleRender();emit('dialogueEnded');return;}
  G._dialogue={...G._dialogue,beatIndex:next};scheduleRender();
}
function selectDialogueChoice(dc) {
  if(!G._dialogue)return;
  if(dc.effect)applyEffect(dc.effect);if(dc.set_flag)setFlag(dc.set_flag);if(dc.set_note)addNote(dc.set_note);
  emit('dialogueChoiceMade',{text:dc.text,next:dc.next});
  if(dc.reply){G._dialogue={...G._dialogue,pendingReply:{speaker:dc.reply.speaker,text:dc.reply.text},pendingNext:dc.next||null};scheduleRender();}
  else{G._dialogue=null;emit('dialogueEnded');if(dc.next)navigate(dc.next);else scheduleRender();}
}
function renderDialogue(root,processTextFn) {
  if(!G._dialogue)return;
  const{beats,beatIndex,pendingReply}=G._dialogue;
  const wrap=document.createElement('div');wrap.className='dialogue-wrap';
  if(pendingReply){_renderNpcBeat(wrap,pendingReply.speaker,pendingReply.text,processTextFn);wrap.appendChild(_continueBtn(()=>advanceDialogue()));root.appendChild(wrap);return;}
  const beat=beats[beatIndex];
  if(!beat){advanceDialogue();return;}
  if(beat.choices){
    const cd=document.createElement('div');cd.className='dialogue-choices';
    beat.choices.forEach(dc=>{const btn=document.createElement('button');btn.className='choice dialogue-choice';btn.textContent=processTextFn?processTextFn(dc.text):dc.text;btn.onclick=()=>selectDialogueChoice(dc);cd.appendChild(btn);});
    wrap.appendChild(cd);
  }else if(beat.speaker){
    // NPC speech: render this beat and stop — one exchange per advance
    _renderNpcBeat(wrap,beat.speaker,beat.text,processTextFn);
    wrap.appendChild(_continueBtn(()=>advanceDialogue()));
  }else if(beat.text){
    // Narration beat: batch ALL consecutive narration beats into one render
    // Only stop when we hit a speaker beat, choices, or end of dialogue
    let i=beatIndex;
    while(i<beats.length && beats[i] && !beats[i].speaker && !beats[i].choices && beats[i].text){
      const p=document.createElement('p');p.className='sp dialogue-narration';
      p.innerHTML=processTextFn?processTextFn(beats[i].text):beats[i].text;
      wrap.appendChild(p);
      i++;
    }
    // Advance the beat index to where we stopped
    G._dialogue.beatIndex=i-1; // advanceDialogue will +1 from here
    wrap.appendChild(_continueBtn(()=>advanceDialogue()));
  }else{advanceDialogue();return;}
  root.appendChild(wrap);
}
function _renderNpcBeat(wrap,speaker,text,processTextFn) {
  const block=document.createElement('div');block.className='dialogue-npc';
  const sp=document.createElement('div');sp.className='dialogue-speaker';sp.textContent=speaker;
  const tp=document.createElement('p');tp.className='sp dialogue-line';tp.innerHTML=processTextFn?processTextFn(text):text;
  block.appendChild(sp);block.appendChild(tp);wrap.appendChild(block);
}
function _continueBtn(onclick){const btn=document.createElement('button');btn.className='choice dialogue-continue';btn.textContent='Continue \u2014';btn.onclick=onclick;return btn;}


// ============================================================
// SECTION: systems/endings.js
// ============================================================

const _endings=[];
function registerEnding({id,condition,scene,priority=0}){
  if(!id||!scene){console.error('[SOBORNOST] registerEnding() requires id and scene');return;}
  const existing=_endings.findIndex(e=>e.id===id);if(existing!==-1)_endings.splice(existing,1);
  _endings.push({id,condition,scene,priority});
}
function checkEndings(){
  if(!_endings.length)return false;
  const triggered=_endings.filter(e=>{if(G.flags.has('__ending_fired__'+e.id))return false;return!e.condition||evaluateCondition(e.condition);});
  if(!triggered.length)return false;
  triggered.sort((a,b)=>b.priority-a.priority);
  const winner=triggered[0];
  G.flags.add('__ending_fired__'+winner.id);
  emit('endingTriggered',{id:winner.id,scene:winner.scene});
  navigate(winner.scene);return true;
}
function getRegisteredEndings(){return[..._endings];}


// ============================================================
// SECTION: systems/eventlog.js
// NOTE: recordEvent must be a function declaration (not const/let)
// so it is hoisted and available when emit() is called at startup.
// ============================================================

const EVENT_LOG_MAX=150;
let _loggedEvents=new Set([
  'flagSet','statChanged','soundingSettled','soundingTaken',
  'choiceApplied','sceneChanged','endingTriggered','theosisChanged',
  'metaUnlocked','companionAdded','companionRemoved','itemAdded','itemRemoved',
]);

function setLoggedEvents(eventTypeArray){_loggedEvents=new Set(eventTypeArray);}
function getLoggedEvents(){return[..._loggedEvents];}
function addLoggedEvent(type){_loggedEvents.add(type);}
function removeLoggedEvent(type){_loggedEvents.delete(type);}

// HOISTED function declaration — called from emit() which runs before this
// section in the execution order (but hoisting makes it safe)
function recordEvent(type,data){
  if(!_loggedEvents.has(type))return;
  G.eventLog.push({type,data,scene:G.scene,crossing:G.playCount,t:Date.now()});
  if(G.eventLog.length>EVENT_LOG_MAX)G.eventLog.shift();
}

function clearEventLog(){G.eventLog=[];}
function exportEventLog(){
  const blob=new Blob([JSON.stringify(G.eventLog,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`eventlog_${Date.now()}.json`;a.click();URL.revokeObjectURL(a.href);
}

const TYPE_COLOUR={flagSet:'var(--dim)',statChanged:'var(--amber)',soundingSettled:'var(--cold)',soundingTaken:'var(--cold-dim)',choiceApplied:'var(--fg)',sceneChanged:'var(--amber-dim)',endingTriggered:'var(--rust)',theosisChanged:'var(--amber)',metaUnlocked:'var(--cold)'};
function _typeColour(type){return TYPE_COLOUR[type]||'var(--dim)';}
function _summarise(type,data){
  if(!data)return'';
  switch(type){
    case'flagSet':return`"${data}"`;case'statChanged':return`${data.stat} ${data.delta>0?'+':''}${data.delta}`;
    case'sceneChanged':return`\u2192 ${data}`;case'choiceApplied':return data.text?`"${String(data.text).slice(0,40)}"`:'' ;
    case'endingTriggered':return`${data.id} \u2192 ${data.scene}`;case'theosisChanged':return`${data}`;
    case'soundingSettled':return`${data}`;case'soundingTaken':return`${data}`;case'metaUnlocked':return`${data}`;
    case'itemAdded':return`+ ${data}`;case'itemRemoved':return`- ${data}`;case'companionAdded':return`+ ${data}`;
    default:return typeof data==='string'?data:JSON.stringify(data).slice(0,60);
  }
}
function renderEventLogPanel(root,openPanelFn){
  const overlay=document.createElement('div');overlay.className='panel-overlay';
  overlay.onclick=(e)=>{if(e.target===overlay)openPanelFn(null);};
  const panel=document.createElement('div');panel.className='panel';
  const hdr=document.createElement('div');hdr.className='panel-header';
  const title=document.createElement('div');title.className='panel-title';title.textContent='event log';
  const exportBtn=document.createElement('button');exportBtn.className='btn btn-sm';exportBtn.style.cssText='font-size:.58rem;padding:.1rem .4rem;margin-right:.4rem';exportBtn.textContent='export';exportBtn.onclick=exportEventLog;
  const close=document.createElement('button');close.className='panel-close';close.textContent='\u00d7';close.onclick=()=>openPanelFn(null);
  hdr.appendChild(title);hdr.appendChild(exportBtn);hdr.appendChild(close);panel.appendChild(hdr);
  const body=document.createElement('div');body.className='panel-body';body.style.fontFamily="'Courier Prime',monospace";
  if(!G.eventLog.length){const empty=document.createElement('p');empty.style.cssText='color:var(--dim);font-size:.7rem;font-style:italic';empty.textContent='No events logged yet.';body.appendChild(empty);}
  else{
    [...G.eventLog].reverse().forEach(entry=>{
      const row=document.createElement('div');row.style.cssText='display:flex;gap:.5rem;align-items:baseline;margin-bottom:.25rem;font-size:.65rem;line-height:1.3';
      const typeEl=document.createElement('span');typeEl.style.cssText=`color:${_typeColour(entry.type)};min-width:8rem;flex-shrink:0`;typeEl.textContent=entry.type;
      const dataEl=document.createElement('span');dataEl.style.cssText='color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';dataEl.textContent=_summarise(entry.type,entry.data);
      const sceneEl=document.createElement('span');sceneEl.style.cssText='color:var(--border-mid);font-size:.58rem;margin-left:auto;flex-shrink:0';sceneEl.textContent=entry.scene||'';
      row.appendChild(typeEl);row.appendChild(dataEl);row.appendChild(sceneEl);body.appendChild(row);
    });
  }
  panel.appendChild(body);overlay.appendChild(panel);document.body.appendChild(overlay);
}


// ============================================================
// SECTION: systems/devmode.js
// NOTE: hot-reload of individual data files replaced with full
// page reload — appropriate for single-file build.
// ============================================================

let _ws=null, _wsPort=3001, _retries=0;
const MAX_RETRIES=10, RETRY_DELAY=2000;
const _isLocal=()=>location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='::1';

function devMode(wsPort=3001){
  if(!_isLocal())return;
  _wsPort=wsPort; _wsConnect();
  console.log(`%c[SOBORNOST devMode] connected on ws://localhost:${wsPort}`,'color:#90c060;font-weight:bold');
  console.log('%c[SOBORNOST devMode] Hot-reload active. Save any file to reload.','color:#90c060');
}
function _wsConnect(){
  _ws=new WebSocket(`ws://localhost:${_wsPort}`);
  _ws.onopen=()=>{_retries=0;console.log('[SOBORNOST devMode] WS connected');};
  _ws.onmessage=(event)=>{
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.type==='reload'){console.log(`[SOBORNOST devMode] File changed (${msg.file||''}) — reloading\u2026`);location.reload();}
  };
  _ws.onclose=()=>{if(_retries<MAX_RETRIES){_retries++;setTimeout(_wsConnect,RETRY_DELAY);}else{console.warn('[SOBORNOST devMode] WS disconnected. Giving up.')}};
  _ws.onerror=()=>{};
}


// ============================================================
// SECTION: systems/validate.js
// ============================================================

const _VALID_STATS=()=>new Set(Object.keys(G.stats));
const _SPECIAL_NEXTS=new Set(['__new_play__']);
function _isValidScene(id){return id===null||id===undefined||_SPECIAL_NEXTS.has(id)||!!getScene(id);}
function _checkConditionV(cond,sceneId,where,issues){
  if(!cond)return;
  const stats=_VALID_STATS();
  if(cond.type==='stat'&&!stats.has(cond.name))issues.push({severity:'error',scene:sceneId,message:`${where}: condition references unknown stat "${cond.name}"`});
  if(cond.type==='charism'){const ids=allCharisms().map(c=>c.id);if(!ids.includes(cond.id))issues.push({severity:'warning',scene:sceneId,message:`${where}: condition references unknown charism "${cond.id}"`});}
  if(cond.conditions)cond.conditions.forEach(c=>_checkConditionV(c,sceneId,where,issues));
  if(cond.condition)_checkConditionV(cond.condition,sceneId,where,issues);
}
function _checkChoiceV(ch,sceneId,issues,charismIds,soundingIds,stats,prefix='choice'){
  if(ch.next!==undefined&&!_isValidScene(ch.next))issues.push({severity:'error',scene:sceneId,message:`${prefix}: next "${ch.next}" is not a registered scene`});
  if(ch.requires_charism&&!charismIds.includes(ch.requires_charism))issues.push({severity:'warning',scene:sceneId,message:`${prefix}: requires_charism "${ch.requires_charism}" is not a registered charism`});
  if(ch.requires_stat){const[statName]=ch.requires_stat;if(!stats.has(statName))issues.push({severity:'error',scene:sceneId,message:`${prefix}: requires_stat references unknown stat "${statName}"`});}
  if(ch.thought&&!soundingIds.has(ch.thought))issues.push({severity:'warning',scene:sceneId,message:`${prefix}: thought "${ch.thought}" is not a registered sounding`});
  if(ch.effect){for(const key of Object.keys(ch.effect))if(!stats.has(key))issues.push({severity:'error',scene:sceneId,message:`${prefix}: effect key "${key}" is not a valid stat`});}
  if(ch.condition)_checkConditionV(ch.condition,sceneId,prefix,issues);
  if(ch.dialogue&&Array.isArray(ch.dialogue)){ch.dialogue.forEach((beat,bi)=>{if(beat.choices)beat.choices.forEach((dc,ci)=>{_checkChoiceV(dc,sceneId,issues,charismIds,soundingIds,stats,`${prefix} > dialogue beat ${bi} choice ${ci}`);if(dc.reply&&typeof dc.reply.text!=='string')issues.push({severity:'warning',scene:sceneId,message:`${prefix} > dialogue beat ${bi} choice ${ci}: reply.text should be a string`});});});}
}
function validate(){
  const issues=[],scenes=_registries.scenes,charismIds=allCharisms().map(c=>c.id),soundingIds=new Set(Object.keys(_registries.soundings)),stats=_VALID_STATS(),sceneIds=new Set(Object.keys(scenes));
  const initial=getInitialScene();
  if(!initial)issues.push({severity:'error',scene:null,message:'setInitialScene() has not been called'});
  else if(!sceneIds.has(initial))issues.push({severity:'error',scene:null,message:`setInitialScene("${initial}") — scene is not registered`});
  for(const[id,scene]of Object.entries(scenes)){
    if(!scene.location)issues.push({severity:'warning',scene:id,message:'scene has no location label'});
    if(scene.text===undefined&&!scene.iconLayers)issues.push({severity:'warning',scene:id,message:'scene has no text or iconLayers'});
    if(scene.return_to&&!_isValidScene(scene.return_to))issues.push({severity:'error',scene:id,message:`return_to "${scene.return_to}" is not a registered scene`});
    if(scene.on_enter&&scene.on_enter.thought&&!soundingIds.has(scene.on_enter.thought))issues.push({severity:'warning',scene:id,message:`on_enter.thought "${scene.on_enter.thought}" is not a registered sounding`});
    if(scene.choices)scene.choices.forEach((ch,i)=>_checkChoiceV(ch,id,issues,charismIds,soundingIds,stats,`choice[${i}] "${ch.text||''}"`));
  }
  for(const ending of getRegisteredEndings()){
    if(!_isValidScene(ending.scene)||!sceneIds.has(ending.scene))issues.push({severity:'error',scene:null,message:`ending "${ending.id}" references unregistered scene "${ending.scene}"`});
    if(ending.condition)_checkConditionV(ending.condition,null,`ending "${ending.id}"`,issues);
  }
  const errors=issues.filter(i=>i.severity==='error'),warnings=issues.filter(i=>i.severity==='warning');
  if(!issues.length)console.log('%c[SOBORNOST] validate() — all clear.','color:#90c060');
  else{
    console.group(`%c[SOBORNOST] validate() — ${errors.length} error(s), ${warnings.length} warning(s)`,'color:#c09060;font-weight:bold');
    errors.forEach(i=>{const loc=i.scene?`[${i.scene}] `:'';console.error(`%cERROR%c  ${loc}${i.message}`,'color:#c06060;font-weight:bold','color:inherit');});
    warnings.forEach(i=>{const loc=i.scene?`[${i.scene}] `:'';console.warn(`%cWARN%c   ${loc}${i.message}`,'color:#c0a060;font-weight:bold','color:inherit');});
    console.groupEnd();
  }
  return issues;
}


// ============================================================
// SECTION: systems/text.js
// ============================================================

function _conditionPasses(item){
  if(item.if!==undefined&&!G.flags.has(item.if))return false;
  if(item.if_not!==undefined&&G.flags.has(item.if_not))return false;
  if(item.if_stat!==undefined&&(G.stats[item.if_stat[0]]||0)<item.if_stat[1])return false;
  if(item.if_charism!==undefined&&!G.charisms.includes(item.if_charism))return false;
  if(item.if_awareness!==undefined&&(G.awareness||0)<item.if_awareness)return false;
  if(item.if_theosis!==undefined&&G.theosis<item.if_theosis)return false;
  if(item.if_belief!==undefined&&!G.beliefs.has(item.if_belief))return false;
  if(item.if_knowledge!==undefined&&!G.knowledge.has(item.if_knowledge))return false;
  if(item.if_playcount!==undefined&&G.playCount<item.if_playcount)return false;
  return true;
}
const _CONDITION_KEYS=new Set(['if','if_not','if_stat','if_charism','if_awareness','if_theosis','if_belief','if_knowledge','if_playcount']);
function _hasConditionKey(item){return Object.keys(item).some(k=>_CONDITION_KEYS.has(k));}
function _pickRandom(options){
  const pool=options.map(o=>typeof o==='string'?{text:o,weight:1}:{text:o.text,weight:o.weight||1});
  const total=pool.reduce((s,o)=>s+o.weight,0);let r=Math.random()*total;
  for(const o of pool){if(r<o.weight)return o.text;r-=o.weight;}return pool[pool.length-1].text;
}
function _resolveTextValue(val){
  if(typeof val==='string')return[val];
  if(typeof val==='function'){const r=val(G);return typeof r==='string'?[r]:(r||[]);}
  if(Array.isArray(val))return val.filter(v=>typeof v==='string');
  return[];
}
function _resolvePassage(item){
  if(typeof item==='string')return[item];
  if(typeof item==='function'){const r=item(G);return typeof r==='string'?[r]:(r||[]);}
  if(typeof item!=='object'||item===null)return[];
  const hasCondition=_hasConditionKey(item);
  if(hasCondition&&!_conditionPasses(item))return item.else!==undefined?_resolveTextValue(item.else):[];
  if(item.random!==undefined)return[_pickRandom(item.random)];
  if(item.text!==undefined)return _resolveTextValue(item.text);
  return[];
}
function resolveTextBlock(textBlock){
  if(typeof textBlock==='function')textBlock=textBlock(G);
  if(typeof textBlock==='object'&&!Array.isArray(textBlock)&&textBlock!==null){
    const a=G.awareness||0;let best=0;
    for(const k in textBlock){const n=parseInt(k);if(!isNaN(n)&&n<=a&&n>=best)best=n;}
    textBlock=textBlock[best]||textBlock[0]||[];
  }
  const raw=Array.isArray(textBlock)?[...textBlock]:[textBlock];
  return raw.flatMap(item=>_resolvePassage(item));
}
function getSceneText(scene){return resolveTextBlock(scene.text);}
function resolveLayeredText(scene){return getSceneText(scene);}
function injectMicroLines(lines, sceneId) {
  // At very high theosis (Illumined tier), inject faint environmental lines
  const t = G.theosis || 0;
  const dev = G.magneticDeviation || 0;
  if (t < 66 && dev < 0.6) return lines;
  // Append a very faint micro-observation to the last paragraph
  const microLines = {
    'foredeck_standing':    'The compass needle holds its deviation. It has been holding for six hours.',
    'hold_boxes':           'Freezer Beef adjusts her position by one inch. She does not explain this.',
    'instrument_shimmer':   'The porthole light has a quality that is not weather.',
    'anomaly_peak':         'The instruments have been correct about everything so far.',
    'cabin_porthole_stay':  'The sea is the same sea it was before the crossing. It is not the same sea.',
    'lena_silence':         'The coffee is the right temperature. It is always the right temperature.',
  };
  const micro = microLines[sceneId];
  if (!micro || Math.random() > 0.6) return lines;
  return [...lines, `<span class="micro-line">${micro}</span>`];
}
const _toggleMemo = new Map();
function applyLinguisticToggle(t){
  const doubt = G.stats.doubt || 0;
  if (doubt < 4 || !_registries.translations || !Object.keys(_registries.translations).length) return t;
  // Memoize per scene+doubt-tier to prevent per-render flickering
  const tier = doubt >= 7 ? 'H' : doubt >= 5 ? 'M' : 'L';
  const key = G.scene + '|' + tier + '|' + t.slice(0, 32);
  if (_toggleMemo.has(key)) return _toggleMemo.get(key);
  const flicker = tier === 'H' ? 0.35 : tier === 'M' ? 0.18 : 0.08;
  let result = t;
  for (const [orig, trans] of Object.entries(_registries.translations)) {
    if (Math.random() < flicker) {
      result = result.replaceAll(orig, `<span class="cyrillic-flicker" title="${orig}">${trans}</span>`);
    }
  }
  _toggleMemo.set(key, result);
  // Expire memo on scene change
  return result;
}
// Clear memo on navigation
function _clearToggleMemo() { _toggleMemo.clear(); }
function applyPostEventShifts(t) {
  if (!t || !_registries.postEventShifts || !_registries.postEventShifts.length) return t;
  let result = t;
  for (const shift of _registries.postEventShifts) {
    if (!G.flags.has(shift.triggerFlag)) continue;
    for (const p of (shift.patterns || [])) {
      if (p.pattern && p.replacement) {
        result = result.replace(new RegExp(_escapeRe(p.pattern), 'g'), p.replacement);
      }
    }
  }
  return result;
}
function applyPastLifeLines(text, sceneId) {
  if (!text || G.playCount <= 1) return text;
  const lines = _registries.pastLifeLines[sceneId];
  if (!lines || !lines.length) return text;
  let result = text;
  for (const entry of lines) {
    if (!entry.pattern || !entry.replacement) continue;
    result = result.replace(new RegExp(_escapeRe(entry.pattern), 'g'), entry.replacement);
  }
  return result;
}
function injectGhostText(t, sceneId) {
  // At high deviation + high doubt, inject ghost fragments into scene text
  const dev = G.magneticDeviation || 0;
  const doubt = G.stats.doubt || 0;
  if (dev < 0.7 && doubt < 6) return t;
  const intensity = Math.min(1, (dev - 0.5) * 2 + (doubt - 4) * 0.1);
  if (Math.random() > intensity * 0.4) return t;
  // Ghost fragments that bleed through at anomaly peak
  const ghosts = [
    '\n<span class="ghost-line">( the field receives )</span>',
    '\n<span class="ghost-line">( something below is listening )</span>',
    '\n<span class="ghost-line">( thirty years )</span>',
    '\n<span class="ghost-line">( Заря )</span>',
    '\n<span class="ghost-line">( the record persists )</span>',
  ];
  // Insert one ghost line into the text at a paragraph boundary
  const para = t.lastIndexOf('\n\n');
  if (para < 0) return t;
  const ghost = ghosts[Math.floor(Math.random() * ghosts.length)];
  return t.slice(0, para) + ghost + t.slice(para);
}
function processText(raw){
  if(typeof raw==='function')raw=raw(G);
  if(typeof raw!=='string')return'';
  let t = raw.replace(/\{ICON\}/g,iconWord());
  t = applyPostEventShifts(t);
  t = applyPastLifeLines(t, G.scene);
  t = applyNameMapping(t);
  return t;
}


// ============================================================
// SECTION: systems/idle.js
// ============================================================

let _idleTimer=null;
function startIdleTimer(){
  clearIdleTimer();if(G.phase!=='game')return;
  _idleTimer=setTimeout(()=>{
    if(G.phase!=='game')return;
    const scene=getScene(G.scene);
    if(scene&&(!scene.choices||scene.choices.length===0)&&!G.pendingRoll){
      const doubt=G.stats.doubt||0;
      showToast(doubt>=4?'What if I am not supposed to be here?':doubt>=2?'The silence is heavy.':'I wonder what time it is.','note');
      emit('rumination',doubt);
    }
    startIdleTimer();
  },10000);
}
function resetIdleTimer(){if(G.phase!=='game'){clearIdleTimer();return;}clearIdleTimer();startIdleTimer();}
function clearIdleTimer(){if(_idleTimer){clearTimeout(_idleTimer);_idleTimer=null;}}


// ============================================================
// SECTION: ui/widgets.js
// ============================================================

let _uiOpacity=1;
function setUiOpacity(o){_uiOpacity=Math.min(1,Math.max(0,o));emit('uiOpacityChanged',_uiOpacity);}
function getUiOpacity(){return _uiOpacity;}
let _compass={left:{label:'Left',value:0},right:{label:'Right',value:0}};
function registerCompassAxes(l,r){_compass={left:{label:l,value:0},right:{label:r,value:0}};}
function updateCompass(l,r){_compass.left.value=l;_compass.right.value=r;emit('compassUpdated',{left:l,right:r});}
function renderCompass(){
  const total=_compass.left.value+_compass.right.value;
  if(!total)return'<div style="font-family:monospace">\u25c4\u2014\u2014\u2014???\u2014\u2014\u2014\u25ba</div>';
  const pos=Math.floor((_compass.left.value/total)*20);
  let c='\u25c4';for(let i=0;i<20;i++)c+=i===pos?'\u25cf':'\u2500';c+='\u25ba';
  return`<div style="font-family:monospace;font-size:.7rem">${c}</div><div style="font-size:.7rem">${_compass.left.label} \u25cf ${_compass.right.label}</div>`;
}
const _pt={};
function registerProgressTracker(id,label,max,onUpdate){_pt[id]={current:0,max,label,onUpdate};emit('progressTrackerRegistered',id);}
function updateProgressTracker(id,inc){
  if(!_pt[id])return;const old=_pt[id].current;
  _pt[id].current=Math.min(_pt[id].max,Math.max(0,old+inc));
  if(_pt[id].onUpdate)_pt[id].onUpdate(_pt[id].current);
  emit('progressTrackerUpdated',{id,old,new:_pt[id].current});
}
function getProgressTracker(id){return _pt[id];}
function renderCoverMeter(integrity){
  const pct=(Math.min(integrity,10)/10)*100;const color=integrity<=2?'#c06060':integrity<=5?'#c0a060':'#90c060';
  const pulse=integrity<=2?' pulsing':'';
  return`<div class="cover-meter${pulse}" style="width:100%;background:#2a2018;border-radius:4px;margin-top:.3rem"><div style="width:${pct}%;background:${color};height:6px;border-radius:4px"></div></div>`;
}
function renderMapPanel(){
  let s='';for(const[id,d]of Object.entries(_registries.mapNodes)){s+=`${d.visited?'\u25c9':'\u25cb'} ${id}\n`;if(d.connections&&d.connections.length)s+=`  \u2514\u2500 connects to: ${d.connections.join(', ')}\n`;}
  return`<pre style="font-size:.7rem;font-family:monospace">${s}</pre>`;
}
function markMapNodeVisited(id){if(_registries.mapNodes[id]){_registries.mapNodes[id].visited=true;setFlag('visited_'+id);}}
function isNodeVisited(id){return !!((_registries.mapNodes[id]&&_registries.mapNodes[id].visited)||G.flags.has('visited_'+id)||G.pastLifeFlags&&G.pastLifeFlags.has('visited_'+id));}
function isNodeKnown(id){
  // Known = visited this crossing OR visited in past life (Witness charism)
  if(isNodeVisited(id)) return true;
  if(G.charisms&&G.charisms.includes('witness')&&G.pastLifeFlags&&G.pastLifeFlags.has('visited_'+id)) return true;
  return false;
}

// ============================================================
// SECTION: ui/renderer.js
// ============================================================

setRenderFn(render);

function render(){
  const root=document.getElementById('root');
  if(!root){console.error('[SOBORNOST] No #root element found');return;}
  root.innerHTML='';
  if(typeof IS_DEMO!=='undefined'&&IS_DEMO){const b=document.createElement('div');b.className='demo-banner';b.textContent='\u2693 DEMO \u2014 '+(window.GAME_TITLE||'Game');root.appendChild(b);}
  if     (G.phase==='title')    renderTitle(root);
  else if(G.phase==='mode')     renderMode(root);
  else if(G.phase==='charism')  renderCharism(root);
  else if(G.phase==='game')     renderGame(root);
  else if(G.phase==='memorial') renderMemorial(root);
}

function renderTitle(root){
  clearIdleTimer();setMood('neutral');
  const replay=G.playCount>0,hasSave=!!localStorage.getItem(SAVE_KEY_PREFIX+'legacy'),isDemo=typeof IS_DEMO!=='undefined'&&IS_DEMO;
  const d=document.createElement('div');d.className='title-screen';
  d.innerHTML=`
    <div class="title-plate">
    <div class="title-cyrillic">${window.GAME_TITLE||'СПАСИБО'}</div>
    </div>
    <div style="font-family:'GOST type B','Share Tech Mono',monospace;font-size:.66rem;color:var(--amber-dim);letter-spacing:.22em;margin-bottom:${isDemo?'1.2':'2'}rem">${window.GAME_MOTTO||'Thank You'}</div>
    ${isDemo?'<div style="font-size:.8rem;color:var(--amber);border:1px solid var(--amber-dim);padding:.5rem 1.2rem;margin-bottom:2.5rem">DEMO VERSION \u2014 Act One Only</div>':''}
    <pre class="title-ship-art">
      |    |    |
     )_)  )_)  )_)
    )___))___))___)\\
   )____)____)_____)\\\\
___|____|____|____\\\\\\__
--\\                    /--
~~~  ~~~~  ~~~  ~~~  ~~~</pre>
    <div style="font-size:.78rem;color:${replay?'var(--cold-dim)':'var(--dim)'};letter-spacing:.12em;font-style:italic;margin-bottom:2rem">${replay?'another crossing.':'a crossing.'}</div>
    <div style="display:flex;flex-direction:column;gap:.6rem;align-items:center">
      ${hasSave?`<button class="btn" id="tc">Continue crossing</button><button class="btn btn-sm" id="tn">New crossing</button>`:`<button class="btn" id="tb">Begin the crossing</button>`}
    </div>
    ${replay?`<div style="margin-top:.8rem;font-size:.66rem;color:var(--dim)">crossing ${G.playCount+1}</div>`:''}
    <div style="margin-top:2.5rem;display:flex;gap:.8rem;justify-content:center">
      <button class="btn btn-sm" id="tm" style="color:var(--cold-dim)">the memorial</button>
      <button class="btn btn-sm" id="tr" style="color:var(--border-mid);font-size:.6rem">reset all</button>
    </div>`;
  root.appendChild(d);
  d.querySelector('#tc')?.addEventListener('click',_continueGame);
  d.querySelector('#tn')?.addEventListener('click',()=>{G.phase='mode';render();});
  d.querySelector('#tb')?.addEventListener('click',()=>{G.phase='mode';render();});
  d.querySelector('#tm')?.addEventListener('click',()=>{G.phase='memorial';render();});
  d.querySelector('#tr')?.addEventListener('click',doRestart);
}
function _continueGame(){
  if(loadGameLegacy()){
    G.phase = 'game';
    if(G.scene && !getScene(G.scene)){
      console.warn('[SOBORNOST] Saved scene "'+G.scene+'" not found — resetting to initial scene');
      G.scene = getInitialScene();
    }
    render();
  } else { G.phase='mode'; render(); }
}

function renderMode(root) {
  clearIdleTimer();
  const d = document.createElement('div'); d.className = 'title-screen';
  const modes = _registries.availableModes || ['attended', 'witnessed'];
  const reg = _registries.modeDescriptions || {};
  const fallback = {
    attended:  { name:'Attended',  long:'Standard play. Your choices matter. The ship keeps score. Cover can fail. All five endings are reachable. Choose this for your first crossing.' },
    witnessed: { name:'Witnessed', long:'A quieter mode. Cover challenges resolve automatically. The story draws on your history more than your moment-to-moment choices. Choose this if you want the narrative without the mechanical pressure.' },
    open:      { name:'Open',      long:'No restrictions. Everything is available.' },
  };

  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:.62rem;color:var(--dim);letter-spacing:.22em;text-transform:uppercase;margin-bottom:2rem;font-family:var(--font-display)';
  heading.textContent = 'How do you cross?';
  d.appendChild(heading);

  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:.7rem;width:100%;max-width:380px';
  modes.forEach(m => {
    const md = reg[m] || fallback[m] || { name: m, long: '' };
    const btn = document.createElement('button');
    btn.className = 'btn mode-btn';
    btn.style.cssText = 'text-align:left;padding:.9rem 1.1rem;display:flex;flex-direction:column;gap:.35rem';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:.82rem;color:var(--fg);letter-spacing:.06em';
    nameEl.textContent = md.name || m;
    const descEl = document.createElement('div');
    descEl.style.cssText = 'font-size:.74rem;color:var(--dim);line-height:1.65;font-style:italic';
    descEl.textContent = md.long || md.short || '';
    btn.appendChild(nameEl); btn.appendChild(descEl);
    btn.addEventListener('click', () => { G.mode = m; G.phase = 'charism'; render(); });
    btnWrap.appendChild(btn);
  });
  d.appendChild(btnWrap);
  root.appendChild(d);
}
function renderCharism(root) {
  clearIdleTimer();
  const isReplay = G.playCount > 0;
  const sleeping = (_registries.charisms.sleeping || []);
  const waking   = (_registries.charisms.waking   || []);

  // On replay, check if a waking charism was already assigned via newPlay event
  const assignedWaking = isReplay ? waking.find(c => G.charisms.includes(c.id)) : null;

  const d = document.createElement('div'); d.className = 'charism-screen';

  if (assignedWaking) {
    // Show the assigned waking charism, let player confirm + optionally pick a sleeping one
    d.innerHTML = `
      <div class="charism-prompt">The crossing remembers something about you. This charism has found you.</div>
      <div class="charism-card waking" style="margin-bottom:1.4rem">
        <h3>${assignedWaking.name}</h3>
        <p>${assignedWaking.desc}</p>
        <p style="margin-top:.4rem;font-size:.68rem;color:var(--cold-dim)">${assignedWaking.effect||''}</p>
      </div>
      <div class="charism-prompt" style="margin-top:1rem">Choose also a sleeping charism — or carry only what the crossing gave you.</div>
      <div id="charism-list"></div>
      <button class="btn" id="charism-skip" style="margin-top:1rem;color:var(--dim)">Carry only the waking charism</button>`;
    root.appendChild(d);
    const list = d.querySelector('#charism-list');
    sleeping.forEach(c => {
      const card = document.createElement('div'); card.className = 'charism-card';
      card.innerHTML = `<h3>${c.name}</h3><p>${c.desc}</p>`;
      card.addEventListener('click', () => {
        G.charisms = [...new Set([assignedWaking.id, c.id])];
        beginGame();
      });
      list.appendChild(card);
    });
    d.querySelector('#charism-skip').addEventListener('click', () => {
      G.charisms = [assignedWaking.id];
      beginGame();
    });
  } else {
    // First crossing: pick one sleeping charism
    d.innerHTML = `<div class="charism-prompt">Before the crossing begins, something in you presents itself. You have carried this for a long time. You may not have known its name.</div><div id="charism-list"></div>`;
    root.appendChild(d);
    const list = d.querySelector('#charism-list');
    sleeping.forEach(c => {
      const card = document.createElement('div'); card.className = 'charism-card';
      card.innerHTML = `<h3>${c.name}</h3><p>${c.desc}</p><p style="margin-top:.4rem;font-size:.68rem;color:var(--cold-dim)">${c.effect||''}</p>`;
      card.addEventListener('click', () => {
        G.charisms = [c.id];
        beginGame();
      });
      list.appendChild(card);
    });
  }
}

function selCharism(id) { G.charisms = [id]; beginGame(); }

function renderMemorial(root) {
  clearIdleTimer();
  const d = document.createElement('div'); d.className = 'title-screen';
  const crossings = G.journal ? G.journal.filter(e => e.type === 'crossing') : [];
  const endingsReached = G.journal ? G.journal.filter(e => e.type === 'ending') : [];

  let inner = `<div style="font-size:.62rem;color:var(--dim);letter-spacing:.22em;text-transform:uppercase;margin-bottom:1.8rem">the memorial</div>`;

  if (crossings.length === 0 && endingsReached.length === 0) {
    inner += `<div style="font-size:.84rem;color:var(--cold-dim);font-style:italic;max-width:340px;line-height:1.8;margin-bottom:2rem">No crossings yet. The ship is waiting.</div>`;
  } else {
    inner += `<div style="width:100%;max-width:400px;text-align:left;margin-bottom:1.6rem">`;
    crossings.forEach((c, i) => {
      inner += `<div style="border:1px solid var(--border);padding:.7rem 1rem;margin-bottom:.6rem">
        <div style="font-size:.62rem;color:var(--cold-dim);letter-spacing:.12em;text-transform:uppercase;margin-bottom:.3rem">Crossing ${i + 1}</div>
        <div style="font-size:.8rem;color:var(--fg)">${c.text || ''}</div>
      </div>`;
    });
    endingsReached.forEach(e => {
      inner += `<div style="border:1px solid var(--amber-dim);padding:.7rem 1rem;margin-bottom:.6rem">
        <div style="font-size:.62rem;color:var(--amber-dim);letter-spacing:.12em;text-transform:uppercase;margin-bottom:.3rem">Ending</div>
        <div style="font-size:.8rem;color:var(--amber)">${e.text || ''}</div>
      </div>`;
    });
    inner += `</div>`;
  }

  inner += `<button class="btn" id="mem-back">return to shore</button>`;
  d.innerHTML = inner;
  root.appendChild(d);
  d.querySelector('#mem-back').addEventListener('click', () => { G.phase = 'title'; render(); });
}
function _stub(root,name){
  const d=document.createElement('div');d.className='title-screen';
  d.innerHTML=`<p style="padding:2rem;color:var(--amber)">${name} \u2014 port from your v3.1 source</p>`;root.appendChild(d);
}

function dismissTutorial(){G.tutorialDone=true;saveGameLegacy();render();}

function beginGame(){
  if(!G.charisms.length)return;
  G.charisms.forEach(id=>addNote('charism_'+id));
  G.phase='game';G.scene=getInitialScene();
  if(!G.scene)console.error('[SOBORNOST] No initial scene set — call SOBORNOST.setInitialScene()');
  G.mode='open';refreshAtmosMods();emit('gameStarted');render();
}

function _renderTutorial(root){
  const div=document.createElement('div');div.className='tutorial-overlay';
  div.setAttribute('role','dialog');
  div.setAttribute('aria-label','Before you board');
  div.addEventListener('click',(e)=>{if(e.target===div)dismissTutorial();});

  const isWitnessed = G.mode === 'witnessed';
  const modeNote = isWitnessed
    ? '<div class="tutorial-mode-note">Witnessed mode — cover challenges resolve automatically. You are here to observe.</div>'
    : '';

  const customContent = _registries.tutorialContent;
  const boxHtml = customContent || `
    <div class="tutorial-h">Before you board</div>
    ${modeNote}
    <div class="tutorial-section">The cover</div>
    <div class="tutorial-item">You are the ship's chaplain. This is a cover. Build it through conversation — be consistent, don't over-explain. It is confirmed by others believing it, not by you asserting it.</div>
    ${isWitnessed ? '' : '<div class="tutorial-item"><em>When your cover is questioned, a Challenge appears. Roll Composure. Success holds clean. Partial holds but costs. Failure shifts something.</em></div>'}
    <div class="tutorial-section">The stats</div>
    <div class="tutorial-item"><strong>Vigilance</strong> — what you notice before it becomes a problem.</div>
    <div class="tutorial-item"><strong>Composure</strong> — what you can hold under pressure. Used in cover challenges.</div>
    <div class="tutorial-item"><strong>Communion</strong> — how much the crew trusts you collectively. Opens paths.</div>
    <div class="tutorial-item"><strong>Doubt</strong> — accumulates when the cover strains. Keep it low.</div>
    <div class="tutorial-section">Theosis &amp; soundings</div>
    <div class="tutorial-item">Theosis rises through contemplation, witness, and honest choices. Watch the porthole — it changes at 33 and 66. Soundings are moments of recognition; take them in the Breviary and they settle over time.</div>
    <div class="tutorial-section">Navigation</div>
    <div class="tutorial-item">Bottom row: Record · Status · Breviary · Calendar · Map. Keys 1–9 select choices. Escape closes panels. ? for this reference.</div>
    <div class="tutorial-item" style="color:var(--dim);font-size:.78rem;margin-top:.6rem">The crossing takes three days. What you carry forward depends on how far you have come.</div>
  `;
  div.innerHTML='<div class="tutorial-box">'+boxHtml+'<button class="btn" style="margin-top:1.5rem;width:100%;min-height:48px;font-size:1rem" id="dt">Board the ship</button></div>';
  div.querySelector('#dt').addEventListener('click',dismissTutorial);
  root.appendChild(div);
}

function _renderRollBox(root){
  const{choice,rollDef,result}=G.pendingRoll;
  const outCls=result.outcome==='success'?'roll-success':result.outcome==='partial'?'roll-partial':'roll-fail';
  const box=document.createElement('div');
  box.className=`roll-box ${result.outcome==='partial'?'roll-box-partial':result.outcome==='failure'?'roll-box-fail':''}`;
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

function renderGame(root){
  if(!G.tutorialDone&&G.scene===getInitialScene()){_renderTutorial(root);return;}
  if(G.rollResult&&G.pendingRoll){_renderRollBox(root);return;}
  if(isRitualActive()){renderRitual(root);return;}
  if(G._coverChallenge){
    const scene=getScene(G.scene);
    if(scene){const wrap=document.createElement('div');wrap.className='game';wrap.appendChild(_buildHeader(scene));const body=document.createElement('div');body.className='game-body';renderCoverChallengeOverlay(body,processText);body.appendChild(_buildRestartBar());wrap.appendChild(body);root.appendChild(wrap);}
    else{renderCoverChallengeOverlay(root,processText);}
    _appendAudioBtn(root);
  // Atmos toggle in page footer (not overlaid)
  if (!document.getElementById('_atmos_btn')) {
    const _ab = document.createElement('button'); _ab.id='_atmos_btn'; _ab.className='atmos-toggle';
    _ab.textContent = _atmosEnabled ? 'canvas on' : 'canvas off';
    _ab.onclick = toggleAtmos; _ab.title = 'Toggle atmospheric animation';
    _ab.setAttribute('aria-label', 'Toggle atmospheric canvas animation');
    root.appendChild(_ab);
  }_appendBottomNav(root);return;
  }
  processConsequenceQueue();resetIdleTimer();
  const scene=getScene(G.scene);
  if(!scene){_registries.sceneNotFound(G.scene,root);return;}
  const liturgical=LITURGICAL_HOURS[G.liturgicalHour];
  const _sceneMood = (liturgical ? liturgical.mood : scene.mood) || 'neutral';
  if(liturgical)setMood(liturgical.mood);else setMood(scene.mood||'neutral');
  // Apply mood body class for CSS mood-responsive text
  document.body.classList.remove('mood-neutral','mood-revelation','mood-uncanny','mood-tense');
  document.body.classList.add('mood-'+_sceneMood);
  const visitKey='visited_'+G.scene,firstVisit=!hasFlag(visitKey);
  if(firstVisit){setFlag(visitKey);if(scene.on_enter){if(scene.on_enter.note)addNote(scene.on_enter.note);if(scene.on_enter.flag)setFlag(scene.on_enter.flag);if(scene.on_enter.thought)offerSounding(scene.on_enter.thought);}
  // Support arbitrary onEnter function — first visit only
  if(typeof scene.onEnter === 'function') { try { scene.onEnter(); } catch(e) { console.error('[SOBORNOST] onEnter error in scene', G.scene, e); } }
  }
  // Check for custom render override (e.g. crossing_record screen)
  if (scene && typeof scene._renderOverride === 'function') {
    // Fire onEnter for this scene (normally fires in main render path)
    const _ovKey='_visited_'+G.scene;
    if(!G[_ovKey]){G[_ovKey]=true;if(typeof scene.onEnter==='function'){try{scene.onEnter();}catch(e){console.error(e);}}}
    scene._renderOverride(root);
    return;
  }
  const wrap=document.createElement('div');wrap.className='game';wrap.setAttribute('role','main');wrap.setAttribute('aria-label','Spasibo — game content');
  const uiOp=getUiOpacity();if(uiOp<1)wrap.style.opacity=uiOp;
  wrap.appendChild(_buildHeader(scene));
  const body=document.createElement('div');body.className='game-body';
  if(scene.art&&_registries.art[scene.art]){const art=document.createElement('pre');art.className='art-block';art.textContent=_registries.art[scene.art];body.appendChild(art);}
  if(G.lastReaction){const rp=document.createElement('p');rp.className='sp sp-reaction';rp.textContent=G.lastReaction;body.appendChild(rp);G.lastReaction=null;}
  const echo=G.choiceHistory[G.scene];
  if(echo&&!G.flags.has('__echo_shown_'+G.scene)){
    const echoDiv=document.createElement('div');echoDiv.className='scene-echo';
    const echoText=document.createElement('p');echoText.className='sp sp-echo';
    const crossingLabel=echo.crossing===G.playCount?'Earlier':`Crossing ${echo.crossing+1}`;
    echoText.innerHTML=`<em>${crossingLabel}, you chose: "${echo.text}"</em>`;
    echoDiv.appendChild(echoText);body.appendChild(echoDiv);setFlag('__echo_shown_'+G.scene);
  }
  const ambient=getAmbientText(G.scene);
  if(ambient){const ambP=document.createElement('p');ambP.className='sp sp-ambient';ambP.innerHTML=processText(ambient);body.appendChild(ambP);}
  let rawText=scene.iconLayers?resolveLayeredText(scene):getSceneText(scene);
  rawText=injectMicroLines(rawText,scene);rawText=injectGhostText(rawText,G.scene);rawText=applyPastLifeLines(rawText,G.scene);
  const stxt=document.createElement('div');
  const wakingC=['anamnesis','kenosis','tathagatagarbha','apophasis'];
  const isHalo=scene.mood==='revelation'||G.charisms.some(id=>wakingC.includes(id));
  stxt.className='stxt'+(isHalo?' stxt-halo':'');
  const showAnam=G.playCount>0&&scene.anamnesis;
  rawText.forEach((raw,idx)=>{
    if(typeof raw==='string'&&raw.startsWith('__GHOST__:')){const gp=document.createElement('p');gp.className='sp sp-ghost';gp.textContent=raw.replace('__GHOST__:','');stxt.appendChild(gp);return;}
    const p=document.createElement('p');p.className='sp';p.innerHTML=processText(raw);stxt.appendChild(p);
    if(showAnam&&scene.anamnesis&&scene.anamnesis.after===idx){const ap=document.createElement('p');ap.className='sp sp-anamnesis';ap.innerHTML=processText(scene.anamnesis.text);stxt.appendChild(ap);if(scene.anamnesis.note)addNote(scene.anamnesis.note);}
  });
  body.appendChild(stxt);
  if(G._dialogue){renderDialogue(body,processText);body.appendChild(_buildRestartBar());wrap.appendChild(body);root.appendChild(wrap);_appendAudioBtn(root);_appendBottomNav(root);return;}
  const cd=document.createElement('div');cd.className='choices';
  if(scene.return_to){const rb=document.createElement('button');rb.className='choice choice-return';rb.textContent=scene.return_label||'Return.';rb.onclick=()=>{_lastScrolledScene=null;navigate(scene.return_to);};cd.appendChild(rb);}
  if(scene.choices){
    let _choiceIdx=0;
    scene.choices.forEach(ch=>{
      if(ch.hide_if&&hasFlag(ch.hide_if))return;if(ch.show_if&&!hasFlag(ch.show_if))return;if(ch.once&&ch.next&&hasFlag('visited_'+ch.next))return;
      const btn=document.createElement('button');const locked=isChoiceLocked(ch);
      if(locked){
        if(G.mode==='open')return;btn.className='choice choice-locked';btn.disabled=true;
        let hint=processText(ch.text);
        if(ch.requires_stat)hint+=` [${ch.requires_stat[0]} ${ch.requires_stat[1]}+]`;if(ch.requires_charism)hint+=` [charism: ${ch.requires_charism}]`;
        if(ch.requires_playcount!==undefined)hint+=` [crossing ${ch.requires_playcount+1}+]`;if(ch.requires_item)hint+=` [requires: ${ch.requires_item}]`;
        if(ch.requires_theosis)hint+=` [theosis ${ch.requires_theosis}+]`;if(ch.requires_companion)hint+=` [companion: ${ch.requires_companion}]`;
        if(ch.requires_reputation_min)for(const[id,min]of Object.entries(ch.requires_reputation_min))hint+=` [${id}\u2265${min}]`;
        if(ch.requires_quest_state)for(const[id,state]of Object.entries(ch.requires_quest_state))hint+=` [${id}=${state}]`;
        if(ch.requires_belief)hint+=` [belief: ${ch.requires_belief}]`;if(ch.requires_knowledge)hint+=` [knowledge: ${ch.requires_knowledge}]`;if(ch.requires_past_flag)hint+=` [past: ${ch.requires_past_flag}]`;
        btn.textContent=hint;
      }else{
        const tv=ch.next&&hasFlag('visited_'+ch.next)&&scene.hub;
        let cls='choice';
        if(ch.type==='silence')cls+=' choice-silence';if(ch.style==='cold')cls+=' choice-cold';if(ch.style==='return')cls+=' choice-return';if(ch.style==='vespers')cls+=' choice-vespers';
        if(ch.cover_set)cls+=' choice-cover';if(ch.requires_charism)cls+=' choice-charism';if(tv)cls+=' choice-visited';if(ch.dialogue)cls+=' choice-dialogue';
        btn.className=cls;btn.innerHTML=(tv?'\u25e6 ':'')+processText(ch.text);
        if(ch.cover_set&&!hasFlag('cover_'+ch.cover_set.key+'_set')){const l=document.createElement('span');l.className='cover-label';l.textContent='\u2b25 establishing cover';btn.appendChild(l);}
        if(ch.requires_charism){const l=document.createElement('span');l.className='charism-label';l.textContent='\u25c8 '+ch.requires_charism;btn.appendChild(l);}
        if(ch.give_item){const l=document.createElement('span');l.className='item-label';l.textContent='+ '+ch.give_item;btn.appendChild(l);}
        if(ch.take_item){const l=document.createElement('span');l.className='item-label';l.textContent='- '+ch.take_item;btn.appendChild(l);}
        if(ch.advance_time){const l=document.createElement('span');l.className='time-label';l.textContent=`\u23f1 +${ch.advance_time}h`;btn.appendChild(l);}
        // reputation changes are silent — tracked in observations panel
        if(ch.set_quest_state){const l=document.createElement('span');l.className='quest-label';l.textContent=Object.entries(ch.set_quest_state).map(([id,s])=>`${id}\u2192${s}`).join(', ');btn.appendChild(l);}
        if(ch.spend_composure){const l=document.createElement('span');l.className='composure-label';l.textContent=`\u2212${ch.spend_composure} composure`;btn.appendChild(l);}
        btn.onclick=(ch.roll&&typeof ch.roll==='object')?()=>startRoll(ch):()=>applyChoice(ch);
      }
      cd.appendChild(btn);
    });
  }
  body.appendChild(cd);
  body.appendChild(_buildRestartBar());wrap.appendChild(body);root.appendChild(wrap);
  _appendAudioBtn(root);_appendBottomNav(root);
  // Mobile stat tip tap handler
  if ('ontouchstart' in window) {
    root.querySelectorAll('.stat').forEach(s => {
      s.addEventListener('touchstart', (e) => {
        e.preventDefault();
        document.querySelectorAll('.stat.tip-open').forEach(o => { if (o !== s) o.classList.remove('tip-open'); });
        s.classList.toggle('tip-open');
        setTimeout(() => s.classList.remove('tip-open'), 2500);
      }, { passive: false });
    });
  }
  // Version watermark
  { const vm=document.createElement('div');vm.className='version-mark';vm.textContent='SPASIBO v1.2 — Zarya';root.appendChild(vm); }
  // Render panel only if not already open (openPanel renders synchronously)
  if(G.panelOpen && !document.querySelector('.panel-overlay')) {
    _renderPanel(G.panelOpen, root);
  }
}

function _buildHeader(scene){
  const hdr=document.createElement('div');hdr.className='game-header';
  // Anomaly deviation indicator in header
  const _dev = G.magneticDeviation || 0;
  if (_dev > 0.2) {
    const devIndicator = document.createElement('div');
    devIndicator.className = 'deviation-indicator';
    const devDeg = Math.round(_dev * 41); // 0-41 degrees
    const devText = _dev > 0.7 ? `${devDeg}° — past calibration` :
                    _dev > 0.4 ? `${devDeg}° deviation` :
                    `${devDeg}°`;
    devIndicator.textContent = devText;
    devIndicator.style.opacity = Math.min(1, _dev * 1.4).toFixed(2);
    hdr.appendChild(devIndicator);
  }
  const si=document.createElement('div');si.className='save-indicator';si.textContent='\u25e6 autosaved';si.style.display='none';hdr.appendChild(si);
  const moodCls=scene.mood==='uncanny'?' uncanny':scene.mood==='revelation'?' revelation':'';
  const lb=document.createElement('div');lb.className='location-bar'+moodCls;
  const locSpan=document.createElement('span'); locSpan.textContent=scene.location||''; lb.appendChild(locSpan);
  const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name;
  if(hourName){ const hs=document.createElement('span'); hs.className='loc-hour'; hs.textContent=hourName; lb.appendChild(hs); }
  hdr.appendChild(lb);
  const sbarDoubt = G.stats.doubt || 0;
  const sb=document.createElement('div');sb.className='sbar'+(sbarDoubt>=7?' sbar-jitter':'');
  const _statLabels={vigilance:'bearing',composure:'stillness',communion:'solidarity',doubt:'static'};
  Object.entries(G.stats).forEach(([k,v])=>{const d=document.createElement('div');d.className='stat';const lbl=_statLabels[k]||k;d.innerHTML=lbl+' <span class="stat-val">'+v+'</span>'+(_registries.statTips[k]?'<span class="stat-tip">'+_registries.statTips[k]+'</span>':'');sb.appendChild(d);});
  if(G.theosis>32){const td=document.createElement('div');td.className='stat stat-theosis';const tier=G.theosis>65?'\u041a\u041a\u0410':String(G.theosis);td.innerHTML='<span class="stat-val" style="color:var(--gold)">'+tier+'</span><span class="stat-tip">theosis</span>';sb.appendChild(td);}
  // Deviation compass — shown when magneticDeviation > 0.2
  if(G.magneticDeviation>0.2){
    const dev=G.magneticDeviation;
    const needlePos=Math.round(dev*8)-4; // -4 to +4
    const bar='─'.repeat(Math.max(0,4+needlePos))+'N'+'─'.repeat(Math.max(0,4-needlePos));
    const cd2=document.createElement('div');cd2.className='stat stat-compass';
    const cmpColor=dev>0.7?'var(--amber)':'var(--cold-dim)';
    cd2.innerHTML='<span class="stat-val" style="color:'+cmpColor+';font-family:var(--font-display)">'+bar+'</span><span class="stat-tip">magnetic deviation '+Math.round(dev*100)+'%</span>';
    sb.appendChild(cd2);
  }
  hdr.appendChild(sb);
  const tags=[];
  G.charisms.forEach(id=>{const c=findCharism(id);if(c)tags.push(`<span class="ctag" title="${c.desc}">${c.name}</span>`);});
  const cc=Object.values(G.cover).filter(Boolean).length;
  if(cc>0)tags.push('<span class="cover-tag">cover '+cc+'/5</span>');
  if(G.coverIntegrity<3){const ci=G.coverIntegrity===0?'blown':G.coverIntegrity===1?'thin':'questioned';tags.push(`<span class="cover-tag" style="border-color:var(--rust);color:var(--rust)">cover ${ci}</span>`);}
  const tc=G.soundings.taken.length+G.soundings.settled.length,ta=G.soundings.available.length;
  if(tc>0||ta>0)tags.push(`<span class="breviary-tag">\u2693 ${tc}/${MAX_SOUNDINGS}${ta?' +'+ta:''}</span>`);
  if(tags.length){const cb=document.createElement('div');cb.className='cbar';cb.innerHTML=tags.join('');hdr.appendChild(cb);}
  // Cover integrity bar — only show when cover has been partially established
  const coverFields = Object.values(G.cover).filter(Boolean).length;
  if(coverFields > 0) {
    const cib = document.createElement('div'); cib.className='cover-hud';
    const pct = (G.coverIntegrity / 5) * 100;
    const hue = G.coverIntegrity >= 4 ? 'var(--cold)' : G.coverIntegrity >= 3 ? 'var(--amber)' : 'var(--rust)';
    const pulse = G.coverIntegrity <= 2 ? ' cover-hud-pulse' : '';
    cib.innerHTML = `<div class="cover-hud-label">cover</div><div class="cover-hud-track${pulse}"><div class="cover-hud-fill" style="width:${pct}%;background:${hue}"></div></div>`;
    hdr.appendChild(cib);
  }
  return hdr;
}

function _buildRestartBar(){
  const rb=document.createElement('div');rb.className='restart-bar';
  if(G.confirmRestart){
    const msg=document.createElement('span');msg.className='confirm-msg';msg.textContent='End this crossing?';rb.appendChild(msg);
    const yes=document.createElement('button');yes.className='btn confirm-yes';yes.textContent='Yes \u2014 return to shore';yes.onclick=doRestart;rb.appendChild(yes);
    const no=document.createElement('button');no.className='btn confirm-no';no.textContent='No \u2014 continue';no.onclick=()=>{G.confirmRestart=false;render();};rb.appendChild(no);
  }else{const rbt=document.createElement('button');rbt.className='btn restart-btn';rbt.textContent='abandon crossing';rbt.onclick=()=>{G.confirmRestart=true;render();};rb.appendChild(rbt);}
  return rb;
}
function _appendAudioBtn(root){
  const ab=document.createElement('button');ab.id='audio-btn';
  ab.style.cssText="position:fixed;top:.55rem;right:.8rem;background:none;border:none;font-family:'Courier Prime',monospace;font-size:.7rem;color:var(--dim);cursor:pointer;z-index:200;letter-spacing:.08em;padding:.2rem .4rem";
  ab.textContent=_audioOn?'\u266a on':'\u266a off';ab.onclick=toggleAudio;root.appendChild(ab);
}
function _appendBottomNav(root){
  const bnav=document.createElement('div');bnav.id='bottom-nav';
  bnav.style.cssText='position:fixed;bottom:0;left:0;width:100%;z-index:100;display:flex;justify-content:center;background:rgba(6,8,12,0.96);border-top:1px solid var(--border)';
  const codexCount=getUnlockedCodex().length;
  const doubt = G.stats.doubt || 0;
  const dev = G.magneticDeviation || 0;
  // Flicker from doubt OR from extreme magnetic deviation (static/interference)
  const flickerDoubt = doubt >= 7 ? 0.4 : doubt >= 5 ? 0.2 : 0;
  const flickerDev   = dev >= 0.8 ? 0.5 : dev >= 0.65 ? 0.25 : 0;
  const flicker = Math.max(flickerDoubt, flickerDev);
  const fl = (en, ru) => (flicker > 0 && Math.random() < flicker) ? ru : en;
  const navItems=[
    {label:fl('record','запись'),          fn:()=>openPanel('notes'),     title:'Observations and codex'},
    {label:fl('status','статус'),          fn:()=>openPanel('status'),    title:'Stats, cover, charisms, inventory'},
    {label:'breviary'+(G.soundings.available.length?' \u2691':''),fn:()=>openPanel('breviary'),cls:G.soundings.available.length?' has-available':'', title:'Soundings — moments of contemplation'},
    {label:fl('calendar','календарь'),     fn:()=>openPanel('calendar'),  title:'The crossing — day and liturgical hour'},
    {label:fl('map','карта'),              fn:()=>openPanel('map'),       title:'Where things are'},
  ];
  const _navPanelIds=['notes','status','breviary','calendar','map'];
  navItems.forEach(({label,fn,cls='',title=''},_ni)=>{
    const b=document.createElement('button');
    b.style.cssText="flex:1;background:none;border:none;border-right:1px solid var(--border);font-family:'GOST type B','Share Tech Mono','Courier Prime',monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;padding:.72rem .2rem .58rem;cursor:pointer;color:var(--dim);border-top:2px solid transparent;position:relative;";
    const _pid=_navPanelIds[_ni]||'';
    if(_pid)b.setAttribute('aria-controls','panel-'+_pid);
    let _cls=cls||'';
    if(G.panelOpen===_pid&&_pid) _cls+=(_cls?' ':'')+' panel-active';
    b.className=_cls;b.textContent=label;b.onclick=fn;if(title)b.title=title;bnav.appendChild(b);
  });
  // Persist nav in body — prevents double-fire from root.innerHTML='' clearing it
  if (document.getElementById('bottom-nav')) {
    document.getElementById('bottom-nav').querySelectorAll('button').forEach((b, i) => {
      if (!navItems[i]) return;
      const pid = _navPanelIds[i] || '';
      let cls = navItems[i].cls || '';
      if (G.panelOpen === pid && pid) cls = (cls + ' panel-active').trim();
      b.className = cls;
      b.textContent = navItems[i].label;
    });
  } else {
    document.body.appendChild(bnav);
  }
  // Canvas toggle button (bottom-left)
  const _atmBtn=document.createElement('button');_atmBtn.className='atmos-toggle';
  _atmBtn.textContent=_atmosEnabled?'atmos on':'atmos off';
  _atmBtn.onclick=toggleAtmos;_atmBtn.title='Toggle atmospheric animation (saves battery)';
  _atmBtn.setAttribute('aria-label','Toggle atmospheric animation');
  root.appendChild(_atmBtn);

  // ? Help button
  if(!document.querySelector('.help-btn')){
    const _hBtn=document.createElement('button');_hBtn.className='help-btn';
    _hBtn.textContent='?';_hBtn.setAttribute('aria-label','How to play');
    _hBtn.onclick=()=>{ if(G._helpOpen){document.querySelector('.help-overlay')?.remove();G._helpOpen=false;}else{renderHelp(document.getElementById('root'));} };
    document.body.appendChild(_hBtn);
  }

  // Restore high contrast pref
  if(localStorage.getItem('spasibo_hc')==='1') document.body.classList.add('high-contrast');

  // Low power mode on mobile
  if(!_atmosEnabled||(/Mobi|Android/i.test(navigator.userAgent)&&!localStorage.getItem('spasibo_atmos'))){
    _canvas.style.display='none';_atmosEnabled=false;
  }
}
function _renderNotesPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'observations';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';

  // Build organised observations from flags — exclude system/meta flags, charism notes
  const flagCategories = [
    { label: 'Persons met', prefix: 'met_', names: {
        met_miguel: 'Miguel — the First Mate. Fifteen years on this ship.',
        met_pavel:  'Pavel — a passenger. Talks constantly. Hard to place.',
        met_lena:   'Lena — the cook. Twenty-two years aboard. Does not explain herself.',
        met_alexei: 'Alexei — the meteorologist. Magnetic anomalies are his specialty.',
        met_nadia:  'Nadia — junior scientist. She finds things.',
        met_kylie:  'Kylie Matterhorn — journalist, or says she is.',
        met_connie: "Connie Frank — ship's doctor.",
        met_othis:  'Othis Commera — cargo officer.',
    }},
    { label: 'The ship', flags: [
        ['chartroom_visited',       'Visited the chart room. Scientific logs going back to 1957.'],
        ['zarya_log_read',          'Read the 1957 log. The instruments were singing.'],
        ['late_logs_seen',          'Found the later logs. Gap after 1982. A pencilled folder: final manifest.'],
        ['archive_discovered',      'The cargo hold contains an archive. Thirty years of scientific records.'],
        ['hold_visited',            'Been in the hold. Freezer Beef is there.'],
        ['hold_micha_photo',        'Found a photograph. A young man on the bowsprit at the anomaly, 1972.'],
        ['anomaly_first_noticed',   'The magnetic deviation is increasing. Someone is tracking it.'],
        ['anomaly_explained',       'Alexei: the anomaly is significantly larger than projected.'],
        ['bronze_hum',              'The bronze fittings hummed at a frequency the inner ear catches first.'],
        ['instrument_room_visited', 'The instrument room. Singing instruments. A locked cabinet.'],
    ]},
    { label: 'The mission', flags: [
        ['mission_funders_hinted',    'Lena: the people who paid for this crossing.'],
        ['mission_reality_known',     'The sealed envelope is open. You know what the crossing is for.'],
        ['mission_fully_understood',  'The archive is to be destroyed. Evidence made inconvenient.'],
        ['miguel_knows',              'Miguel knows. He has always known.'],
        ['pavel_knows',               'Pavel knows. He was not surprised.'],
        ['mission_refused',           'You have refused the mission.'],
        ['radio_existence_known',     'There is a radio in the instrument room Othis does not know about.'],
    ]},
    { label: 'Pavel', flags: [
        ['pavel_ferromagnetic_heard', 'Pavel on the ship: built to not interfere, so something can come through.'],
        ['pavel_is_companion',        'Pavel is with you.'],
        ['pavel_mission_hinted',      'Pavel: this crossing is going somewhere that needs a witness.'],
    ]},
  ];

  let hasAny = false;
  flagCategories.forEach(cat => {
    const items = [];
    if (cat.names) {
      Object.entries(cat.names).forEach(([flag, text]) => {
        if (G.flags.has(flag)) items.push(text);
      });
    }
    if (cat.flags) {
      cat.flags.forEach(([flag, text]) => {
        if (G.flags.has(flag)) items.push(text);
      });
    }
    if (items.length) {
      hasAny = true;
      const sec = document.createElement('div'); sec.className = 'panel-section'; sec.textContent = cat.label; body.appendChild(sec);
      items.forEach(text => {
        const row = document.createElement('div'); row.className = 'obs-note';
        row.textContent = text; body.appendChild(row);
      });
    }
  });

  if (!hasAny) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-style:italic;font-size:.86rem;line-height:1.75;';
    empty.textContent = 'Nothing noted yet.'; body.appendChild(empty);
  }

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}

function _renderStatusPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'status';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';

  // Stats
  const st = document.createElement('div'); st.className = 'panel-section'; st.textContent = 'bearing'; body.appendChild(st);
  Object.entries(G.stats).forEach(([k, v]) => {
    const row = document.createElement('div'); row.className = 'panel-row';
    const lbl = document.createElement('span'); lbl.className = 'panel-row-label'; lbl.textContent = k;
    const val = document.createElement('span'); val.className = 'panel-row-value'; val.textContent = v;
    const tip = _registries.statTips[k];
    if (tip) { const n = document.createElement('span'); n.className = 'panel-row-note'; n.textContent = tip; row.appendChild(lbl); row.appendChild(val); row.appendChild(n); }
    else { row.appendChild(lbl); row.appendChild(val); }
    body.appendChild(row);
  });

  // Theosis
  const theosisS = document.createElement('div'); theosisS.className = 'panel-section'; theosisS.textContent = 'theosis'; body.appendChild(theosisS);
  const tier = G.theosis <= 32 ? 'Asleep' : G.theosis <= 65 ? 'Waking' : 'Illumined';
  const tRow = document.createElement('div'); tRow.className = 'panel-row';
  const tVal = document.createElement('span'); tVal.className = 'panel-row-value'; tVal.style.color = 'var(--gold)'; tVal.textContent = G.theosis;
  const tNote = document.createElement('span'); tNote.className = 'panel-row-note'; tNote.textContent = `/ 100 — ${tier}`;
  tRow.appendChild(tVal); tRow.appendChild(tNote); body.appendChild(tRow);
  const bar = document.createElement('div'); bar.className = 'status-theosis-bar';
  const fill = document.createElement('div'); fill.className = 'status-theosis-fill';
  fill.style.width = G.theosis + '%'; bar.appendChild(fill); body.appendChild(bar);

  // Cover
  const filledCover = Object.entries(G.cover).filter(([, v]) => v);
  if (filledCover.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'cover'; body.appendChild(cs);
    const intLabel = G.coverIntegrity === 0 ? 'blown' : G.coverIntegrity <= 2 ? 'thin' : 'intact';
    const intBadge = document.createElement('div'); intBadge.className = 'status-integrity ' + intLabel;
    intBadge.textContent = `integrity — ${intLabel} (${G.coverIntegrity}/5)`; body.appendChild(intBadge);
    filledCover.forEach(([k, v]) => {
      const row = document.createElement('div'); row.className = 'status-cover-field';
      const lbl = document.createElement('span'); lbl.className = 'status-cover-label'; lbl.textContent = k;
      const val = document.createElement('span'); val.className = 'status-cover-value'; val.textContent = v;
      row.appendChild(lbl); row.appendChild(val); body.appendChild(row);
    });
    const missing = Object.entries(G.cover).filter(([, v]) => !v);
    if (missing.length > 0) {
      missing.forEach(([k]) => {
        const row = document.createElement('div'); row.className = 'status-cover-field';
        const lbl = document.createElement('span'); lbl.className = 'status-cover-label'; lbl.textContent = k;
        const val = document.createElement('span'); val.style.cssText = 'color:var(--dim);font-style:italic;font-size:.78rem;'; val.textContent = 'not yet established';
        row.appendChild(lbl); row.appendChild(val); body.appendChild(row);
      });
    }
  }

  // Charisms
  if (G.charisms && G.charisms.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'charisms'; body.appendChild(cs);
    G.charisms.forEach(id => {
      const c = findCharism(id); if (!c) return;
      const row = document.createElement('div'); row.style.cssText = 'padding:.4rem 0;border-bottom:1px solid var(--border);';
      const name = document.createElement('div'); name.style.cssText = 'color:var(--cold);font-size:.84rem;margin-bottom:.2rem;'; name.textContent = c.name;
      const desc = document.createElement('div'); desc.style.cssText = 'color:var(--dim);font-size:.72rem;font-style:italic;'; desc.textContent = c.desc;
      row.appendChild(name); row.appendChild(desc); body.appendChild(row);
    });
  }

  // Companions — show with trust level and last memory
  if (G.companions && G.companions.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'companions'; body.appendChild(cs);
    G.companions.forEach(c => {
      const wrap = document.createElement('div'); wrap.className = 'companion-row';
      const nameEl = document.createElement('div'); nameEl.className = 'companion-name';
      nameEl.textContent = c.name || c.id;
      // Trust indicator from npcStance
      const stance = G.npcStance && G.npcStance[c.id];
      const trust = stance ? (stance.trust || 0) : (c.stats && c.stats.trust ? c.stats.trust : 0);
      if (trust > 0) {
        const trustEl = document.createElement('span'); trustEl.className = 'companion-trust';
        trustEl.textContent = '  ' + '·'.repeat(Math.min(trust, 5));
        nameEl.appendChild(trustEl);
      }
      wrap.appendChild(nameEl);
      // Last memory
      if (stance && stance.memories && stance.memories.length) {
        const lastMem = stance.memories[stance.memories.length - 1];
        const memEl = document.createElement('div'); memEl.className = 'companion-memory';
        memEl.textContent = lastMem.text || '';
        wrap.appendChild(memEl);
      }
      body.appendChild(wrap);
    });
  }

  // Inventory — tappable, shows description
  if (G.inventory && G.inventory.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'carried'; body.appendChild(cs);
    G.inventory.forEach(id => {
      const item = _registries.items[id];
      const wrap = document.createElement('div'); wrap.className = 'item-row'; wrap.style.cursor = 'pointer';
      const name = document.createElement('div'); name.className = 'item-name';
      name.textContent = item ? (item.name || id) : id;
      const bonus = item && item.effectWhileHeld ? Object.entries(item.effectWhileHeld).map(([k,v])=>`${k} ${v>0?'+'+v:v}`).join('  ') : '';
      if (bonus) { const b = document.createElement('span'); b.className = 'item-bonus'; b.textContent = bonus; name.appendChild(b); }
      wrap.appendChild(name);
      const desc = document.createElement('div'); desc.className = 'item-desc';
      desc.style.cssText = 'display:none;font-size:.8rem;color:var(--dim);line-height:1.72;margin-top:.3rem;font-style:italic;padding-left:.8rem;border-left:1px solid var(--border);';
      desc.textContent = item ? (item.desc || '') : '';
      wrap.appendChild(desc);
      wrap.onclick = () => { desc.style.display = desc.style.display === 'none' ? 'block' : 'none'; };
      body.appendChild(wrap);
    });
  }

  // Crossing info
  const crossS = document.createElement('div'); crossS.className = 'panel-section'; crossS.textContent = 'the crossing'; body.appendChild(crossS);
  [{label:'day', val:`${G.time.day} of ${G.time.maxDays}`}, {label:'mode', val:G.mode}, ...(G.playCount>0?[{label:'crossing', val:String(G.playCount+1)}]:[])].forEach(({label,val})=>{
    const row = document.createElement('div'); row.className = 'panel-row';
    const l = document.createElement('span'); l.className = 'panel-row-label'; l.textContent = label;
    const v = document.createElement('span'); v.className = 'panel-row-value'; v.textContent = val;
    row.appendChild(l); row.appendChild(v); body.appendChild(row);
  });


  // ── CODEX section merged below observations ──────────────────
  const _unlocked = typeof getUnlockedCodex === 'function' ? getUnlockedCodex() : [];
  const _hasGlossary = _registries.glossary && _registries.glossary.length > 0;
  if (_unlocked.length || _hasGlossary) {
    const _cdxSep = document.createElement('div'); _cdxSep.style.cssText='height:1px;background:var(--border);margin:1.4rem 0 1rem;'; body.appendChild(_cdxSep);
    const _cdxSec = document.createElement('div'); _cdxSec.className='panel-section'; _cdxSec.textContent='codex'; body.appendChild(_cdxSec);
    const _re = (titleTxt, bodyTxt, catTxt) => {
      const item=document.createElement('div'); item.className='codex-entry'; item.style.marginBottom='.9rem'; item.style.cursor='pointer';
      if(catTxt){const c=document.createElement('div');c.className='codex-category';c.textContent=catTxt;item.appendChild(c);}
      const t=document.createElement('div');t.className='codex-term';t.textContent=titleTxt;
      const d=document.createElement('div');d.className='codex-body';
      d.style.cssText='max-height:3.6rem;overflow:hidden;transition:max-height .2s;-webkit-mask-image:linear-gradient(to bottom,black 50%,transparent);mask-image:linear-gradient(to bottom,black 50%,transparent);';
      d.textContent=bodyTxt; item.appendChild(t); item.appendChild(d);
      item.onclick=()=>{
        const ex=d.style.maxHeight==='none';
        d.style.maxHeight=ex?'3.6rem':'none';
        d.style.webkitMaskImage=ex?'linear-gradient(to bottom,black 50%,transparent)':'none';
        d.style.maskImage=ex?'linear-gradient(to bottom,black 50%,transparent)':'none';
      };
      body.appendChild(item);
    };
    if(_unlocked.length) _unlocked.forEach(id=>{const e=typeof getCodexEntry==='function'?getCodexEntry(id):null;if(e)_re(e.title,e.content,e.category||'');});
    if(_hasGlossary) _registries.glossary.forEach(({term,def})=>_re(term,def,''));
  }

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}

function _renderBreviaryPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'breviary';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';
  const hasAnything = (G.soundings.available.length || G.soundings.taken.length || G.soundings.settled.length);

  if (!hasAnything) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-style:italic;font-size:.84rem;line-height:1.75;';
    empty.textContent = 'No soundings yet. They arise from moments of stillness on the crossing.'; body.appendChild(empty);
  }

  if (G.soundings.available.length) {
    const s = document.createElement('div'); s.className = 'panel-section'; s.textContent = 'available'; body.appendChild(s);
    G.soundings.available.forEach(id => {
      const snd = _registries.soundings[id]; if (!snd) return;
      const card = document.createElement('div'); card.className = 'sounding-card';
      const name = document.createElement('div'); name.className = 'sounding-name'; name.textContent = snd.name;
      const text = document.createElement('div'); text.className = 'sounding-text'; text.textContent = snd.text;
      card.appendChild(name); card.appendChild(text);
      const full = soundingSlotsFull();
      const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.style.marginTop = '.6rem';
      btn.textContent = full ? 'slots full' : 'take this sounding';
      btn.disabled = full;
      btn.onclick = () => { takeSounding(id); openPanel(null); scheduleRender(); };
      card.appendChild(btn); body.appendChild(card);
    });
  }

  if (G.soundings.taken.length) {
    const s = document.createElement('div'); s.className = 'panel-section';
    s.textContent = `active — ${G.soundings.taken.length} / ${MAX_SOUNDINGS}`; body.appendChild(s);
    G.soundings.taken.forEach(entry => {
      const snd = _registries.soundings[entry.id]; if (!snd) return;
      const card = document.createElement('div'); card.className = 'sounding-card';
      const name = document.createElement('div'); name.className = 'sounding-name'; name.textContent = snd.name;
      const filled = Math.round((entry.progress / SOUNDING_THRESHOLD) * 8);
      const prog = document.createElement('div'); prog.className = 'sounding-progress';
      prog.textContent = '▓'.repeat(filled) + '░'.repeat(8 - filled) + '  ' + entry.progress + '/' + SOUNDING_THRESHOLD;
      const text = document.createElement('div'); text.className = 'sounding-text'; text.textContent = snd.text;
      const releaseBtn = document.createElement('button'); releaseBtn.className = 'btn btn-sm'; releaseBtn.style.marginTop = '.6rem';
      releaseBtn.textContent = 'release';
      releaseBtn.onclick = () => { releaseSounding(entry.id); scheduleRender(); };
      card.appendChild(name); card.appendChild(prog); card.appendChild(text); card.appendChild(releaseBtn); body.appendChild(card);
    });
  }

  if (G.soundings.settled.length) {
    const s = document.createElement('div'); s.className = 'panel-section'; s.textContent = 'settled'; body.appendChild(s);
    G.soundings.settled.forEach(id => {
      const snd = _registries.soundings[id]; if (!snd) return;
      const card = document.createElement('div'); card.className = 'sounding-card settled';
      const name = document.createElement('div'); name.className = 'sounding-name'; name.textContent = snd.name;
      const text = document.createElement('div'); text.className = 'sounding-text'; text.textContent = snd.text;
      card.appendChild(name); card.appendChild(text); body.appendChild(card);
    });
  }

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}

function _renderGlossaryPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'glossary';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';
  const unlocked = getUnlockedCodex ? getUnlockedCodex() : [];
  const hasGlossary = _registries.glossary && _registries.glossary.length > 0;

  if (!unlocked.length && !hasGlossary) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-style:italic;font-size:.84rem;';
    empty.textContent = 'Nothing recorded yet. The crossing will fill this.'; body.appendChild(empty);
  }

  if (unlocked.length) {
    const s = document.createElement('div'); s.className = 'panel-section'; s.textContent = 'codex'; body.appendChild(s);
    unlocked.forEach(id => {
      const entry = getCodexEntry ? getCodexEntry(id) : null; if (!entry) return;
      const item = document.createElement('div'); item.className = 'codex-entry';
      if (entry.category) { const cat = document.createElement('div'); cat.className = 'codex-category'; cat.textContent = entry.category; item.appendChild(cat); }
      const term = document.createElement('div'); term.className = 'codex-term'; term.textContent = entry.title;
      const def = document.createElement('div'); def.className = 'codex-body'; def.textContent = entry.content;
      item.appendChild(term); item.appendChild(def); body.appendChild(item);
    });
  }

  if (hasGlossary) {
    const s = document.createElement('div'); s.className = 'panel-section'; s.textContent = 'terms'; body.appendChild(s);
    _registries.glossary.forEach(({ term, def }) => {
      const item = document.createElement('div'); item.className = 'codex-entry';
      const t2 = document.createElement('div'); t2.className = 'codex-term'; t2.textContent = term;
      const d = document.createElement('div'); d.className = 'codex-body'; d.textContent = def;
      item.appendChild(t2); item.appendChild(d); body.appendChild(item);
    });
  }

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}


function _renderCalendarPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'the crossing';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';
  
  // Day indicator
  const dayS = document.createElement('div'); dayS.className = 'panel-section'; dayS.textContent = `day ${G.time.day} of ${G.time.maxDays}`; body.appendChild(dayS);

  // Hours
  const hourDescs = [
    { name:'Lauds',    mood:'dawn',          desc:'The first light. The instruments are quieter. NPCs are honest in the way people are honest when they are not fully awake yet.' },
    { name:'Prime',    mood:'early morning', desc:'The ship at work. Maintenance, measurements, small talk. The day is still forming.' },
    { name:'Terce',    mood:'mid-morning',   desc:'The anomaly tends to be stable here. Good time for the chart room and the hold.' },
    { name:'Sext',     mood:'noon',          desc:'Tension rises with the light. Cover challenges are more likely. Othis is most alert.' },
    { name:'None',     mood:'afternoon',     desc:'The strange hour. The anomaly sometimes spikes. Oblong is most present. NPCs are tired and less guarded.' },
    { name:'Vespers',  mood:'evening',       desc:'Candour. The time of hardest conversations. Miguel tends to speak. Lena brings food no one asked for.' },
    { name:'Compline', mood:'night',         desc:'The anomaly intensifies. The night office. Alexei cannot sleep. This is when the radio reaches furthest.' },
  ];

  hourDescs.forEach((h, i) => {
    const isCurrent = i === G.liturgicalHour;
    const row = document.createElement('div'); 
    row.className = 'calendar-hour' + (isCurrent ? ' current' : '');
    const nameLine = document.createElement('div'); nameLine.className = 'calendar-hour-name';
    nameLine.textContent = h.name + (isCurrent ? ' ◂' : '') + '  ·  ' + h.mood;
    const desc = document.createElement('div'); desc.className = 'calendar-hour-desc';
    desc.textContent = h.desc;
    row.appendChild(nameLine); row.appendChild(desc); body.appendChild(row);
  });

  // Theosis tier indicator
  const tier = G.theosis <= 32 ? 'The Dawn — Asleep' : G.theosis <= 65 ? 'Zarya — Waking' : 'Заря — Illumined';
  const tS = document.createElement('div'); tS.className = 'panel-section'; tS.style.marginTop='1rem'; tS.textContent = 'state'; body.appendChild(tS);
  const tRow = document.createElement('div'); tRow.className = 'calendar-hour';
  const tLine = document.createElement('div'); tLine.className = 'calendar-hour-name'; tLine.textContent = tier;
  if (G.theosis > 32) tLine.style.color = G.theosis > 65 ? 'var(--gold)' : 'var(--amber)';
  tRow.appendChild(tLine); body.appendChild(tRow);

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}

function _renderMapPanelSide(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
  overlay.onclick = (e) => { if (e.target === overlay) openPanel(null); };
  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const t = document.createElement('div'); t.className = 'panel-title'; t.textContent = 'map — the crossing';
  const x = document.createElement('button'); x.className = 'panel-close'; x.textContent = '✕'; x.onclick = () => openPanel(null);
  hdr.appendChild(t); hdr.appendChild(x); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';
  const nodes = _registries.mapNodes;

  const sceneToNode = {
    cabin_wake:'cabin',cabin_porthole:'cabin',cabin_porthole_stay:'cabin',cabin_remember:'cabin',cabin_letter:'cabin',cabin_sit:'cabin',cabin_sealed_envelope:'cabin',act_one_ending:'cabin',
    first_mate_first:'bridge',bridge_hub:'bridge',bridge_air:'bridge',miguel_return:'bridge',miguel_how_holding:'bridge',miguel_q_posting:'bridge',miguel_q_connection:'bridge',miguel_response:'bridge',miguel_history_probe:'bridge',miguel_before:'bridge',miguel_crew_intro:'bridge',miguel_pavel_intro:'bridge',miguel_othis_probe:'bridge',miguel_mission_direct:'bridge',mission_refused_miguel:'bridge',miguel_mission_detail:'bridge',miguel_photo_return:'bridge',
    chart_room_first:'chart_room',chartroom_1957:'chart_room',chartroom_late_logs:'chart_room',chartroom_manifest:'chart_room',chartroom_current:'chart_room',chartroom_deviation:'chart_room',
    foredeck_first:'foredeck',pavel_ferromagnetic:'foredeck',pavel_denomination_response:'foredeck',pavel_joined:'foredeck',pavel_why_chaplain:'foredeck',pavel_how_knew:'foredeck',pavel_monologue:'foredeck',pavel_origin:'foredeck',pavel_destination:'foredeck',
    galley_first:'galley',galley_hub:'galley',lena_silence:'galley',lena_coffee:'galley',lena_tenure:'galley',lena_hold:'galley',lena_they:'galley',lena_reasons:'galley',
    mess_hub:'mess',kylie_first:'mess',kylie_background_response:'mess',kylie_cover_left:'mess',kylie_deflect:'mess',kylie_reversal:'mess',kylie_end_first:'mess',connie_first:'mess',connie_left_response:'mess',connie_pastoral:'mess',connie_accepted:'mess',connie_honest:'mess',connie_self:'mess',nadia_first:'mess',nadia_why_glad:'mess',nadia_wrong:'mess',nadia_work:'mess',nadia_sit:'mess',alexei_first:'mess',alexei_process:'mess',alexei_theology:'mess',alexei_anomaly:'mess',alexei_anomaly_meaning:'mess',alexei_allowed:'mess',
    othis_first:'hold_access',othis_polite:'hold_access',othis_others:'hold_access',othis_hold_ask:'hold_access',othis_pastoral_cargo:'hold_access',othis_cabinet_direct:'hold_access',
    hold_first:'hold',hold_sit:'hold',hold_boxes:'hold',hold_witness:'hold',hold_1972_box:'hold',
    instrument_room_first:'instrument_room',instrument_shimmer:'instrument_room',alexei_cabinet:'instrument_room',
    main_deck_hub:'main_deck',act_two_begin:'main_deck',
  };
  // sceneMap: map node → scene to navigate to from map
  // First-visit scenes (foredeck_first, chart_room_first etc.) are only used on first visit.
  // After that, use the return/hub scene — detected by whether visited flag is set.
  const _baseSceneMap = {cabin:'cabin_wake',main_deck:'main_deck_hub',foredeck:'foredeck_first',bridge:'bridge_hub',mess:'mess_hub',galley:'galley_hub',chart_room:'chart_room_first',captain_quarters:'bridge_hub',hold_access:'hold_first',hold:'hold_first',cargo_bay:'hold_first',instrument_room:'instrument_room_first',aft:'instrument_room_first'};
  const _returnSceneMap = {cabin:'cabin_porthole_stay',foredeck:'foredeck_standing',chart_room:'chart_room_first',hold_access:'hold_first',hold:'hold_boxes',instrument_room:'instrument_shimmer'};
  // isVisited must be declared BEFORE sceneMap uses it
  const _checkVisited = (nodeId, sm) => {
    if(G.flags && G.flags.has('visited_'+nodeId)) return true;
    const scId = sm[nodeId];
    if(scId && G.flags && G.flags.has('visited_'+scId)) return true;
    for(const [nid, sid] of Object.entries(sm)) {
      if(nid === nodeId && G.flags && G.flags.has('visited_'+sid)) return true;
    }
    return false;
  };
  // Build sceneMap using the base maps first (no isVisited needed yet)
  const sceneMap = {..._baseSceneMap};
  // Now apply return-scene overrides where already visited
  for(const [nodeId, firstScene] of Object.entries(_baseSceneMap)){
    const returnScene = _returnSceneMap[nodeId];
    if(returnScene && _checkVisited(nodeId, _baseSceneMap)) sceneMap[nodeId] = returnScene;
  }
  // isVisited function for use in categorisation loop
  const isVisited = (nodeId) => _checkVisited(nodeId, sceneMap);
  const currentNode = sceneToNode[G.scene] || null;

  if (!nodes || Object.keys(nodes).length === 0) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-style:italic;font-size:.84rem;';
    empty.textContent = 'The ship is still taking shape.'; body.appendChild(empty);
  } else {
    const nodeNames = { cabin:'Cabin',main_deck:'Main Deck',foredeck:'Foredeck',bridge:'Bridge',mess:'Mess Hall',galley:'Galley',chart_room:'Chart Room',captain_quarters:"Captain's Quarters",hold_access:'Hold Access',hold:'Hold',cargo_bay:'Cargo Bay',instrument_room:'Instrument Room',aft:'Aft Compartment' };
    
    // Map shows only what you have been to or remember
    // Accessible-but-unvisited locations are NOT shown (discover by exploring)
    const visited=[], knownRoute=[], hiddenCount=[0];
    Object.entries(nodes).forEach(([id,node])=>{
      const req=node.theosisRequired||0;
      if(G.theosis<req){hiddenCount[0]++;return;}
      const isCur=currentNode===id;
      const wasVisited = isVisited(id);
      const scId = sceneMap[id];
      const isPastLife=G.charisms&&G.charisms.includes('witness')&&G.pastLifeFlags&&(G.pastLifeFlags.has('visited_'+id)||(scId&&G.pastLifeFlags.has('visited_'+scId)));
      if(isCur||wasVisited) visited.push({id,isCur,wasVisited});
      else if(isPastLife) knownRoute.push(id);
      // If not visited and not past-life: don't show — explore to discover
    });

    const _hubNodes=new Set(['cabin','main_deck','bridge','mess','galley']);
    const makeNode=(id,cls,isCur)=>{
      const hubCls=_hubNodes.has(id)?' hub-node':'';
      const row=document.createElement('div');row.className='map-node'+hubCls+cls+(isCur?' current':'');
      const dot=document.createElement('div');dot.className='map-node-dot';
      const label=document.createElement('span');label.textContent=nodeNames[id]||id.replace(/_/g,' ');
      row.appendChild(dot);row.appendChild(label);
      if(isCur)row.classList.add('current');
      row.onclick=()=>{if(!isCur){openPanel(null);navigate(sceneMap[id]||id);}};
      return row;
    };

    if(visited.length){
      const sec=document.createElement('div');sec.className='panel-section';sec.textContent='this crossing';body.appendChild(sec);
      const list=document.createElement('div');list.className='map-grid';
      visited.forEach(({id,isCur,wasVisited})=>list.appendChild(makeNode(id,wasVisited&&!isCur?' visited':'',isCur)));
      body.appendChild(list);
    }
    if(knownRoute.length){
      const sec=document.createElement('div');sec.className='panel-section';sec.style.marginTop='.9rem';sec.textContent='remembered from before';body.appendChild(sec);
      const list=document.createElement('div');list.className='map-grid';
      knownRoute.forEach(id=>{
        const row=makeNode(id,' past-life',false);
        row.title='Known from a previous crossing';list.appendChild(row);
      });
      body.appendChild(list);
    }
    const hc=hiddenCount[0];
    if(hc>0){
      const hint=document.createElement('p');hint.className='map-hint';hint.textContent=`${hc} location${hc>1?'s':''} not yet accessible.`;body.appendChild(hint);
    }
  }

  panel.appendChild(body); overlay.appendChild(panel); document.body.appendChild(overlay);
}

loadMetaUnlocks();
initBuiltinSfx(); _initKeyboard();

function renderCrossingRecord(root) {
  // Called before __new_play__ — shows a dénouement screen
  const screen = document.createElement('div');
  screen.className = 'crossing-record';

  // Ending title
  const endingNames = {
    ending_erasure_reached:     ['ERASURE',     'The archive is gone.'],
    ending_witness_reached:     ['WITNESS',     'The archive is hidden.'],
    ending_restoration_reached: ['RESTORATION', 'The record goes into the world.'],
    ending_solidarity_reached:  ['SOLIDARITY',  'The ship acted as one body.'],
    ending_the_knowing_reached: ['THE KNOWING', 'You have been here before.'],
  };
  let endingTitle = 'THE CROSSING', endingDesc = '';
  for (const [flag, [title, desc]] of Object.entries(endingNames)) {
    if (G.flags.has(flag)) { endingTitle = title; endingDesc = desc; break; }
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'cr-ending-title';
  titleEl.textContent = endingTitle;
  screen.appendChild(titleEl);

  if (endingDesc) {
    const descEl = document.createElement('div');
    descEl.className = 'cr-ending-desc';
    descEl.textContent = endingDesc;
    screen.appendChild(descEl);
  }

  // Divider
  const div1 = document.createElement('div'); div1.className = 'cr-divider'; screen.appendChild(div1);

  // Settled soundings
  if (G.soundings.settled && G.soundings.settled.length > 0) {
    const sec = document.createElement('div'); sec.className = 'cr-section'; sec.textContent = 'Settled this crossing'; screen.appendChild(sec);
    for (const s of G.soundings.settled) {
      const snd = _registries.soundings[s.id];
      const row = document.createElement('div'); row.className = 'cr-row';
      row.textContent = (snd && snd.name) ? snd.name : s.id;
      screen.appendChild(row);
    }
  }

  // NPC memories — surface 2–3 most significant
  if (G.npcStance) {
    const memories = [];
    for (const [npc, stance] of Object.entries(G.npcStance)) {
      if (stance.memories && stance.memories.length) {
        // Take the last (most recent) memory per NPC
        const m = stance.memories[stance.memories.length - 1];
        if (m && m.text) memories.push({ npc, text: m.text });
      }
    }
    if (memories.length > 0) {
      const div2 = document.createElement('div'); div2.className = 'cr-divider'; screen.appendChild(div2);
      const sec2 = document.createElement('div'); sec2.className = 'cr-section'; sec2.textContent = 'What the ship remembers'; screen.appendChild(sec2);
      for (const { npc, text } of memories.slice(0, 3)) {
        const row = document.createElement('div'); row.className = 'cr-memory';
        const npcSpan = document.createElement('span'); npcSpan.className = 'cr-memory-npc';
        npcSpan.textContent = npc.charAt(0).toUpperCase() + npc.slice(1);
        const textSpan = document.createElement('span'); textSpan.textContent = ' — ' + text;
        row.appendChild(npcSpan); row.appendChild(textSpan);
        screen.appendChild(row);
      }
    }
  }

  // Theosis and crossing tax
  const div3 = document.createElement('div'); div3.className = 'cr-divider'; screen.appendChild(div3);
  const t = G.theosis || 0;
  const tax = Math.min(15, Math.max(0, t - 5));
  const carried = Math.max(5, Math.min(85, t - tax));
  const tierNames = ['Asleep', 'Waking', 'Illumined'];
  const tierName = t >= 66 ? tierNames[2] : t >= 33 ? tierNames[1] : tierNames[0];
  const theoSec = document.createElement('div'); theoSec.className = 'cr-section'; theoSec.textContent = 'Theosis'; screen.appendChild(theoSec);
  const theoRow = document.createElement('div'); theoRow.className = 'cr-theosis';
  theoRow.innerHTML = `<span class="cr-theosis-val">${t}</span> <span class="cr-theosis-tier">${tierName}</span>`;
  screen.appendChild(theoRow);
  const taxRow = document.createElement('div'); taxRow.className = 'cr-tax';
  taxRow.textContent = `The body forgets ${tax}. You carry ${carried} into the next crossing.`;
  screen.appendChild(taxRow);

  // ── Ship's log — what the ship witnessed ──────────────────────
  const _shipLog = [];
  if (G.flags.has('ending_solidarity_reached') || G.flags.has('ending_restoration_reached')) {
    _shipLog.push('In the hold throughout: one calico cat. She did not intervene. She witnessed.');
  }
  // Pavel in the ship's log if companion
  if (G.flags.has('pavel_is_companion') && G.flags.has('pavel_anomaly_theology_seen')) {
    _shipLog.push('On the foredeck at peak: Pavel Ivanovich, who had been in prison for saying things people did not want heard, and who came to the bow of a non-magnetic ship and stood there until the field answered.');
  } else if (G.flags.has('pavel_is_companion')) {
    _shipLog.push('On the foredeck throughout: Pavel Ivanovich. He held the rope. He stood at the bow. He said things that turned out to be true.');
  }
  if (G.flags.has('sunday_service_led')) {
    _shipLog.push('In the mess hall on Sunday: seven people who did not have to stay, stayed.');
  }
  if (G.flags.has('archive_transmitted')) {
    _shipLog.push('On the instrument room radio: a transmission at 4am, at peak anomaly, into the frequencies that use deviation as a carrier. Something received it.');
  }
  if (G.flags.has('anomaly_signal_returned')) {
    _shipLog.push('At 4:18am: the field returned the signal. The instruments confirmed this. Alexei marked the timestamp.');
  }
  if (G.flags.has('ending_erasure_reached')) {
    _shipLog.push('In the hold at 2am: smoke. The sea absorbed it. The anomaly is still measurable at this position.');
  }
  if (_shipLog.length) {
    const div5 = document.createElement('div'); div5.className = 'cr-divider'; screen.appendChild(div5);
    const logSec = document.createElement('div'); logSec.className = 'cr-section'; logSec.textContent = "The ship's log"; screen.appendChild(logSec);
    _shipLog.forEach(line => {
      const row = document.createElement('div'); row.className = 'cr-memory cr-ship-log';
      row.textContent = line; screen.appendChild(row);
    });
  }

  // Meta marks — which endings reached
  const metaEndings = ['reached_erasure','reached_witness','reached_restoration','reached_solidarity','reached_the_knowing'];
  const metaLabels = { reached_erasure:'✦', reached_witness:'✦✦', reached_restoration:'✦✦✦', reached_solidarity:'✦✦✦✦', reached_the_knowing:'✦✦✦✦✦' };
  const reached = metaEndings.filter(m => hasMeta(m));
  if (reached.length > 0) {
    const metaEl = document.createElement('div'); metaEl.className = 'cr-meta';
    metaEl.textContent = reached.map(m => metaLabels[m]).join('  ');
    screen.appendChild(metaEl);
  }

  // Continue button
  const div4 = document.createElement('div'); div4.className = 'cr-divider'; screen.appendChild(div4);
  const btn = document.createElement('button');
  btn.className = 'btn cr-btn';
  btn.textContent = G.playCount > 0 ? 'Begin a new crossing.' : 'Begin.';
  btn.onclick = () => newPlay();
  screen.appendChild(btn);

  root.appendChild(screen);
}

// ─────────────────────────────────────────────────────────────────
// COMPANION HELPERS
// ─────────────────────────────────────────────────────────────────

// Get a random ambient companion line for the current location/trust.
// Returns null if companion not present or no lines registered for context.
function getCompanionLine(companionId, location, trustMin) {
  if (!hasCompanion(companionId)) return null;
  const trust = (G.npcStance[companionId] && G.npcStance[companionId].trust) || 0;
  if (trustMin !== undefined && trust < trustMin) return null;
  const pool = (_registries.companionLines[companionId] || []).filter(entry => {
    if (entry.location && entry.location !== location) return false;
    if (entry.trustMin !== undefined && trust < entry.trustMin) return false;
    if (entry.trustMax !== undefined && trust > entry.trustMax) return false;
    if (entry.condition && !evaluateCondition(entry.condition)) return false;
    if (entry.once && G.flags.has('_cl_shown_' + entry.id)) return false;
    return true;
  });
  if (!pool.length) return null;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  if (entry.once) G.flags.add('_cl_shown_' + entry.id);
  return entry.text;
}

// Register a companion ambient line.
function registerCompanionLine(companionId, entry) {
  if (!_registries.companionLines) _registries.companionLines = {};
  if (!_registries.companionLines[companionId]) _registries.companionLines[companionId] = [];
  _registries.companionLines[companionId].push(entry);
}

// Inject a companion interjection beat into an active dialogue.
// Call from a scene's onEnter to splice a beat after beatIndex N.
function injectDialogueBeat(afterIndex, beat) {
  if (!G._dialogue) return;
  const beats = G._dialogue.beats;
  const insertAt = Math.min(afterIndex + 1, beats.length);
  beats.splice(insertAt, 0, beat);
}


function renderHelp(root) {
  const ov = document.createElement('div'); ov.className = 'help-overlay';
  ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','How to play');

  const close = document.createElement('button'); close.className = 'help-close';
  close.textContent = '×'; close.setAttribute('aria-label','Close help');
  close.onclick = () => { ov.remove(); G._helpOpen = false; };
  ov.appendChild(close);

  const content = `
<h2>The Crossing</h2>
<p>You are the ship's chaplain. This is your cover. Your mission is in the case under the bunk.</p>
<p>The crossing takes three days. What happens in those three days determines which ending you reach — and what you carry into the next crossing.</p>

<h2>Stats</h2>
<ul>
<li><strong>Vigilance</strong> — what you notice. High vigilance reveals things before they become problems.</li>
<li><strong>Composure</strong> — what you can hold under pressure. Used in cover challenges.</li>
<li><strong>Communion</strong> — how much the crew trusts you collectively. Opens paths.</li>
<li><strong>Doubt</strong> — accumulates when the cover is strained. High doubt dissolves things.</li>
</ul>

<h2>Cover Challenges</h2>
<p>When someone questions your cover, a challenge overlay appears. You roll 2d6 + Composure against the field difficulty.</p>
<p><strong>Success</strong>: the cover holds cleanly. <strong>Partial</strong>: holds, but costs something. <strong>Failure</strong>: the cover shifts. Cover integrity (◈) tracks how much remains.</p>
<p>Tap <em>skip — resolve automatically</em> if you prefer narrative play.</p>

<h2>Soundings</h2>
<p>Soundings are moments of spiritual recognition. Open the Breviary to see available soundings. Take one when it resonates. They progress through contemplative choices — stillness, presence, witness. When a sounding settles, the porthole changes.</p>

<h2>Theosis</h2>
<p>Theosis is spiritual progression. It rises through contemplation, honest choices, and witness. It changes what's available. Watch the porthole for the tier you're in: Asleep, Waking, Illumined.</p>

<h2>Items</h2>
<p>Items in your inventory (STATUS panel) can be tapped to read their description. Some modify stats while held.</p>

<h2>Keyboard Shortcuts</h2>
<ul>
<li><span class="help-key">1</span>–<span class="help-key">9</span> Activate choices</li>
<li><span class="help-key">Esc</span> Close panels</li>
<li><span class="help-key">Tab</span> Navigate elements</li>
<li><span class="help-key">Enter</span> Activate focused choice</li>
</ul>
`;
  ov.innerHTML += content;

  // High contrast toggle
  const hcBtn = document.createElement('button'); hcBtn.className = 'contrast-toggle';
  hcBtn.textContent = document.body.classList.contains('high-contrast') ? 'standard contrast' : 'high contrast';
  hcBtn.onclick = () => {
    document.body.classList.toggle('high-contrast');
    localStorage.setItem('spasibo_hc', document.body.classList.contains('high-contrast') ? '1' : '0');
    hcBtn.textContent = document.body.classList.contains('high-contrast') ? 'standard contrast' : 'high contrast';
  };
  ov.appendChild(hcBtn);

  root.appendChild(ov);
  G._helpOpen = true;
}

window.SOBORNOST={
  VERSION, G, render, setDebug, undo, redo,
  registerScenes, getScene, setSceneNotFoundHandler,
  setInitialScene:(sceneId)=>{setInitialScene(sceneId);if(G.phase==='game'&&!G.scene)G.scene=sceneId;},
  devMode, validate,
  registerJournalEntry, addJournalEntry,
  startDialogue,
  setLoggedEvents, getLoggedEvents, addLoggedEvent, removeLoggedEvent, exportEventLog, clearEventLog,
  registerCoverChallenge, startCoverChallenge, hasCoverChallenges,
  registerEnding, checkEndings, getRegisteredEndings,
  registerCodexEntry, unlockCodexEntry, isCodexUnlocked, checkCodexUnlocks,
  registerAmbientEvent, unregisterAmbientEvent,
  registerCharisms, registerSounding, registerNote, registerArt, registerGlossaryEntry,
  registerStatTip, registerRollModifier, setAvailableModes, setModeDescriptions, getModeDescription,
  setIconWordFunction, setHarbourWordFunction, setShipWordFunction, setObjectDescriptionFunction,
  registerScenePool, addToScenePool, registerRitual, registerTranslation,
  registerPostEventShift, registerPastLifeLine, registerMapNode, registerSfx,
  registerItem, registerAtmosModifier, setTutorialContent,
  registerTheosisTagValue, setTheosisTiers, incrementTheosis, flashTheosisLight,
  setMagneticDeviation, getMagneticDeviation, progressSounding, getShipState, modShipState,
  registerNameMapping, setLiturgicalHour,
  addCompanion, removeCompanion, hasCompanion, getCompanion, modCompanionStat, setCompanionCharism,
  getCompanionLine, registerCompanionLine, injectDialogueBeat,
  learn, comeToBelieve, contradict, knows, believes,
  pushConsequence, scheduleEvent,
  unlockMeta, hasMeta, exportAnalytics,
  saveGameSlot, loadGameSlot, listSaveSlots,
  setUiOpacity, getUiOpacity,
  registerCompassAxes, updateCompass, renderCompass,
  registerProgressTracker, updateProgressTracker, getProgressTracker,
  navigateToPool, startRitual, ritualNextPhase, getCurrentRitualPhase, isRitualActive,
  navigate, applyChoice, newPlay,
  allCharisms, findCharism, noteLabel, iconWord, harbourWord, shipWord, objectDescription,
  hasFlag, setFlag, addNote, applyEffect, setCover, showToast, rollCover, degradeCover,
  advanceTime, modReputation, getReputation, setReputation,
  setQuestState, getQuestState, isQuestActive, isQuestCompleted,
  hasItem, addItem, removeItem, getStance, setStance, modStance, recordNpcMemory, getNpcMemories, hasNpcMemory,
  setDeadline, removeDeadline,
  offerSounding, takeSounding, suspendSounding, releaseSounding,
  applySoundingProgress, applyAutoAlignment,
  on, off, emit,
};
