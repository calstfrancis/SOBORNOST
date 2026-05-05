// ── SOBORNOST ENGINE — systems/journal.js ─────────────────────
// Upgrade 4: Theosis Reflection Journal.
//
// Automatically records an entry at each registered theosis threshold
// and at each crossing boundary (newPlay). Entries are persisted to
// localStorage alongside save data and displayed in a new journal panel.
//
// ── Authoring ─────────────────────────────────────────────────
//
//   SOBORNOST.registerJournalEntry(33, 'The first fissure of light.');
//   SOBORNOST.registerJournalEntry(66, 'The word begins to change.');
//   SOBORNOST.registerJournalEntry(100, 'Nothing remains but the crossing itself.');
//
// Entries fire once per threshold per play (tracked by flag). If the
// author does not register an entry for a threshold, a default line
// is generated from the theosis value.
//
// ── Journal entry shape ───────────────────────────────────────
//   {
//     timestamp:  number,   // Date.now()
//     crossing:   number,   // G.playCount at time of entry
//     scene:      string,   // G.scene at time of entry
//     theosis:    number,   // G.theosis at time of entry
//     hour:       number,   // G.liturgicalHour at time of entry
//     type:       'threshold' | 'crossing' | 'authored',
//     text:       string,
//   }

import { G } from '../core/state.js';
import { on } from '../core/events.js';
import { LITURGICAL_HOURS } from './theosis.js';

// ── Registered threshold entries ──────────────────────────────
// Map<threshold:number, text:string>
const _thresholdEntries = new Map();

export function registerJournalEntry(threshold, text) {
  if (typeof threshold !== 'number' || !text) {
    console.error('[SOBORNOST] registerJournalEntry(threshold, text) — both arguments required');
    return;
  }
  _thresholdEntries.set(threshold, text);
}

// ── Writing entries ───────────────────────────────────────────

export function addJournalEntry(entry) {
  G.journal.push({
    timestamp:  Date.now(),
    crossing:   G.playCount,
    scene:      G.scene,
    theosis:    G.theosis,
    hour:       G.liturgicalHour,
    ...entry,
  });
  // Cap at 200 entries — oldest drop off first
  if (G.journal.length > 200) G.journal.shift();
}

// Called by the theosis system on every theosis change
export function checkJournalThresholds(newValue, oldValue) {
  for (const [threshold, text] of _thresholdEntries) {
    if (oldValue < threshold && newValue >= threshold) {
      const flagKey = `__journal_threshold_${threshold}_c${G.playCount}`;
      if (!G.flags.has(flagKey)) {
        G.flags.add(flagKey);
        addJournalEntry({ type: 'threshold', text });
      }
    }
  }
  // Automatic entry if no authored text registered for any threshold just crossed
  const crossedThresholds = [33, 66, 100].filter(
    t => oldValue < t && newValue >= t && !_thresholdEntries.has(t)
  );
  crossedThresholds.forEach(t => {
    const flagKey = `__journal_auto_${t}_c${G.playCount}`;
    if (!G.flags.has(flagKey)) {
      G.flags.add(flagKey);
      const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name || 'the hour';
      addJournalEntry({
        type: 'threshold',
        text: `Theosis ${t}. ${hourName}.`,
      });
    }
  });
}

// Called by newPlay() to mark crossing boundaries
export function addCrossingEntry() {
  const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name || '';
  addJournalEntry({
    type: 'crossing',
    text: `Crossing ${G.playCount} concluded. Theosis: ${G.theosis}.${hourName ? ' ' + hourName + '.' : ''}`,
  });
}

// ── Persistence helpers (called by save.js) ───────────────────
export const JOURNAL_KEY = 'sobornost_journal';

export function saveJournal() {
  try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(G.journal)); } catch (e) {}
}

export function loadJournal() {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw) G.journal = JSON.parse(raw);
  } catch (e) { G.journal = []; }
}

// ── Journal panel renderer ────────────────────────────────────

export function renderJournalPanel(root, openPanelFn) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) openPanelFn(null); };

  const panel = document.createElement('div');
  panel.className = 'panel';

  const hdr = document.createElement('div'); hdr.className = 'panel-header';
  const title = document.createElement('div'); title.className = 'panel-title';
  title.textContent = 'the journal';
  const close = document.createElement('button'); close.className = 'panel-close';
  close.textContent = '\u00d7'; close.onclick = () => openPanelFn(null);
  hdr.appendChild(title); hdr.appendChild(close); panel.appendChild(hdr);

  const body = document.createElement('div'); body.className = 'panel-body';

  if (!G.journal.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:var(--dim);font-size:.75rem;font-style:italic;padding:.5rem 0';
    empty.textContent = 'The journal is empty. It fills as you cross.';
    body.appendChild(empty);
  } else {
    // Show most recent first, grouped by crossing
    const entries = [...G.journal].reverse();
    let lastCrossing = -1;

    entries.forEach(entry => {
      if (entry.crossing !== lastCrossing) {
        lastCrossing = entry.crossing;
        const ch = document.createElement('div');
        ch.style.cssText = 'font-size:.6rem;color:var(--amber-dim);letter-spacing:.15em;text-transform:uppercase;margin:1rem 0 .4rem;border-top:1px solid var(--border);padding-top:.6rem';
        ch.textContent = entry.crossing === 0 ? 'First crossing' : `Crossing ${entry.crossing + 1}`;
        body.appendChild(ch);
      }

      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:.8rem';

      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:.6rem;color:var(--dim);letter-spacing:.08em;margin-bottom:.15rem';
      const hourName = LITURGICAL_HOURS[entry.hour]?.name || '';
      const theosisStr = entry.theosis !== undefined ? `\u25cf ${entry.theosis}` : '';
      meta.textContent = [hourName, theosisStr].filter(Boolean).join('  ');

      const text = document.createElement('p');
      text.style.cssText = 'font-size:.78rem;color:var(--fg);line-height:1.5;margin:0';
      text.textContent = entry.text;

      row.appendChild(meta); row.appendChild(text); body.appendChild(row);
    });
  }

  panel.appendChild(body); overlay.appendChild(panel); root.appendChild(overlay);
}
