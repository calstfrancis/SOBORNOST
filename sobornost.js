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
  G.magneticDeviation = 0.0;
  Object.assign(G, preserve);
}


// ============================================================
// SECTION: systems/schedule.js
// ============================================================

let _renderFn  = null;
let _scheduled = false;

function setRenderFn(fn) { _renderFn = fn; }

function scheduleRender() {
  if (_scheduled) return;
  if (!_renderFn) { console.warn('[SOBORNOST] scheduleRender() called before renderer registered'); return; }
  _scheduled = true;
  queueMicrotask(() => { _scheduled = false; _renderFn(); });
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

function showToast(msg, type) {
  const old = document.querySelector('.note-toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'note-toast' + (type === 'sounding' ? ' sounding-toast' : '');
  t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3200);
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
function addItem(id) { if (!hasItem(id)) { G.inventory.push(id); recalculateHeldEffects(); emit('itemAdded', id); scheduleRender(); } }
function removeItem(id) { G.inventory = G.inventory.filter(i => i !== id); recalculateHeldEffects(); emit('itemRemoved', id); scheduleRender(); }

function _ensureStance(npcId) { if (!G.npcStance[npcId]) G.npcStance[npcId] = { trust: 0, suspicion: 0, solidarity: 0, memories: [] }; }
function getStance(npcId, key) { _ensureStance(npcId); return G.npcStance[npcId][key] || 0; }
function setStance(npcId, key, value) {
  _ensureStance(npcId); const old = G.npcStance[npcId][key]; G.npcStance[npcId][key] = value;
  if (old !== value) emit('stanceChanged', { npcId, key, old, new: value });
}
function modStance(npcId, key, delta) {
  const cur = getStance(npcId, key); setStance(npcId, key, cur + delta);
  if (delta !== 0) showToast(`${npcId}: ${key} ${delta > 0 ? '+' + delta : delta}`, 'note');
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
    case 'stat':            return (G.stats[cond.name] || 0) >= (cond.min || 0);
    case 'charism':         return G.charisms.includes(cond.id);
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
const SOUNDING_THRESHOLD = 8;

function soundingSlotsFull() { return G.soundings.taken.length + G.soundings.settled.length >= MAX_SOUNDINGS; }

function offerSounding(id) {
  if (!id || !_registries.soundings[id]) return;
  if (G.soundings.available.includes(id) || G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  G.soundings.available.push(id);
  showToast('Sounding: ' + _registries.soundings[id].name, 'sounding');
  emit('soundingOffered', id);
}

function settleSounding(soundingId) {
  const idx = G.soundings.taken.findIndex(t => t.id === soundingId);
  if (idx !== -1) {
    G.soundings.taken.splice(idx, 1);
    if (!G.soundings.settled.includes(soundingId)) {
      G.soundings.settled.push(soundingId);
      const snd = _registries.soundings[soundingId];
      if (snd && snd.effect) applyEffect(snd.effect);
      showToast(`${snd.name} has settled.`, 'sounding');
      refreshAtmosMods(); emit('soundingSettled', soundingId);
    }
  }
}

function applySoundingProgress(soundingId, delta) {
  const entry = G.soundings.taken.find(t => t.id === soundingId); if (!entry) return;
  const old = entry.progress;
  entry.progress = Math.min(Math.max(entry.progress + delta, 0), SOUNDING_THRESHOLD);
  if (entry.progress >= SOUNDING_THRESHOLD && old < SOUNDING_THRESHOLD) settleSounding(soundingId);
  if (delta !== 0) { showToast(`${_registries.soundings[soundingId].name}: ${delta > 0 ? '+' + delta : delta}`, 'sounding'); emit('soundingProgress', { soundingId, progress: entry.progress, delta }); }
}

function applyAutoAlignment(tags) {
  if (!tags || !tags.length) return;
  for (const entry of G.soundings.taken) {
    const snd = _registries.soundings[entry.id];
    if (snd && snd.alignmentTags && snd.alignmentTags.some(tag => tags.includes(tag))) applySoundingProgress(entry.id, 1);
  }
}

function takeSounding(id) {
  if (G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  if (soundingSlotsFull()) { G.soundingPending = id; G.panelOpen = 'breviary'; scheduleRender(); return; }
  G.soundings.available = G.soundings.available.filter(x => x !== id);
  G.soundings.taken.push({ id, progress: 0 }); G.soundingPending = null;
  showToast(_registries.soundings[id].name + ': taking the sounding.', 'sounding');
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
    showToast(s.name + ': settled.', 'sounding');
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
  G.theosis = Math.min(Math.max(G.theosis + amount, 0), 100);
  refreshAtmosMods();
  checkJournalThresholds(G.theosis, oldValue);
  emit('theosisChanged', G.theosis);
  scheduleRender();
}

// Magnetic deviation: 0.0 = true north, 1.0 = maximum anomaly
function setMagneticDeviation(val) {
  G.magneticDeviation = Math.max(0, Math.min(1, val));
  emit('magneticDeviationChanged', G.magneticDeviation);
  scheduleRender();
}
function getMagneticDeviation() { return G.magneticDeviation || 0; }

function flashTheosisLight(intensity = 1.0, duration = 2000) {
  atmosMods.goldIntensity = Math.max(atmosMods.goldIntensity, intensity * 0.9);
  atmosMods.goldGlow = true; scheduleRender();
  G._theosisFlashTimer = setTimeout(() => { refreshAtmosMods(); scheduleRender(); G._theosisFlashTimer = null; }, duration);
}

const _nameMappings = {};
function registerNameMapping(original, tier1, tier2, cyrillic) { _nameMappings[original] = { tier1, tier2, cyrillic }; }
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function applyNameMapping(text) {
  if (!text) return text;
  const tier = getCurrentTier(); let result = text;
  for (const [original, mapping] of Object.entries(_nameMappings)) {
    let replacement = original;
    if      (tier.max <= 32)  replacement = original;
    else if (tier.max <= 65)  replacement = mapping.tier1  || original;
    else if (tier.max <= 100) replacement = mapping.tier2  || mapping.tier1 || original;
    if (mapping.cyrillic && tier.max >= 66) replacement = mapping.cyrillic;
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
function _porthole() { const r = Math.min(canvas.width,canvas.height)*.085; return { x: canvas.width-r-28, y: r+28, r }; }
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
  if (t>=71) atmosMods.goldIntensity=0.6;
  else if (t>=33) atmosMods.goldIntensity=0.2+(t-33)/38*0.4;
  else atmosMods.goldIntensity=0;
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
  ctx.strokeStyle='#1c2830'; ctx.lineWidth=r*.18; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#243038';
  for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; ctx.beginPath(); ctx.arc(x+Math.cos(a)*(r+r*.1),y+Math.sin(a)*(r+r*.1),r*.045,0,Math.PI*2); ctx.fill(); }
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*.87,0,Math.PI*2); ctx.clip();
  const sc=mood==='uncanny'?'#060e18':mood==='revelation'?'#202810':'#0e1820';
  const sg=ctx.createLinearGradient(x,y-r,x,y+r); sg.addColorStop(0,sc); sg.addColorStop(1,'#182430');
  ctx.fillStyle=sg; ctx.fillRect(x-r,y-r,r*2,r*2);
  const sw=atmosMods.soboWarm;
  ctx.strokeStyle=`rgba(${sw?80:60},${sw?110:100},${sw?120:130},${mood==='uncanny'?0.5:0.25})`; ctx.lineWidth=.8;
  for (let i=0;i<6;i++) { const wy=y+r*.2+i*r*.12+Math.sin(T*.6+i*1.2)*2; ctx.beginPath(); ctx.moveTo(x-r,wy); ctx.quadraticCurveTo(x,wy+Math.sin(T+i)*3,x+r,wy); ctx.stroke(); }
  ctx.strokeStyle=`rgba(100,150,180,${mood==='tense'?0.35:0.18})`; ctx.lineWidth=.6;
  for (const d of rainDrops) { d.y+=d.spd; if (d.y>y+r) { d.y=y-r; d.x=x+(Math.random()-.5)*r*2; } ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-1,d.y+d.len); ctx.stroke(); }
  ctx.restore(); ctx.strokeStyle='#2a3c48'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,y,r*.87,0,Math.PI*2); ctx.stroke();
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
    _oscNodes=[50,101,149].map((freq,i)=>{const o=_actx.createOscillator(),g=_actx.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.value=[0.5,0.25,0.15][i];o.connect(g);g.connect(master);o.connect(rev);o.start();return o;});
    const buf=_actx.createBuffer(1,_actx.sampleRate,_actx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const ns=_actx.createBufferSource();ns.buffer=buf;ns.loop=true;
    _filterNode=_actx.createBiquadFilter();_filterNode.type='lowpass';_filterNode.frequency.value=90;
    const ng=_actx.createGain();ng.gain.value=0.03;ns.connect(_filterNode);_filterNode.connect(ng);ng.connect(master);ns.start();
  } catch(e) { console.warn('Audio:',e); }
}
function _gain() { return _currentMoodRef==='tense'?0.055:_currentMoodRef==='revelation'?0.015:_currentMoodRef==='uncanny'?0.008:0.035; }
function _applyMood(m) {
  if (!_actx||!_audioOn) return;
  const t=_actx.currentTime;
  const cfg={neutral:{freqs:[50,101,149],filter:90,rv:0.18},tense:{freqs:[48,98,146],filter:60,rv:0.08},uncanny:{freqs:[44,88,132],filter:200,rv:0.35},revelation:{freqs:[55,110,165],filter:420,rv:0.45}}[m]||{freqs:[50,101,149],filter:90,rv:0.18};
  _oscNodes.forEach((o,i)=>{if(o)o.frequency.setTargetAtTime(cfg.freqs[i],t,2.5);});
  if(_filterNode)_filterNode.frequency.setTargetAtTime(cfg.filter,t,2.5);
  if(_reverbGain)_reverbGain.gain.setTargetAtTime(cfg.rv,t,2.5);
  if(m==='revelation'){try{const b=_actx.createOscillator(),bg=_actx.createGain();b.type='sine';b.frequency.value=880;bg.gain.setValueAtTime(0.07,t);bg.gain.exponentialRampToValueAtTime(0.0001,t+4);b.connect(bg);bg.connect(_gainNode);b.start(t);b.stop(t+4);}catch(e){}}
  if(m==='uncanny'){try{const w=_actx.createOscillator(),wg=_actx.createGain();w.type='sine';w.frequency.value=333;wg.gain.setValueAtTime(0.012,t);wg.gain.exponentialRampToValueAtTime(0.0001,t+5);w.connect(wg);wg.connect(_gainNode);w.start(t);w.stop(t+5);}catch(e){}}
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
  if(_audioOn)_applyMood(mood);
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
function initBuiltinSfx() {}

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
    };
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(state));
    saveJournal(slotId);
    showToast(`Saved to slot ${slotId}`, 'note');
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
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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
  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}


