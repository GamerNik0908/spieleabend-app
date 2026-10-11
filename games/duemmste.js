const questions = require('../content/duemmste');
const roasts = require('../content/roasts');
const { shuffle, pick, tally, topKeys, answerText } = require('./util');

// Ablauf pro Runde:
//   turn (reihum Fragen, Spieler drückt Buzzer, Host bewertet)  ->  summary (wer ist safe?)
//   -> vote (anonym unter allen, die mindestens einen roten Punkt haben)  ->  verdict (Leben weg)
//   -> nächste Runde ... bis nur noch eine Person übrig ist.

const lives = (g, pid) => g.lives[pid] ?? 0;
const aliveIds = (room, g) => g.order.filter((pid) => room.players.has(pid) && lives(g, pid) > 0);

function roast(room, kind, name) {
  const list = roasts[kind][room.spicy ? 'spicy' : 'mild'];
  return pick(list).replace(/\{name\}/g, name);
}

function drawQuestion(g) {
  const r = Math.random();
  const wanted = r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
  let pool = questions.map((q, i) => i).filter((i) => !g.used.includes(i));
  if (!pool.length) {
    g.used = [];
    pool = questions.map((q, i) => i);
  }
  const sameLevel = pool.filter((i) => questions[i].d === wanted);
  const i = pick(sameLevel.length ? sameLevel : pool);
  g.used.push(i);
  return { ...questions[i] };
}

function newRound(room) {
  const g = room.game;
  const alive = aliveIds(room, g);
  g.round++;
  g.phase = 'turn';
  g.dots = {};
  alive.forEach((pid) => (g.dots[pid] = []));
  // Jede Runde fängt jemand anderes an
  const shift = (g.round - 1) % Math.max(1, alive.length);
  g.roundOrder = [...alive.slice(shift), ...alive.slice(0, shift)];
  g.turn = 0;
  g.history = [];
  g.votes = {};
  g.voteCands = [];
  g.revote = false;
  g.loser = null;
  g.voteCounts = null;
  g.randomLoser = false;
  g.last = null;
  nextTurn(room);
}

function nextTurn(room) {
  const g = room.game;
  const total = g.roundOrder.length * g.opts.perRound;
  // Spieler, die raus sind oder den Raum verlassen haben, überspringen
  while (g.turn < total) {
    const pid = g.roundOrder[g.turn % g.roundOrder.length];
    if (room.players.has(pid) && lives(g, pid) > 0) break;
    g.turn++;
  }
  if (g.turn >= total) {
    g.current = null;
    g.phase = 'summary';
    return;
  }
  g.current = { pid: g.roundOrder[g.turn % g.roundOrder.length], q: drawQuestion(g), buzzed: false, jokerFrom: null };
  g.phase = 'turn';
}

function candidates(room, g) {
  return Object.keys(g.dots).filter(
    (pid) => room.players.has(pid) && lives(g, pid) > 0 && g.dots[pid].some((d) => d.result === 'wrong')
  );
}

function judge(room, result) {
  const g = room.game;
  const c = g.current;
  if (g.phase !== 'turn' || !c) return;
  if (!g.dots[c.pid]) g.dots[c.pid] = [];
  g.dots[c.pid].push({ result, extra: !!c.jokerFrom });
  const name = room.players.get(c.pid)?.name || '?';
  const entry = { pid: c.pid, q: c.q.q, a: answerText(c.q), d: c.q.d, result, jokerFrom: c.jokerFrom };
  g.history.push(entry);
  g.last = { ...entry, comment: result === 'wrong' ? roast(room, 'wrong', name) : roast(room, 'right', name) };
  g.turn++;
  nextTurn(room);
}

function voters(room, g) {
  // Alle verbundenen Spieler dürfen abstimmen (auch wer schon raus ist) – aber nie für sich selbst
  return room.activePlayers().filter((p) => g.voteCands.some((c) => c !== p.id));
}

function startVote(room) {
  const g = room.game;
  const cands = candidates(room, g);
  g.revote = false;
  if (cands.length === 0) {
    if (!maybeFinish(room)) newRound(room);
    return;
  }
  if (cands.length === 1) return applyLoss(room, cands[0]);
  g.voteCands = cands;
  g.votes = {};
  g.phase = 'vote';
}

