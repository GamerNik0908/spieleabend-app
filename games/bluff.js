const items = require('../content/bluff');
const roasts = require('../content/roasts');
const { shuffle, pick, normalize } = require('./util');

// Ablauf: write (alle erfinden eine falsche Antwort) -> vote (echte Antwort finden) -> reveal
// Punkte: echte Antwort gefunden +1000, jede Person, die auf deine Lüge reinfällt +500

function isTooTrue(item, text) {
  const n = normalize(text);
  return [item.a, ...(item.alt || [])].some((x) => normalize(x) === n);
}

function startWrite(room) {
  const g = room.game;
  g.phase = 'write';
  g.lies = {};
  g.rejected = {};
  g.options = [];
  g.votes = {};
  g.gained = {};
  g.comment = null;
  g.deadline = Date.now() + g.opts.writeTime * 1000;
  room.setTimer(g.opts.writeTime * 1000, () => startVote(room));
}

function startVote(room) {
  const g = room.game;
  if (g.phase !== 'write') return;
  const item = g.items[g.index];
  const byText = new Map();
  for (const [pid, text] of Object.entries(g.lies)) {
    const key = normalize(text);
    if (!byText.has(key)) byText.set(key, { text, authors: [] });
    byText.get(key).authors.push(pid);
  }
  const options = [...byText.values()].map((o) => ({ ...o, real: false, house: false }));
  // Mit Haus-Lügen auffüllen, damit es immer genug Auswahl gibt
  for (const fake of shuffle(item.fake || [])) {
    if (options.length >= 3) break;
    if (!byText.has(normalize(fake))) options.push({ text: fake, authors: [], real: false, house: true });
  }
  options.push({ text: item.a, authors: [], real: true, house: false });
  g.options = shuffle(options).map((o, i) => ({ ...o, id: i }));
  g.votes = {};
  g.phase = 'vote';
  g.deadline = Date.now() + g.opts.voteTime * 1000;
  room.setTimer(g.opts.voteTime * 1000, () => reveal(room));
}

function canVote(g, pid) {
  return g.options.some((o) => !o.authors.includes(pid));
}

function reveal(room) {
  const g = room.game;
  if (g.phase !== 'vote') return;
  room.clearTimer();
  g.phase = 'reveal';
  g.deadline = null;
  g.gained = {};
  const add = (pid, n) => {
    g.gained[pid] = (g.gained[pid] || 0) + n;
    room.addPoints(pid, n);
  };
  let bestFooler = null;
  for (const [voter, optId] of Object.entries(g.votes)) {
    const o = g.options.find((x) => x.id === optId);
    if (!o) continue;
    if (o.real) add(voter, 1000);
    else o.authors.forEach((a) => add(a, 500));
  }
  for (const o of g.options) {
    const fooled = Object.values(g.votes).filter((id) => id === o.id).length;
    if (!o.real && o.authors.length && fooled && (!bestFooler || fooled > bestFooler.fooled)) bestFooler = { o, fooled };
  }
  if (bestFooler) {
    const name = room.players.get(bestFooler.o.authors[0])?.name || '?';
    g.comment = roast(room, 'bluffKing', name);
  }
}

function roast(room, kind, name) {
  return pick(roasts[kind][room.spicy ? 'spicy' : 'mild']).replace(/\{name\}/g, name);
}

function allDone(room, map, filter = () => true) {
  const active = room.activePlayers().filter(filter);
  return active.length > 0 && active.every((p) => map[p.id] !== undefined);
}

