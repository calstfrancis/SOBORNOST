// ── SOBORNOST ENGINE — systems/navigation.js ──────────────────

import { G, resetG } from '../core/state.js';
import { emit } from '../core/events.js';
import { scheduleRender } from './schedule.js';
import { _captureSnapshot } from './history.js';
import { tickSoundings, offerSounding } from './soundings.js';
import { markMapNodeVisited } from '../ui/widgets.js';
import { refreshAtmosMods } from './atmosphere.js';
import { getInitialScene } from './registries.js';
import {
  applyEffect, setFlag, addNote,
  addItem, removeItem, advanceTime,
  modReputation, setQuestState,
  setCover, degradeCover, modStance,
  learn, comeToBelieve, contradict,
  pushConsequence, scheduleEvent,
  tickDelayedConsequences,      // Upgrade 5
  fireNextChoiceConsequences,   // Upgrade 5
} from './mechanics.js';
import { addCompanion, removeCompanion } from './companions.js';
import { incrementTheosis, flashTheosisLight, getTheosisTagValues } from './theosis.js';
import { SAVE_KEY_PREFIX } from './save.js';
import { checkEndings } from './endings.js';
import { startDialogue } from './dialogue.js';
// Upgrade 4: journal crossing entry
import { addCrossingEntry } from './journal.js';

export function navigate(id) {
  G.scene = id;
  G._sceneCount = (G._sceneCount || 0) + 1;  // Upgrade 5: used by delay_scenes
  markMapNodeVisited(id);
  G._poaAbsorbedThisScene = false;
  G._mortificationSpent   = false;
  G._dialogue             = null;
  tickSoundings();
  tickDelayedConsequences();   // Upgrade 5: decrement and fire delay_scenes consequences
  _captureSnapshot();
  window.scrollTo(0, 0);
  scheduleRender();
  emit('sceneChanged', id);
}

export function openPanel(w) {
  G.panelOpen = G.panelOpen === w ? null : w;
  scheduleRender();
}

export function returnToTitle() { G.phase = 'title'; scheduleRender(); }

export function applyChoice(ch) {
  // Upgrade 5: fire on_next_choice consequences before this choice's effects
  fireNextChoiceConsequences();

  // ── Theosis ───────────────────────────────────────────────
  if (ch.tags && Array.isArray(ch.tags)) {
    const tagValues = getTheosisTagValues(); let total = 0;
    for (const tag of ch.tags) total += tagValues[tag] || 0;
    if (total !== 0) incrementTheosis(total);
  }
  if (ch.theosis)      incrementTheosis(ch.theosis);
  if (ch.theosisFlash) flashTheosisLight(
    typeof ch.theosisFlash === 'number' ? ch.theosisFlash : 1.0,
    ch.theosisFlashDuration || 2000
  );

  // ── Stats / flags / notes ─────────────────────────────────
  applyEffect(ch.effect);
  if (ch.set_flag) setFlag(ch.set_flag);
  if (ch.set_note) addNote(ch.set_note);

  // ── Cover ─────────────────────────────────────────────────
  if (ch.set_cover)                   setCover(ch.set_cover.key, ch.set_cover.value);
  if (ch.degrade_cover !== undefined)  degradeCover(ch.degrade_cover);

  // ── Inventory / soundings ─────────────────────────────────
  if (ch.thought)   offerSounding(ch.thought);
  if (ch.give_item) addItem(ch.give_item);
  if (ch.take_item) removeItem(ch.take_item);

  // ── Time & economy ────────────────────────────────────────
  if (ch.advance_time)    advanceTime(ch.advance_time);
  if (ch.mod_reputation)  for (const [id, delta] of Object.entries(ch.mod_reputation))  modReputation(id, delta);
  if (ch.set_quest_state) for (const [id, state] of Object.entries(ch.set_quest_state)) setQuestState(id, state);

  // ── Stance ────────────────────────────────────────────────
  if (ch.mod_stance)
    for (const [npc, stances] of Object.entries(ch.mod_stance))
      for (const [key, delta] of Object.entries(stances)) modStance(npc, key, delta);

  // ── Epistemic ─────────────────────────────────────────────
  if (ch.learn)           [].concat(ch.learn).forEach(f => learn(f));
  if (ch.come_to_believe) [].concat(ch.come_to_believe).forEach(f => comeToBelieve(f));
  if (ch.contradict)      [].concat(ch.contradict).forEach(f => contradict(f));

  // ── Companions ────────────────────────────────────────────
  if (ch.add_companion)    addCompanion(ch.add_companion.id, ch.add_companion);
  if (ch.remove_companion) removeCompanion(ch.remove_companion);

  // ── Deferred effects ──────────────────────────────────────
  if (ch.push_consequence) pushConsequence(ch.push_consequence);
  if (ch.schedule_event)   scheduleEvent(ch.schedule_event);

  // ── Ending check (after all effects applied) ──────────────
  if (checkEndings()) { emit('choiceApplied', ch); return; }

  // ── Dialogue ──────────────────────────────────────────────
  if (ch.dialogue) { startDialogue(ch.dialogue); emit('choiceApplied', ch); return; }

  // ── Navigation ────────────────────────────────────────────
  if (ch.next === '__new_play__') { newPlay(); return; }
  if (ch.next) navigate(ch.next);
  emit('choiceApplied', ch);
}

export function newPlay() {
  // Upgrade 4: record crossing boundary in journal before resetting
  addCrossingEntry();
  const currentFlags = [...G.flags];
  const preserve = {
    theosis:     G.theosis,
    metaUnlocks: G.metaUnlocks,
    playCount:   G.playCount + 1,
    pastFlags:   currentFlags,
    // Preserve journal across crossings
    journal:     G.journal,
  };
  resetG(preserve);
  G.pastLifeFlags = new Set(currentFlags);
  G.scene  = getInitialScene();
  G.phase  = 'charism';
  refreshAtmosMods();
  _captureSnapshot();
  emit('newPlay');
  scheduleRender();
}

export function absoluteReset() {
  if (!confirm('Reset all crossings to zero? This cannot be undone.')) return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SAVE_KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch (e) { console.warn('Reset clear failed:', e); }
  resetG();
  emit('gameReset');
  scheduleRender();
}

export function doRestart() { absoluteReset(); }
export function mkOverlay(fn) {
  const o = document.createElement('div'); o.className = 'overlay-bg'; o.onclick = fn; return o;
}
