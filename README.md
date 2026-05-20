# SOBORNOST 3.4.0

A browser-based interactive fiction engine for serious narrative games. No build step. No dependencies. Runs natively in any modern browser, deploys directly to GitHub Pages.

Built for games that involve spiritual practice, slow disclosure, contested identity, and meaning that accumulates across multiple playthroughs.

---

## Overview

SOBORNOST is a complete game engine written as a single vanilla JavaScript file. The author registers scenes, charisms, soundings, and endings in a plain JavaScript data file. The engine handles rendering, audio, atmospherics, save/load, companion systems, cover mechanics, and all game mechanics. There is no compilation step and no package manager required.

The name is the Russian theological term for conciliarity — the unity of many voices into one body.

---

## Getting started

### Running locally

JavaScript modules cannot load from `file://` URLs. You need a local HTTP server:

```bash
python3 -m http.server 3000
```

Open `http://localhost:3000`.

### File structure

```
your-game/
  index.html        ← shell HTML
  sobornost.js      ← the complete engine (do not edit)
  game.js           ← your scenes, charisms, endings
  style.css         ← your stylesheet
```

### HTML setup

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Game</title>
  <link rel="stylesheet" href="style.css">
  <script>
    window.GAME_TITLE    = 'YOUR GAME';
    window.GAME_SUBTITLE = 'a subtitle';
    window.GAME_MOTTO    = 'a motto';
  </script>
</head>
<body class="tier-asleep">
  <canvas id="atmos"></canvas>
  <div id="root"></div>
  <script src="sobornost.js" defer></script>
  <script src="game.js" defer></script>
</body>
</html>
```

Both scripts use `defer`. The engine file must load before your data file — `defer` preserves document order. Wrap your initial `S.render()` call in a `load` or `DOMContentLoaded` listener to ensure styles are applied before the first paint.

### Minimal data file

```js
const S = window.SOBORNOST;

S.registerCharisms([
  { id: 'stillness', name: 'Stillness', desc: 'A capacity for quiet.' },
], []);

S.registerScenes({
  harbour: {
    location: 'The Harbour',
    mood: 'neutral',
    text: ['The crossing begins here.'],
    choices: [
      { text: 'Board the vessel.', next: 'aboard' },
    ],
  },
  aboard: {
    location: 'Aboard',
    mood: 'tense',
    text: ['The vessel moves.'],
    choices: [
      { text: 'Begin again.', next: '__new_play__' },
    ],
  },
});

S.setInitialScene('harbour');
S.setModeDescriptions({
  attended: {
    name: 'Attended',
    short: 'You are here. Your choices matter.',
    long: 'Standard play. All mechanics active. All endings reachable.',
  },
  witnessed: {
    name: 'Witnessed',
    short: 'The crossing unfolds. You observe.',
    long: 'Cover challenges resolve automatically. Theosis accrues at 80%. For experienced players.',
  },
});

