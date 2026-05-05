// ── SOBORNOST ENGINE — systems/eventlog.js ────────────────────
// Upgrade 7: Typed Event Log.
//
// Records significant engine events to G.eventLog for in-session
// review. The log is intentionally in-session only — it is not
// persisted to localStorage. It resets on page reload and on newPlay().
// This is a development and play-transparency tool, not a save feature.
//
// ── Configuration ─────────────────────────────────────────────
//
//   By default, only a minimal set of event types are logged.
//   Authors can expand or narrow the set:
//
//   SOBORNOST.setLoggedEvents([
//     'flagSet', 'statChanged', 'soundingSettled',
//     'choiceApplied', 'sceneChanged', 'endingTriggered',
//   ]);
//
// ── Log entry shape ───────────────────────────────────────────
//   {
//     type:     string,   // event name from emit()
//     data:     any,      // event payload
//     scene:    string,   // G.scene at time of event
//     crossing: number,   // G.playCount
//     t:        number,   // Date.now()
//   }
//
// ── Event log panel ───────────────────────────────────────────
//   Accessible via the 'log' bottom-nav button (only visible in
//   attended or open mode — hidden in witnessed mode to keep the
//   experience clean for that mode's intended opacity).
//
// ── Programmatic access ───────────────────────────────────────
//   SOBORNOST.G.eventLog       — live array of entries
//   SOBORNOST.exportEventLog() — downloads as JSON

import { G } from '../core/state.js';

const EVENT_LOG_MAX = 150;

// Default logged event types — author-configurable via setLoggedEvents()
let _loggedEvents = new Set([
  'flagSet',
  'statChanged',
  'soundingSettled',
  'soundingTaken',
  'choiceApplied',
  'sceneChanged',
  'endingTriggered',
  'theosisChanged',
  'metaUnlocked',
  'companionAdded',
  'companionRemoved',
  'itemAdded',
  'itemRemoved',
]);

export function setLoggedEvents(eventTypeArray) {
  _loggedEvents = new Set(eventTypeArray);
}

export function getLoggedEvents() { return [..._loggedEvents]; }

export function addLoggedEvent(type) { _loggedEvents.add(type); }
export function removeLoggedEvent(type) { _loggedEvents.delete(type); }

/**
 * Called from emit() in events.js for every event. Appends to G.eventLog
 * if the event type is in the logged set.
 */
export function recordEvent(type, data) {
  if (!_loggedEvents.has(type)) return;
  G.eventLog.push({ type, data, scene: G.scene, crossing: G.playCount, t: Date.now() });
  if (G.eventLog.length > EVENT_LOG_MAX) G.eventLog.shift();
}

export function clearEventLog() { G.eventLog = []; }

export function exportEventLog() {
  const blob = new Blob([JSON.stringify(G.eventLog, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eventlog_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Event log panel renderer ──────────────────────────────────
const TYPE_COLOUR = {
  flagSet:         'var(--dim)',
  statChanged:     'var(--amber)',
  soundingSettled: 'var(--cold)',
  soundingTaken:   'var(--cold-dim)',
  choiceApplied:   'var(--fg)',
  sceneChanged:    'var(--amber-dim)',
  endingTriggered: 'var(--rust)',
  theosisChanged:  'var(--amber)',
  metaUnlocked:    'var(--cold)',
};

function _typeColour(type) { return TYPE_COLOUR[type] || 'var(--dim)'; }

function _summarise(type, data) {
  if (!data) return '';
  switch (type) {
    case 'flagSet':        return `"${data}"`;
    case 'statChanged':    return `${data.stat} ${data.delta > 0 ? '+' : ''}${data.delta}`;
    case 'sceneChanged':   return `→ ${data}`;
    case 'choiceApplied':  return data.text ? `"${String(data.text).slice(0, 40)}"` : '';
    case 'endingTriggered':return `${data.id} → ${data.scene}`;
    case 'theosisChanged': return `${data}`;
    case 'soundingSettled':return `${data}`;
    case 'soundingTaken':  return `${data}`;
    case 'metaUnlocked':   return `${data}`;
    case 'itemAdded':      return `+ ${data}`;
    case 'itemRemoved':    return `- ${data}`;
    case 'companionAdded': return `+ ${data}`;
    default: return typeof data === 'string' ? data : JSON.stringify(data).slice(0, 60);
  }
}

export function renderEventLogPanel(root, openPanelFn) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) openPanelFn(null); };

  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const title = document.createElement('div'); title.className = 'panel-title';
  title.textContent = 'event log';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-sm';
  exportBtn.style.cssText = 'font-size:.58rem;padding:.1rem .4rem;margin-right:.4rem';
  exportBtn.textContent = 'export';
  exportBtn.onclick = exportEventLog;
  const close = document.createElement('button'); close.className = 'panel-close';
  close.textContent = '\u00d7'; close.onclick = () => openPanelFn(null);
  hdr.appendChild(title); hdr.appendChild(exportBtn); hdr.appendChild(close);
  panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';
  body.style.fontFamily = "'Courier Prime', monospace";

  if (!G.eventLog.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:var(--dim);font-size:.7rem;font-style:italic';
    empty.textContent = 'No events logged yet.';
    body.appendChild(empty);
  } else {
    [...G.eventLog].reverse().forEach(entry => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:.5rem;align-items:baseline;margin-bottom:.25rem;font-size:.65rem;line-height:1.3';

      const typeEl = document.createElement('span');
      typeEl.style.cssText = `color:${_typeColour(entry.type)};min-width:8rem;flex-shrink:0`;
      typeEl.textContent = entry.type;

      const dataEl = document.createElement('span');
      dataEl.style.cssText = 'color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      dataEl.textContent = _summarise(entry.type, entry.data);

      const sceneEl = document.createElement('span');
      sceneEl.style.cssText = 'color:var(--border-mid);font-size:.58rem;margin-left:auto;flex-shrink:0';
      sceneEl.textContent = entry.scene || '';

      row.appendChild(typeEl); row.appendChild(dataEl); row.appendChild(sceneEl);
      body.appendChild(row);
    });
  }

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}
