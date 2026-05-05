// ── SOBORNOST ENGINE — systems/dialogue.js ────────────────────
// Upgrade 6: Branching Dialogue Trees.
//
// Dialogue is defined inline on a choice as a `dialogue:` array.
// The dialogue runs without leaving the current scene until a
// terminal choice navigates away.
//
// ── Authoring format ──────────────────────────────────────────
//
//   choices: [
//     {
//       text: 'Speak to the ferryman.',
//       effect: { communion: 1 },    // applied immediately on click
//       dialogue: [
//         // NPC lines — show with Continue button
//         { speaker: 'Ferryman', text: 'You have been here before.' },
//         { speaker: 'Ferryman', text: 'Many times.' },
//
//         // Player choice node — always the last beat, or anywhere mid-dialogue
//         { choices: [
//           {
//             text: '"I don\'t remember."',
//             reply: { speaker: 'Ferryman', text: 'That is how it works.' },
//             effect: { doubt: 1 },
//             next: 'aboard',
//           },
//           {
//             text: '"Tell me more."',
//             reply: { speaker: 'Ferryman', text: 'There is always more. But not today.' },
//             next: 'aboard',
//           },
//         ]},
//       ],
//     },
//   ]
//
// ── Beat types ────────────────────────────────────────────────
//
//   NPC line:   { speaker: 'Name', text: 'String.' }
//   Narration:  { text: 'String.' }   (no speaker, styled differently)
//   Player choices: { choices: [ ...dialogueChoice ] }
//
// ── DialogueChoice shape ──────────────────────────────────────
//
//   {
//     text: 'Player line.',              // required
//     reply: { speaker, text },          // optional NPC reply shown before navigation
//     effect: { stat: delta },           // optional stat effect
//     set_flag: 'flag_id',              // optional
//     set_note: 'note_key',             // optional
//     next: 'scene_id',                 // required — navigate after reply (or immediately)
//   }
//
// ── Renderer interface ────────────────────────────────────────
//
//   G._dialogue is null when no dialogue is active.
//   When active:
//     {
//       beats:        Beat[],   // full authored beat array (immutable)
//       beatIndex:    number,   // index of beat currently displayed
//       pendingReply: { speaker, text } | null,   // reply being shown
//       pendingNext:  string | null,              // scene to go to after reply
//     }
//
//   The renderer checks G._dialogue and calls renderDialogue(root).

import { G } from '../core/state.js';
import { emit } from '../core/events.js';
import { scheduleRender } from './schedule.js';
import { applyEffect, setFlag, addNote } from './mechanics.js';
import { navigate } from './navigation.js';

// ── Start ─────────────────────────────────────────────────────

/**
 * Initiate a dialogue. Called from applyChoice when choice.dialogue is present.
 * The calling choice's own effects (effect, set_flag, etc.) are applied first
 * by applyChoice before startDialogue is called.
 */
export function startDialogue(beats) {
  if (!beats || !beats.length) return;
  G._dialogue = { beats, beatIndex: 0, pendingReply: null, pendingNext: null };
  scheduleRender();
  emit('dialogueStarted');
}

// ── Navigation ────────────────────────────────────────────────

/** Advance past a narration or NPC beat. */
export function advanceDialogue() {
  if (!G._dialogue) return;
  const { beats, beatIndex, pendingReply, pendingNext } = G._dialogue;

  // If we're showing a pending reply, navigating away concludes the dialogue
  if (pendingReply) {
    G._dialogue = null;
    if (pendingNext) navigate(pendingNext);
    else scheduleRender();
    emit('dialogueEnded');
    return;
  }

  const next = beatIndex + 1;
  if (next >= beats.length) {
    // Ran off the end without a choices beat — close dialogue
    G._dialogue = null;
    scheduleRender();
    emit('dialogueEnded');
    return;
  }

  G._dialogue = { ...G._dialogue, beatIndex: next };
  scheduleRender();
}

/** Handle a player selecting a choice within a { choices: [...] } beat. */
export function selectDialogueChoice(dc) {
  if (!G._dialogue) return;

  // Apply the choice's effects immediately
  if (dc.effect)   applyEffect(dc.effect);
  if (dc.set_flag) setFlag(dc.set_flag);
  if (dc.set_note) addNote(dc.set_note);

  emit('dialogueChoiceMade', { text: dc.text, next: dc.next });

  if (dc.reply) {
    // Show the reply beat; navigation happens after Continue
    G._dialogue = {
      ...G._dialogue,
      pendingReply: { speaker: dc.reply.speaker, text: dc.reply.text },
      pendingNext:  dc.next || null,
    };
    scheduleRender();
  } else {
    // No reply — close dialogue and navigate immediately
    G._dialogue = null;
    emit('dialogueEnded');
    if (dc.next) navigate(dc.next);
    else scheduleRender();
  }
}

// ── Renderer helper ───────────────────────────────────────────

/**
 * Render the current dialogue beat into `root`.
 * Called by renderer.js when G._dialogue is non-null.
 */
export function renderDialogue(root, processTextFn) {
  if (!G._dialogue) return;
  const { beats, beatIndex, pendingReply } = G._dialogue;

  const wrap = document.createElement('div'); wrap.className = 'dialogue-wrap';

  if (pendingReply) {
    // Show the NPC's reply to the player's choice
    _renderNpcBeat(wrap, pendingReply.speaker, pendingReply.text, processTextFn);
    const cont = _continueBtn(() => advanceDialogue());
    wrap.appendChild(cont);
    root.appendChild(wrap);
    return;
  }

  const beat = beats[beatIndex];
  if (!beat) { advanceDialogue(); return; }

  if (beat.choices) {
    // Player choice node
    const cd = document.createElement('div'); cd.className = 'dialogue-choices';
    beat.choices.forEach(dc => {
      const btn = document.createElement('button'); btn.className = 'choice dialogue-choice';
      btn.textContent = processTextFn ? processTextFn(dc.text) : dc.text;
      btn.onclick = () => selectDialogueChoice(dc);
      cd.appendChild(btn);
    });
    wrap.appendChild(cd);
  } else if (beat.speaker) {
    // NPC or named narrator line
    _renderNpcBeat(wrap, beat.speaker, beat.text, processTextFn);
    const cont = _continueBtn(() => advanceDialogue());
    wrap.appendChild(cont);
  } else if (beat.text) {
    // Narration — no speaker attribution
    const p = document.createElement('p'); p.className = 'sp dialogue-narration';
    p.innerHTML = processTextFn ? processTextFn(beat.text) : beat.text;
    wrap.appendChild(p);
    const cont = _continueBtn(() => advanceDialogue());
    wrap.appendChild(cont);
  } else {
    // Unknown beat shape — skip it
    advanceDialogue();
    return;
  }

  root.appendChild(wrap);
}

function _renderNpcBeat(wrap, speaker, text, processTextFn) {
  const block = document.createElement('div'); block.className = 'dialogue-npc';
  const sp = document.createElement('div'); sp.className = 'dialogue-speaker';
  sp.textContent = speaker;
  const tp = document.createElement('p'); tp.className = 'sp dialogue-line';
  tp.innerHTML = processTextFn ? processTextFn(text) : text;
  block.appendChild(sp); block.appendChild(tp); wrap.appendChild(block);
}

function _continueBtn(onclick) {
  const btn = document.createElement('button'); btn.className = 'choice dialogue-continue';
  btn.textContent = 'Continue \u2014'; btn.onclick = onclick; return btn;
}
