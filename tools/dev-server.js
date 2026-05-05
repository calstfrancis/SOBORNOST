#!/usr/bin/env node
// ── SOBORNOST ENGINE — tools/dev-server.js ────────────────────
// Upgrade 1: Hot-Reload Development Server.
//
// A minimal Node.js HTTP + WebSocket server that:
//   1. Serves your game files over HTTP
//   2. Watches your game/ directory for file changes
//   3. Sends a reload signal over WebSocket to the browser
//
// ── Requirements ──────────────────────────────────────────────
// Node.js 18+. No npm packages required — uses only Node built-ins.
// Node 18+ ships with native WebSocket server support via the `ws`
// module... actually it doesn't. We implement a minimal WebSocket
// handshake from scratch using net + crypto. No dependencies.
//
// ── Usage ─────────────────────────────────────────────────────
//   node tools/dev-server.js [port] [gameDir]
//
//   Defaults: port=3000, gameDir=./game
//
//   Then open: http://localhost:3000
//
// ── In your game HTML ──────────────────────────────────────────
//   <script type="module" src="src/index.js"></script>
//   <script type="module" src="game/data.js"></script>
//
//   And in your data file, enable dev mode:
//   SOBORNOST.devMode(3001);   // WebSocket port = HTTP port + 1
//
// ── What happens on file change ───────────────────────────────
//   The server detects a change in game/*.js (or any watched file).
//   It sends { type: 'reload', file: 'path/to/changed.js' } over WS.
//   The browser's devMode client re-imports the changed data file and
//   calls SOBORNOST.render() — without a page reload, preserving G.

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const net    = require('net');
const crypto = require('crypto');

const PORT     = parseInt(process.argv[2]) || 3000;
const WS_PORT  = PORT + 1;
const GAME_DIR = path.resolve(process.argv[3] || './game');
const ROOT_DIR = path.resolve('.');

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
};

// ── HTTP server ───────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT_DIR, urlPath);
  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[SOBORNOST dev] HTTP  → http://localhost:${PORT}`);
  console.log(`[SOBORNOST dev] WS    → ws://localhost:${WS_PORT}`);
  console.log(`[SOBORNOST dev] Watch → ${GAME_DIR}`);
});

// ── Minimal WebSocket server (RFC 6455, no dependencies) ──────
const _wsClients = new Set();

function _wsHandshake(socket, req) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  _wsClients.add(socket);
  socket.on('close', () => _wsClients.delete(socket));
  socket.on('error', () => _wsClients.delete(socket));
}

function _wsSend(socket, message) {
  const payload = Buffer.from(JSON.stringify(message));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch (e) { _wsClients.delete(socket); }
}

function _broadcast(message) {
  for (const socket of _wsClients) _wsSend(socket, message);
}

// Raw TCP server for WebSocket upgrades
const wsServer = net.createServer(socket => {
  let upgraded = false;
  let buffer   = Buffer.alloc(0);

  socket.on('data', chunk => {
    if (upgraded) return; // ignore data after handshake for this simple server
    buffer = Buffer.concat([buffer, chunk]);
    const raw = buffer.toString('utf8');
    if (!raw.includes('\r\n\r\n')) return; // headers not complete yet

    // Parse minimal HTTP request
    const lines   = raw.split('\r\n');
    const headers = {};
    lines.slice(1).forEach(line => {
      const idx = line.indexOf(':');
      if (idx > -1) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    });

    if (headers['upgrade'] === 'websocket') {
      upgraded = true;
      _wsHandshake(socket, { headers });
    }
  });
});

wsServer.listen(WS_PORT);

// ── File watcher ──────────────────────────────────────────────
let _debounceTimer = null;

function _watchDir(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[SOBORNOST dev] Watch dir not found: ${dir}`);
    return;
  }
  fs.watch(dir, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith('.js')) return;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const rel = path.relative(ROOT_DIR, path.join(dir, filename)).replace(/\\/g, '/');
      console.log(`[SOBORNOST dev] Changed: ${rel}`);
      _broadcast({ type: 'reload', file: rel });
    }, 80);
  });
}

// Watch game/ directory and src/ directory
_watchDir(GAME_DIR);
_watchDir(path.resolve('./src'));

process.on('SIGINT', () => {
  console.log('\n[SOBORNOST dev] Shutting down.');
  process.exit(0);
});
