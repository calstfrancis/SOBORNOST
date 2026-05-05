// ── SOBORNOST ENGINE — systems/history.js ─────────────────────
// Snapshot-based undo/redo. Sets serialised via custom replacer/reviver.

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { debugLog } from '../core/debug.js';
import { scheduleRender } from './schedule.js';

const HISTORY_MAX = 50;
let _history = [], _historyIndex = -1;

function _serialise(state) {
  return JSON.stringify(state, (_k, v) => v instanceof Set ? { __set__: [...v] } : v);
}
function _deserialise(json) {
  return JSON.parse(json, (_k, v) => (v && typeof v === 'object' && Array.isArray(v.__set__)) ? new Set(v.__set__) : v);
}

export function _captureSnapshot() {
  const snap = _serialise(G);
  if (!_history.length) { _history.push(snap); _historyIndex = 0; debugLog('Snapshot (initial)'); return; }
  if (_history[_historyIndex] === snap) return;
  _history = _history.slice(0, _historyIndex + 1);
  _history.push(snap);
  if (_history.length > HISTORY_MAX) _history.shift(); else _historyIndex++;
  debugLog('Snapshot captured, depth:', _history.length);
}

export function undo() {
  if (_historyIndex <= 0) return false;
  _historyIndex--;
  Object.assign(G, _deserialise(_history[_historyIndex]));
  scheduleRender(); emit('undo'); return true;
}

export function redo() {
  if (_historyIndex >= _history.length - 1) return false;
  _historyIndex++;
  Object.assign(G, _deserialise(_history[_historyIndex]));
  scheduleRender(); emit('redo'); return true;
}
