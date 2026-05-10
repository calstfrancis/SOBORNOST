# SOBORNOST

A browser-based interactive fiction engine for serious narrative games. No build step. No dependencies. Runs natively in any modern browser via ES6 modules, deploys directly to GitHub Pages.

Built for games that involve spiritual practice, slow disclosure, contested identity, and meaning that accumulates across multiple playthroughs.

---

## Overview

SOBORNOST is a complete game engine written as a single vanilla JavaScript file. The author registers scenes, charisms, soundings, and endings in a plain JavaScript data file. The engine handles rendering, audio, atmospherics, save/load, undo/redo, and all game mechanics. There is no compilation step and no package manager required.

The name is the Russian theological term for conciliarity — the unity of many voices into one body. The engine was built to support a specific kind of contemplative, layered narrative game, but its systems are general enough for any text-heavy interactive fiction with RPG mechanics.

---

## Getting started

### Running locally

JavaScript modules cannot load from `file://` URLs. You need a local HTTP server:

```bash
# Python (always available)
python3 -m http.server 3000

# Or use the built-in dev server (hot-reload included)
node tools/dev-server.js 3000
```

Open `http://localhost:3000`.

### File structure

```
your-game/
  index.html          ← your shell HTML
  sobornost.js        ← the complete engine (do not edit)
  game/
    data.js           ← your scenes, charisms, endings
```

### HTML setup

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Your Game</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="atmos"></canvas>
  <div id="root"></div>

  <script type="module" src="sobornost.js"></script>
  <script type="module" src="game/data.js"></script>
</body>
</html>
```

The engine file must load before your data file. Both use `type="module"`.

### Minimal data file

```js
const S = window.SOBORNOST;

window.GAME_TITLE  = 'YOUR GAME';
window.GAME_MOTTO  = 'A subtitle or motto';

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
S.validate(); // remove for production
S.render();
```

---

## Core concepts

### Scenes

Every scene is a plain object registered with `SOBORNOST.registerScenes({ id: scene, ... })`.

```js
S.registerScenes({
  scene_id: {
    location: 'Display name shown in the header',
    mood: 'neutral',          // neutral | tense | uncanny | revelation
    text: [ ... ],            // array of strings or passage objects
    choices: [ ... ],         // array of choice objects
    on_enter: {               // fires on first visit only
      note: 'note_key',
      flag: 'flag_id',
      thought: 'sounding_id',
    },
    return_to: 'scene_id',    // shows a return link
    return_label: 'Go back.', // optional label for return link
    hub: true,                // marks visited choices in hub scenes
    art: 'art_id',            // ASCII art registered with registerArt()
    anamnesis: {              // extra line on crossing 2+
      after: 2,               // index of line after which it appears
      text: 'Remembered.',
      note: 'optional_note',
    },
  },
});
```

### Choices

```js
{
  text: 'The choice the player sees.',

  // Navigation
  next: 'scene_id',         // navigate to this scene
  next: '__new_play__',     // end crossing and start a new one

  // Effects applied immediately
  effect: { vigilance: 1, doubt: -1 },
  set_flag: 'flag_id',
  set_note: 'note_key',
  thought: 'sounding_id',   // offer a sounding
  give_item: 'item_id',
  take_item: 'item_id',
  advance_time: 2,           // hours

  // Theosis
  theosis: 5,                // direct increment
  tags: ['threshold'],       // looked up in registerTheosisTagValue

  // Economy
  mod_reputation: { npc_id: 2 },
  set_quest_state: { quest_id: 'active' },
  mod_stance: { npc_id: { trust: 1 } },

  // Epistemic
  learn: 'fact_id',
  come_to_believe: 'belief_id',
  contradict: 'belief_id',

  // Companions
  add_companion: { id: 'companion_id', name: 'Name' },
  remove_companion: 'companion_id',

  // Deferred
  push_consequence: { delay_scenes: 3, flagsToSet: ['something_follows'] },
  schedule_event: { triggerTime: { day: 2, hour: 14 }, sceneId: 'event_scene' },

  // Access control
  requires_stat: ['composure', 3],
  requires_charism: 'charism_id',
  requires_flag: 'flag_id',
  requires_playcount: 2,
  requires_item: 'item_id',
  requires_theosis: 33,
  requires_companion: 'companion_id',
  requires_reputation_min: { npc_id: 2 },
  requires_quest_state: { quest_id: 'completed' },
  requires_belief: 'belief_id',
  requires_knowledge: 'fact_id',
  requires_past_flag: 'flag_from_previous_crossing',

  // Conditional visibility
  show_if: 'flag_id',
  hide_if: 'flag_id',
  once: true,                // hide after the destination is visited

  // Roll
  roll: {
    stat: 'composure',
    difficulty: 8,
    successNext: 'scene_success',
    partialNext: 'scene_partial',
    failNext: 'scene_fail',
  },

  // Dialogue tree (see Dialogue section)
  dialogue: [ ... ],

  // Style variants
  type: 'silence',           // styled as a silence/contemplation choice
  style: 'cold',             // cold | return | vespers
}
```

### Stats

The four built-in stats are `vigilance`, `composure`, `communion`, and `doubt`. They live at `G.stats`. The engine does not define what they mean — that is the author's domain. You can rename them conceptually in your own writing, or override the stat tips:

```js
S.registerStatTip('vigilance', 'Sharpness. Opens investigative choices.');
S.registerStatTip('doubt',     'Accumulates under pressure.');
```

Stats floor at 0 and have no ceiling by default.

### Charisms

Charisms are the player's trait selections — one chosen at the start of each crossing. They gate choices, modify rolls, and can be checked in conditions.

```js
S.registerCharisms(
  [ // sleeping — player picks one at game start
    { id: 'stillness',   name: 'Stillness',   desc: 'A capacity for quiet.' },
    { id: 'discernment', name: 'Discernment', desc: 'An eye for what is real.' },
  ],
  [ // waking — unlockable mid-game via registerWakingCharism()
    { id: 'kenosis', name: 'Kenosis', desc: 'Self-emptying. A waking charism.' },
  ]
);
```

### Soundings

Soundings are contemplations that surface through choices and settle over time. Each sounding has an alignment tag list; choices that share those tags automatically advance matching soundings.

```js
S.registerSounding('the_shore', {
  name: 'The Shore',
  desc: 'The memory of standing at the water\'s edge.',
  alignmentTags: ['departure', 'threshold'],
  effect: { communion: 1 },  // applied when the sounding settles
});
```

A sounding is offered by a choice: `thought: 'the_shore'`. The player takes it via the Breviary panel. Progress accumulates across 8 scene navigations. The Breviary displays progress and lets the player manage up to 4 active soundings.

### Flags and notes

Flags are boolean markers stored in `G.flags` (a `Set`). They persist across a single crossing and into the next via `G.pastLifeFlags`.

```js
S.setFlag('met_ferryman');
S.hasFlag('met_ferryman'); // true
```

Notes are display labels that accumulate in the Observations panel. Register a label, then add the note from a choice:

```js
S.registerNote('met_ferryman', 'Met the Ferryman');

