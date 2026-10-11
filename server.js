const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const games = require('./games');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const ROOM_IDLE_MS = 1000 * 60 * 60 * 3; // Räume ohne Aktivität nach 3h löschen

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// QR-Code für den Beitreten-Link
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.u || '').slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).end();
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).end();
  }
});

// Lokale Netzwerk-Adressen, damit Handys im selben WLAN beitreten können
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
}

app.get('/api/info', (req, res) => {
  res.json({ lan: lanAddresses() });
});

app.get('/api/games', (req, res) => {
  res.json(games.list());
});

// ---------------------------------------------------------------------------
// Räume

const rooms = new Map();
const newId = () => crypto.randomBytes(9).toString('base64url');

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor() {
    this.code = makeCode();
    this.hostToken = newId();
    this.hostSockets = new Set();
    this.screenSockets = new Set();
    this.players = new Map();
    this.locked = false;
    this.game = null;
    this.timer = null;
    this.lastActivity = Date.now();
  }

  playerList() {
    return [...this.players.values()];
  }

  activePlayers() {
    return this.playerList().filter((p) => p.connected);
  }

  addPoints(pid, n) {
    const p = this.players.get(pid);
    if (p) p.score += n;
  }

  setTimer(ms, fn) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
      this.broadcast();
    }, ms);
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  publicPlayers() {
    return this.playerList().map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
    }));
  }

  buildState(viewer) {
    const mod = this.game ? games.get(this.game.id) : null;
    const state = {
      now: Date.now(),
      code: this.code,
      locked: this.locked,
      players: this.publicPlayers(),
      gameId: this.game ? this.game.id : null,
      gameName: mod ? mod.name : null,
      gameEmoji: mod ? mod.emoji : null,
      game: mod ? mod.view(this, viewer) : null,
    };
    if (viewer.role === 'host') {
      state.controls = mod ? mod.controls(this) : [];
      state.screens = this.screenSockets.size;
    }
    if (viewer.role === 'player') {
      const me = this.players.get(viewer.pid);
      state.me = me ? { id: me.id, name: me.name, avatar: me.avatar, score: me.score } : null;
    }
    return state;
  }

  broadcast() {
    this.lastActivity = Date.now();
    for (const sid of this.hostSockets) {
      io.to(sid).emit('state', this.buildState({ role: 'host' }));
    }
    for (const sid of this.screenSockets) {
      io.to(sid).emit('state', this.buildState({ role: 'screen' }));
    }
    for (const p of this.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('state', this.buildState({ role: 'player', pid: p.id }));
    }
  }

  close() {
    this.clearTimer();
    io.to(this.code).emit('room:closed');
    rooms.delete(this.code);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.lastActivity > ROOM_IDLE_MS) room.close();
  }
}, 60 * 1000);

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Socket-Verbindungen

