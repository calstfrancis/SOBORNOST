// ── SOBORNOST ENGINE — systems/journal.js ─────────────────────
// Upgrade 4: Theosis Reflection Journal.
//
// Bug 7 fix: journal is now stored per save-slot rather than under a
// global key. saveJournal(slotId) and loadJournal(slotId) receive the
// slot identifier from save.js. Two different slots no longer share or
// overwrite each other's journal history.

import { G } from '../core/state.js';
import { LITURGICAL_HOURS } from './theosis.js';

const JOURNAL_KEY_PREFIX = 'sobornost_journal_';

// ── Registered threshold entries ──────────────────────────────
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
  if (G.journal.length > 200) G.journal.shift();
}

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
  const autoThresholds = [33, 66, 100].filter(
    t => oldValue < t && newValue >= t && !_thresholdEntries.has(t)
  );
  autoThresholds.forEach(t => {
    const flagKey = `__journal_auto_${t}_c${G.playCount}`;
    if (!G.flags.has(flagKey)) {
      G.flags.add(flagKey);
      const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name || 'the hour';
      addJournalEntry({ type: 'threshold', text: `Theosis ${t}. ${hourName}.` });
    }
  });
}

export function addCrossingEntry() {
  const hourName = LITURGICAL_HOURS[G.liturgicalHour]?.name || '';
  addJournalEntry({
    type: 'crossing',
    text: `Crossing ${G.playCount} concluded. Theosis: ${G.theosis}.${hourName ? ' ' + hourName + '.' : ''}`,
  });
}

// ── Persistence ───────────────────────────────────────────────
// Bug 7 fix: accept slotId so each slot has its own journal key.
export function saveJournal(slotId) {
  try { localStorage.setItem(JOURNAL_KEY_PREFIX + slotId, JSON.stringify(G.journal)); } catch (e) {}
}

export function loadJournal(slotId) {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY_PREFIX + slotId);
    if (raw) G.journal = JSON.parse(raw);
    else     G.journal = [];
  } catch (e) { G.journal = []; }
}

// ── Journal panel renderer ────────────────────────────────────
export function renderJournalPanel(root, openPanelFn) {
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) openPanelFn(null); };

  const panel = document.createElement('div'); panel.className = 'panel';

  const hdr   = document.createElement('div'); hdr.className   = 'panel-header';
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
      const row  = document.createElement('div'); row.style.cssText  = 'margin-bottom:.8rem';
      const meta = document.createElement('div'); meta.style.cssText = 'font-size:.6rem;color:var(--dim);letter-spacing:.08em;margin-bottom:.15rem';
      const hourName  = LITURGICAL_HOURS[entry.hour]?.name || '';
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
