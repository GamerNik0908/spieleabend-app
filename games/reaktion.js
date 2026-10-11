const { standings } = require('./util');

const PRIZES = [500, 300, 200, 100];

function startRound(room) {
  const g = room.game;
  g.round++;
  g.phase = 'wait';
  g.results = {};
  g.ranking = [];
  g.goAt = null;
  const delay = 2000 + Math.random() * 4000;
  room.setTimer(delay, () => {
    g.phase = 'go';
    g.goAt = Date.now();
    room.setTimer(5000, () => reveal(room));
  });
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'go' && g.phase !== 'wait') return;
  room.clearTimer();
  g.phase = 'reveal';
  const valid = Object.entries(g.results)
    .filter(([, r]) => !r.foul)
    .sort((a, b) => a[1].ms - b[1].ms);
  g.ranking = valid.map(([pid, r], i) => {
    const pts = PRIZES[i] || 0;
    if (pts) room.addPoints(pid, pts);
    return { pid, ms: r.ms, pts };
  });
  g.fouls = Object.entries(g.results)
    .filter(([, r]) => r.foul)
    .map(([pid]) => pid);
}

function allIn(room) {
  const g = room.game;
  const active = room.activePlayers();
  return active.length > 0 && active.every((p) => g.results[p.id]);
}

module.exports = {
  id: 'reaktion',
  name: 'Reaktionstest',
  emoji: '⚡',
  desc: 'Warte auf Grün und tippe so schnell du kannst. Zu früh getippt = raus!',
  minPlayers: 1,
  options: [{ key: 'rounds', label: 'Anzahl Runden', min: 1, max: 20, default: 5 }],

  start(room, opts) {
    room.game = { id: 'reaktion', opts, round: 0, phase: 'ready', results: {}, ranking: [], fouls: [] };
  },

  action(room, action) {
    const g = room.game;
    if (action === 'go' && (g.phase === 'ready' || g.phase === 'reveal')) {
      if (g.round < g.opts.rounds) startRound(room);
      else g.phase = 'end';
    }
    if (action === 'reveal') reveal(room);
  },

  input(room, player, { ms }) {
    const g = room.game;
    if (g.results[player.id]) return;
    if (g.phase === 'wait') {
      g.results[player.id] = { foul: true };
    } else if (g.phase === 'go') {
      const serverMs = Date.now() - g.goAt;
      // Das Gerät misst die Zeit selbst (fairer bei Lag), wir prüfen nur auf Plausibilität
      let m = Number(ms);
      if (!Number.isFinite(m) || m < 80 || m > serverMs + 200) m = serverMs;
      g.results[player.id] = { ms: Math.round(m) };
    } else return;
    if (allIn(room)) reveal(room);
  },

  view(room, viewer) {
    const g = room.game;
    const name = (pid) => room.players.get(pid)?.name || '?';
    const v = {
      phase: g.phase,
      round: g.round,
      rounds: g.opts.rounds,
      answered: Object.keys(g.results).length,
      playerCount: room.activePlayers().length,
    };
    if (viewer.role === 'player') {
      const r = g.results[viewer.pid];
      v.mine = r || null;
      const rank = g.ranking.findIndex((x) => x.pid === viewer.pid);
      v.myRank = rank >= 0 ? rank + 1 : null;
      v.myGain = rank >= 0 ? g.ranking[rank].pts : 0;
    }
    if (g.phase === 'reveal' || g.phase === 'end') {
      v.ranking = g.ranking.map((r) => ({ name: name(r.pid), avatar: room.players.get(r.pid)?.avatar, ms: r.ms, pts: r.pts }));
      v.fouls = (g.fouls || []).map(name);
    }
    if (g.phase === 'end') v.standings = standings(room);
    return v;
  },

  controls(room) {
    const g = room.game;
    if (g.phase === 'ready') return [{ action: 'go', label: '🚦 Runde 1 starten', primary: true }];
    if (g.phase === 'wait' || g.phase === 'go') return [{ action: 'reveal', label: '⏩ Runde beenden' }];
    if (g.phase === 'reveal')
      return [{ action: 'go', label: g.round < g.opts.rounds ? `🚦 Runde ${g.round + 1} starten` : '🏁 Endergebnis', primary: true }];
    return [];
  },
};
