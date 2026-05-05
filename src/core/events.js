// ── SOBORNOST ENGINE — core/events.js ─────────────────────────
// Minimal pub/sub event bus.
// Upgrade 7: emit() forwards events to the typed event log.
// The import is lazy (dynamic) to break the circular dependency:
//   events ← eventlog ← G ← state (state doesn't import events)
// We import eventlog once on first emit, then cache the reference.

import { debugLog } from './debug.js';

const _bus = {};
let _recordEvent = null;  // resolved once on first emit

async function _loadRecorder() {
  if (_recordEvent) return;
  try {
    const m = await import('../systems/eventlog.js');
    _recordEvent = m.recordEvent;
  } catch { _recordEvent = () => {}; }
}
// Kick off the import immediately so it's ready before the first emit
_loadRecorder();

export function on(event, callback) {
  if (!_bus[event]) _bus[event] = [];
  _bus[event].push(callback);
}

export function off(event, callback) {
  if (!_bus[event]) return;
  _bus[event] = _bus[event].filter(cb => cb !== callback);
}

export function emit(event, data) {
  // Notify event log (synchronous once _recordEvent is resolved)
  if (_recordEvent) _recordEvent(event, data);
  if (!_bus[event]) { debugLog('emit (no listeners):', event, data); return; }
  _bus[event].forEach(cb => cb(data));
  debugLog('emit:', event, data);
}
