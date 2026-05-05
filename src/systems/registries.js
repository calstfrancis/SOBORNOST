// ── SOBORNOST ENGINE — systems/registries.js ──────────────────

export const _registries = {
  charisms: { sleeping: [], waking: [] },
  soundings: {}, notes: {}, art: {}, glossary: [], statTips: {},
  iconWordFn: null, harbourWordFn: null, shipWordFn: null, objectDescriptionFn: null,
  rollModifiers: [], availableModes: ['attended', 'open', 'witnessed'],
  scenePools: {}, rituals: {}, translations: {}, postEventShifts: [], pastLifeLines: {},
  sfxLibrary: {}, mapNodes: {}, items: {}, tutorialContent: null,
  scenes: {},
  sceneNotFound: (sceneId, root) => {
    console.error(`[SOBORNOST] Scene not found: "${sceneId}"`);
    const p = document.createElement('p');
    p.style.cssText = 'padding:2rem;color:var(--rust,#c06060);font-family:monospace;font-size:.9rem;';
    p.textContent = `Scene not found: "${sceneId}" — check registerScenes() call`;
    root.appendChild(p);
  },
};

// ── Initial scene ─────────────────────────────────────────────
let _initialScene = null;
export function setInitialScene(sceneId) {
  if (!sceneId || typeof sceneId !== 'string') {
    console.error('[SOBORNOST] setInitialScene() requires a non-empty scene ID string'); return;
  }
  _initialScene = sceneId;
}
export function getInitialScene() { return _initialScene; }

// ── Scenes ────────────────────────────────────────────────────
export function registerScenes(obj)          { Object.assign(_registries.scenes, obj); }
export function getScene(id)                 { return _registries.scenes[id] ?? null; }
export function setSceneNotFoundHandler(fn)  { _registries.sceneNotFound = fn; }

// ── Charisms ──────────────────────────────────────────────────
export function registerCharisms(sleepingList, wakingList) {
  if (sleepingList) _registries.charisms.sleeping = sleepingList;
  if (wakingList)   _registries.charisms.waking   = wakingList;
}
export function allCharisms() {
  return [..._registries.charisms.sleeping, ..._registries.charisms.waking];
}
export function findCharism(id) { return allCharisms().find(c => c.id === id); }

// ── Soundings / Notes / Art / Glossary ───────────────────────
export function registerSounding(id, data)       { _registries.soundings[id] = data; }
export function registerNote(key, value)          { _registries.notes[key] = value; }
export function registerArt(id, ascii)            { _registries.art[id] = ascii; }
export function registerGlossaryEntry(term, def)  { _registries.glossary.push({ term, def }); }
export function registerStatTip(stat, tip)        { _registries.statTips[stat] = tip; }
export function noteLabel(k) {
  const n = _registries.notes[k]; if (!n) return k;
  return typeof n === 'function' ? n() : n;
}

// ── Word / description overrides ──────────────────────────────
export function setIconWordFunction(fn)          { _registries.iconWordFn = fn; }
export function setHarbourWordFunction(fn)       { _registries.harbourWordFn = fn; }
export function setShipWordFunction(fn)          { _registries.shipWordFn = fn; }
export function setObjectDescriptionFunction(fn) { _registries.objectDescriptionFn = fn; }

// ── Roll modifiers ────────────────────────────────────────────
export function registerRollModifier(statKey, condition, bonusCallback) {
  _registries.rollModifiers.push({ statKey, condition, bonusCallback });
}

// ── Mode, pools, rituals ──────────────────────────────────────
export function setAvailableModes(modeArray) { _registries.availableModes = modeArray; }
export function registerScenePool(poolId, entries) { _registries.scenePools[poolId] = entries; }
export function addToScenePool(poolId, entry) {
  if (!_registries.scenePools[poolId]) _registries.scenePools[poolId] = [];
  _registries.scenePools[poolId].push(entry);
}
export function registerRitual(ritual) { _registries.rituals[ritual.id] = ritual; }

// ── Translations / post-event / past-life ─────────────────────
export function registerTranslation(original, translated) { _registries.translations[original] = translated; }
export function registerPostEventShift(triggerFlag, patterns) { _registries.postEventShifts.push({ triggerFlag, patterns }); }
export function registerPastLifeLine(sceneId, pattern, replacement, index) {
  if (!_registries.pastLifeLines[sceneId]) _registries.pastLifeLines[sceneId] = [];
  _registries.pastLifeLines[sceneId].push({ pattern, replacement, index });
}

// ── Map / SFX / Items / Tutorial ─────────────────────────────
export function registerMapNode(nodeId, connections) { _registries.mapNodes[nodeId] = { connections, visited: false }; }
export function registerSfx(name, playFunction)      { _registries.sfxLibrary[name] = playFunction; }
export function registerItem(id, data)                { _registries.items[id] = data; }
export function setTutorialContent(contentHtml)       { _registries.tutorialContent = contentHtml; }