// in a choice:
{ set_note: 'met_ferryman' }
```

---

## Passage system

Scene text arrays accept passage objects alongside plain strings. All passages resolve to a flat string array before the renderer sees them.

```js
text: [
  // Plain string — always shown
  'The crossing begins here.',

  // Conditional — shown when flag is set
  { if: 'met_ferryman', text: 'The ferryman has not moved.' },

  // Conditional with else branch
  { if: 'spoke_honestly',
    text: 'You feel you have passed something.',
    else: 'The doubt does not leave.' },

  // Stat gate
  { if_stat: ['doubt', 3], text: 'Something feels wrong.' },

  // Charism gate
  { if_charism: 'discernment', text: 'You notice the door is ajar.' },

  // Awareness gate
  { if_awareness: 2, text: 'A deeper reading of the room.' },

  // Theosis gate
  { if_theosis: 33, text: 'The {ICON} is near.' },

  // Crossing gate (crossing 2+)
  { if_playcount: 1, text: 'You have stood here before.' },

  // Belief and knowledge gates
  { if_belief: 'the_shore_is_real', text: 'It was real.' },
  { if_knowledge: 'ferryman_name',  text: 'You know his name now.' },

  // Random — picks one line per render (re-rolls each visit)
  { random: ['Fog.', 'Rain.', 'A thin wind.'] },

  // Weighted random
  { random: [{ text: 'Rare.', weight: 1 }, { text: 'Common.', weight: 4 }] },

  // Conditional + random combined
  { if: 'met_ferryman', random: ['He nods.', 'He watches.', 'He waits.'] },
]
```

Supported condition keys: `if`, `if_not`, `if_stat`, `if_charism`, `if_awareness`, `if_theosis`, `if_belief`, `if_knowledge`, `if_playcount`.

---

## Dialogue trees

A choice with a `dialogue:` array launches an inline dialogue sequence without leaving the scene.

```js
{
  text: 'Speak to the ferryman.',
  effect: { communion: 1 },   // applied immediately on click
  dialogue: [
    // NPC lines — advance with Continue
    { speaker: 'Ferryman', text: 'You have been here before.' },
    { speaker: 'Ferryman', text: 'Many times.' },

    // Narration beat (no speaker)
    { text: 'The water darkens.' },

    // Player choice node
    { choices: [
      {
        text: '"I don\'t remember."',
        reply: { speaker: 'Ferryman', text: 'That is how it works.' },
        effect: { doubt: 1 },
        set_note: 'spoke_honestly',
        next: 'aboard',
      },
      {
        text: 'Say nothing.',
        // No reply — closes dialogue and navigates immediately
        next: 'aboard',
      },
    ]},
  ],
}
```

The scene header and text remain visible during dialogue for spatial context. The dialogue is cleared automatically on any scene navigation.

---

## Endings

Endings are declared globally and checked after every choice. The highest-priority triggered ending wins; ties break by registration order.

```js
S.registerEnding({
  id: 'dissolution',
  condition: { type: 'stat', name: 'doubt', min: 8 },
  scene: 'ending_dissolution',
  priority: 10,
});

