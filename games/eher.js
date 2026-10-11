const content = require('./content');
const { shuffle, tally, topKeys, allAnswered, standings } = require('./util');

function ask(room) {
  const g = room.game;
  g.phase = 'vote';
  g.votes = {};
  g.winners = [];
  g.deadline = Date.now() + g.opts.time * 1000;
  room.setTimer(g.opts.time * 1000, () => reveal(room));
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  room.clearTimer();
  g.phase = 'reveal';
  g.deadline = null;
  g.winners = topKeys(tally(g.votes));
  // Wer mit der Mehrheit gestimmt hat, bekommt Punkte
  for (const [voter, target] of Object.entries(g.votes)) {
    if (g.winners.includes(target)) room.addPoints(voter, 200);
  }
}

module.exports = {
  id: 'eher',
  name: 'Wer würde eher…?',
  emoji: '👀',
  desc: 'Stimmt ab, wer aus der Runde am ehesten… Wer mit der Mehrheit stimmt, kriegt Punkte.',
  minPlayers: 3,
  options: [
    { key: 'rounds', label: 'Anzahl Fragen', min: 3, max: Math.min(30, content.eher.length), default: 10 },
    { key: 'time', label: 'Sekunden zum Abstimmen', min: 10, max: 60, default: 20 },
  ],

  start(room, opts) {
    room.game = { id: 'eher', opts, items: shuffle(content.eher).slice(0, opts.rounds), index: 0 };
    ask(room);
  },

  action(room, action) {
    const g = room.game;
    if (action === 'reveal') reveal(room);
    if (action === 'next' && g.phase === 'reveal') {
      if (g.index + 1 < g.items.length) {
        g.index++;
        ask(room);
      } else g.phase = 'end';
    }
  },

  input(room, player, { target }) {
    const g = room.game;
    if (g.phase !== 'vote' || g.votes[player.id] || !room.players.has(target)) return;
    g.votes[player.id] = target;
    if (allAnswered(room, g.votes)) reveal(room);
  },

  view(room, viewer) {
    const g = room.game;
    const v = {
      phase: g.phase,
      index: g.index,
      total: g.items.length,
      question: g.items[g.index],
      deadline: g.deadline,
      answered: Object.keys(g.votes).length,
      playerCount: room.activePlayers().length,
      candidates: room.playerList().map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
    };
    if (viewer.role === 'player') v.myVote = g.votes[viewer.pid] || null;
    if (g.phase !== 'vote') {
      const counts = tally(g.votes);
      v.results = Object.entries(counts)
        .map(([pid, count]) => ({ id: pid, name: room.players.get(pid)?.name || '?', avatar: room.players.get(pid)?.avatar, count }))
        .sort((a, b) => b.count - a.count);
      v.winners = g.winners;
    }
    if (g.phase === 'end') v.standings = standings(room);
    return v;
  },

  controls(room) {
    const g = room.game;
    if (g.phase === 'vote') return [{ action: 'reveal', label: '⏩ Jetzt auflösen' }];
    if (g.phase === 'reveal') {
      const last = g.index + 1 >= g.items.length;
      return [{ action: 'next', label: last ? '🏁 Endergebnis' : '➡️ Nächste Frage', primary: true }];
    }
    return [];
  },
};
