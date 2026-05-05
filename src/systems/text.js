// ── SOBORNOST ENGINE — systems/text.js ────────────────────────
// Upgrades 3 + 8: Passage System and Weighted Random Text Lines.
//
// Scene text arrays may now contain passage objects alongside plain strings.
// All passage objects are resolved to strings before the renderer sees them.
// The renderer always receives a flat string[].
//
// ── Passage shapes ────────────────────────────────────────────
//
//   Plain string (unchanged):
//     'The fog is heavy.'
//
//   Conditional (Upgrade 3):
//     { if: 'flag_id',          text: 'Shown when flag is set.' }
//     { if_not: 'flag_id',      text: 'Shown when flag is absent.' }
//     { if_stat: ['stat', min], text: 'Shown when stat >= min.' }
//     { if_charism: 'id',       text: 'Shown when player has charism.' }
//     { if_awareness: 2,        text: 'Shown when awareness >= 2.' }
//     { if_theosis: 33,         text: 'Shown when theosis >= 33.' }
//     { if_belief: 'id',        text: 'Shown when player believes id.' }
//     { if_knowledge: 'id',     text: 'Shown when player knows id.' }
//     { if_playcount: 2,        text: 'Shown from crossing 2 onward.' }
//
//   Optional else branch on any conditional:
//     { if: 'flag_id', text: 'Set.', else: 'Not set.' }
//
//   The `text` value inside a passage may be a string or string[]:
//     { if: 'flag_id', text: ['Line one.', 'Line two.'] }
//
//   Random text (Upgrade 8):
//     { random: ['Line A.', 'Line B.', 'Line C.'] }
//     { random: [{ text: 'Rare.', weight: 1 }, { text: 'Common.', weight: 4 }] }
//
//   Conditional + random combined:
//     { if: 'met_ferryman', random: ['He nods.', 'He watches.', 'He waits.'] }
//
//   Random lines are re-picked on every render. This is intentional for hub
//   scenes visited repeatedly. Use plain strings where consistency matters.

import { G } from '../core/state.js';
import { iconWord, applyNameMapping } from './theosis.js';

// ── Internal helpers ──────────────────────────────────────────

function _conditionPasses(item) {
  if (item.if           !== undefined && !G.flags.has(item.if))                            return false;
  if (item.if_not       !== undefined &&  G.flags.has(item.if_not))                        return false;
  if (item.if_stat      !== undefined && (G.stats[item.if_stat[0]] || 0) < item.if_stat[1]) return false;
  if (item.if_charism   !== undefined && !G.charisms.includes(item.if_charism))             return false;
  if (item.if_awareness !== undefined && (G.awareness || 0) < item.if_awareness)            return false;
  if (item.if_theosis   !== undefined && G.theosis < item.if_theosis)                       return false;
  if (item.if_belief    !== undefined && !G.beliefs.has(item.if_belief))                    return false;
  if (item.if_knowledge !== undefined && !G.knowledge.has(item.if_knowledge))               return false;
  if (item.if_playcount !== undefined && G.playCount < item.if_playcount)                   return false;
  return true;
}

const _CONDITION_KEYS = new Set([
  'if','if_not','if_stat','if_charism','if_awareness',
  'if_theosis','if_belief','if_knowledge','if_playcount',
]);
function _hasConditionKey(item) {
  return Object.keys(item).some(k => _CONDITION_KEYS.has(k));
}

function _pickRandom(options) {
  const pool = options.map(o =>
    typeof o === 'string' ? { text: o, weight: 1 } : { text: o.text, weight: o.weight || 1 }
  );
  const total = pool.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of pool) { if (r < o.weight) return o.text; r -= o.weight; }
  return pool[pool.length - 1].text;
}

function _resolveTextValue(val) {
  // Turns the `text:` value of a passage into string[].
  if (typeof val === 'string')   return [val];
  if (typeof val === 'function') { const r = val(G); return typeof r === 'string' ? [r] : (r || []); }
  if (Array.isArray(val))        return val.filter(v => typeof v === 'string');
  return [];
}

function _resolvePassage(item) {
  // Resolves one item from a text array into string[] (may be empty).
  if (typeof item === 'string')   return [item];
  if (typeof item === 'function') { const r = item(G); return typeof r === 'string' ? [r] : (r || []); }
  if (typeof item !== 'object' || item === null) return [];

  const hasCondition = _hasConditionKey(item);

  if (hasCondition && !_conditionPasses(item)) {
    // Condition failed — use else branch if provided
    return item.else !== undefined ? _resolveTextValue(item.else) : [];
  }

  // Condition passed (or unconditional)
  if (item.random !== undefined) return [_pickRandom(item.random)];
  if (item.text   !== undefined) return _resolveTextValue(item.text);
  return [];
}

// ── Public API ────────────────────────────────────────────────

export function resolveTextBlock(textBlock) {
  if (typeof textBlock === 'function') textBlock = textBlock(G);
  // Awareness-keyed object: { 0: [...], 3: [...] }
  if (typeof textBlock === 'object' && !Array.isArray(textBlock) && textBlock !== null) {
    const a = G.awareness || 0;
    let best = 0;
    for (const k in textBlock) {
      const n = parseInt(k);
      if (!isNaN(n) && n <= a && n >= best) best = n;
    }
    textBlock = textBlock[best] || textBlock[0] || [];
  }
  const raw = Array.isArray(textBlock) ? [...textBlock] : [textBlock];
  // Resolve all passage objects → flat string[]
  return raw.flatMap(item => _resolvePassage(item));
}

export function getSceneText(scene)       { return resolveTextBlock(scene.text); }
export function resolveLayeredText(scene) { return getSceneText(scene); }

// ── Extension hooks — no-ops by default ───────────────────────
export function injectMicroLines(a, _s)    { return a; }
export function applyLinguisticToggle(t)   { return t; }
export function applyPostEventShifts(t)    { return t; }
export function applyPastLifeLines(a, _id) { return a; }
export function injectGhostText(t, _id)    { return t; }

// ── String processing ─────────────────────────────────────────
export function processText(raw) {
  if (typeof raw === 'function') raw = raw(G);
  if (typeof raw !== 'string')   return '';
  return applyNameMapping(raw.replace(/\{ICON\}/g, iconWord()));
}