// ============================================================
// SECTION: systems/companions.js
// ============================================================

function addCompanion(id, data) {
  if (!G.companions.find(c => c.id === id)) { G.companions.push({ id, ...data }); saveGameLegacy(); emit('companionAdded', id); }
}
function removeCompanion(id) { G.companions = G.companions.filter(c => c.id !== id); saveGameLegacy(); emit('companionRemoved', id); }
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
    raw.forEach(line=>{const p=document.createElement('p');p.className='sp';p.innerHTML=processText(line);body.appendChild(p);});
  }
  const cd=document.createElement('div'); cd.className='choices';
  if (phase.ritualChoices) {
    phase.ritualChoices.forEach(ch=>{
      const btn=document.createElement('button'); btn.className='choice'+(ch.style==='sacrifice'?' choice-sacrifice':'');
      btn.textContent=processText(ch.text);
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
  tickSoundings();
  _captureSnapshot();
  tickDelayedConsequences();
  window.scrollTo(0, 0);
  scheduleRender();
  emit('sceneChanged', id);
}

function openPanel(w) { G.panelOpen = G.panelOpen === w ? null : w; scheduleRender(); }
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
    if (ch.next) navigate(ch.next);
    emit('choiceApplied', ch);
  } finally { _processingChoice = false; }
}