S.registerEnding({
  id: 'revelation',
  condition: { type: 'and', conditions: [
    { type: 'flag', id: 'visited_far_shore' },
    { type: 'theosis', min: 33 },
  ]},
  scene: 'ending_revelation',
  priority: 20,
});
```

Each ending fires at most once per crossing. The condition schema is the same one used for choice locks — `flag`, `stat`, `charism`, `item`, `theosis`, `playcount`, `awareness`, `belief`, `knowledge`, `companion`, `or`, `and`, `not`.

---

## Condition schema

Used in endings, choice locks, consequences, and scene pools. Composable:

```js
{ type: 'flag',     id: 'flag_id',        state: true }  // state: false to invert
{ type: 'stat',     name: 'doubt',        min: 3 }
{ type: 'charism',  id: 'discernment' }
{ type: 'item',     id: 'item_id' }
{ type: 'theosis',  min: 33 }
{ type: 'awareness',min: 2 }
{ type: 'playcount',min: 2 }
{ type: 'belief',   id: 'belief_id' }
{ type: 'knowledge',id: 'fact_id' }
{ type: 'companion',id: 'companion_id' }
{ type: 'past_flag',id: 'flag_from_previous_crossing' }

{ type: 'and', conditions: [ ... ] }
{ type: 'or',  conditions: [ ... ] }
{ type: 'not', condition: { ... } }
```

---

## Theosis

Theosis is a 0–100 spiritual progression value that affects:

- Canvas atmosphere (gold glow increases with theosis)
- Word substitution (`{ICON}` in scene text resolves to a tier-dependent word)
- Name mappings (NPCs or places can shift spelling/script across tiers)
- Journal threshold entries

```js
// Register authored journal text for specific thresholds
S.registerJournalEntry(33, 'The first threshold. The word begins to change.');
S.registerJournalEntry(66, 'Past the second threshold.');
S.registerJournalEntry(100, 'There is no word for what you have arrived at.');

// Map theosis gains to choice tags
S.registerTheosisTagValue('threshold', 5);
S.registerTheosisTagValue('revelation', 10);

// In a choice:
{ tags: ['threshold'], next: 'scene' }

// Or directly:
{ theosis: 5, next: 'scene' }

// Tiered word substitution
S.setTheosisTiers([
  { max: 32,  word: 'icon',  wordPlural: 'icons',  cyrillic: null },
  { max: 65,  word: 'ikon',  wordPlural: 'ikons',  cyrillic: null },
  { max: 100, word: 'Икон', wordPlural: 'Иконы', cyrillic: 'Икон' },
]);

