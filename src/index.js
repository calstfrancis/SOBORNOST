// ── SOBORNOST ENGINE — index.js ───────────────────────────────
// Entry point. Load BEFORE your game data files.
// Call SOBORNOST.render() at the end of your data file.
//
// Upgrade 1: SOBORNOST.devMode(wsPort) — hot-reload (localhost only)
// Upgrade 4: SOBORNOST.registerJournalEntry(threshold, text)
// Upgrade 5: pushConsequence({ delay_scenes: N, ... }) / on_next_choice: true
// Upgrade 7: SOBORNOST.setLoggedEvents([...]) / SOBORNOST.exportEventLog()
// Upgrade 9: SOBORNOST.registerCoverChallenge(field, prompts)

import { G, resetG }     from './core/state.js';
import { on, off, emit } from './core/events.js';
import { setDebug }      from './core/debug.js';

import {
  _registries,
  registerScenes, getScene, setSceneNotFoundHandler,
  setInitialScene as _setInitialScene, getInitialScene,
  registerCharisms, registerSounding, registerNote, registerArt, registerGlossaryEntry,
  registerStatTip, registerRollModifier, setAvailableModes,
  setIconWordFunction, setHarbourWordFunction, setShipWordFunction, setObjectDescriptionFunction,
  registerScenePool, addToScenePool, registerRitual, registerTranslation,
  registerPostEventShift, registerPastLifeLine, registerMapNode, registerSfx,
  registerItem, setTutorialContent, allCharisms, findCharism, noteLabel,
} from './systems/registries.js';

import { drawAtmos, setMood, refreshAtmosMods, registerAtmosModifier } from './systems/atmosphere.js';
import { toggleAudio, playSfx, initBuiltinSfx }                        from './systems/audio.js';
import { _captureSnapshot, undo, redo }                                 from './systems/history.js';
import {
  VERSION,
  saveGameSlot, loadGameSlot, listSaveSlots, saveGameLegacy, loadGameLegacy,
  loadMetaUnlocks, unlockMeta, hasMeta, exportAnalytics,
} from './systems/save.js';
import {
  registerTheosisTagValue, setTheosisTiers, incrementTheosis, flashTheosisLight,
  iconWord, harbourWord, shipWord, objectDescription,
  registerNameMapping, setLiturgicalHour,
} from './systems/theosis.js';
import {
  hasFlag, setFlag, addNote, applyEffect, setCover, showToast, rollCover, degradeCover,
  advanceTime, modReputation, getReputation, setReputation,
  setQuestState, getQuestState, isQuestActive, isQuestCompleted,
  hasItem, addItem, removeItem, getStance, setStance, modStance,
  learn, comeToBelieve, contradict, knows, believes,
  pushConsequence, scheduleEvent,
} from './systems/mechanics.js';
import {
  offerSounding, takeSounding, suspendSounding, releaseSounding,
  applySoundingProgress, applyAutoAlignment,
} from './systems/soundings.js';
import {
  addCompanion, removeCompanion, hasCompanion, getCompanion, modCompanionStat, setCompanionCharism,
} from './systems/companions.js';
import {
  navigateToPool, startRitual, ritualNextPhase, getCurrentRitualPhase, isRitualActive,
} from './systems/rituals.js';
import {
  setUiOpacity, getUiOpacity,
  registerCompassAxes, updateCompass, renderCompass,
  registerProgressTracker, updateProgressTracker, getProgressTracker,
} from './ui/widgets.js';
import { navigate, applyChoice, newPlay, openPanel, returnToTitle } from './systems/navigation.js';
import { render } from './ui/renderer.js';

// Upgrade 1: hot-reload dev mode
import { devMode } from './systems/devmode.js';
// Upgrade 2: validation
import { validate } from './systems/validate.js';
// Upgrade 4: journal
import { registerJournalEntry, addJournalEntry } from './systems/journal.js';
// Upgrade 5: consequence chains (pushConsequence is already imported from mechanics)
// Upgrade 6: dialogue
import { startDialogue } from './systems/dialogue.js';
// Upgrade 7: event log
import { setLoggedEvents, getLoggedEvents, addLoggedEvent, removeLoggedEvent, exportEventLog, clearEventLog } from './systems/eventlog.js';
// Upgrade 9: cover mini-game
import { registerCoverChallenge, startCoverChallenge, hasCoverChallenges } from './systems/cover.js';
// Upgrade 10: endings
import { registerEnding, checkEndings, getRegisteredEndings } from './systems/endings.js';

// ── Init ──────────────────────────────────────────────────────
loadMetaUnlocks();
initBuiltinSfx();

// ── Public API ────────────────────────────────────────────────
window.SOBORNOST = {
  VERSION,

  // Core
  G, render, setDebug, undo, redo,

  // Scene registry
  registerScenes, getScene, setSceneNotFoundHandler,
  setInitialScene: (sceneId) => {
    _setInitialScene(sceneId);
    if (G.phase === 'game' && !G.scene) G.scene = sceneId;
  },

  // Upgrade 1: hot-reload dev server client
  devMode,

  // Upgrade 2: validation
  validate,

  // Upgrade 4: journal
  registerJournalEntry, addJournalEntry,

  // Upgrade 6: dialogue
  startDialogue,

  // Upgrade 7: event log
  setLoggedEvents, getLoggedEvents, addLoggedEvent, removeLoggedEvent,
  exportEventLog, clearEventLog,

  // Upgrade 9: cover mini-game
  registerCoverChallenge, startCoverChallenge, hasCoverChallenges,

  // Upgrade 10: endings
  registerEnding, checkEndings, getRegisteredEndings,

  // Registries
  registerCharisms, registerSounding, registerNote, registerArt, registerGlossaryEntry,
  registerStatTip, registerRollModifier, setAvailableModes,
  setIconWordFunction, setHarbourWordFunction, setShipWordFunction, setObjectDescriptionFunction,
  registerScenePool, addToScenePool, registerRitual, registerTranslation,
  registerPostEventShift, registerPastLifeLine, registerMapNode, registerSfx,
  registerItem, registerAtmosModifier, setTutorialContent,

  // Theosis & liturgy
  registerTheosisTagValue, setTheosisTiers, incrementTheosis, flashTheosisLight,
  registerNameMapping, setLiturgicalHour,

  // Companions
  addCompanion, removeCompanion, hasCompanion, getCompanion, modCompanionStat, setCompanionCharism,

  // Epistemic
  learn, comeToBelieve, contradict, knows, believes,

  // Consequences & events
  pushConsequence, scheduleEvent,

  // Meta & analytics
  unlockMeta, hasMeta, exportAnalytics,

  // Save / load
  saveGameSlot, loadGameSlot, listSaveSlots,

  // UI
  setUiOpacity, getUiOpacity,
  registerCompassAxes, updateCompass, renderCompass,
  registerProgressTracker, updateProgressTracker, getProgressTracker,

  // Navigation
  navigateToPool, startRitual, ritualNextPhase, getCurrentRitualPhase, isRitualActive,
  navigate, applyChoice, newPlay,

  // Utilities
  allCharisms, findCharism, noteLabel, iconWord, harbourWord, shipWord, objectDescription,
  hasFlag, setFlag, addNote, applyEffect, setCover, showToast, rollCover, degradeCover,
  advanceTime, modReputation, getReputation, setReputation,
  setQuestState, getQuestState, isQuestActive, isQuestCompleted,
  hasItem, addItem, removeItem, getStance, setStance, modStance,
  offerSounding, takeSounding, suspendSounding, releaseSounding,
  applySoundingProgress, applyAutoAlignment,

  // Event bus
  on, off, emit,
};
