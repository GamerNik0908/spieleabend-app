const categories = require('../content/board');
const roasts = require('../content/roasts');
const { shuffle, pick } = require('./util');

const VALUES = [100, 200, 300, 400, 500];

// Ablauf: pick (wer dran ist, wählt ein Feld) -> answer (antworten, Buzzer drücken, Host bewertet)
//   falsch -> steal (alle anderen dürfen buzzern) -> stealAnswer -> ... -> reveal -> nächste Person

function roast(room, kind, name) {
  return pick(roasts[kind][room.spicy ? 'spicy' : 'mild']).replace(/\{name\}/g, name);
}

function chooser(room, g) {
  const order = g.order.filter((pid) => room.players.has(pid));
  if (!order.length) return null;
  return order[g.chooserIdx % order.length];
}

function stealEligible(room, g) {
  return room
    .activePlayers()
    .filter((p) => g.order.includes(p.id) && !g.attempted.includes(p.id) && p.id !== room.hostPid)
    .map((p) => p.id);
}

function cellAt(g) {
  return g.cats[g.cell.c].cells[g.cell.r];
}

function pickCell(room, c, r) {
  const g = room.game;
  const cell = g.cats[c] && g.cats[c].cells[r];
  if (g.phase !== 'pick' || !cell || cell.used) return;
  cell.used = true;
  g.cell = { c, r };
  g.answerer = chooser(room, g);
  g.attempted = [g.answerer];
  g.buzzed = false;
  g.results = [];
  g.comment = null;
  g.phase = 'answer';
}

function judge(room, correct) {
  const g = room.game;
  if (g.phase !== 'answer' && g.phase !== 'stealAnswer') return;
  const cell = cellAt(g);
  const pid = g.answerer;
  const name = room.players.get(pid)?.name || '?';
  const delta = correct ? cell.v : -Math.round(cell.v / 2);
  room.addPoints(pid, delta);
  g.results.push({ pid, correct, delta });
  if (correct) {
    cell.by = pid;
    g.comment = roast(room, 'right', name);
    g.phase = 'reveal';
    return;
  }
  g.comment = roast(room, 'wrong', name);
  afterWrong(room);
}

function afterWrong(room) {
  const g = room.game;
  if (g.opts.steal && stealEligible(room, g).length) {
    g.phase = 'steal';
    g.answerer = null;
  } else {
    g.phase = 'reveal';
  }
}

function next(room) {
  const g = room.game;
  g.cell = null;
  g.answerer = null;
  g.chooserIdx++;
  g.phase = g.cats.every((cat) => cat.cells.every((x) => x.used)) ? 'end' : 'pick';
}

