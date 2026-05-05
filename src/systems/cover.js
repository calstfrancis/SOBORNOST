// ── SOBORNOST ENGINE — systems/cover.js ───────────────────────
// Upgrade 9: Cover Story Mini-Game.

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { scheduleRender } from './schedule.js';
import { showToast, degradeCover } from './mechanics.js';
import { performRoll } from './roll.js';

const _challenges  = {};
const _fieldLabels = {
  posting:      'Posting',
  background:   'Background',
  denomination: 'Denomination',
  connection:   'Connection',
  left:         'Left',
};

export function registerCoverChallenge(field, prompts) {
  if (!Array.isArray(prompts) || !prompts.length) {
    console.error(`[SOBORNOST] registerCoverChallenge("${field}", prompts) — prompts must be a non-empty array`);
    return;
  }
  _challenges[field] = prompts;
}

export function hasCoverChallenges(field) {
  return !!(field ? _challenges[field] : Object.keys(_challenges).length);
}

export function getRegisteredChallengeFields() { return Object.keys(_challenges); }

const BASE_DIFFICULTY = 8;
const PRESSURE_PENALTY = 2;

export function startCoverChallenge(field) {
  const prompts = _challenges[field];
  if (!prompts || !prompts.length) {
    console.warn(`[SOBORNOST] No challenges registered for field "${field}"`); return;
  }
  if (!G.cover[field]) {
    showToast(`Cover field "${field}" not yet established.`, 'note'); return;
  }
  const prompt     = prompts[Math.floor(Math.random() * prompts.length)];
  const pressured  = G.flags.has(`__cover_pressured_${field}`);
  const difficulty = BASE_DIFFICULTY + (pressured ? PRESSURE_PENALTY : 0);
  G._coverChallenge = { field, prompt, difficulty, pressured };
  emit('coverChallengeStarted', { field, prompt, difficulty });
  scheduleRender();
}

export function resolveCoverChallenge(action) {
  if (!G._coverChallenge) return;
  const { field, difficulty } = G._coverChallenge;

  if (action === 'deflect') {
    G.flags.add(`__cover_pressured_${field}`);
    showToast('You deflect the question. But it will come up again.', 'note');
    emit('coverChallengeDeflected', { field });
    G._coverChallenge = null;
    scheduleRender();
    return;
  }

  const result = performRoll('composure', difficulty, {});

  if (result.outcome === 'success') {
    G.flags.delete(`__cover_pressured_${field}`);
    showToast(`Cover holds. ${_fieldLabels[field] || field} is secure.`, 'note');
    emit('coverChallengeSuccess', { field, result });
  } else if (result.outcome === 'partial') {
    const before = G.stats.composure || 0;
    G.stats.composure = Math.max(0, before - 1);
    // Bug 8 fix: emit statChanged so all stat listeners (event log, status bar) see the update
    if (G.stats.composure !== before) {
      emit('statChanged', { stat: 'composure', delta: -1 });
    }
    showToast(`You hold \u2014 barely. ${_fieldLabels[field] || field} costs you.`, 'note');
    emit('coverChallengePartial', { field, result });
  } else {
    degradeCover(1);
    G.flags.add(`__cover_pressured_${field}`);
    showToast(`Cover questioned. ${_fieldLabels[field] || field} is under suspicion.`, 'note');
    emit('coverChallengeFailure', { field, result });
  }

  G._coverChallenge = { ...G._coverChallenge, result, resolved: true };
  scheduleRender();
}

export function dismissCoverChallenge() {
  G._coverChallenge = null;
  scheduleRender();
}

// ── Cover challenge renderer ──────────────────────────────────
export function renderCoverChallengeOverlay(root, processTextFn) {
  if (!G._coverChallenge) return false;

  const { field, prompt, difficulty, pressured, result, resolved } = G._coverChallenge;
  const label      = _fieldLabels[field] || field;
  const coverValue = G.cover[field];

  const overlay = document.createElement('div'); overlay.className = 'cover-challenge-overlay';
  const box     = document.createElement('div'); box.className     = 'cover-challenge-box';

  const hdr = document.createElement('div'); hdr.className = 'cover-challenge-header';
  hdr.textContent = `Cover questioned \u2014 ${label}`;
  box.appendChild(hdr);

  if (coverValue) {
    const cv = document.createElement('div'); cv.className = 'cover-challenge-value';
    cv.textContent = `Your stated ${label.toLowerCase()}: ${coverValue}`;
    box.appendChild(cv);
  }

  if (pressured) {
    const pn = document.createElement('div'); pn.className = 'cover-challenge-pressure';
    pn.textContent = '\u26a0 This field is under pressure. Difficulty increased.';
    box.appendChild(pn);
  }

  const promptEl = document.createElement('p'); promptEl.className = 'cover-challenge-prompt sp';
  promptEl.textContent = `\u201c${prompt}\u201d`;
  box.appendChild(promptEl);

  const diffEl = document.createElement('div'); diffEl.className = 'cover-challenge-diff';
  const composure = G.stats.composure || 0;
  diffEl.textContent = `Composure roll vs difficulty ${difficulty} (your Composure: ${composure})`;
  box.appendChild(diffEl);

  if (!resolved) {
    const actions   = document.createElement('div'); actions.className = 'cover-challenge-actions';
    const rollBtn   = document.createElement('button'); rollBtn.className   = 'btn btn-pri';
    rollBtn.textContent   = 'Hold your cover (Composure roll)';
    rollBtn.onclick       = () => resolveCoverChallenge('roll');
    const deflectBtn      = document.createElement('button'); deflectBtn.className = 'btn';
    deflectBtn.textContent = 'Deflect \u2014 change the subject';
    deflectBtn.onclick     = () => resolveCoverChallenge('deflect');
    actions.appendChild(rollBtn); actions.appendChild(deflectBtn); box.appendChild(actions);
  } else if (result) {
    const res = document.createElement('div');
    res.className = `cover-challenge-result ${result.outcome === 'success' ? 'roll-success' : result.outcome === 'partial' ? 'roll-partial' : 'roll-fail'}`;
    res.textContent = `[${result.d1}]+[${result.d2}]=${result.roll}+${result.statValue}=${result.total} \u2014 ${result.outcome.toUpperCase()}`;
    box.appendChild(res);
    const cont = document.createElement('button'); cont.className = 'btn';
    cont.textContent = 'Continue'; cont.onclick = dismissCoverChallenge;
    box.appendChild(cont);
  }

  overlay.appendChild(box); root.appendChild(overlay);
  return true;
}
