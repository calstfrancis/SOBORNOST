// ── SOBORNOST ENGINE — systems/save.js ────────────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { refreshAtmosMods } from './atmosphere.js';
import { showToast } from './mechanics.js';
import { scheduleRender } from './schedule.js';
import { saveJournal, loadJournal } from './journal.js';

export const VERSION         = '3.3.1';
export const SAVE_KEY_PREFIX = 'sobornost_save_';
export const SAVE_KEY_LEGACY = SAVE_KEY_PREFIX + 'legacy';
export const META_KEY        = 'spasibo_meta';
export const ANALYTICS_KEY   = 'spasibo_analytics';

// Bug 2 fix: strip consequence entries that carry function conditions before
// serialising. JSON.stringify silently drops function-valued properties, which
// causes condition-based consequences to fire unconditionally on load.
// Consequences with delay_scenes (number) or on_next_choice (boolean) are
// serialisable and are preserved. Authors who need condition-based consequences
// to survive a save/load cycle should use the evaluateCondition schema instead.
function _serialisableConsequences(queue) {
  const out = [];
  for (const c of queue) {
    if (typeof c.condition === 'function') {
      console.warn('[SOBORNOST] save: consequence with function condition dropped — use evaluateCondition schema for save-safe conditions', c);
      continue;
    }
    out.push(c);
  }
  return out;
}

export function saveGameSlot(slotId) {
  try {
    const state = {
      engineVersion:  VERSION,
      // Bug 1 fix: playCount and pastFlags were absent — added
      playCount:      G.playCount,
      pastFlags:      G.pastFlags,
      stats:          G.stats,          charisms:     G.charisms,
      soundings:      G.soundings,      cover:        G.cover,
      coverIntegrity: G.coverIntegrity, notes:        G.notes,
      flags:          [...G.flags],     scene:        G.scene,
      mode:           G.mode,           lastReaction: G.lastReaction,
      tutorialDone:   G.tutorialDone,   crossingLog:  G.crossingLog,
      inventory:      G.inventory,      time:         G.time,
      reputation:     G.reputation,     quests:       G.quests,
      awareness:      G.awareness,      beliefs:      [...G.beliefs],
      knowledge:      [...G.knowledge],
      // Bug 2 fix: strip function conditions before serialising
      consequenceQueue: _serialisableConsequences(G.consequenceQueue),
      npcStance:      G.npcStance,      eventQueue:   G.eventQueue,
      pastLifeFlags:  [...G.pastLifeFlags],
      _kenosisProgress: G._kenosisProgress, liturgicalHour: G.liturgicalHour,
      companions:     G.companions,     theosis:      G.theosis,
      _sceneCount:    G._sceneCount,
    };
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(state));
    // Bug 7 fix: journal stored per-slot, not under a global key
    saveJournal(slotId);
    showToast(`Saved to slot ${slotId}`, 'note');
    emit('saveSlot', slotId);
  } catch (e) { console.warn('Save failed:', e); }
}

export function loadGameSlot(slotId) {
  try {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slotId); if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.engineVersion && s.engineVersion !== VERSION)
      console.warn(`[SOBORNOST] Save version ${s.engineVersion} loaded into engine ${VERSION}`);
    // Bug 1 fix: restore playCount and pastFlags
    G.playCount         = s.playCount          !== undefined ? s.playCount          : 0;
    G.pastFlags         = s.pastFlags          || [];
    G.stats             = s.stats             || G.stats;
    G.charisms          = s.charisms          || [];
    G.soundings         = s.soundings         || { available: [], taken: [], settled: [], released: [] };
    if (!G.soundings.released) G.soundings.released = [];
    G.cover             = s.cover             || G.cover;
    G.coverIntegrity    = s.coverIntegrity    !== undefined ? s.coverIntegrity    : 3;
    G.notes             = s.notes             || [];
    G.flags             = new Set(s.flags     || []);
    G.scene             = s.scene             || null;
    G.mode              = s.mode              || 'attended';
    G.lastReaction      = s.lastReaction      || null;
    G.tutorialDone      = s.tutorialDone      || false;
    G.crossingLog       = s.crossingLog       || [];
    G.inventory         = s.inventory         || [];
    G.time              = s.time              || { day: 1, hour: 8, maxDays: 3 };
    G.reputation        = s.reputation        || {};
    G.quests            = s.quests            || {};
    G.awareness         = s.awareness         !== undefined ? s.awareness         : 0;
    G.beliefs           = new Set(s.beliefs   || []);
    G.knowledge         = new Set(s.knowledge || []);
    G.consequenceQueue  = s.consequenceQueue  || [];
    G.npcStance         = s.npcStance         || {};
    G.eventQueue        = s.eventQueue        || [];
    G.pastLifeFlags     = new Set(s.pastLifeFlags || []);
    G._kenosisProgress  = s._kenosisProgress  || 0;
    G.liturgicalHour    = s.liturgicalHour    !== undefined ? s.liturgicalHour    : 4;
    G.companions        = s.companions        || [];
    G.theosis           = s.theosis           !== undefined ? s.theosis           : 0;
    G._sceneCount       = s._sceneCount       || 0;
    G.phase = 'game';
    // Bug 7 fix: load journal from per-slot key
    loadJournal(slotId);
    refreshAtmosMods();
    scheduleRender();
    emit('loadSlot', slotId);
    return true;
  } catch (e) { console.warn('Load failed:', e); return false; }
}

export function listSaveSlots() {
  const slots = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SAVE_KEY_PREFIX)) slots.push(k.slice(SAVE_KEY_PREFIX.length));
  }
  return slots.sort();
}

export function saveGameLegacy() { saveGameSlot('legacy'); }
export function loadGameLegacy() { return loadGameSlot('legacy'); }

export function loadMetaUnlocks() {
  try { const r = localStorage.getItem(META_KEY); G.metaUnlocks = r ? JSON.parse(r) : {}; }
  catch (e) { G.metaUnlocks = {}; }
}
export function saveMetaUnlocks() {
  try { localStorage.setItem(META_KEY, JSON.stringify(G.metaUnlocks)); } catch (e) {}
}
export function unlockMeta(id) {
  if (!G.metaUnlocks[id]) {
    G.metaUnlocks[id] = true; saveMetaUnlocks();
    showToast(`Meta-achievement unlocked: ${id}`, 'note');
    emit('metaUnlocked', id);
  }
}
export function hasMeta(id) { return !!G.metaUnlocks[id]; }

export function logChoice(choice, sceneId) {
  G._analyticsLog.push({ timestamp: Date.now(), scene: sceneId, choiceText: choice.text, next: choice.next, playCount: G.playCount });
  if (G._analyticsLog.length > 200) G._analyticsLog.shift();
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(G._analyticsLog)); } catch (e) {}
}
export function exportAnalytics() {
  const blob = new Blob([JSON.stringify(G._analyticsLog, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `analytics_${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
