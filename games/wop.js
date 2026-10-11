const content = require('./content');
const { pick, standings } = require('./util');

function drawTask(g, type) {
  const pool = type === 'truth' ? content.wahrheit : content.pflicht;
  const used = g.used[type];
  if (used.length >= pool.length) used.length = 0;
  let i;
  do i = Math.floor(Math.random() * pool.length);
  while (used.includes(i));
  used.push(i);
  g.type = type;
  g.text = pool[i];
}

function spin(room) {
  const g = room.game;
  const active = room.activePlayers();
  if (!active.length) return;
  // Wer zuletzt dran war, kommt nicht direkt wieder dran
  const fresh = active.filter((p) => !g.recent.includes(p.id));
  const chosen = pick(fresh.length ? fresh : active);
  g.recent.push(chosen.id);
  if (g.recent.length > Math.floor(active.length / 2)) g.recent.shift();
  g.current = chosen.id;
  g.phase = 'choose';
  g.type = null;
  g.text = null;
  g.turns++;
}

module.exports = {
  id: 'wop',
  name: 'Wahrheit oder Pflicht',
  emoji: '🔥',
  desc: 'Der Zufall wählt jemanden aus – Wahrheit oder Pflicht? Geschafft gibt Punkte.',
  minPlayers: 2,
  options: [],

  start(room) {
    room.game = { id: 'wop', phase: 'idle', current: null, recent: [], used: { truth: [], dare: [] }, turns: 0, log: [] };
  },

  action(room, action, payload) {
    const g = room.game;
    if (action === 'spin') spin(room);
    if (action === 'choose' && g.phase === 'choose' && ['truth', 'dare'].includes(payload.type)) {
      drawTask(g, payload.type);
      g.phase = 'task';
    }
    if (action === 'reroll' && g.phase === 'task') drawTask(g, g.type);
    if ((action === 'done' || action === 'fail') && g.phase === 'task') {
      const pts = action === 'done' ? (g.type === 'dare' ? 300 : 200) : 0;
      if (pts) room.addPoints(g.current, pts);
      g.log.unshift({ pid: g.current, type: g.type, ok: action === 'done' });
      g.log = g.log.slice(0, 8);
      g.phase = 'idle';
    }
  },

  input(room, player, { type }) {
    const g = room.game;
    if (g.phase !== 'choose' || player.id !== g.current || !['truth', 'dare'].includes(type)) return;
    drawTask(g, type);
    g.phase = 'task';
  },

  view(room, viewer) {
    const g = room.game;
    const p = room.players.get(g.current);
    return {
      phase: g.phase,
      turns: g.turns,
      current: p ? { id: p.id, name: p.name, avatar: p.avatar } : null,
      isMe: viewer.role === 'player' && viewer.pid === g.current,
      type: g.type,
      text: g.text,
      log: g.log.map((l) => ({ name: room.players.get(l.pid)?.name || '?', type: l.type, ok: l.ok })),
      standings: standings(room).slice(0, 5),
    };
  },

  controls(room) {
    const g = room.game;
    if (g.phase === 'idle') return [{ action: 'spin', label: '🎰 Nächste Person auslosen', primary: true }];
    if (g.phase === 'choose')
      return [
        { action: 'choose', payload: { type: 'truth' }, label: '💬 Wahrheit wählen' },
        { action: 'choose', payload: { type: 'dare' }, label: '⚡ Pflicht wählen' },
        { action: 'spin', label: '🔄 Neu auslosen' },
      ];
    if (g.phase === 'task')
      return [
        { action: 'done', label: '✅ Geschafft (+Punkte)', primary: true },
        { action: 'fail', label: '❌ Verweigert' },
        { action: 'reroll', label: '🔄 Andere Aufgabe' },
      ];
    return [];
  },
};
