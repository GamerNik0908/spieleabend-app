const content = require('./content');
const { shuffle, allAnswered, standings } = require('./util');

const PRIZES = [1000, 600, 400, 200];

function ask(room) {
  const g = room.game;
  g.phase = 'question';
  g.answers = {};
  g.ranking = [];
  g.deadline = Date.now() + g.opts.time * 1000;
  room.setTimer(g.opts.time * 1000, () => reveal(room));
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'question') return;
  room.clearTimer();
  g.phase = 'reveal';
  g.deadline = null;
  const correct = g.items[g.index].a;
  const sorted = Object.entries(g.answers)
    .map(([pid, value]) => ({ pid, value, diff: Math.abs(value - correct) }))
    .sort((a, b) => a.diff - b.diff);
  let rank = 0;
  g.ranking = sorted.map((e, i) => {
    if (i > 0 && e.diff !== sorted[i - 1].diff) rank = i;
    const pts = (PRIZES[rank] || 0) + (e.diff === 0 ? 500 : 0);
    if (pts) room.addPoints(e.pid, pts);
    return { ...e, rank: rank + 1, pts };
  });
}

module.exports = {
  id: 'schaetzen',
  name: 'Schätz mal!',
  emoji: '🎯',
  desc: 'Zahlen schätzen – wer am nächsten dran ist, gewinnt. Volltreffer gibt Bonus!',
  minPlayers: 1,
  options: [
    { key: 'rounds', label: 'Anzahl Fragen', min: 3, max: Math.min(25, content.schaetzen.length), default: 8 },
    { key: 'time', label: 'Sekunden pro Frage', min: 10, max: 90, default: 30 },
  ],

  start(room, opts) {
    room.game = { id: 'schaetzen', opts, items: shuffle(content.schaetzen).slice(0, opts.rounds), index: 0 };
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

  input(room, player, { value }) {
    const g = room.game;
    if (g.phase !== 'question' || g.answers[player.id] !== undefined) return;
    let str = String(value).replace(/\s/g, '');
    // Punkte als Tausendertrenner nur bei eindeutigen Fällen (1.000.000 oder 1.000,5)
    if (/^-?\d{1,3}((\.\d{3}){2,}|(\.\d{3})+,\d+)$/.test(str)) str = str.replace(/\./g, '');
    const n = Number(str.replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) > 1e13) return;
    g.answers[player.id] = n;
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
      unit: item.unit || '',
      deadline: g.deadline,
      answered: Object.keys(g.answers).length,
      playerCount: room.activePlayers().length,
    };
    if (viewer.role === 'player') {
      v.myAnswer = g.answers[viewer.pid] ?? null;
      const mine = g.ranking.find((r) => r.pid === viewer.pid);
      v.myRank = mine ? mine.rank : null;
      v.myGain = mine ? mine.pts : 0;
    }
    if (g.phase !== 'question') {
      v.correct = item.a;
      v.ranking = g.ranking.map((r) => ({
        name: room.players.get(r.pid)?.name || '?',
        avatar: room.players.get(r.pid)?.avatar || '❔',
        value: r.value,
        rank: r.rank,
        pts: r.pts,
      }));
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
