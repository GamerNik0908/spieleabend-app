const { shuffle, allAnswered, standings } = require('./util');

// Erzeugt ein Multiple-Choice-Spiel aus einem Fragenkatalog.
// Frage-Format: { q: 'Frage', a: 'Richtige Antwort', wrong: ['falsch', 'falsch', 'falsch'] }
module.exports = function makeQuiz({ id, name, emoji, desc, questions, bigQuestion = false }) {
  function ask(room) {
    const g = room.game;
    g.phase = 'question';
    g.answers = {};
    g.gained = {};
    g.startedAt = Date.now();
    g.deadline = g.startedAt + g.opts.time * 1000;
    room.setTimer(g.opts.time * 1000, () => reveal(room));
  }

  function reveal(room) {
    const g = room.game;
    if (g.phase !== 'question') return;
    room.clearTimer();
    g.phase = 'reveal';
    g.deadline = null;
    const item = g.items[g.index];
    const total = g.opts.time * 1000;
    for (const [pid, ans] of Object.entries(g.answers)) {
      if (ans.choice === item.correct) {
        const pts = 500 + Math.round(500 * Math.max(0, 1 - ans.ms / total));
        g.gained[pid] = pts;
        room.addPoints(pid, pts);
      }
    }
  }

  return {
    id,
    name,
    emoji,
    desc,
    minPlayers: 1,
    options: [
      { key: 'rounds', label: 'Anzahl Fragen', min: 3, max: Math.min(30, questions.length), default: 10 },
      { key: 'time', label: 'Sekunden pro Frage', min: 5, max: 60, default: 20 },
    ],

    start(room, opts) {
      const items = shuffle(questions)
        .slice(0, opts.rounds)
        .map((x) => {
          const choices = shuffle([x.a, ...x.wrong.slice(0, 3)]);
          return { q: x.q, choices, correct: choices.indexOf(x.a) };
        });
      room.game = { id, opts, items, index: 0 };
      ask(room);
    },

    action(room, action) {
      const g = room.game;
      if (action === 'reveal') reveal(room);
      if (action === 'next' && g.phase === 'reveal') {
        if (g.index + 1 < g.items.length) {
          g.index++;
          ask(room);
        } else {
          g.phase = 'end';
        }
      }
    },

    input(room, player, { choice }) {
      const g = room.game;
      if (g.phase !== 'question' || g.answers[player.id]) return;
      const c = Number(choice);
      if (!Number.isInteger(c) || c < 0 || c >= g.items[g.index].choices.length) return;
      g.answers[player.id] = { choice: c, ms: Date.now() - g.startedAt };
      if (allAnswered(room, g.answers)) reveal(room);
    },

    view(room, viewer) {
      const g = room.game;
      const item = g.items[g.index];
      const v = {
        phase: g.phase,
        index: g.index,
        total: g.items.length,
        question: item.q,
        choices: item.choices,
        bigQuestion,
        deadline: g.deadline,
        answered: Object.keys(g.answers).length,
        playerCount: room.activePlayers().length,
      };
      if (viewer.role === 'player') {
        const mine = g.answers[viewer.pid];
        v.myChoice = mine ? mine.choice : null;
        v.myGain = g.gained[viewer.pid] || 0;
      }
      if (g.phase === 'reveal' || g.phase === 'end') {
        v.correct = item.correct;
        v.counts = item.choices.map((_, i) => Object.values(g.answers).filter((a) => a.choice === i).length);
        v.gains = Object.entries(g.gained)
          .map(([pid, pts]) => ({ name: room.players.get(pid)?.name, avatar: room.players.get(pid)?.avatar, pts }))
          .filter((x) => x.name)
          .sort((a, b) => b.pts - a.pts);
      }
      if (g.phase === 'end') v.standings = standings(room);
      return v;
    },

    controls(room) {
      const g = room.game;
      if (g.phase === 'question') return [{ action: 'reveal', label: '⏩ Jetzt auflösen' }];
      if (g.phase === 'reveal') {
        const last = g.index + 1 >= g.items.length;
        return [{ action: 'next', label: last ? '🏁 Endergebnis' : '➡️ Nächste Frage', primary: true }];
      }
      return [];
    },
  };
};
