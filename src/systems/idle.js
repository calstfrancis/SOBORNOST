// ── SOBORNOST ENGINE — systems/idle.js ────────────────────────
// Rumination engine: fires a context-sensitive toast after inactivity.
// FIX (Issue 13): only runs when G.phase === 'game'.

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { showToast } from './mechanics.js';
import { getScene } from './registries.js';

let _idleTimer = null;

export function startIdleTimer() {
  clearIdleTimer();
  // FIX: bail out immediately if we're not in the game phase
  if (G.phase !== 'game') return;
  _idleTimer = setTimeout(() => {
    if (G.phase !== 'game') return; // double-check in case phase changed
    const scene = getScene(G.scene);
    if (scene && (!scene.choices || scene.choices.length === 0) && !G.pendingRoll) {
      const doubt = G.stats.doubt || 0;
      let rumination = '';
      if      (doubt >= 4) rumination = 'What if I am not supposed to be here?';
      else if (doubt >= 2) rumination = 'The silence is heavy.';
      else                 rumination = 'I wonder what time it is.';
      showToast(rumination, 'note');
      emit('rumination', doubt);
    }
    startIdleTimer(); // reschedule only while in game
  }, 10000);
}

export function resetIdleTimer() {
  if (G.phase !== 'game') { clearIdleTimer(); return; }
  clearIdleTimer();
  startIdleTimer();
}

export function clearIdleTimer() {
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
}