function resolveVote(room) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  const counts = tally(g.votes);
  const top = topKeys(counts).filter((pid) => g.voteCands.includes(pid));
  g.voteCounts = counts;
  if (top.length === 1) return applyLoss(room, top[0]);
  const tied = top.length ? top : g.voteCands;
  if (!g.revote) {
    // Gleichstand -> Stichwahl zwischen den Gleichplatzierten
    g.revote = true;
    g.voteCands = tied;
    g.votes = {};
    return;
  }
  g.randomLoser = true;
  applyLoss(room, pick(tied));
}

function applyLoss(room, pid) {
  const g = room.game;
  g.lives[pid] = Math.max(0, lives(g, pid) - 1);
  g.loser = pid;
  g.phase = 'verdict';
  const name = room.players.get(pid)?.name || '?';
  g.comment = roast(room, g.lives[pid] === 0 ? 'out' : 'lifeLost', name);
}

function maybeFinish(room) {
  const g = room.game;
  const alive = aliveIds(room, g);
  if (alive.length <= 1) {
    g.phase = 'end';
    g.winner = alive[0] || null;
    g.current = null;
    return true;
  }
  return false;
}

module.exports = {
  id: 'duemmste',
  name: 'Wer ist der Dümmste?',
  short: 'Reihum Fragen beantworten, jede Runde wird abgestimmt. Wer alle Leben verliert, fliegt.',
  minPlayers: 2,
  options: [
    { key: 'perRound', label: 'Fragen pro Person & Runde', min: 1, max: 5, default: 2 },
    { key: 'lives', label: 'Leben', min: 1, max: 5, default: 3 },
    { key: 'jokers', label: 'Joker pro Person', min: 0, max: 3, default: 1 },
  ],

  start(room, opts) {
    const order = shuffle(room.activePlayers().map((p) => p.id));
    room.game = { id: 'duemmste', opts, round: 0, order, lives: {}, jokers: {}, used: [], winner: null, comment: null };
    order.forEach((pid) => {
      room.game.lives[pid] = opts.lives;
      room.game.jokers[pid] = opts.jokers;
    });
    newRound(room);
  },

  action(room, action, p) {
    const g = room.game;
    switch (action) {
      case 'judge':
        if (p.result === 'right' || p.result === 'wrong') judge(room, p.result);
        break;
      case 'newQuestion':
        if (g.phase === 'turn' && g.current) {
          g.current.q = drawQuestion(g);
          g.current.buzzed = false;
        }
        break;
      case 'skipTurn':
        if (g.phase === 'turn') {
          g.turn++;
          nextTurn(room);
        }
        break;
      case 'setDot': {
        // Host korrigiert eine Bewertung nachträglich
        const dots = g.dots[p.pid];
        if (!dots || !dots[p.index] || !['right', 'wrong', 'joker'].includes(p.result)) break;
        dots[p.index].result = p.result;
        break;
      }
      case 'addDot':
        if (g.dots[p.pid] && ['right', 'wrong'].includes(p.result)) g.dots[p.pid].push({ result: p.result, extra: true });
        break;
      case 'removeDot':
        if (g.dots[p.pid]) g.dots[p.pid].splice(Number(p.index), 1);
        break;
      case 'lives':
        if (p.pid in g.lives) {
          g.lives[p.pid] = Math.max(0, Math.min(9, g.lives[p.pid] + (p.delta > 0 ? 1 : -1)));
          if (g.lives[p.pid] > 0 && g.phase === 'end') g.phase = 'verdict';
        }
        break;
      case 'jokers':
        if (p.pid in g.jokers) g.jokers[p.pid] = Math.max(0, Math.min(9, g.jokers[p.pid] + (p.delta > 0 ? 1 : -1)));
        break;
      case 'startVote':
        if (g.phase === 'summary') startVote(room);
        break;
      case 'endVote':
        resolveVote(room);
        break;
      case 'setLoser':
        // Host entscheidet anders als die Abstimmung
        if (g.phase === 'verdict' && p.pid in g.lives && p.pid !== g.loser) {
          if (g.loser) g.lives[g.loser]++;
          g.lives[p.pid] = Math.max(0, g.lives[p.pid] - 1);
          g.loser = p.pid;
          g.randomLoser = false;
          g.comment = roast(room, g.lives[p.pid] === 0 ? 'out' : 'lifeLost', room.players.get(p.pid)?.name || '?');
        }
        break;
      case 'nextRound':
        if (g.phase === 'verdict' || g.phase === 'summary') {
          if (!maybeFinish(room)) newRound(room);
        }
        break;
    }
  },

  input(room, player, p) {
    const g = room.game;
    const c = g.current;
    if (g.phase === 'turn' && c && c.pid === player.id) {
      if (p.type === 'buzz') c.buzzed = true;
      if (p.type === 'joker' && !c.buzzed && !c.jokerFrom && (g.jokers[player.id] || 0) > 0) {
        const target = p.target;
        if (target === player.id || !g.dots[target] || lives(g, target) <= 0 || !room.players.has(target)) return;
        g.jokers[player.id]--;
        g.dots[player.id].push({ result: 'joker' });
        g.history.push({ pid: player.id, q: c.q.q, a: answerText(c.q), d: c.q.d, result: 'joker', jokerTo: target });
        g.current = { pid: target, q: c.q, buzzed: false, jokerFrom: player.id };
      }
    }
    if (g.phase === 'vote' && p.type === 'vote') {
      if (g.votes[player.id] || p.target === player.id || !g.voteCands.includes(p.target)) return;
      g.votes[player.id] = p.target;
      const all = voters(room, g);
      if (all.length && all.every((v) => g.votes[v.id])) resolveVote(room);
    }
  },

  onLeave(room, pid) {
    const g = room.game;
    if (g.current && g.current.pid === pid) {
      g.turn++;
      nextTurn(room);
    }
    g.voteCands = (g.voteCands || []).filter((x) => x !== pid);
    delete g.votes[pid];
  },

  view(room, viewer) {
    const g = room.game;
    const c = g.current;
    const total = g.roundOrder.length * g.opts.perRound;
    const cands = g.phase === 'summary' ? candidates(room, g) : g.voteCands;
    const v = {
      phase: g.phase,
      round: g.round,
      turn: Math.min(g.turn + 1, total),
      totalTurns: total,
      perRound: g.opts.perRound,
      maxLives: g.opts.lives,
      profiles: g.order
        .filter((pid) => room.players.has(pid))
        .map((pid) => ({
          id: pid,
          lives: lives(g, pid),
          jokers: g.jokers[pid] || 0,
          dots: g.dots[pid] || null,
          out: lives(g, pid) <= 0,
        })),
      current: c ? { pid: c.pid, q: c.q.q, d: c.q.d, buzzed: c.buzzed, jokerFrom: c.jokerFrom } : null,
      last: g.last,
      history: g.phase === 'turn' ? null : g.history,
      candidates: cands,
      revote: g.revote,
      votedCount: Object.keys(g.votes).length,
      voterCount: g.phase === 'vote' ? voters(room, g).length : 0,
      loser: g.loser,
      loserOut: g.loser ? lives(g, g.loser) === 0 : false,
      voteCounts: g.phase === 'verdict' ? g.voteCounts : null,
      randomLoser: g.randomLoser,
      comment: g.phase === 'verdict' ? g.comment : null,
      winner: g.winner,
    };
    if (viewer.role === 'host' && c) {
      // Spielt der Host selbst und ist dran, bleibt die Lösung verdeckt bis zum Buzzer
      const ownTurn = c.pid === viewer.hostPid && !c.buzzed;
      v.answer = ownTurn ? null : answerText(c.q);
      v.answerHidden = ownTurn;
    }
    if (viewer.role === 'player') {
      v.isMe = !!c && c.pid === viewer.pid;
      v.myJokers = g.jokers[viewer.pid] || 0;
      v.myVote = g.votes[viewer.pid] || null;
      v.alive = lives(g, viewer.pid) > 0;
    }
    return v;
  },

  controls(room) {
    const g = room.game;
    switch (g.phase) {
      case 'turn':
        return [
          { action: 'judge', payload: { result: 'right' }, label: 'Richtig', kind: 'ok', key: 'r' },
          { action: 'judge', payload: { result: 'wrong' }, label: 'Falsch', kind: 'bad', key: 'f' },
          { action: 'newQuestion', label: 'Andere Frage' },
          { action: 'skipTurn', label: 'Person überspringen' },
        ];
      case 'summary': {
        const n = candidates(room, g).length;
        return [{ action: 'startVote', label: n === 0 ? 'Alle safe – weiter' : n === 1 ? 'Urteil anzeigen' : 'Abstimmung starten', kind: 'primary' }];
      }
      case 'vote':
        return [{ action: 'endVote', label: 'Abstimmung jetzt auswerten', kind: 'primary' }];
      case 'verdict':
        return [{ action: 'nextRound', label: 'Nächste Runde', kind: 'primary' }];
      default:
        return [];
    }
  },
};