module.exports = {
  id: 'bluff',
  name: 'Bluff',
  short: 'Erfinde eine glaubwürdige falsche Antwort und finde die echte. Wer andere reinlegt, kriegt Punkte.',
  minPlayers: 2,
  options: [
    { key: 'rounds', label: 'Anzahl Fragen', min: 2, max: Math.min(20, items.length), default: 6 },
    { key: 'writeTime', label: 'Sekunden zum Schreiben', min: 20, max: 180, default: 60 },
    { key: 'voteTime', label: 'Sekunden zum Abstimmen', min: 10, max: 90, default: 30 },
  ],

  start(room, opts) {
    for (const p of room.players.values()) p.score = 0;
    room.game = { id: 'bluff', opts, items: shuffle(items).slice(0, opts.rounds), index: 0 };
    startWrite(room);
  },

  action(room, action, p) {
    const g = room.game;
    switch (action) {
      case 'endWrite':
        startVote(room);
        break;
      case 'endVote':
        reveal(room);
        break;
      case 'removeLie':
        // Host entfernt unpassende Antworten
        if (g.phase === 'write') delete g.lies[p.pid];
        if (g.phase === 'vote') {
          const o = g.options.find((x) => x.id === Number(p.id));
          if (o && !o.real) {
            g.options = g.options.filter((x) => x !== o);
            for (const [voter, id] of Object.entries(g.votes)) if (id === o.id) delete g.votes[voter];
          }
        }
        break;
      case 'skip':
      case 'next':
        if (action === 'next' && g.phase !== 'reveal') break;
        room.clearTimer();
        if (g.index + 1 < g.items.length) {
          g.index++;
          startWrite(room);
        } else {
          g.phase = 'end';
          g.deadline = null;
        }
        break;
    }
  },

  input(room, player, p) {
    const g = room.game;
    if (p.type === 'lie' && g.phase === 'write') {
      const text = String(p.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 50);
      if (!text) return;
      if (isTooTrue(g.items[g.index], text)) {
        g.rejected[player.id] = true;
        return;
      }
      delete g.rejected[player.id];
      g.lies[player.id] = text;
      if (allDone(room, g.lies)) startVote(room);
    }
    if (p.type === 'vote' && g.phase === 'vote' && g.votes[player.id] === undefined) {
      const o = g.options.find((x) => x.id === Number(p.id));
      if (!o || o.authors.includes(player.id)) return;
      g.votes[player.id] = o.id;
      if (allDone(room, g.votes, (x) => canVote(g, x.id))) reveal(room);
    }
  },

  view(room, viewer) {
    const g = room.game;
    const item = g.items[g.index];
    const v = {
      phase: g.phase,
      index: g.index,
      total: g.items.length,
      question: item.q,
      deadline: g.deadline,
      writtenCount: Object.keys(g.lies).length,
      votedCount: Object.keys(g.votes).length,
      playerCount: room.activePlayers().length,
      written: Object.keys(g.lies),
      options: g.phase === 'vote' || g.phase === 'reveal' ? g.options.map((o) => ({ id: o.id, text: o.text })) : null,
      comment: g.comment,
      standings: [...room.players.values()].sort((a, b) => b.score - a.score).map((p) => p.id),
    };
    if (g.phase === 'reveal') {
      v.answer = item.a;
      v.reveal = g.options.map((o) => ({
        id: o.id,
        text: o.text,
        real: o.real,
        house: o.house,
        authors: o.authors,
        voters: Object.entries(g.votes)
          .filter(([, id]) => id === o.id)
          .map(([pid]) => pid),
      }));
      v.gained = g.gained;
    }
    if (viewer.role === 'host') {
      v.answer = item.a;
      v.lies = Object.entries(g.lies).map(([pid, text]) => ({ pid, text }));
      v.optionAuthors = g.options.map((o) => ({ id: o.id, text: o.text, real: o.real, house: o.house, authors: o.authors }));
    }
    if (viewer.role === 'player') {
      v.myLie = g.lies[viewer.pid] || null;
      v.rejected = !!g.rejected[viewer.pid];
      v.myVote = g.votes[viewer.pid] ?? null;
      const mine = g.options.find((o) => o.authors.includes(viewer.pid));
      v.myOptionId = mine ? mine.id : null;
      v.myGain = (g.gained && g.gained[viewer.pid]) || 0;
    }
    return v;
  },

  controls(room) {
    const g = room.game;
    if (g.phase === 'write') return [{ action: 'endWrite', label: 'Schreiben beenden', kind: 'primary' }, { action: 'skip', label: 'Frage überspringen' }];
    if (g.phase === 'vote') return [{ action: 'endVote', label: 'Auflösen', kind: 'primary' }];
    if (g.phase === 'reveal') return [{ action: 'next', label: g.index + 1 < g.items.length ? 'Nächste Frage' : 'Endergebnis', kind: 'primary', key: 'n' }];
    return [];
  },
};
