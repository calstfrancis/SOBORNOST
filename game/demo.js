// ── SOBORNOST ENGINE — game/demo.js ───────────────────────────
// Full demonstration covering all 10 upgrades.
// Upgrades 3, 6, 8, 10 demonstrated in the harbour/crossing scenes.
// Upgrades 1, 4, 5, 7, 9 demonstrated via setup calls below.

const S = window.SOBORNOST;

// ── Upgrade 1: Hot-Reload Dev Mode ────────────────────────────
// Connects to tools/dev-server.js on WS port 3001.
// No-op on non-localhost origins — safe to leave in production data.
// Run: node tools/dev-server.js 3000 game/
S.devMode(3001);

// ── Game metadata ─────────────────────────────────────────────
window.GAME_TITLE    = 'THE CROSSING';
window.GAME_SUBTITLE = 'Engine demonstration — v3.3.0';
window.GAME_MOTTO    = 'May you find what you seek';

// ── Charisms ──────────────────────────────────────────────────
S.registerCharisms([
  { id: 'stillness',   name: 'Stillness',   desc: 'Quiet. Resist doubt.' },
  { id: 'discernment', name: 'Discernment', desc: 'See clearly. Bonus on vigilance rolls.' },
  { id: 'solidarity',  name: 'Solidarity',  desc: 'Stand with others.' },
], []);

// ── Soundings ─────────────────────────────────────────────────
S.registerSounding('the_shore', { name:'The Shore', alignmentTags:['departure','threshold'], effect:{communion:1} });
S.registerSounding('the_bell',  { name:'The Bell',  alignmentTags:['revelation','mystery'],  effect:{vigilance:1} });

// ── Notes ─────────────────────────────────────────────────────
S.registerNote('met_ferryman',    'Met the Ferryman');
S.registerNote('spoke_honestly',  'Spoke honestly to the Ferryman');
S.registerNote('saw_the_light',   'Witnessed the light on the water');
S.registerNote('felt_delay',      'Something is catching up to you');

// ── Stat tips ─────────────────────────────────────────────────
S.registerStatTip('vigilance',  'Sharpness. Opens investigative choices.');
S.registerStatTip('composure',  'Steadiness. Spent on cover challenges and rolls.');
S.registerStatTip('communion',  'Connection. Required for certain encounters.');
S.registerStatTip('doubt',      'Accumulates under pressure. Triggers dissolution at 8.');

// ── Upgrade 4: Journal entries ────────────────────────────────
S.registerJournalEntry(10, 'A small fissure has appeared in what you thought was solid.');
S.registerJournalEntry(33, 'The first threshold. The word begins to change in your mouth.');
S.registerJournalEntry(66, 'Past the second threshold. You are not the same person who boarded.');
S.registerJournalEntry(100, 'There is no word for what you have arrived at. There is only this.');

// ── Upgrade 7: Event log configuration ───────────────────────
S.setLoggedEvents([
  'flagSet', 'statChanged', 'soundingSettled', 'soundingTaken',
  'choiceApplied', 'sceneChanged', 'endingTriggered', 'theosisChanged',
  'coverChallengeStarted', 'coverChallengeSuccess', 'coverChallengeFailure',
  'consequenceProcessed',
]);

// ── Upgrade 9: Cover challenges ───────────────────────────────
S.registerCoverChallenge('denomination', [
  "You don't sound like one of us.",
  "Which parish do you attend?",
  "I don't recognise your accent.",
]);
S.registerCoverChallenge('background', [
  "Tell me about your family.",
  "Where did you train?",
  "I know most people from your diocese. I don't know you.",
]);

// ── Upgrade 10: Endings ───────────────────────────────────────
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
    { type: 'theosis', min: 10 },
  ]},
  scene: 'ending_revelation',
  priority: 20,
});