module.exports = {
  id: 'board',
  name: 'Quiz-Board',
  short: 'Kategorien und Punkte von 100 bis 500 auswählen. Falsch heißt halbe Punkte Abzug, danach dürfen die anderen buzzern.',
  minPlayers: 1,
  options: [
    { key: 'cats', label: 'Kategorien', min: 3, max: Math.min(6, categories.length), default: 5 },
    { key: 'steal', label: 'Buzzern nach Fehler (1 = an, 0 = aus)', min: 0, max: 1, default: 1 },
  ],

  start(room, opts) {
    for (const p of room.players.values()) p.score = 0;
    const cats = shuffle(categories)
      .slice(0, opts.cats)
      .map((cat) => ({
        name: cat.name,
        cells: VALUES.map((v, i) => {
          const q = pick(cat.levels[i]);
          return { v, q: q.q, a: q.a, used: false, by: null };
        }),
      }));
    room.game = {
      id: 'board',
      opts,
      cats,
      order: shuffle(room.activePlayers().map((p) => p.id)),
      chooserIdx: 0,
      phase: 'pick',
      cell: null,
      answerer: null,
      attempted: [],
      results: [],
      buzzed: false,
      comment: null,
    };
  },

  action(room, action, p) {
    const g = room.game;
    switch (action) {
      case 'pick':
        pickCell(room, Number(p.c), Number(p.r));
        break;
      case 'judge':
        judge(room, !!p.correct);
        break;
      case 'closeSteal':
        if (g.phase === 'steal' || g.phase === 'stealAnswer') g.phase = 'reveal';
        break;
      case 'next':
        if (g.phase === 'reveal') next(room);
        break;
      case 'cancel':
        // Frage zurücklegen, z. B. wenn aus Versehen gewählt
        if (g.cell && (g.phase === 'answer' || g.phase === 'steal' || g.phase === 'stealAnswer') && !g.results.length) {
          cellAt(g).used = false;
          g.cell = null;
          g.answerer = null;
          g.phase = 'pick';
        }
        break;
      case 'reopen': {
        const cell = g.cats[p.c] && g.cats[p.c].cells[p.r];
        if (cell && cell.used && g.phase === 'pick') {
          cell.used = false;
          cell.by = null;
        }
        break;
      }
      case 'skipChooser':
        if (g.phase === 'pick') g.chooserIdx++;
        break;
      case 'end':
        g.phase = 'end';
        break;
    }
  },

  input(room, player, p) {
    const g = room.game;
    if (p.type === 'pick' && g.phase === 'pick' && chooser(room, g) === player.id) pickCell(room, Number(p.c), Number(p.r));
    if (p.type === 'buzz') {
      if (g.phase === 'answer' && g.answerer === player.id) g.buzzed = true;
      if (g.phase === 'steal' && stealEligible(room, g).includes(player.id)) {
        g.answerer = player.id;
        g.attempted.push(player.id);
        g.phase = 'stealAnswer';
      }
    }
  },

  onLeave(room, pid) {
    const g = room.game;
    if ((g.phase === 'answer' || g.phase === 'stealAnswer') && g.answerer === pid) afterWrong(room);
  },

  view(room, viewer) {
    const g = room.game;
    const cell = g.cell ? cellAt(g) : null;
    const v = {
      phase: g.phase,
      cats: g.cats.map((cat) => ({ name: cat.name, cells: cat.cells.map((x) => ({ v: x.v, used: x.used, by: x.by })) })),
      chooser: chooser(room, g),
      cell: g.cell,
      cellValue: cell ? cell.v : null,
      catName: cell ? g.cats[g.cell.c].name : null,
      question: cell ? cell.q : null,
      answerer: g.answerer,
      buzzed: g.buzzed,
      results: g.results,
      attempted: g.attempted,
      comment: g.comment,
      steal: !!g.opts.steal,
      answer: g.phase === 'reveal' || g.phase === 'end' ? cell && cell.a : null,
      standings: [...room.players.values()].filter((p) => g.order.includes(p.id)).sort((a, b) => b.score - a.score).map((p) => p.id),
    };
    if (viewer.role === 'host' && cell) {
      const ownTurn = g.phase === 'answer' && g.answerer === viewer.hostPid && !g.buzzed;
      v.answer = ownTurn ? null : cell.a;
      v.answerHidden = ownTurn;
    }
    if (viewer.role === 'player') {
      v.isChooser = v.chooser === viewer.pid;
      v.canSteal = g.phase === 'steal' && stealEligible(room, g).includes(viewer.pid);
    }
    return v;
  },

  controls(room) {
    const g = room.game;
    switch (g.phase) {
      case 'pick':
        return [{ action: 'skipChooser', label: 'Person überspringen' }];
      case 'answer':
      case 'stealAnswer':
        return [
          { action: 'judge', payload: { correct: true }, label: 'Richtig', kind: 'ok', key: 'r' },
          { action: 'judge', payload: { correct: false }, label: 'Falsch', kind: 'bad', key: 'f' },
          ...(g.phase === 'answer' && !g.results.length ? [{ action: 'cancel', label: 'Frage zurücklegen' }] : []),
          ...(g.phase === 'stealAnswer' ? [{ action: 'closeSteal', label: 'Auflösen' }] : []),
        ];
      case 'steal':
        return [{ action: 'closeSteal', label: 'Keiner weiß es – auflösen', kind: 'primary' }];
      case 'reveal':
        return [
          { action: 'next', label: 'Weiter', kind: 'primary', key: 'n' },
          { action: 'end', label: 'Board beenden' },
        ];
      default:
        return [];
    }
  },
};