if (document.readyState === 'complete') {
  requestAnimationFrame(() => S.render());
} else {
  window.addEventListener('load', () => requestAnimationFrame(() => S.render()), { once: true });
}
```

---

## Core concepts

### Scenes

Every scene is a plain object registered with `S.registerScenes({ id: scene, ... })`.

```js
S.registerScenes({
  scene_id: {
    id:           'scene_id',         // must match the key
    location:     'Display name',     // shown in the header
    mood:         'neutral',          // neutral | tense | uncanny | revelation
    text:         `Template literal or plain string`,
    // OR dynamic:
    get text() {
      return S.hasFlag('something') ? 'One thing.' : 'Another thing.';
    },
    choices:      [ ... ],
    onEnter:      () => { S.setFlag('visited'); },   // fires on first visit only
    return_to:    'scene_id',         // renders a persistent return button
    return_label: 'Go back.',
    hub:          true,               // marks visited choices
    art:          'art_id',           // ASCII art block
    condition:    { type: 'flag', id: 'unlocked' },  // scene only accessible if true
    _renderOverride: (root) => { /* custom render function */ },
  },
});
```

### Choices

```js
{
  text: 'The choice the player sees.',

  // Navigation
  next: 'scene_id',
  next: '__new_play__',       // end crossing, start new one

  // Sounding advancement
  tags: ['stillness', 'pastoral'],  // advances matching soundings by 1

  // Effects
  theosis: 5,
  effect: { vigilance: 1, doubt: -1 },  // deprecated; use individual fields
  vigilance: 1,
  composure: -1,
  communion: 2,
  doubt: 1,

  // Flags
  set_flag: 'flag_id',

  // Cover
  set_cover: { key: 'denomination', value: 'Orthodox' },

  // Economy
  mod_stance: { npc_id: 'trust', delta: 2 },
  come_to_believe: 'belief_id',
  record_memory:   'what happened here',
  give_item:       'item_id',

  // Companions
  add_companion:    { id: 'companion_id', name: 'Name', stats: { trust: 0 } },
  remove_companion: 'companion_id',

  // Deferred
  push_consequence: { delay_scenes: 3, flagsToSet: ['something_follows'] },

  // Access control
  requires_stat:      ['composure', 3],   // [statName, minValue]
  requires_charism:   'charism_id',
  requires_flag:      'flag_id',
  requires_theosis:   33,
  requires_item:      'item_id',
  requires_companion: 'companion_id',

  // Visibility
  condition: { type: 'flag', id: 'flag_id' },  // hides if false
  show_if:   'flag_id',
  hide_if:   'flag_id',
  once:      true,   // hide after destination is visited

  // Roll
  roll: {
    stat: 'composure',
    difficulty: 11,
    successNext: 'scene_success',
    partialNext: 'scene_partial',
    failNext:    'scene_fail',
  },
}
```

### Stats

Four built-in stats: `vigilance`, `composure`, `communion`, `doubt`. All live in `G.stats`. Floor at 0, no ceiling. Access via `S.G.stats.composure` or the engine's `applyEffect`.

```js
S.applyEffect({ composure: 1, doubt: -1 });
S.G.stats.vigilance;   // read directly
```

### Charisms

Selected at crossing start. Gate choices, modify rolls, unlock scenes.

```js
S.registerCharisms(
  [ // sleeping charisms — player picks one per crossing
    { id: 'penitent',    name: 'Penitent',    desc: 'Carries the weight of things.' },
    { id: 'witness',     name: 'Witness',     desc: 'Sees without distorting.' },
    { id: 'prophet',     name: 'Prophet',     desc: 'Speaks what is coming.' },
    { id: 'rememberer',  name: 'Rememberer',  desc: 'Carries what others forget.' },
  ],
  [ // waking charisms — unlocked mid-game via high theosis
    { id: 'illumined',   name: 'Illumined',   desc: 'Past the second threshold.' },
  ]
);
```

Charisms compound across crossings. The last waking charism is stored in meta and can unlock specific content on the next crossing.

---

## Soundings

Soundings are contemplative arcs that settle through sustained aligned choices. Each sounding has alignment tags; choices carrying those tags advance matching active soundings by 1 point.

```js
S.registerSounding('sounding_crossing', {
  id:             'sounding_crossing',
  alignmentTags:  ['stillness', 'presence', 'crossing'],
  name:           'On the nature of a crossing',
  text:           'Short offer text shown in the Breviary.',
  theosis:        3,         // applied on settle
  stat:           'composure',
  statDelta:      1,         // applied on settle
  settleText: [              // paragraphs shown in the settle overlay
    'First paragraph.',
    'Second paragraph.',
  ],
  settleDesc:     '+1 Composure · +3 Theosis',
  onSettle:       () => {
    S.setFlag('sounding_crossing_settled');
    S.comeToBelieve('crossings_recurse');
  },
});
```

**Settlement threshold:** `SOUNDING_THRESHOLD = 6`. A sounding needs 6 aligned choice navigations to settle. Offer a sounding with `S.offerSounding('sounding_id')` from a scene `onEnter`. The player manages active soundings in the Breviary panel.

**Settle overlay:** When a sounding settles, a full-screen overlay renders the `settleText` paragraphs with a fade-in animation. The first paragraph is displayed larger. `settleDesc` appears below a divider as a mechanical summary.

---

## Theosis

0–100 spiritual progression. Affects atmosphere, word substitution, waking charism assignment, and what scenes are accessible.

```js
S.incrementTheosis(5);
S.G.theosis;   // read directly

// Tier boundaries (customisable)
// 0–32: Asleep   33–65: Waking   66–100: Illumined

