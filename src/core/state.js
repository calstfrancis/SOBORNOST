// ── SOBORNOST ENGINE — core/state.js ──────────────────────────
export const G = {
  phase: 'title', mode: 'attended',
  stats: { vigilance: 0, composure: 0, communion: 0, doubt: 0 },
  charisms: [],
  cover: { posting: null, background: null, denomination: null, connection: null, left: null },
  coverIntegrity: 5,
  soundings: { available: [], taken: [], settled: [], released: [] }, soundingPending: null,
  notes: [], flags: new Set(), scene: null, lastReaction: null,
  panelOpen: null, confirmRestart: false, tutorialDone: false, playCount: 0, pastFlags: [],
  inventory: [],
  time: { day: 1, hour: 8, maxDays: 3 }, reputation: {}, quests: {}, crossingLog: [],
  pendingRoll: null, rollResult: null, awareness: 0,
  _poaAbsorbedThisScene: false, _mortificationSpent: false,
  beliefs: new Set(), knowledge: new Set(),
  consequenceQueue: [], npcStance: {}, eventQueue: [],
  pastLifeFlags: new Set(), _kenosisProgress: 0,
  liturgicalHour: 4, metaUnlocks: {}, _idleTimer: null, _analyticsLog: [],
  companions: [], theosis: 0, _theosisFlashTimer: null,
  // Upgrade 6: active dialogue state
  _dialogue: null,
  // Upgrade 4: theosis reflection journal
  journal: [],
  // Upgrade 7: typed event log (rolling, in-session only)
  eventLog: [],
  // Upgrade 5: scene counter for delay_scenes consequences
  _sceneCount: 0,
  // Upgrade 9: active cover challenge state
  _coverChallenge: null,
};

export function resetG(preserve = {}) {
  G.phase = 'title'; G.mode = 'attended';
  G.stats = { vigilance: 0, composure: 0, communion: 0, doubt: 0 };
  G.charisms = [];
  G.cover = { posting: null, background: null, denomination: null, connection: null, left: null };
  G.coverIntegrity = 5;
  G.soundings = { available: [], taken: [], settled: [], released: [] }; G.soundingPending = null;
  G.notes = []; G.flags = new Set(); G.scene = null; G.lastReaction = null;
  G.panelOpen = null; G.confirmRestart = false; G.tutorialDone = false;
  G.playCount = 0; G.pastFlags = []; G.inventory = [];
  G.time = { day: 1, hour: 8, maxDays: 3 }; G.reputation = {}; G.quests = {}; G.crossingLog = [];
  G.pendingRoll = null; G.rollResult = null; G.awareness = 0;
  G._poaAbsorbedThisScene = false; G._mortificationSpent = false;
  G.beliefs = new Set(); G.knowledge = new Set();
  G.consequenceQueue = []; G.npcStance = {}; G.eventQueue = [];
  G.pastLifeFlags = new Set(); G._kenosisProgress = 0;
  G.liturgicalHour = 4; G.metaUnlocks = {}; G._idleTimer = null; G._analyticsLog = [];
  G.companions = []; G.theosis = 0; G._theosisFlashTimer = null;
  G._dialogue = null;
  G.journal = [];
  G.eventLog = [];
  G._sceneCount = 0;
  G._coverChallenge = null;
  Object.assign(G, preserve);
}