function newPlay() {
  addCrossingEntry();
  const currentFlags = [...G.flags];
  // Crossing Tax: the body forgets 15 points. The soul does not forget all of it.
  const carriedTheosis = Math.max(5, Math.min(85, G.theosis - 15));
  const preserve = { theosis: carriedTheosis, metaUnlocks: G.metaUnlocks, playCount: G.playCount+1, pastFlags: currentFlags, journal: G.journal };
  resetG(preserve);
  G.pastLifeFlags = new Set(currentFlags);
  G.scene = getInitialScene(); G.phase = 'charism';
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
  panel.appendChild(body);overlay.appendChild(panel);root.appendChild(overlay);
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
    const before=G.stats.composure||0;G.stats.composure=Math.max(0,before-1);
    if(G.stats.composure!==before)emit('statChanged',{stat:'composure',delta:-1});
    showToast(`You hold \u2014 barely. ${_fieldLabels[field]||field} costs you.`,'note');emit('coverChallengePartial',{field,result});
  }else{
    degradeCover(1);G.flags.add(`__cover_pressured_${field}`);
    showToast(`Cover questioned. ${_fieldLabels[field]||field} is under suspicion.`,'note');emit('coverChallengeFailure',{field,result});
  }
  G._coverChallenge={...G._coverChallenge,result,resolved:true};scheduleRender();
}
function dismissCoverChallenge(){G._coverChallenge=null;scheduleRender();}

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
    res.textContent=`[${result.d1}]+[${result.d2}]=${result.roll}+${result.statValue}=${result.total} \u2014 ${result.outcome.toUpperCase()}`;
    box.appendChild(res);
    const cont=document.createElement('button');cont.className='btn';cont.textContent='Continue';cont.onclick=dismissCoverChallenge;box.appendChild(cont);
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
    _renderNpcBeat(wrap,beat.speaker,beat.text,processTextFn);wrap.appendChild(_continueBtn(()=>advanceDialogue()));
  }else if(beat.text){
    const p=document.createElement('p');p.className='sp dialogue-narration';p.innerHTML=processTextFn?processTextFn(beat.text):beat.text;
    wrap.appendChild(p);wrap.appendChild(_continueBtn(()=>advanceDialogue()));
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
  panel.appendChild(body);overlay.appendChild(panel);root.appendChild(overlay);
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
function injectMicroLines(a,_s){return a;}
function applyLinguisticToggle(t){return t;}
function applyPostEventShifts(t){return t;}
function applyPastLifeLines(a,_id){return a;}
function injectGhostText(t,_id){return t;}
function processText(raw){
  if(typeof raw==='function')raw=raw(G);
  if(typeof raw!=='string')return'';
  return applyNameMapping(raw.replace(/\{ICON\}/g,iconWord()));
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
function markMapNodeVisited(id){if(_registries.mapNodes[id])_registries.mapNodes[id].visited=true;}

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
    <div class="title-cyrillic">${window.GAME_TITLE||'GAME'}</div>
    <div style="font-size:.72rem;color:var(--dim);letter-spacing:.3em;text-transform:uppercase;margin-bottom:.2rem">${window.GAME_SUBTITLE||''}</div>
    <div style="font-size:.68rem;color:var(--amber-dim);letter-spacing:.18em;font-style:italic;margin-bottom:${isDemo?'1.2':'3.5'}rem">${window.GAME_MOTTO||'Thank You'}</div>
    ${isDemo?'<div style="font-size:.8rem;color:var(--amber);border:1px solid var(--amber-dim);padding:.5rem 1.2rem;margin-bottom:2.5rem">DEMO VERSION \u2014 Act One Only</div>':''}
    <pre style="font-size:.62rem;color:var(--border-mid);white-space:pre;line-height:1.3;margin-bottom:3rem">
            ___
       ____/ | \\____
  ~~~~|______________|~~~~
    ~~~~~~~~~~~~~~~~~~~~~~~~~~</pre>
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
    // Validate the saved scene still exists; if not, restart from initial scene
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
  const modeDesc = {
    attended:  { label: 'Attended',  desc: 'The full crossing. Choices matter. The ship keeps score.' },
    witnessed: { label: 'Witnessed', desc: 'You observe. Composure does not advance. The record is kept.' },
    open:      { label: 'Open',      desc: 'No restrictions. Everything is available.' },
  };
  d.innerHTML = `
    <div style="font-size:.62rem;color:var(--dim);letter-spacing:.22em;text-transform:uppercase;margin-bottom:2rem">How do you cross?</div>
    <div style="display:flex;flex-direction:column;gap:.7rem;width:100%;max-width:360px">
      ${modes.map(m => `
        <button class="btn mode-btn" data-mode="${m}" style="text-align:left;padding:.8rem 1rem">
          <div style="font-size:.8rem;color:var(--fg);letter-spacing:.08em;margin-bottom:.3rem">${(modeDesc[m]||{label:m}).label}</div>
          <div style="font-size:.72rem;color:var(--dim);font-style:italic">${(modeDesc[m]||{desc:''}).desc}</div>
        </button>`).join('')}
    </div>`;
  root.appendChild(d);
  d.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      G.mode = btn.dataset.mode;
      G.phase = 'charism';
      render();
    });
  });
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
  if(_registries.tutorialContent)
    div.innerHTML=`<div class="tutorial-box">${_registries.tutorialContent}<button class="btn" style="margin-top:1.5rem;width:100%" id="dt">Board the ship</button></div>`;
  else
    div.innerHTML=`<div class="tutorial-box">
      <div class="tutorial-h">Before you board</div>
      <div class="tutorial-item"><strong>Status bar</strong> \u2014 top of screen. Vigilance, Composure, Communion, Doubt.</div>
      <div class="tutorial-item"><strong>The Breviary</strong> <span class="key">breviary</span> \u2014 centre bottom. Soundings settle through choices.</div>
      <div class="tutorial-item"><strong>Observations</strong> <span class="key">observations</span> \u2014 right bottom.</div>
      <div class="tutorial-item"><strong>Status</strong> <span class="key">status</span> \u2014 left bottom.</div>
      <div class="tutorial-item"><strong>Abandon crossing</strong> \u2014 bottom of each scene.</div>
      <button class="btn" style="margin-top:1.5rem;width:100%" id="dt">Board the ship</button>
    </div>`;
  div.querySelector('#dt').addEventListener('click',dismissTutorial);root.appendChild(div);
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
    _appendAudioBtn(root);_appendBottomNav(root);return;
  }
  processConsequenceQueue();resetIdleTimer();
  const scene=getScene(G.scene);
  if(!scene){_registries.sceneNotFound(G.scene,root);return;}
  const liturgical=LITURGICAL_HOURS[G.liturgicalHour];
  if(liturgical)setMood(liturgical.mood);else setMood(scene.mood||'neutral');
  saveGameLegacy();
  const visitKey='visited_'+G.scene,firstVisit=!hasFlag(visitKey);
  if(firstVisit){setFlag(visitKey);if(scene.on_enter){if(scene.on_enter.note)addNote(scene.on_enter.note);if(scene.on_enter.flag)setFlag(scene.on_enter.flag);if(scene.on_enter.thought)offerSounding(scene.on_enter.thought);}
  // Support arbitrary onEnter function — first visit only
  if(typeof scene.onEnter === 'function') { try { scene.onEnter(); } catch(e) { console.error('[SOBORNOST] onEnter error in scene', G.scene, e); } }
  }
  const wrap=document.createElement('div');wrap.className='game';
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
  if(scene.return_to){const rb=document.createElement('button');rb.className='choice choice-return';rb.textContent=scene.return_label||'Return.';rb.onclick=()=>navigate(scene.return_to);cd.appendChild(rb);}
  if(scene.choices){
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
        if(ch.mod_reputation){const l=document.createElement('span');l.className='reputation-label';l.textContent=Object.entries(ch.mod_reputation).map(([id,d])=>`${id} ${d>0?'+'+d:d}`).join(', ');btn.appendChild(l);}
        if(ch.set_quest_state){const l=document.createElement('span');l.className='quest-label';l.textContent=Object.entries(ch.set_quest_state).map(([id,s])=>`${id}\u2192${s}`).join(', ');btn.appendChild(l);}
        if(ch.spend_composure){const l=document.createElement('span');l.className='composure-label';l.textContent=`\u2212${ch.spend_composure} composure`;btn.appendChild(l);}
        btn.onclick=(ch.roll&&typeof ch.roll==='object')?()=>startRoll(ch):()=>applyChoice(ch);
      }
      cd.appendChild(btn);
    });
  }
  body.appendChild(cd);
  if(G.notes.length){
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
  body.appendChild(_buildRestartBar());wrap.appendChild(body);root.appendChild(wrap);
  _appendAudioBtn(root);_appendBottomNav(root);
  if(G.panelOpen==='notes')    _renderNotesPanel(root);
  if(G.panelOpen==='status')   _renderStatusPanel(root);
  if(G.panelOpen==='breviary') _renderBreviaryPanel(root);
  if(G.panelOpen==='glossary') _renderGlossaryPanel(root);
  if(G.panelOpen==='map')      _renderMapPanelSide(root);
  if(G.panelOpen==='journal')  renderJournalPanel(root,openPanel);
  if(G.panelOpen==='log')      renderEventLogPanel(root,openPanel);
  if(G.panelOpen==='codex')    renderCodexPanel(root,openPanel);
}