// Word substitution in scene text
S.setTheosisTiers([
  { max: 32,  word: 'icon',  wordPlural: 'icons'  },
  { max: 65,  word: 'ikon',  wordPlural: 'ikons'  },
  { max: 100, word: 'Икон', wordPlural: 'Иконы' },
]);
```

**Witnessed mode tax:** In Witnessed mode, `incrementTheosis(n)` applies at 80% (ceiling). This is intentional — observation is not transformation.

**Cover/theosis tension:** Roll modifiers can be registered to make cover challenges harder at high theosis. At theosis ≥ 50, cover rolls are −1. At theosis ≥ 70, −2. Register this behaviour:

```js
S.registerRollModifier('composure',
  (statKey, options, G) => options.isCoverChallenge && G.theosis >= 50,
  () => -1
);
```

---

## Condition schema

Used in ending conditions, choice locks, and scene pools. Fully composable.

```js
{ type: 'flag',      id: 'flag_id',       state: true }   // state: false inverts
{ type: 'stat',      stat: 'composure',   min: 5 }
{ type: 'stat',      stat: 'coverIntegrity', min: 3 }
{ type: 'theosis',   min: 33 }
{ type: 'charism',   id: 'witness' }
{ type: 'item',      id: 'item_id' }
{ type: 'playcount', min: 2 }
{ type: 'companion', id: 'companion_id' }
{ type: 'past_flag', id: 'flag_from_previous_crossing' }
{ type: 'mode',      mode: 'witnessed' }        // NEW: game mode check
{ type: 'hour',      value: 5 }                 // NEW: exact liturgical hour
{ type: 'hour_gte',  value: 4 }                 // NEW: hour >= N
{ type: 'hour_lte',  value: 6 }                 // NEW: hour <= N
{ type: 'believes',  id: 'belief_id' }          // NEW: comeToBelieve check
{ type: 'stance',    npc: 'npc_id', key: 'trust', min: 3 }  // NEW: NPC stance

{ type: 'and', conditions: [ ... ] }
{ type: 'or',  conditions: [ ... ] }
{ type: 'not', condition: { ... } }
```

---

## Cover system

Cover tracks five fields of a player's adopted identity: `posting`, `background`, `denomination`, `connection`, `left`. Each can be challenged independently.

```js
// Establish a cover field from a choice
{ set_cover: { key: 'denomination', value: 'Roman Catholic' } }

// Read a cover field
S.G.cover.denomination;    // 'Roman Catholic'

// Start a cover challenge manually
S.startCoverChallenge('denomination', 11);   // field, difficulty
```

**Cover challenge mechanics:** Rolls 2d6 + Composure vs. difficulty (default `BASE_DIFFICULTY = 11`). Success clears pressure on the field. Partial holds but costs 1 Composure and clears pressure. Failure reduces `coverIntegrity` by 1 and marks the field pressured (+3 difficulty on next challenge). Cover integrity restores by 1 when a sounding settles.

**Witnessed mode:** `startCoverChallenge()` returns immediately in Witnessed mode with no roll.

---

## Companions

```js
// Add a companion from a choice
{ add_companion: { id: 'pavel', name: 'Pavel', stats: { trust: 0 } } }

// Check companion presence
S.hasCompanion('pavel');

// Modify companion stats
S.modCompanionStat('pavel', 'trust', 1);

// Register ambient location-specific lines
S.registerCompanionLine('pavel', {
  id:       'fo_3',
  location: 'Foredeck',     // only shows in scenes with this location
  trustMin: 2,              // requires trust >= 2
  trustMax: 4,              // optional ceiling
  once:     false,          // if true, only fires once per crossing
  condition: { type: 'flag', id: 'anomaly_first_noticed' },
  text:     'Pavel is at the bow. He turns when he hears you.',
});

// Retrieve a random eligible line for the current scene
const line = S.getCompanionLine('pavel', 'Foredeck');
if (line) parts.push(line);  // inside a get text() function

// Inject a beat into an active dialogue
// Call from onEnter after S.startDialogue()
S.injectDialogueBeat(2, { speaker: 'Pavel', text: 'He has a right to know.' });
// Inserts after beat index 2
```

Companions are shown in the Status panel with trust dots and their most recent NPC memory.

---

## Roll system

```js
// Perform a visible roll — returns result object and fires narrative HTML
const result = S.performVisibleRoll('composure', 11, { isCoverChallenge: true });
// result.outcome: 'success' | 'partial' | 'failure'
// result.total: number
// result.d1, result.d2: individual dice

// Render roll result as inline HTML string
const html = S.visibleRollHtml(result);
// Returns: <span class="visible-roll success">[4·6] + 5 = 15 — holds</span>

// Register a roll modifier
S.registerRollModifier(
  'composure',
  (statKey, options, G) => options.isCoverChallenge && G.theosis >= 50,
  () => -1   // modifier value
);
```

---

## Meta-persistence

Values that survive across crossings are stored in `G.metaUnlocks` (localStorage-backed).

```js
S.unlockMeta('reached_solidarity');   // set a meta flag
S.hasMeta('reached_solidarity');      // check it
S.getMetaValue('transmissionCount', 0);  // read with fallback

