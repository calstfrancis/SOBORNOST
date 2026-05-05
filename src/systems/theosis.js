// ── SOBORNOST ENGINE — systems/theosis.js ─────────────────────

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { refreshAtmosMods, atmosMods } from './atmosphere.js';
import { scheduleRender } from './schedule.js';
// Upgrade 4: journal threshold checking
import { checkJournalThresholds } from './journal.js';

export const LITURGICAL_HOURS = [
  {name:'Lauds',   mood:'neutral',    timeDesc:'dawn'},
  {name:'Prime',   mood:'neutral',    timeDesc:'early morning'},
  {name:'Terce',   mood:'neutral',    timeDesc:'mid-morning'},
  {name:'Sext',    mood:'tense',      timeDesc:'noon'},
  {name:'None',    mood:'uncanny',    timeDesc:'afternoon'},
  {name:'Vespers', mood:'revelation', timeDesc:'evening'},
  {name:'Compline',mood:'uncanny',    timeDesc:'night'},
];

export function setLiturgicalHour(n) {
  G.liturgicalHour = Math.max(0, Math.min(LITURGICAL_HOURS.length - 1, Math.round(n)));
  emit('liturgicalHourChanged', G.liturgicalHour);
}

let _theosisTiers = [
  {max:32,  word:'icon', wordPlural:'icons', cyrillic:null},
  {max:65,  word:'ikon', wordPlural:'ikons', cyrillic:null},
  {max:100, word:'\u0418\u043a\u043e\u043d', wordPlural:'\u0418\u043a\u043e\u043d\u044b', cyrillic:'\u0418\u043a\u043e\u043d'},
];
export function setTheosisTiers(tiers) { _theosisTiers = tiers; }
export function getCurrentTier() {
  for (let i = 0; i < _theosisTiers.length; i++)
    if (G.theosis <= _theosisTiers[i].max) return _theosisTiers[i];
  return _theosisTiers[_theosisTiers.length - 1];
}
export function iconWord(plural=false) { const t=getCurrentTier(); return plural?t.wordPlural:t.word; }
export function harbourWord()       { return iconWord(); }
export function shipWord()          { return iconWord(); }
export function objectDescription() { return iconWord(); }

const _theosisTagValues = {};
export function registerTheosisTagValue(tag, value) { _theosisTagValues[tag] = value; }
export function getTheosisTagValues() { return _theosisTagValues; }

export function incrementTheosis(amount) {
  if (amount === 0) return;
  const oldValue = G.theosis;
  G.theosis = Math.min(Math.max(G.theosis + amount, 0), 100);
  refreshAtmosMods();
  // Upgrade 4: check journal thresholds on every theosis change
  checkJournalThresholds(G.theosis, oldValue);
  emit('theosisChanged', G.theosis);
}

export function flashTheosisLight(intensity=1.0, duration=2000) {
  if (G._theosisFlashTimer) clearTimeout(G._theosisFlashTimer);
  atmosMods.goldIntensity = Math.max(atmosMods.goldIntensity, intensity * 0.9);
  atmosMods.goldGlow = true;
  scheduleRender();
  G._theosisFlashTimer = setTimeout(() => {
    refreshAtmosMods(); scheduleRender(); G._theosisFlashTimer = null;
  }, duration);
}

const _nameMappings = {};
export function registerNameMapping(original, tier1, tier2, cyrillic) {
  _nameMappings[original] = { tier1, tier2, cyrillic };
}
function _escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function applyNameMapping(text) {
  if (!text) return text;
  const tier = getCurrentTier(); let result = text;
  for (const [original, mapping] of Object.entries(_nameMappings)) {
    let replacement = original;
    if      (tier.max <= 32)  replacement = original;
    else if (tier.max <= 65)  replacement = mapping.tier1  || original;
    else if (tier.max <= 100) replacement = mapping.tier2  || mapping.tier1 || original;
    if (mapping.cyrillic && tier.max >= 66) replacement = mapping.cyrillic;
    if (replacement !== original)
      result = result.replace(new RegExp(_escapeRe(original), 'g'), replacement);
  }
  return result;
}