// ── Scenes ────────────────────────────────────────────────────
S.registerScenes({

  harbour: {
    location: 'The Harbour',
    mood: 'neutral',
    text: [
      'The crossing begins here.',
      // Upgrade 8: random atmospheric line each visit
      { random: [
        'Fog moves in off the water.',
        'Rain has begun. The boards are dark and wet.',
        'The sky is the colour of old pewter.',
      ]},
      // Upgrade 3: conditional passages
      { if: 'met_ferryman', text: 'The ferryman has not moved since you last saw him.' },
      { if_stat: ['doubt', 3], text: 'Something feels wrong about this place.' },
      { if_playcount: 1, text: 'You have stood here before. The harbour does not acknowledge this.' },
    ],
    choices: [
      {
        text: 'Speak to the ferryman.',
        set_note: 'met_ferryman',
        thought: 'the_shore',
        // Upgrade 6: dialogue tree
        dialogue: [
          { speaker: 'Ferryman', text: 'You have come to make the crossing.' },
          { speaker: 'Ferryman', text: 'Most do not choose it. They simply find themselves here.' },
          { choices: [
            {
              text: '"I chose this."',
              reply: { speaker: 'Ferryman', text: 'Then you are already further along than you think.' },
              set_note: 'spoke_honestly',
              effect: { communion: 1 },
              // Upgrade 5: deferred consequence fires two scenes later
              // Ferryman's words catch up with the player
              next: 'harbour',
            },
            { text: 'Say nothing.', next: 'harbour' },
          ]},
        ],
      },
      {
        text: 'Board the vessel.',
        next: 'aboard',
        effect: { vigilance: 1 },
        // Upgrade 5: push a delayed consequence when this choice is made
        push_consequence: {
          delay_scenes: 3,
          flagsToSet: ['something_follows'],
          // effect fires 3 scenes after boarding
        },
      },
      {
        text: 'Wait in silence.',
        type: 'silence',
        effect: { communion: 1, doubt: 1 },
        // Upgrade 5: fires on the very next choice the player makes
        push_consequence: {
          on_next_choice: true,
          flagsToSet: ['waited_at_harbour'],
        },
        next: 'harbour',
      },
    ],
  },

  aboard: {
    location: 'Aboard the Vessel',
    mood: 'tense',
    on_enter: { thought: 'the_bell' },
    text: [
      'The vessel moves without wind.',
      { if: 'something_follows', text: 'You feel it now — whatever you left behind. It is following.' },
      { if: 'spoke_honestly', text: 'The ferryman\'s words have weight. They settle as you move.' },
    ],
    choices: [
      { text: 'Look toward the far shore.', next: 'mid_crossing', set_note: 'saw_the_light', effect: { vigilance: 1 }, theosis: 5 },
      { text: 'Close your eyes.', type: 'silence', effect: { composure: 1 }, next: 'mid_crossing' },
    ],
  },

  mid_crossing: {
    location: 'The Mid-Crossing',
    mood: 'uncanny',
    text: [
      'Halfway between one shore and the other.',
      { random: ['The water is very still.', 'Something moves beneath.', 'The light changes.'] },
      { if_theosis: 10, text: 'The {ICON} is near. You can feel its weight.' },
    ],
    choices: [
      { text: 'Press on.', next: 'far_shore', effect: { communion: 1 }, theosis: 5 },
      { text: 'Surrender to doubt.', effect: { doubt: 4 }, next: 'far_shore' },
    ],
  },

  far_shore: {
    location: 'The Far Shore',
    mood: 'revelation',
    on_enter: { flag: 'visited_far_shore' },
    text: [
      'You arrive.',
      { if_theosis: 10, text: 'The {ICON} is everywhere here.' },
      'Whether to cross again is not a question you need to answer yet.',
    ],
    choices: [
      { text: 'Begin another crossing.', next: '__new_play__' },
    ],
  },

  ending_dissolution: {
    location: 'The Dissolution',
    mood: 'uncanny',
    text: [
      'The doubt has become everything.',
      'There is no far shore. There was never a far shore.',
      'You release it.',
    ],
    choices: [{ text: 'Begin again.', next: '__new_play__' }],
  },

  ending_revelation: {
    location: 'The Revelation',
    mood: 'revelation',
    text: [
      'You have arrived, and understood what arriving means.',
      'The {ICON} is not a destination. It is a quality of attention.',
      'You will cross again. But something is different now.',
    ],
    choices: [{ text: 'Cross again, changed.', next: '__new_play__', theosis: 10 }],
  },

});

// ── Initial scene & validation ────────────────────────────────
S.setInitialScene('harbour');
S.validate();   // remove or guard for production

// ── Render ────────────────────────────────────────────────────
S.render();