function _buildHeader(scene){
  const hdr=document.createElement('div');hdr.className='game-header';
  const si=document.createElement('div');si.className='save-indicator';si.textContent='\u25e6 autosaved';si.style.display='none';hdr.appendChild(si);
  const moodCls=scene.mood==='uncanny'?' uncanny':scene.mood==='revelation'?' revelation':'';
  const lb=document.createElement('div');lb.className='location-bar'+moodCls;lb.textContent=scene.location;hdr.appendChild(lb);
  const sb=document.createElement('div');sb.className='sbar';
  Object.entries(G.stats).forEach(([k,v])=>{const d=document.createElement('div');d.className='stat';d.innerHTML=k+' <span class="stat-val">'+v+'</span>'+(_registries.statTips[k]?'<span class="stat-tip">'+_registries.statTips[k]+'</span>':'');sb.appendChild(d);});
  if(G.theosis>32){const td=document.createElement('div');td.className='stat stat-theosis';const tier=G.theosis>65?'\u041a\u041a\u0410':String(G.theosis);td.innerHTML='<span class="stat-val" style="color:var(--gold)">'+tier+'</span><span class="stat-tip">theosis</span>';sb.appendChild(td);}
  hdr.appendChild(sb);
  const tags=[];
  G.charisms.forEach(id=>{const c=findCharism(id);if(c)tags.push(`<span class="ctag" title="${c.desc}">${c.name}</span>`);});
  const cc=Object.values(G.cover).filter(Boolean).length;
  if(cc>0)tags.push('<span class="cover-tag">cover '+cc+'/5</span>');
  if(G.coverIntegrity<3){const ci=G.coverIntegrity===0?'blown':G.coverIntegrity===1?'thin':'questioned';tags.push(`<span class="cover-tag" style="border-color:var(--rust);color:var(--rust)">cover ${ci}</span>`);}
  const tc=G.soundings.taken.length+G.soundings.settled.length,ta=G.soundings.available.length;
  if(tc>0||ta>0)tags.push(`<span class="breviary-tag">\u2693 ${tc}/${MAX_SOUNDINGS}${ta?' +'+ta:''}</span>`);
  if(tags.length){const cb=document.createElement('div');cb.className='cbar';cb.innerHTML=tags.join('');hdr.appendChild(cb);}
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
  const navItems=[
    {label:'observations',fn:()=>openPanel('notes')},
    {label:'status',fn:()=>openPanel('status')},
    {label:'breviary'+(G.soundings.available.length?' \u2691':''),fn:()=>openPanel('breviary'),cls:G.soundings.available.length?' has-available':''},
    {label:'codex',fn:()=>openPanel('glossary')},
    {label:'map',fn:()=>openPanel('map')},
  ];
  navItems.forEach(({label,fn,cls=''})=>{
    const b=document.createElement('button');
    b.style.cssText="flex:1;background:none;border:none;border-right:1px solid var(--border);font-family:'Courier Prime',monospace;font-size:.66rem;letter-spacing:.07em;padding:.55rem .3rem;cursor:pointer;color:var(--dim)";
    b.className=cls;b.textContent=label;b.onclick=fn;bnav.appendChild(b);
  });
  root.appendChild(bnav);
}
function _renderNotesPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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
        ['pablo_knows',               'Pavel knows. He was not surprised.'],
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

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}

