const content = require('./content');
const { shuffle, allAnswered, standings } = require('./util');

function ask(room) {
  const g = room.game;
  g.phase = 'vote';
  g.votes = {};
  g.deadline = Date.now() + g.opts.time * 1000;
  room.setTimer(g.opts.time * 1000, () => reveal(room));
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  room.clearTimer();
  g.phase = 'reveal';
  g.deadline = null;
  const a = Object.values(g.votes).filter((x) => x === 0).length;
  const b = Object.values(g.votes).filter((x) => x === 1).length;
  if (a === b) return;
  const majority = a > b ? 0 : 1;
  for (const [pid, choice] of Object.entries(g.votes)) {
    if (choice === majority) room.addPoints(pid, 100);
  }
}

module.exports = {
  id: 'lieber',
  name: 'Lieber… oder…?',
  emoji: '⚖️',
  desc: 'Zwei Optionen, eine Entscheidung. Seht, wie die Gruppe tickt – die Mehrheit punktet.',
  minPlayers: 2,
  options: [
    { key: 'rounds', label: 'Anzahl Fragen', min: 3, max: Math.min(30, content.lieber.length), default: 10 },
    { key: 'time', label: 'Sekunden zum Abstimmen', min: 5, max: 60, default: 15 },
  ],

  start(room, opts) {
    room.game = { id: 'lieber', opts, items: shuffle(content.lieber).slice(0, opts.rounds), index: 0 };
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

  input(room, player, { choice }) {
    const g = room.game;
    if (g.phase !== 'vote' || g.votes[player.id] !== undefined) return;
    if (choice !== 0 && choice !== 1) return;
    g.votes[player.id] = choice;
    if (allAnswered(room, g.votes)) reveal(room);
  },

  view(room, viewer) {
    const g = room.game;
    const v = {
      phase: g.phase,
      index: g.index,
      total: g.items.length,
      options: g.items[g.index],
      deadline: g.deadline,
      answered: Object.keys(g.votes).length,
      playerCount: room.activePlayers().length,
    };
    if (viewer.role === 'player') v.myChoice = g.votes[viewer.pid] ?? null;
    if (g.phase !== 'vote') {
      v.counts = [0, 1].map((c) => Object.values(g.votes).filter((x) => x === c).length);
      v.voters = [0, 1].map((c) =>
        Object.entries(g.votes)
          .filter(([, x]) => x === c)
          .map(([pid]) => room.players.get(pid)?.avatar || '❔')
      );
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