// Store arbitrary values
S.G.metaUnlocks.crewVariant = 2;
S.G.metaUnlocks.transmissionCount = (S.G.metaUnlocks.transmissionCount || 0) + 1;
```

`newPlay()` fires a `newPlay` event before resetting game state. Listen to it to read flags from the crossing just ended and store them in meta before the reset:

```js
S.on('newPlay', () => {
  if (S.hasFlag('archive_transmitted')) {
    S.G.metaUnlocks.transmissionCount = (S.G.metaUnlocks.transmissionCount || 0) + 1;
  }
});
```

---

## Magnetic deviation

The anomaly system. `G.magneticDeviation` is 0.0–1.0 and drives atmosphere, audio, and visual distortion.

```js
S.setMagneticDeviation(0.75);
S.getMagneticDeviation();   // returns current value

// The engine automatically:
// - Shows a deviation indicator in the scene header above 0.2
// - Applies CSS data-deviation="mid"|"high" to the root element
// - Plays anomaly_pulse SFX on navigation when deviation > 0.5
// - Introduces Cyrillic character substitution in location text when > 0.75
```

---

## Audio

The engine uses the Web Audio API to generate all sounds procedurally. No external audio files required.

```js
S.toggleAudio();       // on/off; starts ship ambient drone when enabled
S.playSfx('sounding_settle');   // fire a registered SFX

// Register custom SFX
S.registerSfx('my_sound', (vol = 0.5) => {
  if (!_actx) return;
  const o = _actx.createOscillator();
  const g = _actx.createGain();
  g.gain.setValueAtTime(vol, _actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + 0.8);
  o.connect(g); g.connect(_gainNode);
  o.start(); o.stop(_actx.currentTime + 0.9);
});
```

**Built-in SFX:** `sounding_settle`, `cover_fail`, `transmission`, `anomaly_drone`, `theosis_moment`, `ship_ambient_start`, `ship_ambient_stop`, `anomaly_pulse`, `radio_static`.

**Ambient system:** `ship_ambient_start` creates a continuous low drone (two detuned sine oscillators + filtered noise). Starts automatically when audio is enabled. `ship_ambient_stop` fades it out over 2 seconds.

**Anomaly pulse:** `anomaly_pulse` fires a sub-bass throb that scales in frequency and volume with `G.magneticDeviation`. Fires automatically on navigation when deviation > 0.5.

---

## Canvas atmosphere

The `#atmos` canvas renders behind all game content. Its mood is driven by scene mood and theosis tier.

```js
// Toggle canvas on/off (persists in localStorage)
S.toggleAtmos();

// The canvas adjusts automatically to:
// - Scene mood (neutral / tense / uncanny / revelation)
// - Theosis tier (Asleep / Waking / Illumined)
// - Magnetic deviation (porthole brightness shifts)
```

For low-end devices or battery concerns, the toggle is rendered as a button in the game UI. On mobile devices where `localStorage` has no prior preference, the canvas defaults to off.

---

## Play modes

```js
S.setModeDescriptions({
  attended:  { name: 'Attended',  short: '...', long: '...' },
  witnessed: { name: 'Witnessed', short: '...', long: '...' },
});
```

| Mode | Cover challenges | Theosis | Description |
|---|---|---|---|
| `attended` | Full roll | 100% | Standard play |
| `witnessed` | Auto-resolve | 80% | Narrative mode |

The mode is shown in the mode selection screen before the first crossing. Descriptions are read from `_registries.modeDescriptions`. The `long` description is displayed in the mode button.

---

## Panels

Six bottom-nav panels: `notes` (observations + codex), `status`, `breviary`, `calendar`, `map`, `log`.

Panels render into `document.body` and survive `root.innerHTML = ''`. They are rendered synchronously on button click via `openPanel(id)` to avoid async race conditions.

```js
S.openPanel('breviary');  // open
S.openPanel(null);        // close
```

Panel overlays animate via CSS: `transform: translateX(100%) → translateX(0)` with `.open` class added one frame after render.

---

## Endings

```js
S.registerEnding({
  id:        'solidarity',
  priority:  15,       // highest-priority triggered ending wins
  condition: { type: 'and', conditions: [
    { type: 'flag',    id: 'solidarity_sounding_settled' },
    { type: 'flag',    id: 'mission_refused' },
    { type: 'theosis', min: 45 },
  ]},
  scene:     'ending_solidarity',
});
```