// Name mapping (NPC names shift between tiers)
S.registerNameMapping('Father Thomas', 'Fr. Thomas', 'Thomas', 'Фома');
```

### Liturgical hours

The liturgical hour determines the scene mood automatically and is visible in journal entries.

```js
// LITURGICAL_HOURS indices: 0=Lauds, 1=Prime, 2=Terce, 3=Sext, 4=None, 5=Vespers, 6=Compline
S.setLiturgicalHour(5); // Vespers → revelation mood
```

---

## Save system

Multi-slot localStorage. Autosave fires on every scene navigation.

```js
S.saveGameSlot('slot1');           // manual save
S.loadGameSlot('slot1');           // manual load
S.listSaveSlots();                 // returns ['legacy', 'slot1', ...]
```

`saveGameLegacy()` / `loadGameLegacy()` are convenience wrappers for the default `'legacy'` slot used by autosave.

**Note:** Consequences with JavaScript function conditions (`condition: () => boolean`) are not save-safe — they are stripped before serialisation with a console warning. Use the condition schema instead.

### What persists

All game-relevant `G` fields are saved and restored. Intentionally transient fields (roll state, panel state, dialogue state, event log) are not saved. The journal is saved to a separate per-slot key and persists across crossings within a slot.

---

## Consequence chains

Push deferred consequences from any choice:

```js
// Fires after the player navigates 3 more scenes
{ push_consequence: { delay_scenes: 3, flagsToSet: ['something_follows'] } }

// Fires before the player's very next choice
{ push_consequence: { on_next_choice: true, effect: { doubt: 1 } } }

// Fires when a condition is met (not save-safe — see note above)
S.pushConsequence({ condition: () => G.stats.doubt >= 5, sceneToRun: 'doubt_scene' });
```

If a consequence redirects to a new scene, it takes precedence over the choice's own `next` navigation.

---

## Cover system

Cover tracks five fields of a player's adopted identity: `posting`, `background`, `denomination`, `connection`, `left`. Each can be challenged.

```js
// Establish cover via a choice
{ set_cover: { key: 'denomination', value: 'United Church of Canada' } }

// Register challenge prompts per field
S.registerCoverChallenge('denomination', [
  "You don't sound like one of us.",
  "Which parish do you attend?",
]);
```

The cover challenge is accessed from the status panel. The player rolls Composure against difficulty 8 (increased to 10 if the field is under pressure). Success clears pressure. Partial holds but costs 1 Composure. Failure degrades `coverIntegrity` by 1 and marks the field as pressured.

---

## Validation

Call `SOBORNOST.validate()` at the end of your data file during development. It walks every registered scene and reports dangling scene references, unknown charisms, invalid stat names, missing soundings, and broken ending conditions. Guard or remove it for production.

```js
S.setInitialScene('harbour');
if (typeof DEBUG !== 'undefined') S.validate();
S.render();
```

---

## Hot-reload development

```bash
node tools/dev-server.js 3000
```

Serves your game on port 3000, watches `game/` and `sobornost.js` for changes, and sends a WebSocket signal to the browser on save. Game data files hot-reload without a page refresh — `G` state is preserved. Engine file changes trigger a full page reload.

In your data file:

```js
S.devMode(3001); // WS port = HTTP port + 1. No-op on non-localhost origins.
```

Requires Node.js 18+. No `npm install` — uses only Node built-ins.

---

## Event log

In-session only (not persisted). Available in `attended` and `open` play modes via the `log` bottom-nav panel.

```js
S.setLoggedEvents([
  'flagSet', 'statChanged', 'sceneChanged', 'soundingSettled',
  'choiceApplied', 'endingTriggered', 'theosisChanged',
]);

S.exportEventLog(); // downloads JSON
```

---

## Play modes

Three modes affect how locked choices are displayed and which UI elements appear:

| Mode | Locked choices | Composure gains | Log panel |
|------|---------------|-----------------|-----------|
| `attended` | shown greyed | allowed | visible |
| `open` | hidden | allowed | visible |
| `witnessed` | shown greyed | blocked | hidden |

Set via the mode selection screen, or programmatically: `G.mode = 'attended'`.

---

## Single file structure

The `sobornost.js` file contains the complete engine in a single module. The sections are organized by dependency order:

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

The public API is exposed as `window.SOBORNOST` and includes all registration functions, state access, and rendering controls.

---

## Global variables

Set in your HTML or data file before `render()`:

```js
window.GAME_TITLE    = 'YOUR GAME';    // shown on title screen
window.GAME_SUBTITLE = 'A subtitle';   // shown below title
window.GAME_MOTTO    = 'A motto.';     // shown in italics
```

---

## Engine version

Current version: **3.3.1**

Accessible at runtime: `SOBORNOST.VERSION`.

---

## Licence

MIT. The engine is free to use, fork, and adapt. Attribution appreciated but not required.

---

## Origin

SOBORNOST was built as the engine for a specific game grounded in contemplative Christian practice, liberation theology, and the phenomenology of institutional work. The mechanics — soundings, theosis, cover, the breviary — reflect that origin. The engine is general enough for any narrative game that takes interiority seriously.
