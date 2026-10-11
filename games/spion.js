const content = require('./content');
const { shuffle, pick, tally, topKeys, allAnswered, standings } = require('./util');

function newRound(room) {
  const g = room.game;
  const active = room.activePlayers();
  const cat = pick(content.spion);
  g.round++;
  g.phase = 'roles';
  g.category = cat.category;
  g.word = pick(cat.words);
  g.participants = active.map((p) => p.id);
  const spyCount = Math.min(g.opts.spies, Math.max(1, active.length - 2));
  g.spies = shuffle(g.participants).slice(0, spyCount);
  g.starter = pick(g.participants);
  g.votes = {};
  g.caught = null;
  g.deadline = null;
  room.clearTimer();
}

function startVote(room) {
  const g = room.game;
  room.clearTimer();
  g.phase = 'vote';
  g.votes = {};
  g.deadline = null;
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  room.clearTimer();
  g.phase = 'reveal';
  const top = topKeys(tally(g.votes));
  g.caught = top.length > 0 && top.some((pid) => g.spies.includes(pid));
  for (const pid of g.participants) {
    const isSpy = g.spies.includes(pid);
    if (g.caught && !isSpy) room.addPoints(pid, 300);
    if (!g.caught && isSpy) room.addPoints(pid, 600);
  }
}

module.exports = {
  id: 'spion',
  name: 'Wer ist der Spion?',
  emoji: '🕵️',
  desc: 'Alle kennen das geheime Wort – außer dem Spion. Stellt euch Fragen und entlarvt ihn!',
  minPlayers: 3,
  options: [
    { key: 'rounds', label: 'Anzahl Runden', min: 1, max: 15, default: 5 },
    { key: 'spies', label: 'Anzahl Spione', min: 1, max: 3, default: 1 },
    { key: 'discuss', label: 'Diskussionszeit (Sek.)', min: 30, max: 600, default: 150 },
  ],

  start(room, opts) {
    room.game = { id: 'spion', opts, round: 0 };
    newRound(room);
  },

  action(room, action) {
    const g = room.game;
    if (action === 'discuss' && g.phase === 'roles') {
      g.phase = 'discuss';
      g.deadline = Date.now() + g.opts.discuss * 1000;
      room.setTimer(g.opts.discuss * 1000, () => startVote(room));
    }
    if (action === 'vote' && (g.phase === 'discuss' || g.phase === 'roles')) startVote(room);
    if (action === 'reveal') reveal(room);
    if (action === 'next' && g.phase === 'reveal') {
      if (g.round < g.opts.rounds) newRound(room);
      else g.phase = 'end';
    }
  },

  input(room, player, { target }) {
    const g = room.game;
    if (g.phase !== 'vote' || !g.participants.includes(player.id) || g.votes[player.id]) return;
    if (!g.participants.includes(target) || target === player.id) return;
    g.votes[player.id] = target;
    if (allAnswered(room, g.votes, g.participants)) reveal(room);
  },

  view(room, viewer) {
    const g = room.game;
    const name = (pid) => room.players.get(pid)?.name || '?';
    const v = {
      phase: g.phase,
      round: g.round,
      rounds: g.opts.rounds,
      category: g.category,
      spyCount: g.spies.length,
      deadline: g.deadline,
      starter: name(g.starter),
      answered: Object.keys(g.votes).length,
      playerCount: g.participants.length,
      candidates: g.participants.map((pid) => ({ id: pid, name: name(pid), avatar: room.players.get(pid)?.avatar })),
    };
    if (viewer.role === 'player') {
      v.inRound = g.participants.includes(viewer.pid);
      v.isSpy = g.spies.includes(viewer.pid);
      v.word = v.inRound && !v.isSpy ? g.word : null;
      v.myVote = g.votes[viewer.pid] || null;
    }
    if (viewer.role === 'host') {
      // Der Host sieht alles (im UI verdeckt, bis er draufklickt)
      v.secret = { word: g.word, spies: g.spies.map(name) };
    }
    if (g.phase === 'reveal' || g.phase === 'end') {
      v.word = g.word;
      v.spies = g.spies.map((pid) => ({ name: name(pid), avatar: room.players.get(pid)?.avatar }));
      v.caught = g.caught;
      v.results = Object.entries(tally(g.votes))
        .map(([pid, count]) => ({ name: name(pid), avatar: room.players.get(pid)?.avatar, count, spy: g.spies.includes(pid) }))
        .sort((a, b) => b.count - a.count);
    }
    if (g.phase === 'end') v.standings = standings(room);
    return v;
  },

  controls(room) {
    const g = room.game;
    switch (g.phase) {
      case 'roles':
        return [
          { action: 'discuss', label: '💬 Diskussion starten (mit Timer)', primary: true },
          { action: 'vote', label: '🗳️ Direkt abstimmen' },
        ];
      case 'discuss':
        return [{ action: 'vote', label: '🗳️ Abstimmung starten', primary: true }];
      case 'vote':
        return [{ action: 'reveal', label: '🔍 Spion enthüllen', primary: true }];
      case 'reveal':
        return [{ action: 'next', label: g.round < g.opts.rounds ? '➡️ Nächste Runde' : '🏁 Endergebnis', primary: true }];
      default:
        return [];
    }
  },
};