function _renderStatusPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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

  // Companions
  if (G.companions && G.companions.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'companions'; body.appendChild(cs);
    G.companions.forEach(c => {
      const row = document.createElement('div'); row.className = 'panel-row';
      row.textContent = c.name || c.id; body.appendChild(row);
    });
  }

  // Inventory
  if (G.inventory && G.inventory.length > 0) {
    const cs = document.createElement('div'); cs.className = 'panel-section'; cs.textContent = 'carried'; body.appendChild(cs);
    G.inventory.forEach(id => {
      const item = _registries.items[id];
      const row = document.createElement('div'); row.className = 'panel-row';
      row.textContent = item ? (item.name || id) : id; body.appendChild(row);
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

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}

function _renderBreviaryPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}

function _renderGlossaryPanel(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}

function _renderMapPanelSide(root) {
  const overlay = document.createElement('div'); overlay.className = 'panel-overlay';
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
  const sceneMap = {cabin:'cabin_wake',main_deck:'main_deck_hub',foredeck:'foredeck_first',bridge:'bridge_hub',mess:'mess_hub',galley:'galley_hub',chart_room:'chart_room_first',captain_quarters:'bridge_hub',hold_access:'hold_first',hold:'hold_first',cargo_bay:'hold_first',instrument_room:'instrument_room_first',aft:'instrument_room_first'};
  const currentNode = sceneToNode[G.scene] || null;

  if (!nodes || Object.keys(nodes).length === 0) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:var(--dim);font-style:italic;font-size:.84rem;';
    empty.textContent = 'The ship is still taking shape.'; body.appendChild(empty);
  } else {
    const list = document.createElement('div'); list.className = 'map-grid';
    const nodeNames = { cabin:'Cabin',main_deck:'Main Deck',foredeck:'Foredeck',bridge:'Bridge',mess:'Mess Hall',galley:'Galley',chart_room:'Chart Room',captain_quarters:"Captain's Quarters",hold_access:'Hold Access',hold:'Hold',cargo_bay:'Cargo Bay',instrument_room:'Instrument Room',aft:'Aft Compartment' };
    Object.entries(nodes).forEach(([id, node]) => {
      const required = node.theosisRequired !== undefined ? node.theosisRequired : 0;
      if (G.theosis < required) return;
      const isCurrent = currentNode === id;
      const wasVisited = G.flags && G.flags.has('visited_' + (sceneMap[id] || id));
      const row = document.createElement('div');
      row.className = 'map-node' + (isCurrent ? ' current' : wasVisited ? ' visited' : '');
      const dot = document.createElement('div'); dot.className = 'map-node-dot';
      const label = document.createElement('span'); label.textContent = nodeNames[id] || id.replace(/_/g,' ');
      row.appendChild(dot); row.appendChild(label);
      row.onclick = () => { if (!isCurrent) { openPanel(null); navigate(sceneMap[id] || id); } };
      list.appendChild(row);
    });
    body.appendChild(list);
    const hidden = Object.values(nodes).filter(n => G.theosis < (n.theosisRequired || 0)).length;
    if (hidden > 0) { const hint = document.createElement('p'); hint.className = 'map-hint'; hint.textContent = `${hidden} location${hidden>1?'s':''} not yet visible.`; body.appendChild(hint); }
  }

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}

loadMetaUnlocks();
initBuiltinSfx();

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
  registerStatTip, registerRollModifier, setAvailableModes,
  setIconWordFunction, setHarbourWordFunction, setShipWordFunction, setObjectDescriptionFunction,
  registerScenePool, addToScenePool, registerRitual, registerTranslation,
  registerPostEventShift, registerPastLifeLine, registerMapNode, registerSfx,
  registerItem, registerAtmosModifier, setTutorialContent,
  registerTheosisTagValue, setTheosisTiers, incrementTheosis, flashTheosisLight,
  setMagneticDeviation, getMagneticDeviation,
  registerNameMapping, setLiturgicalHour,
  addCompanion, removeCompanion, hasCompanion, getCompanion, modCompanionStat, setCompanionCharism,
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
