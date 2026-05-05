// ── SOBORNOST ENGINE — systems/soundings.js ───────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { _registries } from './registries.js';
import { applyEffect, showToast } from './mechanics.js';
import { refreshAtmosMods } from './atmosphere.js';
import { scheduleRender } from './schedule.js';

export const MAX_SOUNDINGS      = 4;
export const SOUNDING_THRESHOLD = 8;

export function soundingSlotsFull() { return G.soundings.taken.length + G.soundings.settled.length >= MAX_SOUNDINGS; }

export function offerSounding(id) {
  if (!id || !_registries.soundings[id]) return;
  if (G.soundings.available.includes(id) || G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  G.soundings.available.push(id);
  showToast('Sounding: ' + _registries.soundings[id].name, 'sounding');
  emit('soundingOffered', id);
}

export function settleSounding(soundingId) {
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

export function applySoundingProgress(soundingId, delta) {
  const entry = G.soundings.taken.find(t => t.id === soundingId); if (!entry) return;
  const old = entry.progress;
  entry.progress = Math.min(Math.max(entry.progress + delta, 0), SOUNDING_THRESHOLD);
  if (entry.progress >= SOUNDING_THRESHOLD && old < SOUNDING_THRESHOLD) settleSounding(soundingId);
  if (delta !== 0) {
    showToast(`${_registries.soundings[soundingId].name}: ${delta > 0 ? '+' + delta : delta}`, 'sounding');
    emit('soundingProgress', { soundingId, progress: entry.progress, delta });
  }
}

export function applyAutoAlignment(tags) {
  if (!tags || !tags.length) return;
  for (const entry of G.soundings.taken) {
    const snd = _registries.soundings[entry.id];
    if (snd && snd.alignmentTags && snd.alignmentTags.some(tag => tags.includes(tag)))
      applySoundingProgress(entry.id, 1);
  }
}

export function takeSounding(id) {
  if (G.soundings.taken.some(t => t.id === id) || G.soundings.settled.includes(id)) return;
  if (soundingSlotsFull()) { G.soundingPending = id; G.panelOpen = 'breviary'; scheduleRender(); return; }
  G.soundings.available = G.soundings.available.filter(x => x !== id);
  G.soundings.taken.push({ id, progress: 0 }); G.soundingPending = null;
  showToast(_registries.soundings[id].name + ': taking the sounding.', 'sounding');
  emit('soundingTaken', id); scheduleRender();
}

export function suspendSounding(id) {
  if (!G.soundings.taken.find(t => t.id === id)) return;
  G.soundings.taken = G.soundings.taken.filter(t => t.id !== id);
  G.soundings.available.push(id); emit('soundingSuspended', id); scheduleRender();
}

export function releaseSounding(id) {
  G.soundings.taken = G.soundings.taken.filter(t => t.id !== id);
  if (!G.soundings.released) G.soundings.released = [];
  if (!G.soundings.released.includes(id)) G.soundings.released.push(id);
  const pending = G.soundingPending; G.soundingPending = null;
  if (pending) setTimeout(() => takeSounding(pending), 50); else scheduleRender();
  emit('soundingReleased', id);
}

export function tickSoundings() {
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

export function soundingBar(p) {
  const f = Math.round((p / SOUNDING_THRESHOLD) * 8);
  return '\u2588'.repeat(f) + '\u2591'.repeat(8 - f);
}
