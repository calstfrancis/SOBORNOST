// ── SOBORNOST ENGINE — systems/cover.js ───────────────────────
// Upgrade 9: Cover Story Mini-Game.
//
// Transforms cover from a passive resource into an active tension
// mechanic. Authors register challenge prompts per cover field.
// The player can enter a cover challenge from the status panel
// to rehearse answers — risking cover on failure, holding it on success.
//
// ── Authoring ─────────────────────────────────────────────────
//
//   SOBORNOST.registerCoverChallenge('denomination', [
//     "You don't sound like one of us.",
//     "Which parish do you attend?",
//     "Where were you last Sunday?",
//   ]);
//
//   SOBORNOST.registerCoverChallenge('background', [
//     "Tell me about your family.",
//     "I don't recognise you from the diocese.",
//   ]);
//
// Fields correspond to the keys in G.cover:
//   posting, background, denomination, connection, left
//
// ── Mechanics ─────────────────────────────────────────────────
//
//   A challenge session picks one random prompt from the registered
//   list for the challenged field. The player either:
//     a) Rolls Composure against a difficulty (default 8).
//        Success: integrity holds. Partial: holds but costs 1 Composure.
//        Failure: cover degraded by 1.
//     b) Deflects (no roll, no cost — but marks field as under pressure,
//        which makes the next challenge against it harder).
//
//   G._coverChallenge tracks the active challenge:
//     { field, prompt, difficulty, pressured }
//
// ── Renderer integration ───────────────────────────────────────
//
//   The status panel renders a "challenge cover" section when cover
//   fields are set. Clicking a field sets G._coverChallenge and
//   calls scheduleRender(). renderGame() then renders the challenge
//   overlay instead of the normal scene.

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { scheduleRender } from './schedule.js';
import { showToast, degradeCover } from './mechanics.js';
import { performRoll } from './roll.js';

// ── Registry ──────────────────────────────────────────────────
const _challenges = {};   // { [field]: string[] }
const _fieldLabels = {
  posting:     'Posting',
  background:  'Background',
  denomination:'Denomination',
  connection:  'Connection',
  left:        'Left',
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

// ── Challenge lifecycle ───────────────────────────────────────

const BASE_DIFFICULTY = 8;
const PRESSURE_PENALTY = 2;   // added to difficulty when field is pressured

export function startCoverChallenge(field) {
  const prompts = _challenges[field];
  if (!prompts || !prompts.length) {
    console.warn(`[SOBORNOST] No challenges registered for field "${field}"`);
    return;
  }
  if (!G.cover[field]) {
    showToast(`Cover field "${field}" not yet established.`, 'note');
    return;
  }
  const prompt   = prompts[Math.floor(Math.random() * prompts.length)];
  const pressured = G.flags.has(`__cover_pressured_${field}`);
  const difficulty = BASE_DIFFICULTY + (pressured ? PRESSURE_PENALTY : 0);
  G._coverChallenge = { field, prompt, difficulty, pressured };
  emit('coverChallengeStarted', { field, prompt, difficulty });
  scheduleRender();
}

export function resolveCoverChallenge(action) {
  // action: 'roll' | 'deflect'
  if (!G._coverChallenge) return;
  const { field, difficulty, pressured } = G._coverChallenge;

  if (action === 'deflect') {
    // Deflecting holds cover for now but marks the field as pressured
    G.flags.add(`__cover_pressured_${field}`);
    showToast('You deflect the question. But it will come up again.', 'note');
    emit('coverChallengeDeflected', { field });
    G._coverChallenge = null;
    scheduleRender();
    return;
  }

  // Roll: Composure vs difficulty
  const result = performRoll('composure', difficulty, {});

  if (result.outcome === 'success') {
    // Clear pressure flag on success
    G.flags.delete(`__cover_pressured_${field}`);
    showToast(`Cover holds. ${_fieldLabels[field] || field} is secure.`, 'note');
    emit('coverChallengeSuccess', { field, result });
  } else if (result.outcome === 'partial') {
    // Partial: holds but costs Composure
    G.stats.composure = Math.max(0, (G.stats.composure || 0) - 1);
    showToast(`You hold — barely. ${_fieldLabels[field] || field} costs you.`, 'note');
    emit('coverChallengePartial', { field, result });
  } else {
    // Failure: integrity degrades
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
  const label = _fieldLabels[field] || field;
  const coverValue = G.cover[field];

  const overlay = document.createElement('div');
  overlay.className = 'cover-challenge-overlay';

  const box = document.createElement('div'); box.className = 'cover-challenge-box';

  // Header
  const hdr = document.createElement('div'); hdr.className = 'cover-challenge-header';
  hdr.textContent = `Cover questioned — ${label}`;
  box.appendChild(hdr);

  // Cover value reminder
  if (coverValue) {
    const cv = document.createElement('div'); cv.className = 'cover-challenge-value';
    cv.textContent = `Your stated ${label.toLowerCase()}: ${coverValue}`;
    box.appendChild(cv);
  }

  // Pressure note
  if (pressured) {
    const pn = document.createElement('div'); pn.className = 'cover-challenge-pressure';
    pn.textContent = `\u26a0 This field is under pressure. Difficulty increased.`;
    box.appendChild(pn);
  }

  // The prompt
  const promptEl = document.createElement('p'); promptEl.className = 'cover-challenge-prompt sp';
  promptEl.textContent = `\u201c${prompt}\u201d`;
  box.appendChild(promptEl);

  // Difficulty and stat
  const diffEl = document.createElement('div'); diffEl.className = 'cover-challenge-diff';
  const composure = G.stats.composure || 0;
  diffEl.textContent = `Composure roll vs difficulty ${difficulty} (your Composure: ${composure})`;
  box.appendChild(diffEl);

  if (!resolved) {
    // Actions
    const actions = document.createElement('div'); actions.className = 'cover-challenge-actions';

    const rollBtn = document.createElement('button'); rollBtn.className = 'btn btn-pri';
    rollBtn.textContent = 'Hold your cover (Composure roll)';
    rollBtn.onclick = () => resolveCoverChallenge('roll');
    actions.appendChild(rollBtn);

    const deflectBtn = document.createElement('button'); deflectBtn.className = 'btn';
    deflectBtn.textContent = 'Deflect — change the subject';
    deflectBtn.onclick = () => resolveCoverChallenge('deflect');
    actions.appendChild(deflectBtn);

    box.appendChild(actions);
  } else if (result) {
    // Show roll result
    const res = document.createElement('div');
    res.className = `cover-challenge-result ${result.outcome === 'success' ? 'roll-success' : result.outcome === 'partial' ? 'roll-partial' : 'roll-fail'}`;
    res.textContent = `[${result.d1}]+[${result.d2}]=${result.roll}+${result.statValue}=${result.total} — ${result.outcome.toUpperCase()}`;
    box.appendChild(res);

    const cont = document.createElement('button'); cont.className = 'btn';
    cont.textContent = 'Continue'; cont.onclick = dismissCoverChallenge;
    box.appendChild(cont);
  }

  overlay.appendChild(box);
  root.appendChild(overlay);
  return true;
}
