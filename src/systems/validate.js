// ── SOBORNOST ENGINE — systems/validate.js ────────────────────
// Upgrade 2: Scene Validation Pass.
//
// Call SOBORNOST.validate() at the end of your data file during
// development. It walks every registered scene and reports problems
// to the console before the player ever sees them.
//
// Returns an array of { severity, scene, message } objects.
// severity is 'error' (broken link, crash-likely) or 'warning'
// (suspicious but not necessarily wrong).
//
// Example:
//   const issues = SOBORNOST.validate();
//   // Issues are also logged to the console automatically.
//
// Wrap in a debug guard for production:
//   if (DEBUG) SOBORNOST.validate();

import { G } from '../core/state.js';
import { _registries, allCharisms, getScene, getInitialScene } from './registries.js';
import { getRegisteredEndings } from './endings.js';

// ── Helpers ───────────────────────────────────────────────────

const _VALID_STATS = () => new Set(Object.keys(G.stats));
const _SPECIAL_NEXTS = new Set(['__new_play__']);
const _CONDITION_STAT_TYPES = new Set(['stat']);

function _isValidScene(id) {
  return id === null || id === undefined || _SPECIAL_NEXTS.has(id) || !!getScene(id);
}

function _checkCondition(cond, sceneId, where, issues) {
  if (!cond) return;
  const stats = _VALID_STATS();
  if (cond.type === 'stat' && !stats.has(cond.name)) {
    issues.push({ severity: 'error', scene: sceneId, message: `${where}: condition references unknown stat "${cond.name}"` });
  }
  if (cond.type === 'charism') {
    const ids = allCharisms().map(c => c.id);
    if (!ids.includes(cond.id)) issues.push({ severity: 'warning', scene: sceneId, message: `${where}: condition references unknown charism "${cond.id}"` });
  }
  // Recurse into compound conditions
  if (cond.conditions) cond.conditions.forEach(c => _checkCondition(c, sceneId, where, issues));
  if (cond.condition)  _checkCondition(cond.condition, sceneId, where, issues);
}

function _checkChoice(ch, sceneId, issues, charismIds, soundingIds, stats, prefix = 'choice') {
  // next must be a registered scene or a known special value
  if (ch.next !== undefined && !_isValidScene(ch.next)) {
    issues.push({ severity: 'error', scene: sceneId, message: `${prefix}: next "${ch.next}" is not a registered scene` });
  }

  // requires_charism
  if (ch.requires_charism && !charismIds.includes(ch.requires_charism)) {
    issues.push({ severity: 'warning', scene: sceneId, message: `${prefix}: requires_charism "${ch.requires_charism}" is not a registered charism` });
  }

  // requires_stat
  if (ch.requires_stat) {
    const [statName] = ch.requires_stat;
    if (!stats.has(statName)) issues.push({ severity: 'error', scene: sceneId, message: `${prefix}: requires_stat references unknown stat "${statName}"` });
  }

  // thought (sounding offer)
  if (ch.thought && !soundingIds.has(ch.thought)) {
    issues.push({ severity: 'warning', scene: sceneId, message: `${prefix}: thought "${ch.thought}" is not a registered sounding` });
  }

  // effect keys
  if (ch.effect) {
    for (const key of Object.keys(ch.effect)) {
      if (!stats.has(key)) issues.push({ severity: 'error', scene: sceneId, message: `${prefix}: effect key "${key}" is not a valid stat` });
    }
  }

  // condition
  if (ch.condition) _checkCondition(ch.condition, sceneId, prefix, issues);

  // Dialogue — check nested choices and nexts
  if (ch.dialogue && Array.isArray(ch.dialogue)) {
    ch.dialogue.forEach((beat, bi) => {
      if (beat.choices) {
        beat.choices.forEach((dc, ci) => {
          _checkChoice(dc, sceneId, issues, charismIds, soundingIds, stats, `${prefix} > dialogue beat ${bi} choice ${ci}`);
          if (dc.reply && typeof dc.reply.text !== 'string') {
            issues.push({ severity: 'warning', scene: sceneId, message: `${prefix} > dialogue beat ${bi} choice ${ci}: reply.text should be a string` });
          }
        });
      }
    });
  }
}

// ── Main ──────────────────────────────────────────────────────

export function validate() {
  const issues = [];
  const scenes   = _registries.scenes;
  const charismIds = allCharisms().map(c => c.id);
  const soundingIds = new Set(Object.keys(_registries.soundings));
  const stats = _VALID_STATS();
  const sceneIds = new Set(Object.keys(scenes));

  // ── Initial scene ─────────────────────────────────────────
  const initial = getInitialScene();
  if (!initial) {
    issues.push({ severity: 'error', scene: null, message: 'setInitialScene() has not been called' });
  } else if (!sceneIds.has(initial)) {
    issues.push({ severity: 'error', scene: null, message: `setInitialScene("${initial}") — scene is not registered` });
  }

  // ── Per-scene checks ──────────────────────────────────────
  for (const [id, scene] of Object.entries(scenes)) {

    // Location label
    if (!scene.location) {
      issues.push({ severity: 'warning', scene: id, message: 'scene has no location label' });
    }

    // Text
    if (scene.text === undefined && !scene.iconLayers) {
      issues.push({ severity: 'warning', scene: id, message: 'scene has no text or iconLayers' });
    }

    // return_to
    if (scene.return_to && !_isValidScene(scene.return_to)) {
      issues.push({ severity: 'error', scene: id, message: `return_to "${scene.return_to}" is not a registered scene` });
    }

    // on_enter
    if (scene.on_enter) {
      if (scene.on_enter.thought && !soundingIds.has(scene.on_enter.thought)) {
        issues.push({ severity: 'warning', scene: id, message: `on_enter.thought "${scene.on_enter.thought}" is not a registered sounding` });
      }
    }

    // Choices
    if (scene.choices) {
      scene.choices.forEach((ch, i) => {
        _checkChoice(ch, id, issues, charismIds, soundingIds, stats, `choice[${i}] "${ch.text || ''}"`);
      });
    }
  }

  // ── Endings ───────────────────────────────────────────────
  const endings = getRegisteredEndings();
  for (const ending of endings) {
    if (!_isValidScene(ending.scene) || !sceneIds.has(ending.scene)) {
      issues.push({ severity: 'error', scene: null, message: `ending "${ending.id}" references unregistered scene "${ending.scene}"` });
    }
    if (ending.condition) _checkCondition(ending.condition, null, `ending "${ending.id}"`, issues);
  }

  // ── Report ────────────────────────────────────────────────
  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (!issues.length) {
    console.log('%c[SOBORNOST] validate() — all clear.', 'color:#90c060');
  } else {
    console.group(`%c[SOBORNOST] validate() — ${errors.length} error(s), ${warnings.length} warning(s)`, 'color:#c09060;font-weight:bold');
    errors.forEach(i => {
      const loc = i.scene ? `[${i.scene}] ` : '';
      console.error(`%cERROR%c  ${loc}${i.message}`, 'color:#c06060;font-weight:bold', 'color:inherit');
    });
    warnings.forEach(i => {
      const loc = i.scene ? `[${i.scene}] ` : '';
      console.warn(`%cWARN%c   ${loc}${i.message}`, 'color:#c0a060;font-weight:bold', 'color:inherit');
    });
    console.groupEnd();
  }

  return issues;
}