Endings are checked after every `applyChoice`. The `crossing_record` scene runs between endings and the next crossing — render it with `_renderOverride`:

```js
crossing_record: {
  id: 'crossing_record',
  text: '',
  _renderOverride: (root) => { S.renderCrossingRecord(root); },
  choices: [],
},
```

---

## Help screen

```js
S.renderHelp(document.getElementById('root'));
```

Renders a full-screen overlay with mechanics reference, keyboard shortcuts, and a high-contrast toggle. Exposed as the `?` button in the game UI.

---

## Save system

Autosave fires on every scene navigation. Multi-slot localStorage.

```js
S.saveGameSlot('slot1');
S.loadGameSlot('slot1');
S.saveGameLegacy();   // saves to 'legacy' slot
S.loadGameLegacy();
```

**What persists:** All `G` fields including `G.metaUnlocks`, `G.mode`, `G.audioOn`, `G.flags`, `G.beliefs`, `G.npcStance`, `G.inventory`, `G.companions`. Sets are re-wrapped on load.

**What does not persist:** `G._dialogue`, `G._coverChallenge`, panel state, event log.

---

## Validation

```js
S.setInitialScene('harbour');
S.validate();   // logs all dangling refs, unknown IDs, broken conditions
S.render();
```

Remove `validate()` in production or guard it with a `DEBUG` check.

---

## Keyboard shortcuts

Built-in keyboard navigation (registered via `_initKeyboard`):

| Key | Action |
|---|---|
| `1`–`9` | Activate nth visible choice |
| `Escape` | Close open panel |
| `Tab` | Navigate focusable elements |
| `Enter` / `Space` | Activate focused choice |

---

## Event system

```js
S.on('flagSet',         flag => { });
S.on('statChanged',     ({ stat, delta }) => { });
S.on('sceneChanged',    id => { });
S.on('soundingSettled', soundingId => { });
S.on('newPlay',         () => { });
S.on('doubtCrisis',     ({ doubt }) => { });
S.on('companionAdded',  ({ id }) => { });
S.on('codexUnlocked',   id => { });
```

---

## Ship state

Side-channel state for emergent environmental conditions.

```js
S.modShipState('paranoia', 2);    // modShipState(key, delta)
S.getShipState('paranoia');       // returns current value (default 0)

// Automatic CSS class application:
// paranoia >= 4  → body.ship-paranoid
// exhaustion >= 5 → body.ship-exhausted
// morale <= 3    → body.ship-low-morale
```

---

## NPC stances

```js
S.modStance('npc_id', 'trust', 2);         // modStance(npc, key, delta)
S.getStance('npc_id', 'trust');            // returns current value
S.modReputation('npc_id', 1);             // shorthand for trust
S.recordNpcMemory('npc_id', 'text');       // stores a memory entry
```

NPC memories are surfaced in the Status panel and in the crossing record.

---

## Liturgical hours

```js
// Hours: 0=Lauds 1=Prime 2=Terce 3=Sext 4=None 5=Vespers 6=Compline
S.setLiturgicalHour(5);   // Vespers
S.advanceTime(1);          // increments hour
S.G.liturgicalHour;        // read directly

// Condition gating by hour
{ type: 'hour_gte', value: 5 }  // only at Vespers or later
```

---

## Engine version

Current version: **3.4.0**

Accessible at runtime: `SOBORNOST.VERSION`.

---

## Single file structure

```
sobornost.js
  debug → events → state → schedule → registries →
  mechanics → conditions → soundings → theosis →
  atmosphere → audio → history → save → journal →
  companions → roll → rituals → navigation → ambient →
  codex → cover → dialogue → endings → eventlog →
  devmode → validate → text → idle → widgets → renderer →
  public API
```

---

## Global variables

Set in your HTML `<script>` block before the scripts load:

```js
window.GAME_TITLE    = 'YOUR GAME';
window.GAME_SUBTITLE = 'a subtitle';
window.GAME_MOTTO    = 'a motto';
```

---

## Licence

MIT. Free to use, fork, and adapt. Attribution appreciated but not required.

---

## Origin

SOBORNOST was built as the engine for *Spasibo*, a game grounded in contemplative Christian practice, liberation theology, and the phenomenology of institutional work. The mechanics — soundings, theosis, cover, the breviary — reflect that origin. The engine is general enough for any narrative game that takes interiority seriously.
