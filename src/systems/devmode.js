// ── SOBORNOST ENGINE — systems/devmode.js ─────────────────────
// Upgrade 1: Hot-Reload Development Client (browser side).
//
// Called from your data file AFTER SOBORNOST is available:
//
//   SOBORNOST.devMode(3001);   // WS port = HTTP port + 1 (default: 3001)
//
// On file change signal from the dev server:
//   1. The changed file is re-imported via a cache-busted URL.
//   2. SOBORNOST.render() is called.
//   3. Game state (G) is fully preserved — no page reload.
//
// ── What gets reloaded ────────────────────────────────────────
//   Only game data files (game/*.js) are hot-reloaded. Engine files
//   (src/**) trigger a full page reload because ES module re-import
//   cannot replace live bindings in already-loaded modules. For engine
//   development, a manual refresh remains necessary.
//
// ── Limitations ───────────────────────────────────────────────
//   • Re-importing a data file re-runs all registerScenes() calls,
//     overwriting existing scene registrations with the new data.
//     G state is preserved, so if the player is on a scene that no
//     longer exists after the reload, the scene-not-found handler fires.
//   • Sounding, charism, and note registrations are cumulative (additive)
//     across hot reloads. If you remove a registration, you must refresh.
//   • devMode() is a no-op in production — it only activates if the
//     page is served from localhost or 127.0.0.1.

import { scheduleRender } from './schedule.js';

let _ws       = null;
let _wsPort   = 3001;
let _retries  = 0;
const MAX_RETRIES = 10;
const RETRY_DELAY = 2000;

const _isLocal = () =>
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '::1';

export function devMode(wsPort = 3001) {
  if (!_isLocal()) {
    // Silently no-op on non-local origins — safe to leave in data files
    return;
  }
  _wsPort = wsPort;
  _connect();
  console.log(`%c[SOBORNOST devMode] connected on ws://localhost:${wsPort}`, 'color:#90c060;font-weight:bold');
  console.log('%c[SOBORNOST devMode] Hot-reload active. Edit game/*.js and save.', 'color:#90c060');
}

function _connect() {
  _ws = new WebSocket(`ws://localhost:${_wsPort}`);

  _ws.onopen = () => {
    _retries = 0;
    console.log('[SOBORNOST devMode] WS connected');
  };

  _ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === 'reload') {
      const file = msg.file || '';
      const isEngine = file.startsWith('src/');

      if (isEngine) {
        // Engine files cannot be hot-reloaded — full reload needed
        console.log(`[SOBORNOST devMode] Engine file changed (${file}) — reloading page…`);
        location.reload();
        return;
      }

      // Game data file — re-import with cache bust
      const url = '/' + file + '?v=' + Date.now();
      console.log(`[SOBORNOST devMode] Hot-reloading: ${file}`);
      import(/* @vite-ignore */ url)
        .then(() => {
          scheduleRender();
          console.log(`%c[SOBORNOST devMode] ✓ ${file}`, 'color:#90c060');
        })
        .catch(err => {
          console.error(`[SOBORNOST devMode] Failed to reload ${file}:`, err);
        });
    }
  };

  _ws.onclose = () => {
    if (_retries < MAX_RETRIES) {
      _retries++;
      setTimeout(_connect, RETRY_DELAY);
    } else {
      console.warn('[SOBORNOST devMode] WS disconnected. Giving up reconnect after 10 attempts.');
    }
  };

  _ws.onerror = () => {
    // Error is always followed by close, which handles reconnect
  };
}
