// ── SOBORNOST ENGINE — systems/endings.js ─────────────────────
// Upgrade 10: Authored Ending Conditions.
//
// Endings are checked after every applyChoice() call. If one or more
// endings' conditions are met, the highest-priority one takes effect.
//
// Usage in your data file:
//
//   SOBORNOST.registerEnding({
//     id: 'dissolution',
//     condition: { type: 'stat', name: 'doubt', min: 8 },
//     scene: 'ending_dissolution',
//     priority: 10,   // optional, default 0. Higher wins.
//   });
//
//   SOBORNOST.registerEnding({
//     id: 'revelation',
//     condition: { type: 'and', conditions: [
//       { type: 'flag', id: 'visited_far_shore' },
//       { type: 'theosis', min: 66 },
//     ]},
//     scene: 'ending_revelation',
//     priority: 20,
//   });
//
// Conditions use the same evaluateCondition() schema as choice locks.
// An ending fires at most once per play (tracked via a spent flag).
// If multiple endings trigger simultaneously, the highest priority wins.
// Ties are broken by registration order (first registered wins).

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { evaluateCondition } from './conditions.js';
import { navigate } from './navigation.js';

const _endings = [];

export function registerEnding({ id, condition, scene, priority = 0 }) {
  if (!id || !scene) {
    console.error('[SOBORNOST] registerEnding() requires id and scene');
    return;
  }
  // Remove any existing ending with the same id (allows re-registration)
  const existing = _endings.findIndex(e => e.id === id);
  if (existing !== -1) _endings.splice(existing, 1);
  _endings.push({ id, condition, scene, priority });
}

/**
 * Check all registered endings. Called by applyChoice() after effects resolve.
 * Returns true if an ending fired (caller can skip further navigation).
 */
export function checkEndings() {
  if (!_endings.length) return false;

  const triggered = _endings.filter(e => {
    // Skip endings that have already fired this run
    if (G.flags.has('__ending_fired__' + e.id)) return false;
    return !e.condition || evaluateCondition(e.condition);
  });

  if (!triggered.length) return false;

  // Sort by priority descending, then by original registration order (stable)
  triggered.sort((a, b) => b.priority - a.priority);
  const winner = triggered[0];

  // Mark as fired so it cannot retrigger in the same play
  G.flags.add('__ending_fired__' + winner.id);
  emit('endingTriggered', { id: winner.id, scene: winner.scene });
  navigate(winner.scene);
  return true;
}

export function getRegisteredEndings() { return [..._endings]; }
