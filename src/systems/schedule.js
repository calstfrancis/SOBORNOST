// ── SOBORNOST ENGINE — systems/schedule.js ────────────────────
// Centralised render scheduler. All modules call scheduleRender()
// instead of doing import('../ui/renderer.js').then(m => m.render()).
//
// Benefits:
//   • Eliminates scattered dynamic imports and their race conditions
//   • Deduplicates multiple render requests within one synchronous
//     execution (only one render fires per microtask batch)
//   • Prevents processConsequenceQueue→render→processConsequenceQueue
//     re-entrance by deferring past the current call stack
//
// Usage:
//   Any module that needs to trigger a render imports scheduleRender:
//     import { scheduleRender } from './schedule.js';
//     scheduleRender();
//
//   renderer.js registers itself on load:
//     import { setRenderFn } from '../systems/schedule.js';
//     setRenderFn(render);

let _renderFn   = null;
let _scheduled  = false;

/** Called once by renderer.js at module evaluation time. */
export function setRenderFn(fn) {
  _renderFn = fn;
}

/**
 * Schedule a render on the next microtask.
 * Multiple calls within the same synchronous block collapse to one render.
 */
export function scheduleRender() {
  if (_scheduled) return;
  if (!_renderFn) {
    console.warn('[SOBORNOST] scheduleRender() called before renderer registered');
    return;
  }
  _scheduled = true;
  queueMicrotask(() => {
    _scheduled = false;
    _renderFn();
  });
}
