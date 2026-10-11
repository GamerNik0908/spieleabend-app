function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Zählt Stimmen { voterId: choice } -> { choice: count }
function tally(votes) {
  const counts = {};
  for (const v of Object.values(votes)) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function topKeys(counts) {
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return [];
  return Object.keys(counts).filter((k) => counts[k] === max);
}

// Haben alle verbundenen Spieler (optional: aus einer Teilnehmerliste) abgegeben?
function allAnswered(room, answers, participants) {
  const active = room.activePlayers().filter((p) => !participants || participants.includes(p.id));
  return active.length > 0 && active.every((p) => answers[p.id] !== undefined);
}

function standings(room) {
  return room
    .playerList()
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { shuffle, pick, tally, topKeys, allAnswered, standings };
