const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const games = require('./games');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const MAX_PHOTO_BYTES = 120 * 1024;
const ROOM_IDLE_MS = 1000 * 60 * 60 * 4; // Räume ohne Aktivität nach 4h löschen
const COLORS = ['#d7ff3a', '#ff4d6d', '#4da3ff', '#ffb020', '#2ee59d', '#b16cff', '#ff7ab6', '#38e1ff', '#ff8a3d', '#9be15d'];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 512 * 1024 });

app.use(express.static(path.join(__dirname, 'public')));

// QR-Code für den Beitreten-Link
app.get('/qr.svg', async (req, res) => {
  const url = String(req.query.u || '').slice(0, 300);
  if (!/^https?:\/\//.test(url)) return res.status(400).end();
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0a0a0b', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).end();
  }
});

// Profilbilder werden separat ausgeliefert, damit der Spielzustand klein bleibt
app.get('/photo/:code/:pid', (req, res) => {
  const room = rooms.get(String(req.params.code).toUpperCase());
  const p = room && room.players.get(req.params.pid);
  if (!p || !p.photo) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/jpeg').send(p.photo);
});

// Lokale Netzwerk-Adressen, damit Handys im selben WLAN beitreten können
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
}

app.get('/api/info', (req, res) => res.json({ lan: lanAddresses() }));
app.get('/api/games', (req, res) => res.json(games.list()));

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
    this.hostPid = null; // Spieler-ID, falls der Host selbst mitspielt
    this.spicy = false;
    this.locked = false;
    this.game = null;
    this.timer = null;
    this.colorIndex = 0;
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

  nextColor() {
    return COLORS[this.colorIndex++ % COLORS.length];
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
      color: p.color,
      photo: p.photo ? `/photo/${this.code}/${p.id}?v=${p.photoVersion}` : null,
      score: p.score,
      connected: p.connected,
      isHost: p.id === this.hostPid,
    }));
  }

  buildState(viewer) {
    const mod = this.game ? games.get(this.game.id) : null;
    const state = {
      now: Date.now(),
      code: this.code,
      locked: this.locked,
      spicy: this.spicy,
      players: this.publicPlayers(),
      gameId: this.game ? this.game.id : null,
      gameName: mod ? mod.name : null,
      game: mod ? mod.view(this, viewer) : null,
    };
    if (viewer.role === 'host') {
      state.controls = mod ? mod.controls(this) : [];
      state.screens = this.screenSockets.size;
      state.hostPid = this.hostPid;
      // Der Host kann mitspielen: dann bekommt er zusätzlich seine Spieler-Ansicht
      if (this.hostPid && this.players.has(this.hostPid)) {
        state.me = this.players.get(this.hostPid) && { id: this.hostPid };
        state.playerGame = mod ? mod.view(this, { role: 'player', pid: this.hostPid }) : null;
      }
    }
    if (viewer.role === 'player') state.me = { id: viewer.pid };
    return state;
  }

  broadcast() {
    this.lastActivity = Date.now();
    for (const sid of this.hostSockets) {
      io.to(sid).emit('state', this.buildState({ role: 'host', hostPid: this.hostPid }));
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

// Erwartet ein JPEG als Data-URL (wird im Browser verkleinert)
function parsePhoto(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_PHOTO_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return buf;
}

function nameTaken(room, name, exceptId) {
  return room.playerList().some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
}

function createPlayer(room, { name, photo }) {
  const p = {
    id: newId(),
    name,
    color: room.nextColor(),
    photo: parsePhoto(photo),
    photoVersion: 1,
    score: 0,
    connected: true,
    socketId: null,
  };
  room.players.set(p.id, p);
  return p;
}

function removePlayer(room, pid) {
  room.players.delete(pid);
  if (room.hostPid === pid) room.hostPid = null;
  if (room.game) {
    const mod = games.get(room.game.id);
    if (mod.onLeave) mod.onLeave(room, pid);
  }
}

// ---------------------------------------------------------------------------
// Socket-Verbindungen

io.on('connection', (socket) => {
  let room = null;
  let role = null; // 'host' | 'screen' | 'player'
  let pid = null;

  const alive = () => room && rooms.get(room.code) === room;

  function detach() {
    if (!room) return;
    if (role === 'host') {
      room.hostSockets.delete(socket.id);
      const hp = room.players.get(room.hostPid);
      if (hp && room.hostSockets.size === 0) hp.connected = false;
    }
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

  function attachHost(r) {
    detach();
    room = r;
    role = 'host';
    room.hostSockets.add(socket.id);
    const hp = room.players.get(room.hostPid);
    if (hp) hp.connected = true;
    socket.join(room.code);
  }

  socket.on('host:create', (_, cb = () => {}) => {
    const r = new Room();
    rooms.set(r.code, r);
    attachHost(r);
    cb({ ok: true, code: r.code, hostToken: r.hostToken });
    r.broadcast();
  });

  socket.on('host:resume', ({ code, hostToken } = {}, cb = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.hostToken !== hostToken) return cb({ ok: false, error: 'Raum nicht gefunden' });
    attachHost(r);
    cb({ ok: true, code: r.code });
    r.broadcast();
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

  socket.on('player:join', ({ code, name, photo, playerId } = {}, cb = () => {}) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return cb({ ok: false, error: 'Diesen Code gibt es nicht' });

    // Wiederverbinden mit bestehender Identität
    const existing = playerId && playerId !== r.hostPid && r.players.get(playerId);
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
    if (r.locked) return cb({ ok: false, error: 'Der Raum ist gerade gesperrt' });
    if (r.players.size >= MAX_PLAYERS) return cb({ ok: false, error: 'Der Raum ist voll' });
    if (nameTaken(r, n)) return cb({ ok: false, error: 'Der Name ist schon vergeben' });

    detach();
    room = r;
    role = 'player';
    const p = createPlayer(r, { name: n, photo });
    p.socketId = socket.id;
    pid = p.id;
    socket.join(room.code);
    cb({ ok: true, playerId: pid, code: room.code });
    room.broadcast();
  });

  // Profil ändern (Name/Foto) – für Spieler und für den mitspielenden Host
  socket.on('profile:update', ({ name, photo, removePhoto } = {}, cb = () => {}) => {
    if (!alive()) return cb({ ok: false });
    const id = role === 'host' ? room.hostPid : role === 'player' ? pid : null;
    const p = room.players.get(id);
    if (!p) return cb({ ok: false });
    if (name !== undefined) {
      const n = cleanName(name);
      if (!n) return cb({ ok: false, error: 'Name darf nicht leer sein' });
      if (nameTaken(room, n, p.id)) return cb({ ok: false, error: 'Der Name ist schon vergeben' });
      p.name = n;
    }
    if (photo) {
      const buf = parsePhoto(photo);
      if (!buf) return cb({ ok: false, error: 'Bild konnte nicht gelesen werden' });
      p.photo = buf;
      p.photoVersion++;
    }
    if (removePhoto) p.photo = null;
    cb({ ok: true });
    room.broadcast();
  });

  socket.on('player:leave', (_, cb = () => {}) => {
    if (role !== 'player' || !alive()) return cb();
    const r = room;
    const id = pid;
    detach();
    removePlayer(r, id);
    r.broadcast();
    cb();
  });

  socket.on('player:input', (payload = {}) => {
    if (!alive() || !room.game) return;
    const id = role === 'host' ? room.hostPid : role === 'player' ? pid : null;
    const p = room.players.get(id);
    if (!p) return;
    try {
      games.get(room.game.id).input(room, p, payload || {});
    } catch (e) {
      console.error(e);
    }
    room.broadcast();
  });

  socket.on('host:cmd', (msg = {}, cb = () => {}) => {
    if (role !== 'host' || !alive()) return cb({ ok: false, error: 'Raum existiert nicht mehr' });
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
          const err = games.get(r.game.id).action(r, String(msg.action), msg.payload || {});
          if (typeof err === 'string') return cb({ ok: false, error: err });
          break;
        }
        case 'endGame':
          r.clearTimer();
          r.game = null;
          break;
        case 'hostJoin': {
          // Host spielt selbst mit
          const n = cleanName(msg.name);
          if (!n) return cb({ ok: false, error: 'Bitte gib einen Namen ein' });
          const hp = r.players.get(r.hostPid);
          if (nameTaken(r, n, hp && hp.id)) return cb({ ok: false, error: 'Der Name ist schon vergeben' });
          if (hp) hp.name = n;
          else {
            const p = createPlayer(r, { name: n, photo: msg.photo });
            r.hostPid = p.id;
          }
          break;
        }
        case 'hostLeave':
          if (r.hostPid) removePlayer(r, r.hostPid);
          break;
        case 'kick': {
          const p = r.players.get(msg.pid);
          if (p) {
            if (p.socketId) {
              io.to(p.socketId).emit('kicked', { reason: 'Du wurdest vom Host entfernt.' });
              const s = io.sockets.sockets.get(p.socketId);
              if (s) s.leave(r.code);
            }
            removePlayer(r, p.id);
          }
          break;
        }
        case 'score': {
          const delta = Math.max(-100000, Math.min(100000, Number(msg.delta) || 0));
          r.addPoints(msg.pid, delta);
          break;
        }
        case 'lock':
          r.locked = !!msg.value;
          break;
        case 'spicy':
          r.spicy = !!msg.value;
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
  console.log(`Spieleabend läuft auf http://localhost:${PORT}`);
  for (const url of lanAddresses()) console.log(`Im WLAN erreichbar unter: ${url}`);
});