io.on('connection', (socket) => {
  let room = null;
  let role = null; // 'host' | 'screen' | 'player'
  let pid = null;

  function detach() {
    if (!room) return;
    if (role === 'host') room.hostSockets.delete(socket.id);
    if (role === 'screen') room.screenSockets.delete(socket.id);
    if (role === 'player') {
      const p = room.players.get(pid);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        p.socketId = null;
      }
    }
    socket.leave(room.code);
    room.broadcast();
    room = null;
    role = null;
    pid = null;
  }

  socket.on('host:create', (_, cb = () => {}) => {
    detach();
    room = new Room();
    rooms.set(room.code, room);
    role = 'host';
    room.hostSockets.add(socket.id);
    socket.join(room.code);
    cb({ ok: true, code: room.code, hostToken: room.hostToken });
    room.broadcast();
  });

  socket.on('host:resume', ({ code, hostToken } = {}, cb = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.hostToken !== hostToken) return cb({ ok: false, error: 'Raum nicht gefunden' });
    detach();
    room = r;
    role = 'host';
    room.hostSockets.add(socket.id);
    socket.join(room.code);
    cb({ ok: true, code: room.code });
    room.broadcast();
  });

  socket.on('screen:join', ({ code } = {}, cb = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return cb({ ok: false, error: 'Raum nicht gefunden' });
    detach();
    room = r;
    role = 'screen';
    room.screenSockets.add(socket.id);
    socket.join(room.code);
    cb({ ok: true });
    room.broadcast();
  });

  socket.on('player:join', ({ code, name, avatar, playerId } = {}, cb = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return cb({ ok: false, error: 'Diesen Code gibt es nicht 🤔' });

    // Wiederverbinden mit bestehender Identität
    const existing = playerId && r.players.get(playerId);
    if (existing) {
      detach();
      if (existing.socketId && existing.socketId !== socket.id) {
        io.to(existing.socketId).emit('kicked', { reason: 'Du bist auf einem anderen Gerät beigetreten.' });
      }
      room = r;
      role = 'player';
      pid = existing.id;
      existing.socketId = socket.id;
      existing.connected = true;
      socket.join(room.code);
      cb({ ok: true, playerId: pid, code: room.code });
      return room.broadcast();
    }

    const n = cleanName(name);
    if (!n) return cb({ ok: false, error: 'Bitte gib einen Namen ein' });
    if (r.locked) return cb({ ok: false, error: 'Der Raum ist gerade gesperrt 🔒' });
    if (r.players.size >= MAX_PLAYERS) return cb({ ok: false, error: 'Der Raum ist voll' });
    if (r.playerList().some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      return cb({ ok: false, error: 'Der Name ist schon vergeben' });
    }

    detach();
    room = r;
    role = 'player';
    pid = newId();
    room.players.set(pid, {
      id: pid,
      name: n,
      avatar: String(avatar || '😎').slice(0, 8),
      score: 0,
      connected: true,
      socketId: socket.id,
    });
    socket.join(room.code);
    cb({ ok: true, playerId: pid, code: room.code });
    room.broadcast();
  });

  socket.on('player:leave', (_, cb = () => {}) => {
    if (role !== 'player' || !room) return cb();
    const r = room;
    const id = pid;
    detach();
    r.players.delete(id);
    r.broadcast();
    cb();
  });

  socket.on('player:input', (payload = {}) => {
    if (role !== 'player' || !room || !room.game || rooms.get(room.code) !== room) return;
    const p = room.players.get(pid);
    if (!p) return;
    const mod = games.get(room.game.id);
    try {
      mod.input(room, p, payload);
    } catch (e) {
      console.error(e);
    }
    room.broadcast();
  });

  socket.on('host:cmd', (msg = {}, cb = () => {}) => {
    if (role !== 'host' || !room || rooms.get(room.code) !== room) return cb({ ok: false, error: 'Raum existiert nicht mehr' });
    const r = room;
    try {
      switch (msg.cmd) {
        case 'startGame': {
          const mod = games.get(msg.gameId);
          if (!mod) return cb({ ok: false, error: 'Unbekanntes Spiel' });
          const count = r.activePlayers().length;
          if (count < mod.minPlayers) {
            return cb({ ok: false, error: `Für ${mod.name} braucht ihr mindestens ${mod.minPlayers} Spieler` });
          }
          r.clearTimer();
          r.game = { id: mod.id };
          mod.start(r, games.resolveOptions(mod, msg.options));
          break;
        }
        case 'action': {
          if (!r.game) break;
          games.get(r.game.id).action(r, String(msg.action), msg.payload || {});
          break;
        }
        case 'endGame':
          r.clearTimer();
          r.game = null;
          break;
        case 'kick': {
          const p = r.players.get(msg.pid);
          if (p) {
            if (p.socketId) {
              io.to(p.socketId).emit('kicked', { reason: 'Du wurdest vom Host entfernt.' });
              const s = io.sockets.sockets.get(p.socketId);
              if (s) s.leave(r.code);
            }
            r.players.delete(p.id);
          }
          break;
        }
        case 'score': {
          const delta = Math.max(-10000, Math.min(10000, Number(msg.delta) || 0));
          r.addPoints(msg.pid, delta);
          break;
        }
        case 'lock':
          r.locked = !!msg.value;
          break;
        case 'resetScores':
          for (const p of r.players.values()) p.score = 0;
          break;
        case 'closeRoom':
          cb({ ok: true });
          r.close();
          room = null;
          return;
        default:
          return cb({ ok: false, error: 'Unbekannter Befehl' });
      }
    } catch (e) {
      console.error(e);
      return cb({ ok: false, error: 'Fehler: ' + e.message });
    }
    cb({ ok: true });
    r.broadcast();
  });

  socket.on('disconnect', detach);
});

server.listen(PORT, () => {
  console.log(`🎉 Spieleabend läuft auf http://localhost:${PORT}`);
  for (const url of lanAddresses()) console.log(`   Im WLAN erreichbar unter: ${url}`);
});
