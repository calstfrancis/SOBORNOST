// ── SOBORNOST ENGINE — systems/mechanics.js ───────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { _registries, noteLabel } from './registries.js';
import { scheduleRender } from './schedule.js';

// ── Toast ─────────────────────────────────────────────────────
export function showToast(msg, type) {
  const old = document.querySelector('.note-toast'); if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'note-toast' + (type === 'sounding' ? ' sounding-toast' : '');
  t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3200);
}

// ── Flags ─────────────────────────────────────────────────────
export function hasFlag(f) { return G.flags.has(f); }
export function setFlag(f) { if (f) G.flags.add(f); emit('flagSet', f); }

// ── Notes ─────────────────────────────────────────────────────
export function addNote(key) {
  if (!key || G.notes.includes(key)) return;
  G.notes.push(key);
  const l = noteLabel(key);
  showToast(l.length > 52 ? l.slice(0, 52) + '\u2026' : l, 'note');
  emit('noteAdded', key);
}

// ── Effects ───────────────────────────────────────────────────
export function applyEffect(e) {
  if (!e) return;
  const hasPoa = G.charisms.includes('presence_of_absence');
  for (const [k, v] of Object.entries(e)) {
    if (G.stats[k] !== undefined) {
      if (k === 'composure' && v > 0 && G.mode === 'witnessed') continue;
      if (v < 0 && hasPoa) {
        if (!G._poaAbsorbedThisScene) { G._poaAbsorbedThisScene = true; showToast('\u2014', 'note'); }
        continue;
      }
      G.stats[k] = Math.max(0, G.stats[k] + v);
      emit('statChanged', { stat: k, delta: v });
    }
  }
}

// ── Cover ─────────────────────────────────────────────────────
export function setCover(key, value) { G.cover[key] = value; setFlag('cover_' + key + '_set'); }
export function rollCover(difficulty) {
  const roll = Math.ceil(Math.random() * 6), bonus = Math.floor(G.stats.composure / 2), total = roll + bonus;
  if (total >= difficulty + 2) return 'success'; if (total >= difficulty) return 'partial'; return 'failure';
}
export function degradeCover(amount) {
  G.coverIntegrity = Math.max(0, G.coverIntegrity - amount);
  emit('coverIntegrityChanged', G.coverIntegrity);
}

// ── Time ──────────────────────────────────────────────────────
export function advanceTime(hours) {
  G.time.hour += hours;
  while (G.time.hour >= 24) { G.time.hour -= 24; G.time.day++; }
  processEventQueue();
  import('./save.js').then(m => m.saveGameLegacy());
  emit('timeAdvanced', { hours, day: G.time.day, hour: G.time.hour });
}

// ── Reputation ────────────────────────────────────────────────
export function modReputation(id, delta) {
  if (!G.reputation[id]) G.reputation[id] = 0; G.reputation[id] += delta;
  emit('reputationChanged', { id, delta, new: G.reputation[id] });
}
export function getReputation(id) { return G.reputation[id] || 0; }
export function setReputation(id, val) { G.reputation[id] = val; emit('reputationSet', { id, val }); }

// ── Quests ────────────────────────────────────────────────────
export function setQuestState(id, state) { G.quests[id] = state; emit('questStateChanged', { id, state }); }
export function getQuestState(id) { return G.quests[id] || 'inactive'; }
export function isQuestActive(id) { return getQuestState(id) === 'active'; }
export function isQuestCompleted(id) { return getQuestState(id) === 'completed'; }

// ── Items / held effects ──────────────────────────────────────
let _heldBonuses = {};
export function recalculateHeldEffects() {
  for (const stat in _heldBonuses) G.stats[stat] = Math.max(0, G.stats[stat] - _heldBonuses[stat]);
  _heldBonuses = {};
  for (const itemId of G.inventory) {
    const item = _registries.items[itemId];
    if (item && item.effectWhileHeld)
      for (const [stat, delta] of Object.entries(item.effectWhileHeld)) {
        _heldBonuses[stat] = (_heldBonuses[stat] || 0) + delta;
        G.stats[stat] = Math.max(0, G.stats[stat] + delta);
      }
  }
}
export function hasItem(id)    { return G.inventory.includes(id); }
export function addItem(id)    { if (!hasItem(id)) { G.inventory.push(id); recalculateHeldEffects(); emit('itemAdded', id); } }
export function removeItem(id) { G.inventory = G.inventory.filter(i => i !== id); recalculateHeldEffects(); emit('itemRemoved', id); }

// ── NPC Stance ────────────────────────────────────────────────
function _ensureStance(npcId) { if (!G.npcStance[npcId]) G.npcStance[npcId] = { trust: 0, suspicion: 0, solidarity: 0 }; }
export function getStance(npcId, key) { _ensureStance(npcId); return G.npcStance[npcId][key] || 0; }
export function setStance(npcId, key, value) {
  _ensureStance(npcId); const old = G.npcStance[npcId][key]; G.npcStance[npcId][key] = value;
  if (old !== value) emit('stanceChanged', { npcId, key, old, new: value });
}
export function modStance(npcId, key, delta) {
  const cur = getStance(npcId, key); setStance(npcId, key, cur + delta);
  if (delta !== 0) showToast(`${npcId}: ${key} ${delta > 0 ? '+' + delta : delta}`, 'note');
}

// ── Epistemic ─────────────────────────────────────────────────
export function learn(flag)         { G.knowledge.add(flag); G.beliefs.add(flag); emit('learned', flag); }
export function comeToBelieve(flag) { if (!G.knowledge.has(flag)) G.beliefs.add(flag); emit('believed', flag); }
export function contradict(flag)    { G.beliefs.delete(flag); emit('contradicted', flag); }
export function knows(flag)         { return G.knowledge.has(flag); }
export function believes(flag)      { return G.beliefs.has(flag); }

// ── Consequence queue — Upgrade 5 ─────────────────────────────
// Consequence shape (all fields optional except one trigger field):
//   {
//     condition:    () => boolean,    // existing: fires when condition() === true
//     delay_scenes: number,           // NEW: fires after N more scene navigations
//     on_next_choice: true,           // NEW: fires on the very next applyChoice()
//     flagsToSet:   string[],
//     sceneToRun:   string,
//     effect:       { stat: delta },  // NEW: apply an effect object
//   }
//
// delay_scenes and on_next_choice are mutually exclusive with condition.
// Existing consequences with condition: work unchanged.

let _processingConsequences = false;

export function pushConsequence(consequence) {
  G.consequenceQueue.push(consequence);
  emit('consequencePushed', consequence);
}

function _fireConsequence(c) {
  if (c.flagsToSet) c.flagsToSet.forEach(f => setFlag(f));
  if (c.effect)     applyEffect(c.effect);
  if (c.sceneToRun) { G.scene = c.sceneToRun; return true; }
  return false;
}

export function processConsequenceQueue() {
  if (_processingConsequences) return;
  _processingConsequences = true;
  let sceneChanged = false;
  for (let i = 0; i < G.consequenceQueue.length; i++) {
    const c = G.consequenceQueue[i];
    // Skip delay_scenes and on_next_choice types — those fire elsewhere
    if (c.delay_scenes !== undefined || c.on_next_choice) continue;
    if (c.condition && !c.condition()) continue;
    if (_fireConsequence(c)) sceneChanged = true;
    G.consequenceQueue.splice(i, 1); i--;
    emit('consequenceProcessed', c);
  }
  _processingConsequences = false;
  if (sceneChanged) scheduleRender();
}

/**
 * Called by navigate() on every scene change (Upgrade 5).
 * Decrements delay_scenes counters and fires any that hit zero.
 */
export function tickDelayedConsequences() {
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

/**
 * Called by applyChoice() before navigation (Upgrade 5).
 * Fires all on_next_choice consequences immediately.
 */
export function fireNextChoiceConsequences() {
  let sceneChanged = false;
  for (let i = 0; i < G.consequenceQueue.length; i++) {
    const c = G.consequenceQueue[i];
    if (!c.on_next_choice) continue;
    if (_fireConsequence(c)) sceneChanged = true;
    G.consequenceQueue.splice(i, 1); i--;
    emit('consequenceProcessed', c);
  }
  // Don't scheduleRender here — applyChoice will navigate and render
}

// ── Event queue ───────────────────────────────────────────────
export function scheduleEvent(event) {
  G.eventQueue.push(event);
  import('./save.js').then(m => m.saveGameLegacy());
  emit('eventScheduled', event);
}
export function processEventQueue() {
  const pending = [];
  for (let i = G.eventQueue.length - 1; i >= 0; i--) {
    const ev = G.eventQueue[i];
    const { triggerTime, sceneId, conditions, once = true } = ev;
    if (G.time.day === triggerTime.day && G.time.hour === triggerTime.hour)
      pending.push({ ev, idx: i, sceneId, conditions, once });
  }
  if (!pending.length) return;
  import('./conditions.js').then(({ evaluateCondition }) => {
    let processed = false;
    for (const { ev, idx, sceneId, conditions, once } of pending) {
      if (conditions && !evaluateCondition(conditions)) continue;
      if (sceneId) { G.scene = sceneId; emit('eventTriggered', ev); processed = true; }
      if (once) G.eventQueue.splice(idx, 1);
    }
    if (processed) scheduleRender();
  });
}
